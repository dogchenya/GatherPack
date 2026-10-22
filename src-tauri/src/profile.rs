use std::{fs, io::Write, path::Path};

// This is the shipped alpha.3 identifier. Keep it unchanged when importing
// data from the former working-name build.
pub const LEGACY_IDENTIFIER: &str = "io.github.easy-pack.prototype";

fn copy_new(bytes: &[u8], target: &Path) -> Result<bool, String> {
    let mut file = tempfile::NamedTempFile::new_in(target.parent().ok_or("配置目录无效")?)
        .map_err(|e| e.to_string())?;
    file.write_all(bytes).map_err(|e| e.to_string())?;
    file.as_file().sync_all().map_err(|e| e.to_string())?;
    match file.persist_noclobber(target) {
        Ok(_) => Ok(true),
        Err(e) if e.error.kind() == std::io::ErrorKind::AlreadyExists => Ok(false),
        Err(e) => Err(e.to_string()),
    }
}

fn copy_regular(source: &Path, target: &Path) -> Result<(), String> {
    match fs::symlink_metadata(source) {
        Ok(metadata) if metadata.file_type().is_file() => {
            copy_new(&fs::read(source).map_err(|e| e.to_string())?, target)?;
            Ok(())
        }
        Ok(_) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// Import once without moving legacy files or replacing an existing new profile.
pub fn import_legacy(legacy: &Path, target: &Path) -> Result<bool, String> {
    if target.join("state.json").symlink_metadata().is_ok() {
        return Ok(false);
    }
    let source = legacy.join("state.json");
    let metadata = match source.symlink_metadata() {
        Ok(metadata) => metadata,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(e) => return Err(e.to_string()),
    };
    if !metadata.file_type().is_file() {
        return Err("旧版清单不是普通文件，未导入".into());
    }
    let bytes = fs::read(&source).map_err(|e| e.to_string())?;
    serde_json::from_slice::<crate::Saved>(&bytes).map_err(|e| e.to_string())?;
    fs::create_dir_all(target).map_err(|e| e.to_string())?;
    copy_regular(
        &legacy.join("last-report.json"),
        &target.join("last-report.json"),
    )?;
    let history = legacy.join("reports");
    if history
        .symlink_metadata()
        .is_ok_and(|m| m.file_type().is_dir())
    {
        let destination = target.join("reports");
        fs::create_dir_all(&destination).map_err(|e| e.to_string())?;
        if !destination
            .symlink_metadata()
            .map_err(|e| e.to_string())?
            .file_type()
            .is_dir()
        {
            return Err("新版本报告目录不是普通目录，未导入".into());
        }
        for entry in fs::read_dir(history).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            if entry
                .path()
                .extension()
                .is_some_and(|extension| extension == "json")
            {
                copy_regular(&entry.path(), &destination.join(entry.file_name()))?;
            }
        }
    }
    // Commit the state last. A failed import can be retried without overwriting
    // previously copied reports or touching any legacy source file.
    copy_new(&bytes, &target.join("state.json"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn legacy_profile_import_preserves_sources_settings_reports_and_newer_data() {
        let root = tempfile::tempdir().unwrap();
        let legacy = root.path().join("legacy");
        let target = root.path().join("new");
        fs::create_dir_all(legacy.join("reports")).unwrap();
        let state = br#"{"paths":["retained/source.txt"],"settings":{"format":"SevenZip","shortcut":"Control+Alt+Shift+G","lastDirectory":"retained/output","autostart":true}}"#;
        fs::write(legacy.join("state.json"), state).unwrap();
        fs::write(legacy.join("last-report.json"), b"{\"delivered\":true}").unwrap();
        fs::write(legacy.join("reports/task.json"), b"{\"delivered\":true}").unwrap();
        assert!(import_legacy(&legacy, &target).unwrap());
        let saved: crate::Saved =
            serde_json::from_slice(&fs::read(target.join("state.json")).unwrap()).unwrap();
        assert_eq!(
            saved.settings.format,
            gatherpack_collection::Format::SevenZip
        );
        assert_eq!(saved.settings.shortcut, "Control+Alt+Shift+G");
        assert_eq!(
            saved.settings.last_directory.as_deref(),
            Some("retained/output")
        );
        assert!(saved.settings.autostart);
        assert_eq!(saved.paths, ["retained/source.txt"]);
        for file in ["state.json", "last-report.json", "reports/task.json"] {
            assert_eq!(
                fs::read(legacy.join(file)).unwrap(),
                fs::read(target.join(file)).unwrap()
            );
        }
        fs::remove_file(target.join("state.json")).unwrap();
        fs::write(target.join("reports/task.json"), b"newer report").unwrap();
        assert!(import_legacy(&legacy, &target).unwrap());
        assert_eq!(
            fs::read(target.join("reports/task.json")).unwrap(),
            b"newer report"
        );
        fs::write(target.join("state.json"), b"newer user data").unwrap();
        assert!(!import_legacy(&legacy, &target).unwrap());
        assert_eq!(
            fs::read(target.join("state.json")).unwrap(),
            b"newer user data"
        );
        assert_eq!(fs::read(legacy.join("state.json")).unwrap(), state);
    }

    #[test]
    fn malformed_legacy_state_is_preserved_without_committing_a_new_profile() {
        let root = tempfile::tempdir().unwrap();
        let legacy = root.path().join("legacy");
        let target = root.path().join("new");
        fs::create_dir_all(&legacy).unwrap();
        fs::write(legacy.join("state.json"), b"invalid JSON").unwrap();
        assert!(import_legacy(&legacy, &target).is_err());
        assert!(!target.join("state.json").exists());
        assert_eq!(
            fs::read(legacy.join("state.json")).unwrap(),
            b"invalid JSON"
        );
    }

    #[cfg(unix)]
    #[test]
    fn migration_does_not_follow_report_symlinks() {
        let root = tempfile::tempdir().unwrap();
        let legacy = root.path().join("legacy");
        let target = root.path().join("new");
        fs::create_dir_all(legacy.join("reports")).unwrap();
        fs::write(legacy.join("state.json"), b"{\"paths\":[],\"settings\":{}}").unwrap();
        let outside = root.path().join("outside.json");
        fs::write(&outside, b"unrelated").unwrap();
        std::os::unix::fs::symlink(&outside, legacy.join("reports/linked.json")).unwrap();
        assert!(import_legacy(&legacy, &target).unwrap());
        assert!(!target.join("reports/linked.json").exists());
        assert_eq!(fs::read(outside).unwrap(), b"unrelated");
    }
}
