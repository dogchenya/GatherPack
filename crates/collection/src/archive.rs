use crate::{is_link, validate_output, Issue, Plan, Rename};
use serde::{Deserialize, Serialize};
use std::{
    fs::File,
    io::{self, Read},
    path::Path,
    sync::atomic::{AtomicBool, Ordering},
};
#[derive(Clone, Copy, Default, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum Format {
    #[default]
    Zip,
    SevenZip,
    TarGz,
}
impl Format {
    pub fn extension(self) -> &'static str {
        match self {
            Self::Zip => "zip",
            Self::SevenZip => "7z",
            Self::TarGz => "tar.gz",
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Report {
    pub status: String,
    pub output: String,
    pub written: Vec<String>,
    pub skipped: Vec<String>,
    pub failed: Vec<String>,
    pub pending: Vec<String>,
    pub empty_directories: usize,
    pub renames: Vec<Rename>,
    pub error: Option<String>,
    pub delivered: bool,
    #[serde(default)]
    pub issues: Vec<Issue>,
}
struct ProgressReader<'a, F> {
    file: File,
    cancel: &'a AtomicBool,
    progress: &'a mut F,
    remaining: u64,
}
fn open_regular_file(path: &str, size: u64) -> Result<File, String> {
    let mut options = std::fs::OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NOFOLLOW);
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.custom_flags(0x00200000); // FILE_FLAG_OPEN_REPARSE_POINT
    }
    let file = options.open(path).map_err(|e| e.to_string())?;
    let metadata = file.metadata().map_err(|e| e.to_string())?;
    if !metadata.is_file() || is_link(&metadata) || metadata.len() != size {
        return Err("打开时源文件类型或大小发生变化".into());
    }
    Ok(file)
}
impl<F: FnMut(u64)> Read for ProgressReader<'_, F> {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        if self.cancel.load(Ordering::Relaxed) {
            return Err(io::Error::other("用户取消"));
        }
        if buf.is_empty() {
            return Ok(0);
        }
        let limit = buf.len().min(128 * 1024);
        let n = self.file.read(&mut buf[..limit])?;
        if n as u64 > self.remaining || (n == 0 && self.remaining != 0) {
            return Err(io::Error::other("读取期间源文件大小发生变化"));
        }
        self.remaining -= n as u64;
        (self.progress)(n as u64);
        Ok(n)
    }
}
pub fn pack(
    plan: &Plan,
    output: &Path,
    format: Format,
    cancel: &AtomicBool,
    mut progress: impl FnMut(u64),
) -> Report {
    let mut report = Report {
        status: "failed".into(),
        output: output.to_string_lossy().into_owned(),
        written: vec![],
        skipped: plan
            .issues
            .iter()
            .filter(|i| i.file)
            .map(|i| format!("{}：{}", i.source, i.message))
            .collect(),
        failed: vec![],
        pending: plan
            .entries
            .iter()
            .filter(|e| !e.directory)
            .map(|e| e.source.clone())
            .collect(),
        empty_directories: 0,
        renames: plan.renames.clone(),
        error: None,
        delivered: false,
        issues: plan.issues.clone(),
    };
    let mut current = String::new();
    let directories: std::collections::HashSet<_> = plan
        .entries
        .iter()
        .filter(|e| e.directory)
        .map(|e| std::path::PathBuf::from(&e.source))
        .collect();
    let mut current_is_file = false;
    let mut temporary_output = None;
    let result = (|| -> Result<(), String> {
        validate_output(plan, output)?;
        if plan.entries.is_empty() {
            return Err("没有可打包项目".into());
        }
        temporary_output = Some(
            tempfile::NamedTempFile::new_in(output.parent().ok_or("输出目录无效")?)
                .map_err(|e| e.to_string())?,
        );
        let temporary = temporary_output.as_ref().unwrap();
        let mut zip = if format == Format::Zip {
            Some(zip::ZipWriter::new(
                temporary.reopen().map_err(|e| e.to_string())?,
            ))
        } else {
            None
        };
        let mut tar = if format == Format::TarGz {
            Some(tar::Builder::new(flate2::write::GzEncoder::new(
                temporary.reopen().map_err(|e| e.to_string())?,
                flate2::Compression::default(),
            )))
        } else {
            None
        };
        let mut seven = if format == Format::SevenZip {
            Some(
                sevenz_rust::SevenZWriter::new(temporary.reopen().map_err(|e| e.to_string())?)
                    .map_err(|e| e.to_string())?,
            )
        } else {
            None
        };
        for entry in &plan.entries {
            current = entry.source.clone();
            current_is_file = !entry.directory;
            if cancel.load(Ordering::Relaxed) {
                return Err("用户取消".into());
            }
            for ancestor in Path::new(&entry.source).ancestors().skip(1) {
                if directories.contains(ancestor) {
                    let metadata =
                        std::fs::symlink_metadata(ancestor).map_err(|e| e.to_string())?;
                    if is_link(&metadata) || !metadata.is_dir() {
                        return Err("来源文件夹变成了链接或不可用，已停止读取".into());
                    }
                }
            }
            let m = std::fs::symlink_metadata(&entry.source).map_err(|e| e.to_string())?;
            if is_link(&m)
                || m.is_dir() != entry.directory
                || (!entry.directory && (!m.is_file() || m.len() != entry.size))
            {
                return Err("源文件类型或大小发生变化，请重新检查".into());
            }
            let reader = if entry.directory {
                None
            } else {
                Some(ProgressReader {
                    file: open_regular_file(&entry.source, entry.size)?,
                    cancel,
                    progress: &mut progress,
                    remaining: entry.size,
                })
            };
            if let Some(zip) = zip.as_mut() {
                let options = zip::write::SimpleFileOptions::default()
                    .compression_method(zip::CompressionMethod::Deflated)
                    .large_file(entry.size >= u32::MAX as u64);
                if entry.directory {
                    zip.add_directory(format!("{}/", entry.destination), options)
                        .map_err(|e| e.to_string())?;
                } else {
                    zip.start_file(&entry.destination, options)
                        .map_err(|e| e.to_string())?;
                    io::copy(&mut reader.unwrap(), zip).map_err(|e| e.to_string())?;
                }
            } else if let Some(tar) = tar.as_mut() {
                let mut header = tar::Header::new_gnu();
                header.set_mode(if entry.directory { 0o755 } else { 0o644 });
                header.set_size(entry.size);
                header.set_entry_type(if entry.directory {
                    tar::EntryType::Directory
                } else {
                    tar::EntryType::Regular
                });
                header.set_cksum();
                if entry.directory {
                    tar.append_data(&mut header, &entry.destination, io::empty())
                        .map_err(|e| e.to_string())?;
                } else {
                    tar.append_data(&mut header, &entry.destination, reader.unwrap())
                        .map_err(|e| e.to_string())?;
                }
            } else if let Some(seven) = seven.as_mut() {
                seven
                    .push_archive_entry(
                        sevenz_rust::SevenZArchiveEntry::from_path(
                            &entry.source,
                            entry.destination.clone(),
                        ),
                        reader,
                    )
                    .map_err(|e| e.to_string())?;
            }
            if !entry.directory {
                report.written.push(entry.source.clone());
            }
        }
        current.clear();
        if let Some(zip) = zip {
            zip.finish()
                .map_err(|e| e.to_string())?
                .sync_all()
                .map_err(|e| e.to_string())?;
        }
        if let Some(tar) = tar {
            tar.into_inner()
                .map_err(|e| e.to_string())?
                .finish()
                .map_err(|e| e.to_string())?
                .sync_all()
                .map_err(|e| e.to_string())?;
        }
        if let Some(seven) = seven {
            seven
                .finish()
                .map_err(|e| e.to_string())?
                .sync_all()
                .map_err(|e| e.to_string())?;
        }
        if cancel.load(Ordering::Relaxed) {
            return Err("用户取消".into());
        }
        if let Err(e) = temporary_output.take().unwrap().persist_noclobber(output) {
            let error = e.error.to_string();
            temporary_output = Some(e.file);
            return Err(error);
        }
        Ok(())
    })();
    match result {
        Ok(()) => {
            report.status = "success".into();
            report.delivered = true;
            report.empty_directories = plan.empty_directories;
        }
        Err(e) => {
            if !current.is_empty() {
                report.issues.push(Issue {
                    source: current.clone(),
                    message: e.clone(),
                    blocking: true,
                    file: current_is_file,
                });
            }
            if cancel.load(Ordering::Relaxed) {
                report.status = "cancelled".into();
            } else if !current.is_empty() && current_is_file {
                report.failed.push(current.clone());
            }
            report.error = Some(e);
        }
    }
    let completed: std::collections::HashSet<_> =
        report.written.iter().chain(report.failed.iter()).collect();
    report.pending.retain(|s| !completed.contains(s));
    if let Some(temporary) = temporary_output {
        let residual = temporary.path().display().to_string();
        if let Err(e) = temporary.close() {
            report.error = Some(format!(
                "{}；临时输出清理失败，残留位置 {residual}：{e}",
                report.error.unwrap_or_default()
            ));
        }
    }
    report
}
