#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod edge;
#[cfg(target_os = "linux")]
mod linux_bridge;
mod profile;
mod selection;
mod validation;

// GTK native choosers are separate windows. A floating window's ABOVE state
// can otherwise cover its own modal chooser under GNOME/X11.
#[cfg(target_os = "linux")]
struct DialogTopmostGuard(tauri::WebviewWindow, bool);
#[cfg(target_os = "linux")]
impl Drop for DialogTopmostGuard {
    fn drop(&mut self) {
        let _ = self.0.set_always_on_top(self.1);
    }
}
use gatherpack_collection::{
    build_plan, build_plan_with_cancel, pack, Collection, Entry, Format, Plan, Report,
};
use serde::{Deserialize, Serialize};
use std::{
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Mutex,
    },
    time::{Duration, Instant},
};
use tauri::{Emitter, Manager, State};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_opener::OpenerExt;

const SHORTCUT: &str = if cfg!(target_os = "macos") {
    "Command+Alt+Shift+E"
} else {
    "Control+Alt+Shift+E"
};
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct Settings {
    format: Format,
    shortcut: String,
    last_directory: Option<String>,
    autostart: bool,
    language: Language,
    edge_hide: bool,
}
#[derive(Clone, Copy, Default, Serialize, Deserialize, PartialEq)]
enum Language {
    #[default]
    #[serde(rename = "zh-CN")]
    Chinese,
    #[serde(rename = "en")]
    English,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            format: Format::Zip,
            shortcut: SHORTCUT.into(),
            last_directory: None,
            autostart: false,
            language: Language::Chinese,
            edge_hide: true,
        }
    }
}
#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Saved {
    paths: Vec<String>,
    settings: Settings,
}
#[derive(Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct Task {
    running: bool,
    phase: String,
    bytes: u64,
    total_bytes: u64,
    report: Option<Report>,
}
#[derive(Default)]
struct AppState {
    edge: Mutex<edge::Controller>,
    native_menu: Mutex<
        Vec<(
            tauri::menu::MenuItem<tauri::Wry>,
            &'static str,
            &'static str,
        )>,
    >,
    smoke_test: bool,
    collection: Mutex<Collection>,
    undo_collection: Mutex<Option<(Vec<String>, Option<String>)>>,
    panel_wide: AtomicBool,
    pinned: AtomicBool,
    settings: Mutex<Settings>,
    last_message: Mutex<String>,
    shortcut_status: Mutex<String>,
    collecting: AtomicBool,
    running: AtomicBool,
    cancel: AtomicBool,
    task: Mutex<Task>,
    prepared: Mutex<Option<Plan>>,
    storage: Mutex<()>,
    expanded: AtomicBool,
    tray_available: AtomicBool,
    shortcut_available: AtomicBool,
    shortcut_last_triggered: AtomicU64,
    validation: Option<validation::ValidationContext>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Snapshot {
    dock_hidden: Option<edge::Side>,
    dock_motion: Option<edge::Motion>,
    entries: Vec<Entry>,
    message: String,
    shortcut_status: String,
    shortcut_last_triggered: Option<u64>,
    settings: Settings,
    platform: &'static str,
    task: Task,
    expanded: bool,
    tray_available: bool,
    validation: Option<validation::ValidationContext>,
}
fn read_snapshot(state: &AppState) -> Snapshot {
    let (dock_hidden, dock_motion) = {
        let edge = state.edge.lock().unwrap();
        (edge.side(), edge.motion())
    };
    Snapshot {
        dock_hidden,
        dock_motion,
        entries: state.collection.lock().unwrap().entries(),
        message: state.last_message.lock().unwrap().clone(),
        shortcut_status: state.shortcut_status.lock().unwrap().clone(),
        shortcut_last_triggered: match state.shortcut_last_triggered.load(Ordering::Relaxed) {
            0 => None,
            value => Some(value),
        },
        settings: state.settings.lock().unwrap().clone(),
        platform: std::env::consts::OS,
        task: state.task.lock().unwrap().clone(),
        expanded: state.expanded.load(Ordering::Relaxed),
        tray_available: state.tray_available.load(Ordering::Relaxed),
        validation: state.validation.clone(),
    }
}
fn emit(app: &tauri::AppHandle) {
    let _ = app.emit(
        "collection-changed",
        read_snapshot(&app.state::<AppState>()),
    );
}
fn native_text<'a>(app: &tauri::AppHandle, chinese: &'a str, english: &'a str) -> &'a str {
    if app.state::<AppState>().settings.lock().unwrap().language == Language::English {
        english
    } else {
        chinese
    }
}
fn update_native_language(app: &tauri::AppHandle) {
    let english = app.state::<AppState>().settings.lock().unwrap().language == Language::English;
    for (item, chinese, translated) in app.state::<AppState>().native_menu.lock().unwrap().iter() {
        let _ = item.set_text(if english { translated } else { chinese });
    }
    let title = if english {
        "GatherPack · Collect and pack files"
    } else {
        "GatherPack · 文件收集与打包"
    };
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_title(title);
    }
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_tooltip(Some(title));
    }
}

