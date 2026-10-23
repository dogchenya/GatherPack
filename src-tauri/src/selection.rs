use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Selection {
    pub source: String,
    pub paths: Vec<String>,
    pub error: Option<String>,
    #[serde(default)]
    pub rejected: Vec<String>,
}

pub fn capture() -> Selection {
    capture_impl().unwrap_or_else(|error| Selection {
        source: std::env::consts::OS.into(),
        paths: vec![],
        error: Some(error),
        rejected: vec![],
    })
}

// Read both pipes concurrently, and bound slow or denied accessibility/COM calls.
fn run_helper(command: &mut std::process::Command) -> Result<std::process::Output, String> {
    use std::{
        io::Read,
        process::Stdio,
        time::{Duration, Instant},
    };
    let mut child = command
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
    let mut stdout = child.stdout.take().unwrap();
    let mut stderr = child.stderr.take().unwrap();
    let out = std::thread::spawn(move || {
        let mut bytes = vec![];
        stdout.read_to_end(&mut bytes).map(|_| bytes)
    });
    let err = std::thread::spawn(move || {
        let mut bytes = vec![];
        stderr.read_to_end(&mut bytes).map(|_| bytes)
    });
    let start = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if start.elapsed() < Duration::from_secs(12) => {
                std::thread::sleep(Duration::from_millis(30))
            }
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("系统选择读取超时或失败，请检查辅助功能权限后重试".into());
            }
        }
    };
    Ok(std::process::Output {
        status,
        stdout: out
            .join()
            .map_err(|_| "选择读取失败")?
            .map_err(|e| e.to_string())?,
        stderr: err
            .join()
            .map_err(|_| "选择读取失败")?
            .map_err(|e| e.to_string())?,
    })
}

fn decode_output(output: std::process::Output) -> Result<Selection, String> {
    if !output.status.success() {
        return Err(format!(
            "系统选择适配器执行失败：{}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let selection: Selection = serde_json::from_str(text.trim_start_matches('\u{feff}').trim())
        .map_err(|e| format!("系统选择适配器返回格式异常：{e}"))?;
    if selection.error.is_some() && !selection.paths.is_empty() {
        return Err("适配器返回不一致的结果，已取消收集".into());
    }
    Ok(selection)
}

#[cfg(target_os = "windows")]
fn capture_impl() -> Result<Selection, String> {
    use base64::Engine;
    use std::os::windows::process::CommandExt;
    #[link(name = "user32")]
    extern "system" {
        fn GetForegroundWindow() -> isize;
    }
    // Snapshot before spawning any helper; never activate the collection window here.
    let hwnd = unsafe { GetForegroundWindow() };
    let script = format!(
        "$expectedHwnd = {hwnd}\n{}",
        include_str!("../scripts/selection-windows.ps1")
    );
    let bytes: Vec<u8> = script.encode_utf16().flat_map(u16::to_le_bytes).collect();
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
    let system_root = std::env::var_os("SystemRoot").ok_or("找不到 Windows 系统目录")?;
    let powershell = std::path::PathBuf::from(system_root)
        .join("System32/WindowsPowerShell/v1.0/powershell.exe");
    let output = run_helper(
        std::process::Command::new(powershell)
            .args([
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-STA",
                "-EncodedCommand",
                &encoded,
            ])
            .creation_flags(0x08000000),
    )?; // CREATE_NO_WINDOW
    decode_output(output)
}

#[cfg(target_os = "macos")]
fn capture_impl() -> Result<Selection, String> {
    let output = run_helper(std::process::Command::new("/usr/bin/osascript").args([
        "-l",
        "JavaScript",
        "-e",
        include_str!("../scripts/selection-macos.js"),
    ]))?;
    decode_output(output)
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn linux_helper() -> std::process::Command {
    let mut command = std::process::Command::new("/usr/bin/python3");
    command
        // AppImage/Conda paths must not redirect the system Python/GI
        // helper into the application's bundled runtime or module tree.
        .env_remove("PYTHONHOME")
        .env_remove("PYTHONPATH")
        .env_remove("LD_LIBRARY_PATH")
        .env_remove("GI_TYPELIB_PATH")
        .env_remove("GTK_PATH")
        .env_remove("GIO_EXTRA_MODULES")
        .env_remove("GIO_MODULE_DIR")
        .args(["-I", "-c", include_str!("../scripts/selection-linux.py")]);
    command
}

#[cfg(target_os = "linux")]
pub fn linux_bridge_notice() -> Result<Option<String>, String> {
    let output = run_helper(linux_helper().arg("--bridge-status"))?;
    Ok(decode_output(output)?.error)
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn capture_impl() -> Result<Selection, String> {
    let output = run_helper(&mut linux_helper())
        .map_err(|e| format!("Linux 选择读取需要系统 Python3 与 python3-pyatspi：{e}"))?;
    decode_output(output)
}
