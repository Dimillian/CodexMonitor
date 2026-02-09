mod core;
mod daemon_commands;
mod rpc_client;

use std::ffi::{OsStr, OsString};
use std::io::ErrorKind;
use std::process::Output;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde_json::{json, Value};
use tauri::State;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::tcp::{OwnedReadHalf, OwnedWriteHalf};
use tokio::net::TcpStream;
use tokio::time::{sleep, timeout, Instant};

use crate::daemon_binary::resolve_daemon_binary_path;
use crate::shared::process_core::{kill_child_process_tree, tokio_command};
use crate::state::{AppState, TcpDaemonRuntime};
use crate::types::{
    TailscaleDaemonCommandPreview, TailscaleStatus, TcpDaemonState, TcpDaemonStatus,
};

use self::core as tailscale_core;

#[cfg(any(target_os = "android", target_os = "ios"))]
const UNSUPPORTED_MESSAGE: &str = "Tailscale integration is only available on desktop.";

#[cfg(target_os = "macos")]
fn tailscale_command(binary: &OsStr) -> tokio::process::Command {
    let mut command = tokio_command("/bin/launchctl");
    let uid = unsafe { libc::geteuid() };
    command.arg("asuser").arg(uid.to_string()).arg(binary);
    command
}

#[cfg(not(target_os = "macos"))]
fn tailscale_command(binary: &OsStr) -> tokio::process::Command {
    tokio_command(binary)
}

fn trim_to_non_empty(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|entry| !entry.is_empty())
        .map(str::to_string)
}

fn tailscale_binary_candidates() -> Vec<OsString> {
    let mut candidates = vec![OsString::from("tailscale")];

    #[cfg(target_os = "macos")]
    {
        candidates.push(OsString::from(
            "/Applications/Tailscale.app/Contents/MacOS/Tailscale",
        ));
        candidates.push(OsString::from("/opt/homebrew/bin/tailscale"));
        candidates.push(OsString::from("/usr/local/bin/tailscale"));
    }

    #[cfg(target_os = "linux")]
    {
        candidates.push(OsString::from("/usr/bin/tailscale"));
        candidates.push(OsString::from("/usr/sbin/tailscale"));
        candidates.push(OsString::from("/snap/bin/tailscale"));
    }

    #[cfg(target_os = "windows")]
    {
        candidates.push(OsString::from(
            "C:\\Program Files\\Tailscale\\tailscale.exe",
        ));
        candidates.push(OsString::from(
            "C:\\Program Files (x86)\\Tailscale\\tailscale.exe",
        ));
    }

    candidates
}

fn missing_tailscale_message() -> String {
    #[cfg(target_os = "macos")]
    {
        return "Tailscale CLI not found on PATH or standard install paths (including /Applications/Tailscale.app/Contents/MacOS/Tailscale).".to_string();
    }
    #[cfg(not(target_os = "macos"))]
    {
        "Tailscale CLI not found on PATH or standard install paths.".to_string()
    }
}

async fn resolve_tailscale_binary() -> Result<Option<(OsString, Output)>, String> {
    let mut failures: Vec<String> = Vec::new();
    for binary in tailscale_binary_candidates() {
        let output = tailscale_command(binary.as_os_str())
            .arg("version")
            .output()
            .await;
        match output {
            Ok(version_output) => {
                if version_output.status.success() {
                    return Ok(Some((binary, version_output)));
                }
                let stdout = trim_to_non_empty(std::str::from_utf8(&version_output.stdout).ok());
                let stderr = trim_to_non_empty(std::str::from_utf8(&version_output.stderr).ok());
                let detail = match (stdout, stderr) {
                    (Some(out), Some(err)) => format!("stdout: {out}; stderr: {err}"),
                    (Some(out), None) => format!("stdout: {out}"),
                    (None, Some(err)) => format!("stderr: {err}"),
                    (None, None) => "no output".to_string(),
                };
                failures.push(format!(
                    "{}: tailscale version failed ({detail})",
                    OsStr::new(&binary).to_string_lossy()
                ));
            }
            Err(err) if err.kind() == ErrorKind::NotFound => continue,
            Err(err) => failures.push(format!("{}: {err}", OsStr::new(&binary).to_string_lossy())),
        }
    }

    if failures.is_empty() {
        Ok(None)
    } else {
        Err(format!(
            "Failed to run tailscale version from candidate paths: {}",
            failures.join(" | ")
        ))
    }
}

