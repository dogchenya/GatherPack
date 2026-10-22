use std::{fs, io::Write};
use tauri::Manager;

const CONTENT: &str = include_str!("../scripts/gatherpack_selection.py");

fn connection_notice() -> Option<String> {
    let ready = std::process::Command::new("gdbus")
        .args([
            "call",
            "--session",
            "--timeout",
            "2",
            "--dest",
            "org.freedesktop.DBus",
            "--object-path",
            "/org/freedesktop/DBus",
            "--method",
            "org.freedesktop.DBus.NameHasOwner",
            "io.github.dogchenya.gatherpack.NautilusSelection",
        ])
        .output()
        .is_ok_and(|output| {
            output.status.success() && String::from_utf8_lossy(&output.stdout).trim() == "(true,)"
        });
    if ready {
        None
    } else {
        Some("Nautilus 收集桥接尚未加载，快捷键可能已触发但无法取得文件。首次安装或升级后，请保存文件管理器中的操作，手动退出并重新打开“文件”（Nautilus），再点击“重新注册”检查连接。应用不会自动关闭文件管理器。".into())
    }
}

/// AppIndicator can construct successfully even when no desktop tray exists.
pub fn tray_host_available() -> bool {
    [
        "org.kde.StatusNotifierWatcher",
        "org.freedesktop.StatusNotifierWatcher",
    ]
    .iter()
    .any(|name| {
        std::process::Command::new("gdbus")
            .args([
                "call",
                "--session",
                "--dest",
                "org.freedesktop.DBus",
                "--object-path",
                "/org/freedesktop/DBus",
                "--method",
                "org.freedesktop.DBus.NameHasOwner",
                name,
            ])
            .output()
            .is_ok_and(|output| {
                output.status.success()
                    && String::from_utf8_lossy(&output.stdout).trim() == "(true,)"
            })
    })
}

/// Install the independent selection bridge without restarting the user's file manager.
pub fn install(app: &tauri::AppHandle) -> Result<Option<String>, String> {
    let system =
        std::path::Path::new("/usr/share/nautilus-python/extensions/gatherpack_selection.py");
    if fs::read_to_string(system).ok().as_deref() == Some(CONTENT) {
        return Ok(connection_notice());
    }
    let directory = app
        .path()
        .data_dir()
        .map_err(|e| e.to_string())?
        .join("nautilus-python/extensions");
    fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    let target = directory.join("gatherpack_selection.py");
    match fs::read_to_string(&target) {
        Ok(existing) if existing == CONTENT => return Ok(connection_notice()),
        Ok(existing) if !existing.starts_with("# gatherpack managed Nautilus selection bridge") => {
            return Err(format!(
                "桥接位置已有非本应用管理的文件，未覆盖：{}",
                target.display()
            ))
        }
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => return Err(e.to_string()),
        _ => {}
    }
    let mut file = tempfile::NamedTempFile::new_in(&directory).map_err(|e| e.to_string())?;
    file.write_all(CONTENT.as_bytes())
        .map_err(|e| e.to_string())?;
    file.as_file().sync_all().map_err(|e| e.to_string())?;
    file.persist(&target).map_err(|e| e.to_string())?;
    Ok(Some("已准备 Nautilus 直接收集桥接。请确认安装 python3-nautilus，并重新打开 Nautilus 使其加载；不会自动关闭你的文件管理器。".into()))
}
