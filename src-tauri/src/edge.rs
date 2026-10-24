use std::time::{Duration, Instant};
use tauri::Manager;

#[derive(Clone, Copy, serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Side {
    Left,
    Right,
    Top,
    Bottom,
}

#[derive(Clone, Copy, Debug, PartialEq)]
struct Rect {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

#[derive(Clone, Copy)]
struct Hidden {
    side: Side,
    full: Rect,
    strip: Rect,
    hiding: bool,
}

#[derive(Clone, Copy, serde::Serialize)]
pub struct Motion {
    side: Side,
    revealing: bool,
}

#[derive(Default)]
pub struct Controller {
    ticks: u64,
    hidden: Option<Hidden>,
    last: Option<Rect>,
    changed: Option<Instant>,
    outside: Option<Instant>,
    reveal: Option<(Side, Instant)>,
    blocked: bool,
    holds: usize,
}

pub struct Hold(tauri::AppHandle);
impl Drop for Hold {
    fn drop(&mut self) {
        let state = self.0.state::<crate::AppState>();
        let mut controller = state.edge.lock().unwrap();
        controller.holds = controller.holds.saturating_sub(1);
    }
}
pub fn hold(app: &tauri::AppHandle) -> Hold {
    app.state::<crate::AppState>().edge.lock().unwrap().holds += 1;
    restore(app);
    Hold(app.clone())
}
pub fn set_blocked(app: &tauri::AppHandle, blocked: bool) {
    app.state::<crate::AppState>().edge.lock().unwrap().blocked = blocked;
    if blocked {
        restore(app);
    }
}

impl Controller {
    pub fn diagnostics(&self) -> serde_json::Value {
        serde_json::json!({"ticks":self.ticks,"blocked":self.blocked,"holds":self.holds,"hidden":self.side(),"motion":self.motion(),"last":format!("{:?}",self.last),"stableMs":self.changed.map(|t|t.elapsed().as_millis()),"outsideMs":self.outside.map(|t|t.elapsed().as_millis())})
    }
    pub fn side(&self) -> Option<Side> {
        self.hidden.filter(|h| !h.hiding).map(|h| h.side)
    }
    pub fn motion(&self) -> Option<Motion> {
        self.hidden
            .filter(|h| h.hiding)
            .map(|h| Motion {
                side: h.side,
                revealing: false,
            })
            .or_else(|| {
                self.reveal.map(|(side, _)| Motion {
                    side,
                    revealing: true,
                })
            })
    }
}

fn contains(rect: Rect, point: tauri::PhysicalPosition<f64>) -> bool {
    point.x >= rect.x as f64
        && point.x < rect.x as f64 + rect.width as f64
        && point.y >= rect.y as f64
        && point.y < rect.y as f64 + rect.height as f64
}

fn side(rect: Rect, area: Rect, threshold: i32) -> Option<Side> {
    // A large panel can be close to opposite edges at once. Select the closest
    // (or most crossed) edge rather than always preferring left/top.
    [
        (Side::Left, rect.x - area.x),
        (
            Side::Right,
            area.x + area.width as i32 - rect.x - rect.width as i32,
        ),
        (Side::Top, rect.y - area.y),
        (
            Side::Bottom,
            area.y + area.height as i32 - rect.y - rect.height as i32,
        ),
    ]
    .into_iter()
    .filter(|(_, distance)| *distance <= threshold)
    .min_by_key(|(_, distance)| *distance)
    .map(|(side, _)| side)
}

fn anchor(mut full: Rect, area: Rect, side: Side) -> Rect {
    full.x = full.x.clamp(
        area.x,
        (area.x + area.width as i32 - full.width as i32).max(area.x),
    );
    full.y = full.y.clamp(
        area.y,
        (area.y + area.height as i32 - full.height as i32).max(area.y),
    );
    match side {
        Side::Left => full.x = area.x,
        Side::Right => full.x = area.x + area.width as i32 - full.width as i32,
        Side::Top => full.y = area.y,
        Side::Bottom => full.y = area.y + area.height as i32 - full.height as i32,
    }
    full
}

fn wake_rect(full: Rect, area: Rect, side: Side, scale: f64) -> Rect {
    let vertical = matches!(side, Side::Left | Side::Right);
    let thin = (10.0 * scale).round().max(6.0) as u32;
    let long = (112.0 * scale).round() as u32;
    let width = if vertical { thin } else { long }.min(area.width);
    let height = if vertical { long } else { thin }.min(area.height);
    let mut strip = Rect {
        x: full.x + (full.width as i32 - width as i32) / 2,
        y: full.y + (full.height as i32 - height as i32) / 2,
        width,
        height,
    };
    strip = anchor(strip, area, side);
    strip
}

fn apply(window: &tauri::WebviewWindow, rect: Rect, fixed: bool) {
    let _ = window.set_resizable(true);
    let _ = window.set_max_size(None::<tauri::PhysicalSize<u32>>);
    if fixed {
        let _ = window.set_min_size(Some(tauri::PhysicalSize::new(rect.width, rect.height)));
        let _ = window.set_max_size(Some(tauri::PhysicalSize::new(rect.width, rect.height)));
    } else {
        let _ = window.set_min_size(Some(tauri::LogicalSize::new(80.0, 80.0)));
    }
    let _ = window.set_size(tauri::PhysicalSize::new(rect.width, rect.height));
    let _ = window.set_position(tauri::PhysicalPosition::new(rect.x, rect.y));
    #[cfg(not(target_os = "linux"))]
    let _ = window.set_resizable(!fixed);
}

pub fn restore(app: &tauri::AppHandle) {
    let hidden = {
        let state = app.state::<crate::AppState>();
        let mut controller = state.edge.lock().unwrap();
        let hidden = controller.hidden.take();
        controller.reveal = hidden
            .filter(|h| !h.hiding)
            .map(|h| (h.side, Instant::now()));
        controller.last = hidden.map(|h| h.full);
        controller.changed = Some(Instant::now());
        controller.outside = None;
        hidden
    };
    if let Some(hidden) = hidden {
        if let Some(window) = app.get_webview_window("main") {
            let mut full = hidden.full;
            if let Ok(Some(monitor)) = window
                .current_monitor()
                .or_else(|_| window.primary_monitor())
            {
                let work = monitor.work_area();
                full = anchor(
                    full,
                    Rect {
                        x: work.position.x,
                        y: work.position.y,
                        width: work.size.width,
                        height: work.size.height,
                    },
                    hidden.side,
                );
            }
            apply(
                &window,
                full,
                !app.state::<crate::AppState>()
                    .expanded
                    .load(std::sync::atomic::Ordering::Relaxed),
            );
        }
        crate::emit(app);
    }
}

fn tick(app: &tauri::AppHandle) {
    let state = app.state::<crate::AppState>();
    state.edge.lock().unwrap().ticks += 1;
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    if window.is_minimized().unwrap_or(false) {
        return;
    }
    let blocked = {
        let controller = state.edge.lock().unwrap();
        controller.blocked || controller.holds > 0
    };
    if blocked
        || !state.settings.lock().unwrap().edge_hide
        || state.running.load(std::sync::atomic::Ordering::Relaxed)
        || !window.is_visible().unwrap_or(false)
    {
        state.edge.lock().unwrap().reveal = None;
        restore(app);
        return;
    }
    let (Ok(position), Ok(size), Ok(pointer), Ok(Some(monitor))) = (
        crate::panel_position(&window),
        window.inner_size(),
        app.cursor_position(),
        window.current_monitor(),
    ) else {
        return;
    };
    let rect = Rect {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
    };
    let work = monitor.work_area();
    let area = Rect {
        x: work.position.x,
        y: work.position.y,
        width: work.size.width,
        height: work.size.height,
    };
    let now = Instant::now();
    let mut controller = state.edge.lock().unwrap();
    if let Some((_, started)) = controller.reveal {
        if now.duration_since(started) >= Duration::from_millis(420) {
            controller.reveal = None;
            drop(controller);
            crate::emit(app);
        }
        return;
    }
    if let Some(hidden) = controller.hidden {
        if hidden.hiding {
            if contains(rect, pointer) || rect != hidden.full {
                drop(controller);
                restore(app);
            } else if controller
                .changed
                .is_some_and(|started| now.duration_since(started) >= Duration::from_millis(420))
            {
                controller.hidden = Some(Hidden {
                    hiding: false,
                    ..hidden
                });
                controller.changed = Some(now);
                drop(controller);
                apply(&window, hidden.strip, true);
                crate::emit(app);
            }
            return;
        }
        // GTK applies resize asynchronously. Positioning the narrow strip before
        // that configure event is constrained using the old, wider window size.
        // Place it again once the requested size has actually arrived.
        if rect != hidden.strip
            && rect.width == hidden.strip.width
            && rect.height == hidden.strip.height
            && controller
                .changed
                .is_some_and(|changed| now.duration_since(changed) <= Duration::from_millis(500))
        {
            let target = hidden.strip;
            drop(controller);
            let _ = window.set_position(tauri::PhysicalPosition::new(target.x, target.y));
            return;
        }
        // A monitor/work-area change or external movement must leave a reachable icon.
        if contains(rect, pointer)
            || (rect != hidden.strip
                && controller
                    .changed
                    .is_none_or(|changed| now.duration_since(changed) > Duration::from_millis(500)))
            || hidden.strip.x < area.x
            || hidden.strip.x + hidden.strip.width as i32 > area.x + area.width as i32
            || hidden.strip.y < area.y
            || hidden.strip.y + hidden.strip.height as i32 > area.y + area.height as i32
        {
            drop(controller);
            restore(app);
        }
        return;
    }
    if controller.last != Some(rect) {
        controller.last = Some(rect);
        controller.changed = Some(now);
        controller.outside = None;
        return;
    }
    if contains(rect, pointer) {
        controller.outside = None;
        return;
    }
    let outside = *controller.outside.get_or_insert(now);
    if now.duration_since(outside) < Duration::from_millis(800)
        || controller
            .changed
            .is_none_or(|changed| now.duration_since(changed) < Duration::from_millis(650))
    {
        return;
    }
    let scale = window.scale_factor().unwrap_or(1.0);
    let screen = Rect {
        x: monitor.position().x,
        y: monitor.position().y,
        width: monitor.size().width,
        height: monitor.size().height,
    };
    let threshold = (32.0 * scale).round() as i32;
    let Some(side) = side(rect, area, threshold).or_else(|| side(rect, screen, threshold)) else {
        return;
    };
    let strip = wake_rect(anchor(rect, area, side), area, side, scale);
    controller.hidden = Some(Hidden {
        side,
        // Keep the observed geometry until the animation finishes. GTK applies
        // edge snapping asynchronously; an intermediate position must not cancel hiding.
        full: rect,
        strip,
        hiding: true,
    });
    controller.changed = Some(now);
    drop(controller);
    crate::emit(app);
}

pub fn start(app: tauri::AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_millis(50));
        let handle = app.clone();
        if app.run_on_main_thread(move || tick(&handle)).is_err() {
            break;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn near_full_height_panels_choose_the_closest_edge() {
        let area = Rect {
            x: 0,
            y: 0,
            width: 1024,
            height: 728,
        };
        let panel = Rect {
            x: 64,
            y: 8,
            width: 440,
            height: 704,
        };
        assert_eq!(side(panel, area, 32), Some(Side::Top));
        assert_eq!(side(Rect { y: 16, ..panel }, area, 32), Some(Side::Bottom));
        assert_eq!(
            side(
                Rect {
                    x: 4,
                    y: 12,
                    ..panel
                },
                area,
                32
            ),
            Some(Side::Left)
        );
        assert_eq!(
            side(
                Rect {
                    x: 580,
                    y: 12,
                    ..panel
                },
                area,
                32
            ),
            Some(Side::Right)
        );
    }
    #[test]
    fn crossing_an_edge_still_docks_instead_of_missing_the_proximity_band() {
        let area = Rect {
            x: 0,
            y: 0,
            width: 2560,
            height: 1528,
        };
        let icon = Rect {
            x: 1064,
            y: 1542,
            width: 156,
            height: 168,
        };
        assert_eq!(side(icon, area, 48), Some(Side::Bottom));
        assert_eq!(
            side(
                Rect {
                    x: -120,
                    y: 200,
                    ..icon
                },
                area,
                48
            ),
            Some(Side::Left)
        );
        assert_eq!(
            side(
                Rect {
                    x: 2524,
                    y: 200,
                    ..icon
                },
                area,
                48
            ),
            Some(Side::Right)
        );
        assert_eq!(side(Rect { y: -120, ..icon }, area, 48), Some(Side::Top));
    }
    #[test]
    fn all_four_edges_anchor_and_keep_wake_targets_inside_scaled_work_area() {
        let area = Rect {
            x: -1600,
            y: 40,
            width: 1600,
            height: 960,
        };
        let panel = Rect {
            x: -1000,
            y: 200,
            width: 660,
            height: 760,
        };
        for edge in [Side::Left, Side::Right, Side::Top, Side::Bottom] {
            let full = anchor(panel, area, edge);
            assert_eq!(side(full, area, 0), Some(edge));
            let strip = wake_rect(full, area, edge, 1.5);
            assert!(strip.x >= area.x && strip.y >= area.y);
            assert!(strip.x + strip.width as i32 <= area.x + area.width as i32);
            assert!(strip.y + strip.height as i32 <= area.y + area.height as i32);
            if matches!(edge, Side::Top | Side::Bottom) {
                assert_eq!((strip.width, strip.height), (168, 15));
                assert_eq!(full.x, panel.x);
            } else {
                assert_eq!((strip.width, strip.height), (15, 168));
                assert_eq!(full.y, panel.y);
            }
        }
    }
    #[test]
    fn edges_use_work_area_and_physical_coordinates() {
        let area = Rect {
            x: -1920,
            y: 32,
            width: 1920,
            height: 1048,
        };
        let icon = Rect {
            x: -1914,
            y: 200,
            width: 104,
            height: 112,
        };
        assert_eq!(side(icon, area, 12), Some(Side::Left));
        assert_eq!(side(Rect { x: -104, ..icon }, area, 12), Some(Side::Right));
        assert_eq!(side(Rect { x: -900, ..icon }, area, 12), None);
        assert_eq!(side(Rect { x: -1896, ..icon }, area, 32), Some(Side::Left));
        assert_eq!(side(Rect { x: -1896, ..icon }, area, 12), None);
        assert!(contains(icon, tauri::PhysicalPosition::new(-1900.0, 220.0)));
        assert!(!contains(
            icon,
            tauri::PhysicalPosition::new(-1810.0, 220.0)
        ));
    }
}