fn now_unix_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

fn parse_port_from_remote_host(remote_host: &str) -> Option<u16> {
    if remote_host.trim().is_empty() {
        return None;
    }
    if let Ok(addr) = remote_host.trim().parse::<std::net::SocketAddr>() {
        return Some(addr.port());
    }
    remote_host
        .trim()
        .rsplit_once(':')
        .and_then(|(_, port)| port.parse::<u16>().ok())
}

fn daemon_listen_addr(remote_host: &str) -> String {
    let port = parse_port_from_remote_host(remote_host).unwrap_or(4732);
    format!("0.0.0.0:{port}")
}

fn daemon_connect_addr(listen_addr: &str) -> Option<String> {
    let port = parse_port_from_remote_host(listen_addr)?;
    Some(format!("127.0.0.1:{port}"))
}

fn configured_daemon_listen_addr(settings: &crate::types::AppSettings) -> String {
    daemon_listen_addr(&settings.remote_backend_host)
}

fn sync_tcp_daemon_listen_addr(status: &mut TcpDaemonStatus, configured_listen_addr: &str) {
    if matches!(status.state, TcpDaemonState::Running) && status.listen_addr.is_some() {
        return;
    }
    status.listen_addr = Some(configured_listen_addr.to_string());
}

async fn ensure_listen_addr_available(listen_addr: &str) -> Result<(), String> {
    match tokio::net::TcpListener::bind(listen_addr).await {
        Ok(listener) => {
            drop(listener);
            Ok(())
        }
        Err(err) => Err(format!(
            "Cannot start mobile access daemon because {listen_addr} is unavailable: {err}"
        )),
    }
}

async fn refresh_tcp_daemon_runtime(runtime: &mut TcpDaemonRuntime) {
    let Some(child) = runtime.child.as_mut() else {
        runtime.status.state = TcpDaemonState::Stopped;
        runtime.status.pid = None;
        return;
    };

    match child.try_wait() {
        Ok(Some(status)) => {
            let pid = child.id();
            runtime.child = None;
            if status.success() {
                runtime.status = TcpDaemonStatus {
                    state: TcpDaemonState::Stopped,
                    pid,
                    started_at_ms: None,
                    last_error: None,
                    listen_addr: runtime.status.listen_addr.clone(),
                };
            } else {
                let failure_hint = if status.code() == Some(101) {
                    " This usually indicates a startup panic (often due to an unavailable listen port)."
                } else {
                    ""
                };
                runtime.status = TcpDaemonStatus {
                    state: TcpDaemonState::Error,
                    pid,
                    started_at_ms: runtime.status.started_at_ms,
                    last_error: Some(format!(
                        "Daemon exited with status: {status}.{failure_hint}"
                    )),
                    listen_addr: runtime.status.listen_addr.clone(),
                };
            }
        }
        Ok(None) => {
            runtime.status.state = TcpDaemonState::Running;
            runtime.status.pid = child.id();
            runtime.status.last_error = None;
        }
        Err(err) => {
            runtime.status = TcpDaemonStatus {
                state: TcpDaemonState::Error,
                pid: child.id(),
                started_at_ms: runtime.status.started_at_ms,
                last_error: Some(format!("Failed to inspect daemon process: {err}")),
                listen_addr: runtime.status.listen_addr.clone(),
            };
        }
    }
}

#[cfg(unix)]
fn is_pid_running(pid: u32) -> bool {
    let result = unsafe { libc::kill(pid as i32, 0) };
    if result == 0 {
        return true;
    }
    match std::io::Error::last_os_error().raw_os_error() {
        Some(code) => code != libc::ESRCH,
        None => false,
    }
}

