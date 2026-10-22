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
        }
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
    }
    pub fn clear(&mut self) {
        self.entries.clear();
    }
}
