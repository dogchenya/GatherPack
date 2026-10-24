use crate::{add, data_dir, save_json, AppState};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
};
use tauri::{Manager, State};

#[derive(Clone, Serialize, Deserialize)]
pub struct ValidationContext {
    pub root: String,
    pub scenario: String,
}

pub fn arguments() -> Result<Option<ValidationContext>, String> {
    let args: Vec<_> = std::env::args().collect();
    let Some(root) = args
        .iter()
        .find_map(|s| s.strip_prefix("--validation-dir="))
    else {
        return Ok(None);
    };
    let root = PathBuf::from(root);
    if !root.is_absolute() {
        return Err("validation-dir must be absolute".into());
    }
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    let root = root.canonicalize().map_err(|e| e.to_string())?;
    let scenario = args
        .iter()
        .find_map(|s| s.strip_prefix("--validation-scenario="))
        .unwrap_or("core");
    if !["core", "restore", "desktop"].contains(&scenario) {
        return Err("unknown validation scenario".into());
    }
    Ok(Some(ValidationContext {
        root: root.to_string_lossy().into_owned(),
        scenario: scenario.into(),
    }))
}
fn checked_path(state: &AppState, path: &str) -> Result<PathBuf, String> {
    let context = state
        .validation
        .as_ref()
        .ok_or("validation mode is disabled")?;
    let path = Path::new(path).canonicalize().map_err(|e| e.to_string())?;
    let fixtures = Path::new(&context.root)
        .join("fixtures")
        .canonicalize()
        .map_err(|e| e.to_string())?;
    if !path.starts_with(fixtures) {
        return Err("validation paths must stay inside generated fixtures".into());
    }
    Ok(path)
}
pub fn seed(context: &ValidationContext) -> Result<(), String> {
    if context.scenario == "restore" || context.scenario == "desktop" {
        return Ok(());
    }
    let root = Path::new(&context.root);
    if root.join("profile/state.json").exists() {
        return Err("core validation requires a fresh isolated directory".into());
    }
    for directory in [
        "fixtures/A",
        "fixtures/B",
        "fixtures/Bundle/nested",
        "fixtures/Bundle/empty",
        "fixtures/Bundle/.git",
    ] {
        fs::create_dir_all(root.join(directory)).map_err(|e| e.to_string())?;
    }
    for (name, content) in [
        ("A/report.txt", "alpha"),
        ("B/report.txt", "beta"),
        ("Bundle/nested/file.txt", "nested"),
        ("Bundle/.git/config", "hidden"),
        ("new.txt", "next task"),
    ] {
        let mut file = fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(root.join("fixtures").join(name))
            .map_err(|e| e.to_string())?;
        file.write_all(content.as_bytes())
            .map_err(|e| e.to_string())?;
    }
    fs::OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(root.join("fixtures/slow.bin"))
        .map_err(|e| e.to_string())?
        .set_len(128 * 1024 * 1024)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn validation_desktop_action(
    app: tauri::AppHandle,
    action: String,
) -> Result<serde_json::Value, String> {
    let state = app.state::<AppState>();
    let context = state
        .validation
        .as_ref()
        .filter(|c| c.scenario == "desktop")
        .ok_or("desktop validation is disabled")?;
    let window = app.get_webview_window("main").ok_or("window unavailable")?;
    window
        .set_title("GatherPack · 本地窗口验证")
        .map_err(|e| e.to_string())?;
    if action == "fit-panel" {
        let monitor = window
            .current_monitor()
            .map_err(|e| e.to_string())?
            .ok_or("monitor unavailable")?;
        let size = window.inner_size().map_err(|e| e.to_string())?;
        window
            .set_size(tauri::PhysicalSize::new(
                size.width.min(monitor.work_area().size.width / 2 - 2),
                size.height.min(monitor.work_area().size.height / 2 - 2),
            ))
            .map_err(|e| e.to_string())?;
    }
    if action.starts_with("place-") {
        crate::edge::restore(&app);
        let monitor = window
            .current_monitor()
            .map_err(|e| e.to_string())?
            .ok_or("monitor unavailable")?;
        let work = monitor.work_area();
        let size = window.inner_size().map_err(|e| e.to_string())?;
        let mut gap = (if action.ends_with("-over") {
            -80.0
        } else {
            24.0
        } * monitor.scale_factor())
        .round() as i32;
        let edge_action = action.trim_end_matches("-over");
        if gap > 0 {
            let room = if matches!(edge_action, "place-top" | "place-bottom") {
                work.size.height.saturating_sub(size.height)
            } else {
                work.size.width.saturating_sub(size.width)
            };
            gap = gap.min((room / 3) as i32);
            let other_room = if matches!(edge_action, "place-top" | "place-bottom") {
                work.size.width.saturating_sub(size.width)
            } else {
                work.size.height.saturating_sub(size.height)
            };
            gap = gap.min((other_room / 6) as i32);
            if state.expanded.load(std::sync::atomic::Ordering::Relaxed) {
                gap = 0;
            }
            if matches!(edge_action, "place-left" | "place-right") {
                let margin = ((work.size.height / 2).saturating_sub(size.height) / 2)
                    .min((64.0 * monitor.scale_factor()) as u32)
                    .max(1);
                gap = gap.min((margin / 2) as i32);
            }
        }
        let x = match edge_action {
            "place-left" => work.position.x + gap,
            "place-right" => work.position.x + work.size.width as i32 - size.width as i32 - gap,
            "place-top" | "place-bottom" => {
                // Test hiding with the pointer outside the window, without moving
                // the user's mouse. A wide panel otherwise covers a centered pointer.
                let margin = if state.expanded.load(std::sync::atomic::Ordering::Relaxed) {
                    1
                } else {
                    (64.0 * monitor.scale_factor()).round() as i32
                };
                if app
                    .cursor_position()
                    .map(|p| p.x < (work.position.x + work.size.width as i32 / 2) as f64)
                    .unwrap_or(true)
                {
                    work.position.x + work.size.width as i32 - size.width as i32 - margin
                } else {
                    work.position.x + margin
                }
            }
            _ => work.position.x + (work.size.width as i32 - size.width as i32) / 2,
        };
        let y = match edge_action {
            "place-top" => work.position.y + gap,
            "place-bottom" => work.position.y + work.size.height as i32 - size.height as i32 - gap,
            "place-left" | "place-right" => {
                let room = work.size.height.saturating_sub(size.height) as i32;
                let margin = ((work.size.height / 2).saturating_sub(size.height) / 2)
                    .min((64.0 * monitor.scale_factor()) as u32)
                    .max(1) as i32;
                if app
                    .cursor_position()
                    .map(|p| p.y < (work.position.y + work.size.height as i32 / 2) as f64)
                    .unwrap_or(true)
                {
                    work.position.y + room - margin
                } else {
                    work.position.y + margin
                }
            }
            _ => work.position.y + (work.size.height.saturating_sub(size.height) / 2) as i32,
        };
        window
            .set_position(tauri::PhysicalPosition::new(x, y))
            .map_err(|e| e.to_string())?;
        window.show().map_err(|e| e.to_string())?;
    }
    let edge = state.edge.lock().unwrap().diagnostics();
    let result = serde_json::json!({
        "outerPosition": format!("{:?}", window.outer_position()),
        "innerPosition": format!("{:?}", window.inner_position()),
        "outerOrigin": window.outer_position().ok(), "innerOrigin": window.inner_position().ok(),
        "outerSize": window.outer_size().ok(), "innerSize": window.inner_size().ok(),
        "scale": window.scale_factor().ok(), "cursor": app.cursor_position().ok(),
        "monitor": window.current_monitor().ok().flatten().map(|m| serde_json::json!({"position":m.position(),"size":m.size(),"workPosition":m.work_area().position,"workSize":m.work_area().size})),
        "edge": edge,
        "snapshot": crate::read_snapshot(&state),
    });
    save_json(
        &Path::new(&context.root).join("desktop-latest.json"),
        &result,
    )?;
    Ok(result)
}

#[tauri::command]
pub fn validation_desktop_report(
    app: tauri::AppHandle,
    result: serde_json::Value,
) -> Result<(), String> {
    let state = app.state::<AppState>();
    let context = state
        .validation
        .as_ref()
        .filter(|c| c.scenario == "desktop")
        .ok_or("desktop validation is disabled")?;
    save_json(
        &Path::new(&context.root).join("desktop-report.json"),
        &result,
    )
}
#[tauri::command]
pub fn validation_add(app: tauri::AppHandle, paths: Vec<String>) -> Result<(), String> {
    let state = app.state::<AppState>();
    let checked = paths
        .iter()
        .map(|p| checked_path(&state, p))
        .collect::<Result<Vec<_>, _>>()?;
    add(&app, checked);
    Ok(())
}
#[tauri::command]
pub fn validation_relink(
    app: tauri::AppHandle,
    path: String,
    replacement: String,
) -> Result<(), String> {
    let state = app.state::<AppState>();
    checked_path(&state, &path)?;
    let replacement = checked_path(&state, &replacement)?;
    crate::replace_reference(&app, &path, replacement)
}
#[tauri::command]
pub fn validation_remove_source(state: State<'_, AppState>, path: String) -> Result<(), String> {
    let path = checked_path(&state, &path)?;
    if path.file_name().and_then(|n| n.to_str()) != Some("new.txt") {
        return Err("only the generated disposable new.txt fixture may be removed".into());
    }
    fs::remove_file(path).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn validation_done(app: tauri::AppHandle, result: serde_json::Value) -> Result<(), String> {
    let state = app.state::<AppState>();
    let context = state
        .validation
        .as_ref()
        .ok_or("validation mode is disabled")?;
    let root = Path::new(&context.root);
    let mut result = result;
    let verification = (|| -> Result<(), String> {
        for (name, content) in [
            ("A/report.txt", "alpha"),
            ("B/report.txt", "beta"),
            ("Bundle/nested/file.txt", "nested"),
            ("Bundle/.git/config", "hidden"),
        ] {
            if fs::read(root.join("fixtures").join(name)).map_err(|e| e.to_string())?
                != content.as_bytes()
            {
                return Err(format!("source changed: {name}"));
            }
        }
        for (name, magic) in [
            ("out.zip", &[0x50, 0x4b][..]),
            ("out.7z", &[0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c][..]),
            ("out.tar.gz", &[0x1f, 0x8b][..]),
            ("frozen.zip", &[0x50, 0x4b][..]),
            ("skipped.zip", &[0x50, 0x4b][..]),
        ] {
            let mut header = vec![0; magic.len()];
            fs::File::open(root.join(name))
                .map_err(|e| e.to_string())?
                .read_exact(&mut header)
                .map_err(|e| e.to_string())?;
            if header != magic {
                return Err(format!("wrong archive format: {name}"));
            }
        }
        if root.join("cancel.7z").exists() {
            return Err("cancelled archive was published".into());
        }
        if fs::read_dir(root).map_err(|e| e.to_string())?.any(|e| {
            e.map(|e| e.file_name().to_string_lossy().starts_with(".tmp"))
                .unwrap_or(true)
        }) {
            return Err("temporary output remains".into());
        }
        let profile = data_dir(&app)?;
        if !profile.join("state.json").is_file() || !profile.join("last-report.json").is_file() {
            return Err("persistence files missing".into());
        }
        Ok(())
    })();
    result["nativeVerification"] = match verification {
        Ok(()) => {
            serde_json::json!({"passed": true, "checks": ["source bytes unchanged", "real archive signatures", "cancel cleanup", "state and report on disk"]})
        }
        Err(e) => {
            result["passed"] = false.into();
            serde_json::json!({"passed": false, "error": e})
        }
    };
    let passed = result["passed"] == true;
    save_json(
        &root.join(format!("native-{}.json", context.scenario)),
        &result,
    )?;
    app.exit(if passed { 0 } else { 4 });
    Ok(())
}