#[tauri::command]
fn reveal_dock(app: tauri::AppHandle) {
    edge::restore(&app);
}
#[tauri::command]
fn set_edge_blocked(app: tauri::AppHandle, blocked: bool) {
    edge::set_blocked(&app, blocked);
}
fn data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let p = match &app.state::<AppState>().validation {
        Some(context) => PathBuf::from(&context.root).join("profile"),
        None => app.path().app_data_dir().map_err(|e| e.to_string())?,
    };
    std::fs::create_dir_all(&p).map_err(|e| e.to_string())?;
    Ok(p)
}
fn save_json(path: &Path, value: &impl Serialize) -> Result<(), String> {
    use std::io::Write;
    let mut file = tempfile::NamedTempFile::new_in(path.parent().ok_or("保存目录无效")?)
        .map_err(|e| e.to_string())?;
    file.write_all(&serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    file.as_file().sync_all().map_err(|e| e.to_string())?;
    file.persist(path).map_err(|e| e.to_string())?;
    Ok(())
}
fn persist(app: &tauri::AppHandle) {
    let state = app.state::<AppState>();
    let _guard = state.storage.lock().unwrap();
    let saved = Saved {
        paths: state.collection.lock().unwrap().paths(),
        settings: state.settings.lock().unwrap().clone(),
    };
    if let Err(e) = data_dir(app).and_then(|p| save_json(&p.join("state.json"), &saved)) {
        *state.last_message.lock().unwrap() = format!("清单或设置尚未保存：{e}");
    }
}
fn add(app: &tauri::AppHandle, paths: Vec<PathBuf>) {
    add_with_rejected(app, paths, vec![]);
}
fn add_with_rejected(app: &tauri::AppHandle, paths: Vec<PathBuf>, rejected: Vec<String>) {
    let state = app.state::<AppState>();
    let mut r = state.collection.lock().unwrap().add(paths);
    r.rejected.extend(rejected);
    let next = if state.running.load(Ordering::Relaxed) {
        "；清单变更用于下次任务"
    } else {
        ""
    };
    *state.last_message.lock().unwrap() = format!(
        "新增 {} 项，重复 {} 项，未加入 {} 项{next}\n{}",
        r.added,
        r.duplicates,
        r.rejected.len(),
        r.rejected.join("\n")
    );
    persist(app);
    emit(app);
}
#[tauri::command]
fn snapshot(state: State<'_, AppState>) -> Snapshot {
    read_snapshot(&state)
}
#[tauri::command]
fn frontend_ready(app: tauri::AppHandle, state: State<'_, AppState>) {
    if state.smoke_test {
        println!("smoke-test: webview/react/ipc passed");
        app.exit(0);
    }
}
#[tauri::command]
fn remove_entry(path: String, app: tauri::AppHandle) {
    let state = app.state::<AppState>();
    let mut collection = state.collection.lock().unwrap();
    if collection.paths().contains(&path) {
        *state.undo_collection.lock().unwrap() = Some((collection.paths(), None));
        collection.remove(&path);
    }
    drop(collection);
    persist(&app);
    emit(&app);
}
#[tauri::command]
fn clear_entries(app: tauri::AppHandle) {
    let state = app.state::<AppState>();
    let mut collection = state.collection.lock().unwrap();
    if !collection.paths().is_empty() {
        *state.undo_collection.lock().unwrap() = Some((collection.paths(), None));
        collection.clear();
    }
    drop(collection);
    persist(&app);
    emit(&app);
}
#[tauri::command]
fn undo_collection(app: tauri::AppHandle) {
    let state = app.state::<AppState>();
    let mut collection = state.collection.lock().unwrap();
    if let Some((mut previous, replacement)) = state.undo_collection.lock().unwrap().take() {
        // Keep items collected after the removal and restore the original order.
        for path in collection.paths() {
            if replacement.as_ref() == Some(&path) {
                continue;
            }
            if !previous.iter().any(|old| {
                Path::new(old)
                    .canonicalize()
                    .unwrap_or_else(|_| PathBuf::from(old))
                    == Path::new(&path)
                        .canonicalize()
                        .unwrap_or_else(|_| PathBuf::from(&path))
            }) {
                previous.push(path);
            }
        }
        *collection = Collection::restore(previous);
    }
    drop(collection);
    persist(&app);
    emit(&app);
}
#[tauri::command]
fn set_pinned(app: tauri::AppHandle, pinned: bool) -> Result<(), String> {
    app.get_webview_window("main")
        .ok_or("窗口不可用")?
        .set_always_on_top(pinned)
        .map_err(|e| e.to_string())?;
    app.state::<AppState>()
        .pinned
        .store(pinned, Ordering::Relaxed);
    Ok(())
}
#[tauri::command]
fn set_panel_wide(app: tauri::AppHandle, wide: bool) {
    let state = app.state::<AppState>();
    if state.panel_wide.swap(wide, Ordering::Relaxed) != wide
        && state.expanded.load(Ordering::Relaxed)
    {
        if let Some(window) = app.get_webview_window("main") {
            // Switching views changes width only. Re-running expand() used to
            // write the GTK frame origin back as a client position on every
            // switch, accumulating the hidden titlebar offset vertically.
            if let Ok(size) = window.inner_size() {
                let scale = window.scale_factor().unwrap_or(1.0);
                let mut width = ((if wide { 900.0 } else { 440.0 }) * scale).round() as u32;
                let mut position = None;
                if let Ok(Some(monitor)) = window.current_monitor() {
                    let area = monitor.work_area();
                    width = width.min(area.size.width.saturating_sub(24).max(80));
                    if width > size.width {
                        if let Ok(current) = panel_position(&window) {
                            let x = current.x.clamp(
                                area.position.x,
                                (area.position.x + area.size.width as i32 - width as i32)
                                    .max(area.position.x),
                            );
                            if x != current.x {
                                position = Some(tauri::PhysicalPosition::new(x, current.y));
                            }
                        }
                    }
                }
                let _ = window.set_size(tauri::PhysicalSize::new(width, size.height));
                if let Some(position) = position {
                    let _ = window.set_position(position);
                }
            }
        }
    }
}

fn panel_position(window: &tauri::WebviewWindow) -> tauri::Result<tauri::PhysicalPosition<i32>> {
    // GTK frame extents can include a hidden decoration above a frameless
    // window. Configure-event client coordinates match gtk_window_move here.
    #[cfg(target_os = "linux")]
    return window.inner_position();
    #[cfg(not(target_os = "linux"))]
    window.outer_position()
}
fn replace_reference(
    app: &tauri::AppHandle,
    path: &str,
    replacement: PathBuf,
) -> Result<(), String> {
    let state = app.state::<AppState>();
    let mut collection = state.collection.lock().unwrap();
    let previous = collection.paths();
    let replacement_path = replacement.to_string_lossy().into_owned();
    collection.relink(path, replacement)?;
    *state.undo_collection.lock().unwrap() = Some((previous, Some(replacement_path)));
    drop(collection);
    *state.last_message.lock().unwrap() =
        "来源已重新定位，请核对更新后的目录预览；正在执行的任务不受影响。".into();
    persist(app);
    emit(app);
    Ok(())
}
#[tauri::command]
async fn relink_entry(
    app: tauri::AppHandle,
    path: String,
    directory: bool,
) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _edge_hold = edge::hold(&app);
        #[cfg(target_os = "linux")]
        let _topmost = app.get_webview_window("main").map(|window| {
            let previous = app.state::<AppState>().pinned.load(Ordering::Relaxed);
            let _ = window.set_always_on_top(false);
            DialogTopmostGuard(window, previous)
        });
        let mut dialog = app.dialog().file().set_title(native_text(
            &app,
            "重新定位来源（替换清单引用）",
            "Relink source (replace collection reference)",
        ));
        if let Some(window) = app.get_webview_window("main") {
            dialog = dialog.set_parent(&window);
        }
        let selected = if directory {
            dialog.blocking_pick_folder()
        } else {
            dialog.blocking_pick_file()
        };
        let Some(replacement) = selected.and_then(|p| p.into_path().ok()) else {
            return Ok(false);
        };
        replace_reference(&app, &path, replacement)?;
        Ok(true)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn pick_entries(app: tauri::AppHandle, directories: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _edge_hold = edge::hold(&app);
        #[cfg(target_os = "linux")]
        let _topmost = app.get_webview_window("main").map(|window| {
            let previous = app.state::<AppState>().pinned.load(Ordering::Relaxed);
            let _ = window.set_always_on_top(false);
            DialogTopmostGuard(window, previous)
        });
        let mut dialog = app.dialog().file().set_title(if directories {
            native_text(&app, "选择文件夹", "Select folders")
        } else {
            native_text(&app, "选择文件", "Select files")
        });
        if let Some(window) = app.get_webview_window("main") {
            dialog = dialog.set_parent(&window);
        }
        let paths = if directories {
            dialog.blocking_pick_folders()
        } else {
            dialog.blocking_pick_files()
        };
        if let Some(paths) = paths {
            add(
                &app,
                paths
                    .into_iter()
                    .filter_map(|p| p.into_path().ok())
                    .collect(),
            );
        }
    })
    .await
    .map_err(|e| e.to_string())
}
#[tauri::command]
async fn prepare(app: tauri::AppHandle) -> Result<Plan, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let paths = state.collection.lock().unwrap().paths();
        let plan = build_plan(paths);
        *state.prepared.lock().unwrap() = Some(plan.clone());
        plan
    })
    .await
    .map_err(|e| e.to_string())
}
#[tauri::command]
async fn choose_output(app: tauri::AppHandle, format: Format) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _edge_hold = edge::hold(&app);
        #[cfg(target_os = "linux")]
        let _topmost = app.get_webview_window("main").map(|window| {
            let previous = app.state::<AppState>().pinned.load(Ordering::Relaxed);
            let _ = window.set_always_on_top(false);
            DialogTopmostGuard(window, previous)
        });
        let settings = app.state::<AppState>().settings.lock().unwrap().clone();
        let name = format!(
            "GatherPack_{}.{}",
            chrono::Local::now().format("%Y%m%d_%H%M%S"),
            format.extension()
        );
        let mut dialog = app
            .dialog()
            .file()
            .set_title(native_text(&app, "保存压缩包", "Save archive"))
            .set_file_name(&name)
            .add_filter(
                native_text(&app, "压缩包", "Archive"),
                &[format.extension()],
            );
        if let Some(window) = app.get_webview_window("main") {
            dialog = dialog.set_parent(&window);
        }
        if let Some(dir) = settings.last_directory {
            dialog = dialog.set_directory(dir);
        }
        dialog
            .blocking_save_file()
            .and_then(|p| p.into_path().ok())
            .map(|p| p.to_string_lossy().into_owned())
    })
    .await
    .map_err(|e| e.to_string())
}
#[tauri::command]
async fn start_pack(
    app: tauri::AppHandle,
    output: String,
    format: Format,
    skip_issues: bool,
    expected_plan: Plan,
) -> Result<(), String> {
    let state = app.state::<AppState>();
    let plan = state
        .prepared
        .lock()
        .unwrap()
        .clone()
        .ok_or("请先检查目录预览")?;
    if plan != expected_plan || state.collection.lock().unwrap().paths() != plan.sources {
        return Err("清单或预览已改变，请重新检查并确认".into());
    }
    if state.running.swap(true, Ordering::SeqCst) {
        return Err("已有打包任务".into());
    }
    state.cancel.store(false, Ordering::SeqCst);
    *state.task.lock().unwrap() = Task {
        running: true,
        phase: "准备：重新检查目录".into(),
        ..Task::default()
    };
    emit(&app);
    let fallback_plan = plan.clone();
    let fallback_output = output.clone();
    let worker_app = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let app = worker_app;
        let state = app.state::<AppState>();
        // The task owns this plan; subsequent public collection changes are independent.
        let fresh = build_plan_with_cancel(plan.sources.clone(), &state.cancel);
        if state.cancel.load(Ordering::Relaxed) {
            return Err("用户取消准备".into());
        }
        if fresh != plan {
            *state.prepared.lock().unwrap() = Some(fresh);
            return Err("源目录或问题列表已变化，请重新查看预览并确认".into());
        }
        if plan.issues.iter().any(|i| i.blocking) && !skip_issues {
            return Err("请修正问题，或明确勾选跳过所列问题".into());
        }
        let output = PathBuf::from(output);
        if !output
            .to_string_lossy()
            .to_lowercase()
            .ends_with(&format!(".{}", format.extension()))
        {
            return Err("输出扩展名与压缩格式不一致".into());
        }
        gatherpack_collection::validate_output(&plan, &output)?;
        {
            let mut task = state.task.lock().unwrap();
            task.phase = "打包中".into();
            task.total_bytes = plan.total_bytes;
        }
        let mut bytes = 0;
        let mut last = Instant::now();
        let report = pack(&plan, &output, format, &state.cancel, |n| {
            bytes += n;
            if last.elapsed() >= Duration::from_millis(100) {
                state.task.lock().unwrap().bytes = bytes;
                let _ = app.emit("task-progress", state.task.lock().unwrap().clone());
                last = Instant::now();
            }
        });
        let mut warning = None;
        if let Ok(dir) = data_dir(&app) {
            let report_path = dir.join("last-report.json");
            if let Err(e) = save_json(&report_path, &report) {
                warning = Some(format!("结果报告未保存：{e}"));
            }
            let history = dir.join("reports");
            let _ = std::fs::create_dir_all(&history);
            if let Err(e) = save_json(
                &history.join(format!(
                    "{}.json",
                    chrono::Utc::now().format("%Y%m%dT%H%M%S%.9f")
                )),
                &report,
            ) {
                warning = Some(format!("历史报告未保存：{e}"));
            }
        } else {
            warning = Some("无法保存本机报告".into());
        }
        if let Some(parent) = output.parent() {
            state.settings.lock().unwrap().last_directory =
                Some(parent.to_string_lossy().into_owned());
        }
        *state.task.lock().unwrap() = Task {
            running: false,
            phase: report.status.clone(),
            bytes,
            total_bytes: plan.total_bytes,
            report: Some(report),
        };
        if let Some(warning) = warning {
            *state.last_message.lock().unwrap() = warning;
        }
        persist(&app);
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())
    .and_then(|r| r);
    let state = app.state::<AppState>();
    if let Err(ref e) = result {
        let report = Report {
            status: if state.cancel.load(Ordering::Relaxed) {
                "cancelled"
            } else {
                "failed"
            }
            .into(),
            output: fallback_output,
            written: vec![],
            skipped: vec![],
            failed: vec![],
            pending: fallback_plan
                .entries
                .iter()
                .filter(|e| !e.directory)
                .map(|e| e.source.clone())
                .collect(),
            empty_directories: 0,
            renames: fallback_plan.renames,
            error: Some(e.clone()),
            delivered: false,
            issues: fallback_plan.issues,
        };
        if let Ok(dir) = data_dir(&app) {
            let _ = save_json(&dir.join("last-report.json"), &report);
        }
        let mut task = state.task.lock().unwrap();
        task.running = false;
        task.phase = format!("准备失败：{e}");
        task.report = Some(report);
    }
    state.running.store(false, Ordering::SeqCst);
    emit(&app);
    result
}
#[tauri::command]
fn cancel_pack(state: State<'_, AppState>) {
    state.cancel.store(true, Ordering::SeqCst);
}
#[tauri::command]
fn save_settings(
    app: tauri::AppHandle,
    format: Format,
    shortcut: String,
    autostart: bool,
    language: Option<Language>,
    edge_hide: Option<bool>,
) -> Result<(), String> {
    let state = app.state::<AppState>();
    let old = state.settings.lock().unwrap().clone();
    if shortcut != old.shortcut && !state.shortcut_available.load(Ordering::Relaxed) {
        return Err("当前环境的全局快捷键后端不可用；仍可使用拖拽和添加文件".into());
    }
    let needs_registration = shortcut != old.shortcut
        || (state.shortcut_available.load(Ordering::Relaxed)
            && !app.global_shortcut().is_registered(shortcut.as_str()));
    if needs_registration {
        app.global_shortcut()
            .register(shortcut.as_str())
            .map_err(|e| format!("快捷键冲突或无法注册：{e}"))?;
    }
    let auto_result = if autostart == old.autostart {
        Ok(())
    } else if autostart {
        app.autolaunch().enable()
    } else {
        app.autolaunch().disable()
    };
    if let Err(e) = auto_result {
        if needs_registration {
            let _ = app.global_shortcut().unregister(shortcut.as_str());
        }
        return Err(format!("开机启动设置失败：{e}"));
    }
    if shortcut != old.shortcut {
        let _ = app.global_shortcut().unregister(old.shortcut.as_str());
    }
    *state.settings.lock().unwrap() = Settings {
        format,
        shortcut,
        autostart,
        language: language.unwrap_or(old.language),
        edge_hide: edge_hide.unwrap_or(old.edge_hide),
        ..old
    };
    if state.shortcut_available.load(Ordering::Relaxed) {
        let registered = app
            .global_shortcut()
            .is_registered(state.settings.lock().unwrap().shortcut.as_str());
        if registered {
            *state.shortcut_status.lock().unwrap() = "快捷键已注册".into();
        }
    }
    persist(&app);
    edge::restore(&app);
    update_native_language(&app);
    emit(&app);
    Ok(())
}
#[tauri::command]
fn retry_shortcut(app: tauri::AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    if !state.shortcut_available.load(Ordering::Relaxed) {
        return Err(
            "全局快捷键后端不可用，请退出后重新启动应用；Ubuntu 请使用 GNOME/X11 会话".into(),
        );
    }
    let shortcut = state.settings.lock().unwrap().shortcut.clone();
    let result = (|| {
        if app.global_shortcut().is_registered(shortcut.as_str()) {
            app.global_shortcut()
                .unregister(shortcut.as_str())
                .map_err(|error| error.to_string())?;
        }
        app.global_shortcut()
            .register(shortcut.as_str())
            .map_err(|error| {
                format!("快捷键注册失败，请关闭占用此组合键的其他程序，或在设置中换键：{error}")
            })
    })();
    *state.shortcut_status.lock().unwrap() = match &result {
        Ok(()) => "快捷键已注册".into(),
        Err(error) => error.clone(),
    };
    if result.is_ok() {
        *state.last_message.lock().unwrap() =
            "快捷键已重新注册。请切回文件管理器，选中文件后按收集快捷键。".into();
        #[cfg(target_os = "linux")]
        match linux_bridge::install(&app) {
            Ok(Some(message)) | Err(message) => *state.last_message.lock().unwrap() = message,
            Ok(None) => {}
        }
    }
    emit(&app);
    result
}
#[tauri::command]
async fn linux_connection_diagnostics(
    app: tauri::AppHandle,
    restart_confirmed: bool,
) -> Result<serde_json::Value, String> {
    #[cfg(target_os = "linux")]
    {
        let result = tauri::async_runtime::spawn_blocking(move || {
            selection::connection_diagnostics(restart_confirmed)
        })
        .await
        .map_err(|e| e.to_string())??;
        if restart_confirmed {
            if let Some(message) = result.get("summary").and_then(|v| v.as_str()) {
                *app.state::<AppState>().last_message.lock().unwrap() = message.into();
            }
            emit(&app);
        }
        return Ok(result);
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = (app, restart_confirmed);
        Err("此连接检查仅适用于 Linux".into())
    }
}
fn expand(app: &tauri::AppHandle, expanded: bool, focus: bool) {
    edge::restore(app);
    let state = app.state::<AppState>();
    state.expanded.store(expanded, Ordering::Relaxed);
    if let Some(window) = app.get_webview_window("main") {
        // GTK otherwise negotiates a 200×200 content minimum. Explicit bounds
        // also prevent a fixed compact window retaining its expanded size.
        let _ = window.set_resizable(true);
        let _ = window.set_min_size(Some(tauri::LogicalSize::new(80.0, 80.0)));
        let _ = window.set_max_size(None::<tauri::PhysicalSize<u32>>);
        let (width, height) = if expanded {
            (
                if state.panel_wide.load(Ordering::Relaxed) {
                    900.0_f64
                } else {
                    440.0_f64
                },
                760.0_f64,
            )
        } else {
            (104.0, 112.0)
        };
        if let Ok(Some(monitor)) = window.current_monitor() {
            let area = monitor.work_area();
            let width = ((width * monitor.scale_factor()).round() as u32)
                .min(area.size.width.saturating_sub(24).max(80));
            let height = ((height * monitor.scale_factor()).round() as u32)
                .min(area.size.height.saturating_sub(24).max(80));
            let position = panel_position(&window).unwrap_or(area.position);
            let x = position.x.clamp(
                area.position.x,
                (area.position.x + area.size.width as i32 - width as i32).max(area.position.x),
            );
            let y = position.y.clamp(
                area.position.y,
                (area.position.y + area.size.height as i32 - height as i32).max(area.position.y),
            );
            if !expanded {
                let _ = window.set_min_size(Some(tauri::PhysicalSize::new(width, height)));
                let _ = window.set_max_size(Some(tauri::PhysicalSize::new(width, height)));
            }
            let _ = window.set_size(tauri::PhysicalSize::new(width, height));
            if x != position.x || y != position.y {
                let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
            }
        } else {
            if !expanded {
                let _ = window.set_min_size(Some(tauri::LogicalSize::new(width, height)));
                let _ = window.set_max_size(Some(tauri::LogicalSize::new(width, height)));
            }
            let _ = window.set_size(tauri::LogicalSize::new(width, height));
        }
        // GTK uses the web content's natural size when resizable=false. Keep
        // its sizing enabled and enforce equal compact min/max bounds instead.
        #[cfg(target_os = "linux")]
        let _ = window.set_resizable(true);
        #[cfg(not(target_os = "linux"))]
        let _ = window.set_resizable(expanded);
        let _ = window.show();
        if focus {
            let _ = window.set_focus();
        }
    }
    emit(app);
}
#[tauri::command]
fn set_expanded(app: tauri::AppHandle, expanded: bool) {
    expand(&app, expanded, true);
}
#[tauri::command]
fn hide_window(app: tauri::AppHandle) -> Result<(), String> {
    if !app
        .state::<AppState>()
        .tray_available
        .load(Ordering::Relaxed)
    {
        return Err("托盘不可用，暂不能隐藏；可收起为悬浮图标".into());
    }
    if let Some(w) = app.get_webview_window("main") {
        w.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}
#[tauri::command]
fn exit_app(app: tauri::AppHandle) -> Result<(), String> {
    if app.state::<AppState>().running.load(Ordering::Relaxed) {
        return Err("请先取消任务，待清理完成后退出".into());
    }
    app.exit(0);
    Ok(())
}
#[tauri::command]
fn reveal(app: tauri::AppHandle, path: String) -> Result<(), String> {
    app.opener()
        .reveal_item_in_dir(path)
        .map_err(|e| e.to_string())
}
fn collect_from_selection(app: tauri::AppHandle) {
    let state = app.state::<AppState>();
    state.shortcut_last_triggered.store(
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64,
        Ordering::Relaxed,
    );
    if state.collecting.swap(true, Ordering::SeqCst) {
        return;
    }
    *state.last_message.lock().unwrap() = "已收到快捷键，正在读取前台文件管理器的选中项…".into();
    emit(&app);
    std::thread::spawn(move || {
        let result = selection::capture();
        let state = app.state::<AppState>();
        if let Some(e) = result.error {
            *state.last_message.lock().unwrap() = e;
            emit(&app);
        } else {
            add_with_rejected(
                &app,
                result.paths.into_iter().map(PathBuf::from).collect(),
                result.rejected,
            );
        }
        state.collecting.store(false, Ordering::SeqCst);
    });
}
fn main() {
    if std::env::args().any(|arg| arg == "--probe-selection") {
        let result = selection::capture();
        println!("{}", serde_json::to_string_pretty(&result).unwrap());
        std::process::exit(if result.error.is_none() { 0 } else { 2 });
    }
    let smoke_test = std::env::args().any(|arg| arg == "--smoke-test");
    let validation = validation::arguments().unwrap_or_else(|error| {
        eprintln!("{error}");
        std::process::exit(4);
    });
    let mut context = tauri::generate_context!();
    #[cfg(target_os = "linux")]
    for window in &mut context.config_mut().app.windows {
        window.transparent = true;
        window.resizable = true;
        window.min_width = Some(window.width);
        window.min_height = Some(window.height);
    }
    if smoke_test || validation.is_some() {
        for w in &mut context.config_mut().app.windows {
            // WebKitGTK defers page initialization for an unmapped window.
            // Linux validation runs in its own disposable desktop session.
            w.visible = cfg!(target_os = "linux") && validation.is_some();
        }
    }
    tauri::Builder::default()
        .manage(AppState {
            pinned: AtomicBool::new(true),
            smoke_test,
            validation,
            ..AppState::default()
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .setup(move |app| {
            let handle = app.handle();
            let state = app.state::<AppState>();
            let migration_notice = if !smoke_test && state.validation.is_none() {
                match app.path().data_dir().map_err(|e| e.to_string()).and_then(|base| {
                    let target = app.path().app_data_dir().map_err(|e| e.to_string())?;
                    profile::import_legacy(&base.join(profile::LEGACY_IDENTIFIER), &target)
                }) {
                    Ok(true) => Some("已导入旧版清单、设置与报告；旧记录保留。开机启动请在新版本设置中重新启用。".to_string()),
                    Ok(false) => None,
                    Err(error) => Some(format!("旧版配置未导入，原记录保留：{error}")),
                }
            } else { None };
            if let Some(context) = &state.validation {
                validation::seed(context).map_err(std::io::Error::other)?;
            }
            if smoke_test {
                let h = handle.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_secs(15));
                    h.exit(3);
                });
            } else {
                match data_dir(handle).and_then(|p| match std::fs::read(p.join("state.json")) {
                    Ok(b) => serde_json::from_slice::<Saved>(&b)
                        .map(Some)
                        .map_err(|e| e.to_string()),
                    Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
                    Err(e) => Err(e.to_string()),
                }) {
                    Ok(Some(saved)) => {
                        *state.collection.lock().unwrap() = Collection::restore(saved.paths);
                        *state.settings.lock().unwrap() = saved.settings;
                    }
                    Ok(None) => {}
                    Err(e) => {
                        *state.last_message.lock().unwrap() = format!("恢复失败，原记录保留：{e}");
                    }
                }
                if let Ok(dir) = data_dir(handle) {
                    if let Ok(b) = std::fs::read(dir.join("last-report.json")) {
                        state.task.lock().unwrap().report = serde_json::from_slice(&b).ok();
                    }
                }
                if state.validation.is_none() {
                    if let Ok(enabled) = app.autolaunch().is_enabled() {
                        state.settings.lock().unwrap().autostart = enabled;
                    }
                    #[cfg(target_os = "linux")]
                    match linux_bridge::install(handle) {
                        Ok(Some(message)) => *state.last_message.lock().unwrap() = message,
                        Err(e) => {
                            *state.last_message.lock().unwrap() =
                                format!("Nautilus 桥接未就绪：{e}")
                        }
                        _ => {}
                    }
                    let shortcut = state.settings.lock().unwrap().shortcut.clone();
                    let shortcut_plugin = tauri_plugin_global_shortcut::Builder::new()
                        .with_handler(|app, _, event| {
                            if event.state() == ShortcutState::Pressed {
                                collect_from_selection(app.clone());
                            }
                        })
                        .build();
                    *state.shortcut_status.lock().unwrap() = match handle.plugin(shortcut_plugin) {
                        Err(e) => format!("快捷键后端不可用：{e}"),
                        Ok(_) => {
                            state.shortcut_available.store(true, Ordering::Relaxed);
                            match app.global_shortcut().register(shortcut.as_str()) {
                                Ok(_) => "快捷键已注册".into(),
                                Err(e) => format!("快捷键注册失败：{e}"),
                            }
                        }
                    };
                    use tauri::{
                        menu::{Menu, MenuItem},
                        tray::TrayIconBuilder,
                    };
                    let show = MenuItem::with_id(app, "show", "打开收集栏", true, None::<&str>)?;
                    let hide = MenuItem::with_id(app, "hide", "隐藏收集栏", true, None::<&str>)?;
                    let quit =
                        MenuItem::with_id(app, "quit", "退出 GatherPack", true, None::<&str>)?;
                    let menu = Menu::with_items(app, &[&show, &hide, &quit])?;
                    *state.native_menu.lock().unwrap() = vec![(show, "打开收集栏", "Open collection"), (hide, "隐藏收集栏", "Hide collection"), (quit, "退出 GatherPack", "Quit GatherPack")];
                    let mut tray = TrayIconBuilder::with_id("main")
                        .menu(&menu)
                        .tooltip("GatherPack · 文件收集与打包")
                        .on_menu_event(|app, event| match event.id.as_ref() {
                            "show" => expand(app, true, true),
                            "hide" => {
                                if let Some(w) = app.get_webview_window("main") {
                                    let _ = w.hide();
                                }
                            }
                            "quit" => {
                                if let Err(e) = exit_app(app.clone()) {
                                    *app.state::<AppState>().last_message.lock().unwrap() = e;
                                    expand(app, true, true);
                                }
                            }
                            _ => {}
                        });
                    if let Some(icon) = app.default_window_icon() {
                        tray = tray.icon(icon.clone());
                    }
                    match tray.build(app) {
                        Ok(_) => {
                            #[cfg(target_os = "linux")]
                            let available = linux_bridge::tray_host_available();
                            #[cfg(not(target_os = "linux"))]
                            let available = true;
                            state.tray_available.store(available, Ordering::Relaxed);
                            if !available {
                                let mut message = state.last_message.lock().unwrap();
                                if !message.is_empty() { message.push('\n'); }
                                message.push_str("当前桌面没有系统托盘，收集栏将保留窗口入口");
                            }
                        }
                        Err(e) => {
                            let mut message = state.last_message.lock().unwrap();
                            if !message.is_empty() { message.push('\n'); }
                            message.push_str(&format!("托盘不可用，仍可通过窗口操作：{e}"));
                        }
                    }
                }
            }
            if let Some(notice) = migration_notice {
                let mut message = state.last_message.lock().unwrap();
                if !message.is_empty() { message.push('\n'); }
                message.push_str(&notice);
            }
            let window = app.get_webview_window("main").unwrap();
            update_native_language(handle);
            window.on_window_event({
                let h = handle.clone();
                move |event| match event {
                    tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Enter { .. }) => {
                        edge::restore(&h);
                    }
                    tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) => {
                        let h = h.clone();
                        let paths = paths.clone();
                        std::thread::spawn(move || {
                            add(&h, paths);
                            expand(&h, true, false);
                        });
                    }
                    tauri::WindowEvent::CloseRequested { api, .. } => {
                        api.prevent_close();
                        expand(&h, false, false);
                    }
                    _ => {}
                }
            });
            if !smoke_test && state.validation.is_none() { edge::start(handle.clone()); }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            snapshot,
            reveal_dock,
            set_edge_blocked,
            frontend_ready,
            remove_entry,
            clear_entries,
            undo_collection,
            relink_entry,
            set_pinned,
            set_panel_wide,
            pick_entries,
            prepare,
            choose_output,
            start_pack,
            cancel_pack,
            save_settings,
            retry_shortcut,
            linux_connection_diagnostics,
            set_expanded,
            hide_window,
            exit_app,
            reveal,
            validation::validation_add,
            validation::validation_relink,
            validation::validation_remove_source,
            validation::validation_done
        ])
        .build(context)
        .expect("启动 GatherPack 失败")
        .run(|app, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                if app.state::<AppState>().running.load(Ordering::Relaxed) {
                    api.prevent_exit();
                    *app.state::<AppState>().last_message.lock().unwrap() =
                        "请先取消任务，待临时输出清理完成后退出".into();
                    expand(app, true, true);
                }
            }
        });
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn legacy_settings_default_to_chinese_and_new_preferences_roundtrip() {
        let mut settings: Settings = serde_json::from_str(
            r#"{"format":"Zip","shortcut":"Control+Alt+Shift+E","autostart":false}"#,
        )
        .unwrap();
        assert!(settings.language == Language::Chinese);
        assert!(settings.edge_hide);
        settings.language = Language::English;
        settings.edge_hide = false;
        let restored: Settings =
            serde_json::from_slice(&serde_json::to_vec(&settings).unwrap()).unwrap();
        assert!(restored.language == Language::English);
        assert!(!restored.edge_hide);
        assert!(serde_json::from_str::<Settings>(r#"{"language":"invalid"}"#).is_err());
    }
    #[test]
    fn persisted_collection_and_settings_survive_replacement_and_missing_source() {
        let dir = tempfile::tempdir().unwrap();
        let source = dir.path().join("source.txt");
        std::fs::write(&source, b"preserved").unwrap();
        let path = dir.path().join("state.json");
        let mut saved = Saved {
            paths: vec![source.to_string_lossy().into_owned()],
            settings: Settings::default(),
        };
        save_json(&path, &saved).unwrap();
        saved.settings.format = Format::SevenZip;
        saved.settings.last_directory = Some(dir.path().to_string_lossy().into_owned());
        save_json(&path, &saved).unwrap();
        let restored: Saved = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        assert_eq!(restored.settings.format, Format::SevenZip);
        assert!(!restored.settings.autostart);
        assert_eq!(restored.paths, saved.paths);
        assert_eq!(std::fs::read(&source).unwrap(), b"preserved");
        std::fs::remove_file(&source).unwrap();
        let entries = Collection::restore(restored.paths).entries();
        assert_ne!(entries[0].status, "可用");
        assert_eq!(
            std::fs::read_dir(dir.path()).unwrap().count(),
            1,
            "no temporary state files remain"
        );
    }
}