#[cfg(unix)]
async fn find_listener_pid(port: u16) -> Option<u32> {
    let target = format!(":{port}");
    let output = match tokio_command("lsof")
        .args(["-nP", "-iTCP"])
        .arg(&target)
        .args(["-sTCP:LISTEN", "-t"])
        .output()
        .await
    {
        Ok(output) => output,
        Err(err) if err.kind() == ErrorKind::NotFound => return None,
        Err(_) => return None,
    };

    if !output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);
        if output.status.code() == Some(1) && stdout.trim().is_empty() && stderr.trim().is_empty() {
            return None;
        }
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    stdout
        .lines()
        .find_map(|line| line.trim().parse::<u32>().ok())
}

#[cfg(unix)]
async fn kill_pid_gracefully(pid: u32) -> Result<(), String> {
    let term_result = unsafe { libc::kill(pid as i32, libc::SIGTERM) };
    if term_result != 0 {
        let err = std::io::Error::last_os_error();
        if err.raw_os_error() != Some(libc::ESRCH) {
            return Err(format!("Failed to stop daemon process {pid}: {err}"));
        }
        return Ok(());
    }

    for _ in 0..12 {
        if !is_pid_running(pid) {
            return Ok(());
        }
        sleep(Duration::from_millis(100)).await;
    }

    let kill_result = unsafe { libc::kill(pid as i32, libc::SIGKILL) };
    if kill_result != 0 {
        let err = std::io::Error::last_os_error();
        if err.raw_os_error() != Some(libc::ESRCH) {
            return Err(format!("Failed to force-stop daemon process {pid}: {err}"));
        }
    }

    for _ in 0..8 {
        if !is_pid_running(pid) {
            return Ok(());
        }
        sleep(Duration::from_millis(100)).await;
    }

    Err(format!("Daemon process {pid} is still running."))
}

#[cfg(not(unix))]
async fn find_listener_pid(_port: u16) -> Option<u32> {
    None
}

#[cfg(not(unix))]
async fn kill_pid_gracefully(_pid: u32) -> Result<(), String> {
    Err("Stopping external daemon by pid is not supported on this platform.".to_string())
}

