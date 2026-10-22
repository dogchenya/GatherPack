use crate::is_link;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    sync::atomic::{AtomicBool, Ordering},
};
use unicode_normalization::UnicodeNormalization;
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PlannedEntry {
    pub source: String,
    pub destination: String,
    pub directory: bool,
    pub size: u64,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Issue {
    pub source: String,
    pub message: String,
    pub blocking: bool,
    pub file: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Rename {
    pub source: String,
    pub destination: String,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct Plan {
    pub sources: Vec<String>,
    pub entries: Vec<PlannedEntry>,
    pub issues: Vec<Issue>,
    pub renames: Vec<Rename>,
    pub total_bytes: u64,
    pub files: usize,
    pub empty_directories: usize,
}
fn safe_name(name: &str) -> String {
    let mut s: String = name
        .nfc()
        .map(|c| {
            if c.is_control() || "<>:\"/\\|?*".contains(c) {
                '_'
            } else {
                c
            }
        })
        .collect();
    s = s.trim_end_matches(['.', ' ']).to_string();
    while s.len() > 200 {
        s.pop();
    }
    if s.is_empty() || s == "." || s == ".." {
        s = "_".into();
    }
    let stem = s.split('.').next().unwrap_or("").to_uppercase();
    if [
        "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
        "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    ]
    .contains(&stem.as_str())
    {
        s.insert(0, '_');
    }
    s
}
fn unique(name: &str, used: &mut HashSet<String>, directory: bool) -> String {
    let name = safe_name(name);
    let mut candidate = name.clone();
    let mut n = 2;
    while !used.insert(candidate.nfc().collect::<String>().to_lowercase()) {
        let path = Path::new(&name);
        candidate = if !directory && path.extension().is_some() {
            format!(
                "{} ({n}).{}",
                path.file_stem().unwrap().to_string_lossy(),
                path.extension().unwrap().to_string_lossy()
            )
        } else {
            format!("{name} ({n})")
        };
        n += 1;
    }
    candidate
}
fn issue(plan: &mut Plan, path: &Path, message: String, file: bool) {
    plan.issues.push(Issue {
        source: path.to_string_lossy().into_owned(),
        message,
        blocking: true,
        file,
    });
}
fn scan(path: &Path, destination: String, plan: &mut Plan, cancel: &AtomicBool) {
    if cancel.load(Ordering::Relaxed) {
        return;
    }
    let m = match fs::symlink_metadata(path) {
        Ok(m) => m,
        Err(e) => {
            issue(plan, path, e.to_string(), false);
            return;
        }
    };
    if is_link(&m) {
        issue(
            plan,
            path,
            "符号链接或目录链接：不跟随，需明确跳过".into(),
            false,
        );
        return;
    }
    if !m.is_file() && !m.is_dir() {
        issue(plan, path, "不支持的文件类型".into(), false);
        return;
    }
    if m.is_file() && fs::File::open(path).is_err() {
        issue(plan, path, "无法读取文件".into(), true);
        return;
    }
    if m.is_dir() {
        let children = match fs::read_dir(path).and_then(|it| it.collect::<Result<Vec<_>, _>>()) {
            Ok(v) => v,
            Err(e) => {
                issue(plan, path, e.to_string(), false);
                return;
            }
        };
        if children.is_empty() {
            plan.empty_directories += 1;
        }
        plan.entries.push(PlannedEntry {
            source: path.to_string_lossy().into_owned(),
            destination: destination.clone(),
            directory: true,
            size: 0,
        });
        let mut children = children;
        children.sort_by_key(|c| c.file_name());
        let mut used = HashSet::new();
        for child in children {
            if cancel.load(Ordering::Relaxed) {
                break;
            }
            let original = child.file_name().to_string_lossy().into_owned();
            let dir = child.file_type().map(|t| t.is_dir()).unwrap_or(false);
            let name = unique(&original, &mut used, dir);
            let target = format!("{destination}/{name}");
            if name != original {
                plan.renames.push(Rename {
                    source: child.path().to_string_lossy().into_owned(),
                    destination: target.clone(),
                });
            }
            scan(&child.path(), target, plan, cancel);
        }
    } else {
        plan.files += 1;
        plan.total_bytes += m.len();
        plan.entries.push(PlannedEntry {
            source: path.to_string_lossy().into_owned(),
            destination,
            directory: false,
            size: m.len(),
        });
    }
}
pub fn build_plan(sources: Vec<String>) -> Plan {
    build_plan_with_cancel(sources, &AtomicBool::new(false))
}
pub fn build_plan_with_cancel(sources: Vec<String>, cancel: &AtomicBool) -> Plan {
    let mut plan = Plan {
        sources: sources.clone(),
        ..Plan::default()
    };
    let canonical: Vec<PathBuf> = sources
        .iter()
        .map(|s| {
            Path::new(s)
                .canonicalize()
                .unwrap_or_else(|_| PathBuf::from(s))
        })
        .collect();
    let mut used = HashSet::new();
    for (i, source) in sources.iter().enumerate() {
        if cancel.load(Ordering::Relaxed) {
            break;
        }
        if canonical.iter().enumerate().any(|(j, p)| {
            i != j
                && ((canonical[i] == *p && j < i)
                    || (canonical[i] != *p
                        && canonical[i].starts_with(p)
                        && fs::symlink_metadata(&sources[j])
                            .map(|m| m.is_dir() && !is_link(&m))
                            .unwrap_or(false)))
        }) {
            plan.issues.push(Issue {
                source: source.clone(),
                message: "重复来源：已保留在收集的文件夹中，仅写入一次".into(),
                blocking: false,
                file: Path::new(source).is_file(),
            });
            continue;
        }
        let path = Path::new(source);
        let name = path
            .file_name()
            .unwrap_or(path.as_os_str())
            .to_string_lossy();
        let target = unique(&name, &mut used, path.is_dir());
        if target != name {
            plan.renames.push(Rename {
                source: source.clone(),
                destination: target.clone(),
            });
        }
        scan(path, target, &mut plan, cancel);
    }
    let nonempty: HashSet<_> = plan
        .entries
        .iter()
        .filter_map(|e| e.destination.rsplit_once('/').map(|(parent, _)| parent))
        .collect();
    plan.empty_directories = plan
        .entries
        .iter()
        .filter(|e| e.directory && !nonempty.contains(e.destination.as_str()))
        .count();
    plan
}
pub fn validate_output(plan: &Plan, output: &Path) -> Result<(), String> {
    if !output.is_absolute() {
        return Err("请选择绝对输出路径".into());
    }
    if output.exists() {
        return Err("目标已存在，请选择新的包名，禁止覆盖".into());
    }
    let parent = output
        .parent()
        .ok_or("输出目录无效")?
        .canonicalize()
        .map_err(|e| e.to_string())?;
    for source in &plan.sources {
        let path = Path::new(source);
        if let Ok(canonical) = path.canonicalize() {
            if path.is_dir() && parent.starts_with(&canonical) {
                return Err("不能将输出保存到待打包的文件夹内部".into());
            }
            if parent.join(output.file_name().ok_or("包名无效")?) == canonical {
                return Err("不能覆盖源文件".into());
            }
        }
    }
    Ok(())
}
