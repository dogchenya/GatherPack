use std::{fs, io::Write};
use tauri::Manager;

const CONTENT: &str = include_str!("../scripts/gatherpack_selection.py");

fn connection_notice() -> Option<String> {
    crate::selection::linux_bridge_notice()
        .unwrap_or_else(|error| Some(format!("无法检查 Nautilus 桥接连接：{error}")))
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
    let directory = app
        .path()
        .data_dir()
        .map_err(|e| e.to_string())?
        .join("nautilus-python/extensions");
    install_files(&directory, system)?;
    Ok(connection_notice())
}

fn install_files(directory: &std::path::Path, system: &std::path::Path) -> Result<(), String> {
    fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    let target = directory.join("gatherpack_selection.py");
    // Nautilus loads the user's module before the system module of the same
    // name. A previous AppImage can otherwise shadow every subsequent deb fix.
    let existing = fs::read_to_string(&target);
    if fs::read_to_string(system).ok().as_deref() == Some(CONTENT) {
        match &existing {
            Ok(text) if text.starts_with("# gatherpack managed Nautilus selection bridge") => {
                fs::remove_file(&target).map_err(|e| e.to_string())?;
            }
            Ok(_) => {
                return Err(format!(
                    "用户目录中有同名扩展，可能覆盖系统桥接；未修改此文件：{}",
                    target.display()
                ));
            }
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => return Err(e.to_string()),
            _ => {}
        }
        return Ok(());
    }
    match existing {
        Ok(existing) if existing == CONTENT => return Ok(()),
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
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn system_upgrade_removes_only_managed_user_shadow() {
        let root = tempfile::tempdir().unwrap();
        let directory = root.path().join("user");
        fs::create_dir(&directory).unwrap();
        let system = root.path().join("system.py");
        fs::write(&system, CONTENT).unwrap();
        let target = directory.join("gatherpack_selection.py");
        fs::write(
            &target,
            "# gatherpack managed Nautilus selection bridge v1\n# old broken extension",
        )
        .unwrap();
        install_files(&directory, &system).unwrap();
        assert!(!target.exists());
        assert_eq!(fs::read_to_string(&system).unwrap(), CONTENT);
        fs::write(&target, "# user's independent extension").unwrap();
        assert!(install_files(&directory, &system).is_err());
        assert_eq!(
            fs::read_to_string(target).unwrap(),
            "# user's independent extension"
        );
    }

    #[test]
    fn appimage_upgrades_user_bridge_when_system_is_outdated() {
        let root = tempfile::tempdir().unwrap();
        let system = root.path().join("missing.py");
        let directory = root.path().join("user");
        install_files(&directory, &system).unwrap();
        let target = directory.join("gatherpack_selection.py");
        assert_eq!(fs::read_to_string(&target).unwrap(), CONTENT);
        fs::write(
            &target,
            "# gatherpack managed Nautilus selection bridge v1\n# old",
        )
        .unwrap();
        install_files(&directory, &system).unwrap();
        assert_eq!(fs::read_to_string(target).unwrap(), CONTENT);
    }
}