#[tauri::command]
pub(crate) async fn tailscale_status() -> Result<TailscaleStatus, String> {
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        return Ok(tailscale_core::unavailable_status(
            None,
            UNSUPPORTED_MESSAGE.to_string(),
        ));
    }

    let Some((tailscale_binary, version_output)) = resolve_tailscale_binary().await? else {
        return Ok(tailscale_core::unavailable_status(
            None,
            missing_tailscale_message(),
        ));
    };

    let version = trim_to_non_empty(std::str::from_utf8(&version_output.stdout).ok())
        .and_then(|raw| raw.lines().next().map(str::trim).map(str::to_string));

    let status_output = tailscale_command(tailscale_binary.as_os_str())
        .arg("status")
        .arg("--json")
        .output()
        .await
        .map_err(|err| format!("Failed to run tailscale status --json: {err}"))?;

    if !status_output.status.success() {
        let stderr_text = trim_to_non_empty(std::str::from_utf8(&status_output.stderr).ok())
            .unwrap_or_else(|| "tailscale status returned a non-zero exit code.".to_string());
        return Ok(TailscaleStatus {
            installed: true,
            running: false,
            version,
            dns_name: None,
            host_name: None,
            tailnet_name: None,
            ipv4: Vec::new(),
            ipv6: Vec::new(),
            suggested_remote_host: None,
            message: stderr_text,
        });
    }

    let payload = std::str::from_utf8(&status_output.stdout)
        .map_err(|err| format!("Invalid UTF-8 from tailscale status: {err}"))?;
    let stderr_text = trim_to_non_empty(std::str::from_utf8(&status_output.stderr).ok());
    if payload.trim().is_empty() {
        let suffix = stderr_text
            .as_deref()
            .map(|value| format!(" stderr: {value}"))
            .unwrap_or_default();
        return Err(format!(
            "tailscale status --json returned empty output.{suffix}"
        ));
    }
    match tailscale_core::status_from_json(version, payload) {
        Ok(status) => Ok(status),
        Err(err) => {
            let trimmed_payload = payload.trim();
            let payload_preview = if trimmed_payload.is_empty() {
                None
            } else if trimmed_payload.len() > 200 {
                Some(format!("{}…", &trimmed_payload[..200]))
            } else {
                Some(trimmed_payload.to_string())
            };
            let mut details = Vec::new();
            if let Some(stderr) = stderr_text {
                details.push(format!("stderr: {stderr}"));
            }
            if let Some(preview) = payload_preview {
                details.push(format!("stdout: {preview}"));
            }
            if details.is_empty() {
                Err(err)
            } else {
                Err(format!("{err} ({})", details.join("; ")))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        daemon_listen_addr, ensure_listen_addr_available, parse_port_from_remote_host,
        sync_tcp_daemon_listen_addr, tailscale_binary_candidates,
    };
    use crate::types::{TcpDaemonState, TcpDaemonStatus};

    #[test]
    fn includes_path_candidate() {
        let candidates = tailscale_binary_candidates();
        assert!(!candidates.is_empty());
        assert_eq!(candidates[0].to_string_lossy(), "tailscale");

        #[cfg(target_os = "macos")]
        {
            assert!(candidates.iter().any(|candidate| {
                candidate.to_string_lossy()
                    == "/Applications/Tailscale.app/Contents/MacOS/Tailscale"
            }));
        }
    }

    #[test]
    fn parses_listen_port_from_host() {
        assert_eq!(
            parse_port_from_remote_host("100.100.100.1:4732"),
            Some(4732)
        );
        assert_eq!(
            parse_port_from_remote_host("[fd7a:115c:a1e0::1]:4545"),
            Some(4545)
        );
        assert_eq!(parse_port_from_remote_host("example.ts.net"), None);
    }

    #[test]
    fn builds_listen_addr_with_fallback_port() {
        assert_eq!(
            daemon_listen_addr("mac.example.ts.net:8888"),
            "0.0.0.0:8888"
        );
        assert_eq!(daemon_listen_addr("mac.example.ts.net"), "0.0.0.0:4732");
    }

    #[test]
    fn syncs_listen_addr_for_stopped_state() {
        let mut status = TcpDaemonStatus {
            state: TcpDaemonState::Stopped,
            pid: None,
            started_at_ms: None,
            last_error: None,
            listen_addr: Some("0.0.0.0:4732".to_string()),
        };

        sync_tcp_daemon_listen_addr(&mut status, "0.0.0.0:7777");
        assert_eq!(status.listen_addr.as_deref(), Some("0.0.0.0:7777"));
    }

    #[test]
    fn keeps_running_listen_addr_when_present() {
        let mut status = TcpDaemonStatus {
            state: TcpDaemonState::Running,
            pid: Some(42),
            started_at_ms: Some(1),
            last_error: None,
            listen_addr: Some("0.0.0.0:4732".to_string()),
        };

        sync_tcp_daemon_listen_addr(&mut status, "0.0.0.0:7777");
        assert_eq!(status.listen_addr.as_deref(), Some("0.0.0.0:4732"));
    }

    #[test]
    fn listen_addr_preflight_fails_when_port_is_in_use() {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("runtime");

        runtime.block_on(async {
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
                .await
                .expect("bind ephemeral listener");
            let occupied = listener.local_addr().expect("local addr").to_string();

            let error = ensure_listen_addr_available(&occupied)
                .await
                .expect_err("expected occupied port error");
            assert!(error.contains("unavailable"));
        });
    }
}

#[tauri::command]
pub(crate) async fn tailscale_daemon_command_preview(
    state: State<'_, AppState>,
) -> Result<TailscaleDaemonCommandPreview, String> {
    daemon_commands::tailscale_daemon_command_preview(state).await
}

#[tauri::command]
pub(crate) async fn tailscale_daemon_start(
    state: State<'_, AppState>,
) -> Result<TcpDaemonStatus, String> {
    daemon_commands::tailscale_daemon_start(state).await
}

#[tauri::command]
pub(crate) async fn tailscale_daemon_stop(
    state: State<'_, AppState>,
) -> Result<TcpDaemonStatus, String> {
    daemon_commands::tailscale_daemon_stop(state).await
}

#[tauri::command]
pub(crate) async fn tailscale_daemon_status(
    state: State<'_, AppState>,
) -> Result<TcpDaemonStatus, String> {
    daemon_commands::tailscale_daemon_status(state).await
}
