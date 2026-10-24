mod archive;
mod plan;
pub use archive::*;
pub use plan::*;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub path: String,
    pub name: String,
    pub is_directory: bool,
    pub size: Option<u64>,
    pub status: String,
}

#[cfg(test)]
mod reference_tests {
    use super::*;
    #[test]
    fn relink_preserves_order_sources_and_rejects_duplicates() {
        let root = tempfile::tempdir().unwrap();
        let old = root.path().join("old.txt");
        let replacement = root.path().join("new.txt");
        let other = root.path().join("other.txt");
        std::fs::write(&replacement, "new contents").unwrap();
        std::fs::write(&other, "untouched").unwrap();
        let mut collection = Collection::restore(vec![
            old.to_string_lossy().into(),
            other.to_string_lossy().into(),
        ]);
        let before = collection.paths();
        assert!(collection.relink(&before[0], other.clone()).is_err());
        assert!(collection
            .relink(&before[0], root.path().join("missing.txt"))
            .is_err());
        assert!(collection
            .relink("already removed", replacement.clone())
            .is_err());
        assert_eq!(collection.paths(), before);
        collection.relink(&before[0], replacement.clone()).unwrap();
        assert_eq!(Path::new(&collection.paths()[0]), replacement);
        assert_eq!(collection.paths()[1], before[1]);
        assert_eq!(
            std::fs::read_to_string(&replacement).unwrap(),
            "new contents"
        );
        assert_eq!(std::fs::read_to_string(&other).unwrap(), "untouched");
        assert!(!old.exists());
        let folder = root.path().join("folder");
        std::fs::create_dir(&folder).unwrap();
        collection
            .relink(&replacement.to_string_lossy(), folder)
            .unwrap();
        assert!(collection.entries()[0].is_directory);
    }
}
pub fn is_link(m: &std::fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if m.file_attributes() & 0x400 != 0 {
            return true;
        }
    }
    m.file_type().is_symlink()
}
fn inspect(path: &Path) -> Entry {
    let (is_directory, size, status) = match std::fs::symlink_metadata(path) {
        Ok(m) if is_link(&m) => (false, None, "链接：打包前需明确跳过".into()),
        Ok(m) if m.is_dir() => (true, None, "可用".into()),
        Ok(m) if m.is_file() => (
            false,
            Some(m.len()),
            match std::fs::File::open(path) {
                Ok(_) => "可用".into(),
                Err(e) => e.to_string(),
            },
        ),
        Ok(_) => (false, None, "不支持的类型".into()),
        Err(e) => (false, None, format!("不可用：{e}")),
    };
    Entry {
        path: path.to_string_lossy().into_owned(),
        name: path
            .file_name()
            .unwrap_or(path.as_os_str())
            .to_string_lossy()
            .into_owned(),
        is_directory,
        size,
        status,
    }
}
#[derive(Default)]
pub struct Collection {
    entries: Vec<Entry>,
    excluded: Vec<String>,
}
#[derive(Default, Serialize)]
pub struct AddReport {
    pub added: usize,
    pub duplicates: usize,
    pub rejected: Vec<String>,
}
impl Collection {
    pub fn restore(paths: Vec<String>) -> Self {
        Self {
            entries: paths.into_iter().map(|p| inspect(Path::new(&p))).collect(),
            excluded: vec![],
        }
    }
    pub fn excluded(&self) -> Vec<String> {
        self.excluded.clone()
    }
    pub fn restore_excluded(&mut self, excluded: Vec<String>) {
        self.excluded = excluded;
    }
    /// Remove references to a file/subtree from every collected parent. Never touches disk.
    pub fn exclude(&mut self, path: &str) -> bool {
        let target = Path::new(path);
        if !self.entries.iter().any(|e| target.starts_with(&e.path)) {
            return false;
        }
        self.entries
            .retain(|e| !Path::new(&e.path).starts_with(target));
        self.excluded.retain(|e| !Path::new(e).starts_with(target));
        self.excluded.push(path.to_owned());
        true
    }
    pub fn paths(&self) -> Vec<String> {
        self.entries.iter().map(|e| e.path.clone()).collect()
    }
    pub fn entries(&self) -> Vec<Entry> {
        self.entries
            .iter()
            .map(|e| inspect(Path::new(&e.path)))
            .collect()
    }
    pub fn add(&mut self, paths: Vec<PathBuf>) -> AddReport {
        let mut report = AddReport::default();
        for path in paths {
            if !path.is_absolute() {
                report
                    .rejected
                    .push(format!("{}：需要本地绝对路径", path.display()));
                continue;
            }
            let metadata = match std::fs::symlink_metadata(&path) {
                Ok(m) => m,
                Err(e) => {
                    report.rejected.push(format!("{}：{e}", path.display()));
                    continue;
                }
            };
            if is_link(&metadata) || (!metadata.is_file() && !metadata.is_dir()) {
                report
                    .rejected
                    .push(format!("{}：不支持链接或特殊类型", path.display()));
                continue;
            }
            let canonical = path.canonicalize().unwrap_or(path.clone());
            // Explicitly collecting an excluded source restores that source/subtree.
            self.excluded.retain(|e| !Path::new(e).starts_with(&path));
            if self.entries.iter().any(|e| {
                Path::new(&e.path)
                    .canonicalize()
                    .unwrap_or_else(|_| PathBuf::from(&e.path))
                    == canonical
            }) {
                report.duplicates += 1;
                continue;
            }
            self.entries.push(inspect(&path));
            report.added += 1;
        }
        report
    }
    pub fn remove(&mut self, path: &str) {
        self.entries.retain(|e| e.path != path);
        self.excluded.retain(|e| !Path::new(e).starts_with(path));
    }
    /// Replace only a collection reference; never move or modify either source.
    pub fn relink(&mut self, original: &str, replacement: PathBuf) -> Result<(), String> {
        let index = self
            .entries
            .iter()
            .position(|e| e.path == original)
            .ok_or("该来源已从清单移除，请重新添加")?;
        let mut checked = Self::default();
        let result = checked.add(vec![replacement.clone()]);
        if result.added != 1 {
            return Err(result.rejected.join("\n"));
        }
        let canonical = replacement.canonicalize().map_err(|e| e.to_string())?;
        if self.entries.iter().enumerate().any(|(i, entry)| {
            i != index && Path::new(&entry.path).canonicalize().ok().as_ref() == Some(&canonical)
        }) {
            return Err("该来源已在清单中，请移除失效项目以免重复".into());
        }
        self.entries[index] = inspect(&replacement);
        self.excluded
            .retain(|e| !Path::new(e).starts_with(original));
        Ok(())
    }
    pub fn clear(&mut self) {
        self.entries.clear();
        self.excluded.clear();
    }
}
