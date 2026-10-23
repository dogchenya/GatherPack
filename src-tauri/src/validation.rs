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
    if !["core", "restore"].contains(&scenario) {
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
    if context.scenario == "restore" {
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
