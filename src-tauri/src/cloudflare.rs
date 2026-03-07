use std::ffi::{OsStr, OsString};
use std::io::ErrorKind;
use std::path::PathBuf;
use std::process::{Output, Stdio};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tauri::State;
use tokio::io::{AsyncBufReadExt, AsyncRead, BufReader};
use tokio::net::TcpStream;
use tokio::sync::Mutex;
use tokio::time::sleep;

use crate::shared::process_core::{kill_child_process_tree, tokio_command};
use crate::state::{AppState, CloudflareTunnelRuntime};
use crate::types::{CloudflareTunnelStatus, TcpDaemonState};

#[cfg(any(target_os = "android", target_os = "ios"))]
const UNSUPPORTED_MESSAGE: &str = "Cloudflare tunnel integration is only available on desktop.";
const DEFAULT_WS_PORT: u16 = 4733;
const URL_WAIT_TIMEOUT_MS: u64 = 8_000;
const URL_WAIT_INTERVAL_MS: u64 = 150;
const MANAGED_TUNNEL_LABEL_PREFIX: &str = "codexmonitor-managed-ws";

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

fn ws_port_from_remote_host(remote_host: &str) -> u16 {
    match parse_port_from_remote_host(remote_host) {
        Some(port) if port < u16::MAX => port + 1,
        _ => DEFAULT_WS_PORT,
    }
}

fn local_ws_target_url(settings: &crate::types::AppSettings) -> String {
    let port = ws_port_from_remote_host(&settings.remote_backend_host);
    format!("http://127.0.0.1:{port}")
}

fn local_ws_port(local_url: &str) -> Option<u16> {
    local_url
        .strip_prefix("http://127.0.0.1:")
        .and_then(|raw| raw.trim().parse::<u16>().ok())
}

fn managed_tunnel_label(local_url: &str) -> String {
    let suffix = local_ws_port(local_url).unwrap_or(DEFAULT_WS_PORT);
    format!("{MANAGED_TUNNEL_LABEL_PREFIX}-{suffix}")
}

fn cloudflare_tunnel_pidfile_path(state: &AppState, local_url: &str) -> Option<PathBuf> {
    let parent = state.settings_path.parent()?;
    let suffix = local_ws_port(local_url).unwrap_or(DEFAULT_WS_PORT);
    Some(parent.join(format!("cloudflare_tunnel_{suffix}.pid")))
}

fn remove_pidfile_if_exists(path: &PathBuf) {
    if let Err(err) = std::fs::remove_file(path) {
        if err.kind() != ErrorKind::NotFound {
            eprintln!(
                "cloudflare: failed to remove pidfile {}: {err}",
                path.display()
            );
        }
    }
}

fn command_matches_legacy_managed_tunnel(command: &str, local_url: &str) -> bool {
    let normalized = command.trim();
    if normalized.is_empty() {
        return false;
    }
    if !normalized.contains("cloudflared") {
        return false;
    }
    // Legacy CodexMonitor launcher signature (before label/pidfile support).
    normalized.contains("cloudflared tunnel")
        && normalized.contains("--url")
        && normalized.contains(local_url)
        && normalized.contains("--no-autoupdate")
        && normalized.contains("--protocol")
        && normalized.contains("http2")
        && normalized.contains("--loglevel")
        && normalized.contains("info")
        && !normalized.contains("tunnel run")
}

fn command_matches_managed_tunnel(command: &str, label: &str, local_url: &str) -> bool {
    let normalized = command.trim();
    if normalized.is_empty() {
        return false;
    }
    (normalized.contains("cloudflared")
        && normalized.contains(label)
        && normalized.contains(local_url)
        && normalized.contains("--url"))
        || command_matches_legacy_managed_tunnel(normalized, local_url)
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
async fn command_line_for_pid(pid: u32) -> Option<String> {
    let output = tokio_command("ps")
        .args(["-p", &pid.to_string(), "-o", "command="])
        .output()
        .await
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if value.is_empty() {
        None
    } else {
        Some(value)
    }
}

#[cfg(unix)]
async fn managed_tunnel_pids_by_scan(label: &str, local_url: &str) -> Vec<u32> {
    let output = match tokio_command("ps").args(["-axo", "pid=,command="]).output().await {
        Ok(value) => value,
        Err(_) => return Vec::new(),
    };
    if !output.status.success() {
        return Vec::new();
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    stdout
        .lines()
        .filter_map(|line| {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                return None;
            }
            let separator = trimmed.find(char::is_whitespace)?;
            let (pid_raw, command_raw) = trimmed.split_at(separator);
            let pid = pid_raw.trim().parse::<u32>().ok()?;
            let command = command_raw.trim();
            if command_matches_managed_tunnel(command, label, local_url) {
                Some(pid)
            } else {
                None
            }
        })
        .collect()
}

#[cfg(unix)]
fn read_pid_from_file(path: &PathBuf) -> Option<u32> {
    let raw = std::fs::read_to_string(path).ok()?;
    raw.trim().parse::<u32>().ok()
}

#[cfg(unix)]
async fn managed_tunnel_pid_from_file(
    pidfile_path: &PathBuf,
    label: &str,
    local_url: &str,
) -> Option<u32> {
    let pid = read_pid_from_file(pidfile_path)?;
    let command = command_line_for_pid(pid).await?;
    if command_matches_managed_tunnel(&command, label, local_url) {
        Some(pid)
    } else {
        None
    }
}

#[cfg(unix)]
async fn kill_pid_gracefully(pid: u32) -> Result<(), String> {
    let term_result = unsafe { libc::kill(pid as i32, libc::SIGTERM) };
    if term_result != 0 {
        let err = std::io::Error::last_os_error();
        if err.raw_os_error() != Some(libc::ESRCH) {
            return Err(format!("Failed to stop cloudflared process {pid}: {err}"));
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
            return Err(format!("Failed to force-stop cloudflared process {pid}: {err}"));
        }
    }

    for _ in 0..8 {
        if !is_pid_running(pid) {
            return Ok(());
        }
        sleep(Duration::from_millis(100)).await;
    }
    Err(format!("cloudflared process {pid} is still running."))
}

#[cfg(unix)]
async fn collect_managed_tunnel_pids(
    local_url: &str,
    label: &str,
    pidfile_path: Option<&PathBuf>,
) -> Vec<u32> {
    let mut pids = managed_tunnel_pids_by_scan(label, local_url).await;
    if let Some(path) = pidfile_path {
        if let Some(pid) = managed_tunnel_pid_from_file(path, label, local_url).await {
            if !pids.contains(&pid) {
                pids.push(pid);
            }
        }
    }
    pids.sort_unstable();
    pids.dedup();
    pids
}

#[cfg(unix)]
async fn stop_managed_tunnels(local_url: &str, label: &str, pidfile_path: Option<&PathBuf>) {
    let pids = collect_managed_tunnel_pids(local_url, label, pidfile_path).await;
    for pid in pids {
        if let Err(err) = kill_pid_gracefully(pid).await {
            eprintln!("cloudflare: failed to stop managed tunnel pid {pid}: {err}");
        }
    }
}

#[cfg(unix)]
async fn stop_selected_pids(pids: &[u32]) {
    for pid in pids {
        if let Err(err) = kill_pid_gracefully(*pid).await {
            eprintln!("cloudflare: failed to stop managed tunnel pid {pid}: {err}");
        }
    }
}

#[cfg(not(unix))]
async fn collect_managed_tunnel_pids(
    _local_url: &str,
    _label: &str,
    _pidfile_path: Option<&PathBuf>,
) -> Vec<u32> {
    Vec::new()
}

#[cfg(not(unix))]
async fn stop_managed_tunnels(_local_url: &str, _label: &str, _pidfile_path: Option<&PathBuf>) {}

#[cfg(not(unix))]
async fn stop_selected_pids(_pids: &[u32]) {}

fn cloudflared_binary_candidates() -> Vec<OsString> {
    let mut candidates = vec![OsString::from("cloudflared")];

    #[cfg(target_os = "macos")]
    {
        candidates.push(OsString::from("/opt/homebrew/bin/cloudflared"));
        candidates.push(OsString::from("/usr/local/bin/cloudflared"));
    }

    #[cfg(target_os = "linux")]
    {
        candidates.push(OsString::from("/usr/bin/cloudflared"));
        candidates.push(OsString::from("/usr/local/bin/cloudflared"));
        candidates.push(OsString::from("/run/current-system/sw/bin/cloudflared"));
    }

    #[cfg(target_os = "windows")]
    {
        candidates.push(OsString::from(
            "C:\\Program Files\\Cloudflare\\Cloudflared\\cloudflared.exe",
        ));
    }

    candidates
}

fn trim_to_non_empty(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|entry| !entry.is_empty())
        .map(str::to_string)
}

fn looks_like_cloudflared_version(stdout: &str) -> bool {
    let lower = stdout.to_ascii_lowercase();
    lower.contains("cloudflared")
        && lower.split(|ch: char| !ch.is_ascii_alphanumeric() && ch != '.').any(|token| {
            let parts: Vec<&str> = token.split('.').collect();
            parts.len() >= 2
                && parts
                    .iter()
                    .all(|part| !part.is_empty() && part.chars().all(|ch| ch.is_ascii_digit()))
        })
}

fn cloudflared_version_from_output(output: &Output) -> Option<String> {
    trim_to_non_empty(std::str::from_utf8(&output.stdout).ok())
        .and_then(|raw| raw.lines().next().map(str::trim).map(str::to_string))
}

async fn resolve_cloudflared_binary() -> Result<Option<(OsString, Output)>, String> {
    let mut failures: Vec<String> = Vec::new();
    for binary in cloudflared_binary_candidates() {
        let output = tokio_command(binary.as_os_str())
            .arg("--version")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await;
        match output {
            Ok(version_output) => {
                let stdout = trim_to_non_empty(std::str::from_utf8(&version_output.stdout).ok());
                let stderr = trim_to_non_empty(std::str::from_utf8(&version_output.stderr).ok());
                if version_output.status.success()
                    && stdout.as_deref().is_some_and(looks_like_cloudflared_version)
                {
                    return Ok(Some((binary, version_output)));
                }
                let detail = match (stdout, stderr) {
                    (Some(out), Some(err)) => format!("stdout: {out}; stderr: {err}"),
                    (Some(out), None) => format!("stdout: {out}"),
                    (None, Some(err)) => format!("stderr: {err}"),
                    (None, None) => "no output".to_string(),
                };
                failures.push(format!(
                    "{}: cloudflared --version failed or returned unexpected output ({detail})",
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
            "Failed to run cloudflared --version from candidate paths: {}",
            failures.join(" | ")
        ))
    }
}

fn missing_cloudflared_message() -> String {
    "cloudflared CLI not found. Install it first (for macOS: `brew install cloudflared`)."
        .to_string()
}

fn summarize_command_output(output: &Output) -> String {
    let stdout = std::str::from_utf8(&output.stdout).ok().map(str::trim).unwrap_or("");
    let stderr = std::str::from_utf8(&output.stderr).ok().map(str::trim).unwrap_or("");
    let mut sections: Vec<String> = Vec::new();
    if !stdout.is_empty() {
        sections.push(format!("stdout: {stdout}"));
    }
    if !stderr.is_empty() {
        sections.push(format!("stderr: {stderr}"));
    }
    let combined = if sections.is_empty() {
        "no output".to_string()
    } else {
        sections.join("; ")
    };
    const MAX_LEN: usize = 700;
    if combined.len() <= MAX_LEN {
        combined
    } else {
        format!("{}…", &combined[..MAX_LEN])
    }
}

async fn install_cloudflared_cli() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let brew_check = tokio_command("brew")
            .arg("--version")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await
            .map_err(|err| {
                if err.kind() == ErrorKind::NotFound {
                    "Homebrew is not installed. Install Homebrew first, then retry cloudflared install."
                        .to_string()
                } else {
                    format!("Failed to run `brew --version`: {err}")
                }
            })?;
        if !brew_check.status.success() {
            return Err(format!(
                "`brew --version` failed: {}",
                summarize_command_output(&brew_check)
            ));
        }

        let install = tokio_command("brew")
            .arg("install")
            .arg("cloudflared")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await
            .map_err(|err| format!("Failed to run `brew install cloudflared`: {err}"))?;
        if !install.status.success() {
            return Err(format!(
                "`brew install cloudflared` failed: {}",
                summarize_command_output(&install)
            ));
        }
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        return Err(
            "One-click cloudflared install is not available yet on Windows. Install cloudflared manually and retry."
                .to_string(),
        );
    }

    #[cfg(target_os = "linux")]
    {
        return Err(
            "One-click cloudflared install is not available yet on Linux. Install cloudflared manually and retry."
                .to_string(),
        );
    }

    #[allow(unreachable_code)]
    Err("One-click cloudflared install is not supported on this platform.".to_string())
}

fn extract_https_host(candidate: &str) -> Option<String> {
    let rest = candidate.strip_prefix("https://")?;
    let authority_end = rest.find(['/', '?', '#']).unwrap_or(rest.len());
    let authority = &rest[..authority_end];
    let host_port = authority.rsplit('@').next().unwrap_or(authority);
    if host_port.is_empty() {
        return None;
    }

    if let Some(stripped) = host_port.strip_prefix('[') {
        let end = stripped.find(']')?;
        let host = &stripped[..end];
        if host.is_empty() {
            return None;
        }
        return Some(host.to_ascii_lowercase());
    }

    let host = host_port.split(':').next().unwrap_or_default();
    if host.is_empty() {
        return None;
    }
    Some(host.to_ascii_lowercase())
}

fn extract_public_url_from_line(line: &str) -> Option<String> {
    for token in line.split_whitespace() {
        let trimmed = token
            .trim()
            .trim_matches('"')
            .trim_matches('\'')
            .trim_matches('(')
            .trim_matches(')')
            .trim_matches('[')
            .trim_matches(']')
            .trim_end_matches(',')
            .trim_end_matches(';')
            .trim_end_matches('.');
        if !trimmed.starts_with("https://") {
            continue;
        }
        let Some(host_lower) = extract_https_host(trimmed) else {
            continue;
        };
        if host_lower == "trycloudflare.com" || host_lower.ends_with(".trycloudflare.com") {
            return Some(trimmed.to_string());
        }
    }
    None
}

fn to_suggested_wss_url(public_url: &str) -> Option<String> {
    let trimmed = public_url.trim();
    if let Some(rest) = trimmed.strip_prefix("https://") {
        return Some(format!("wss://{rest}"));
    }
    if trimmed.starts_with("wss://") {
        return Some(trimmed.to_string());
    }
    None
}

fn spawn_log_reader_task<R>(
    reader: R,
    discovered_public_url: Arc<Mutex<Option<String>>>,
) -> tokio::task::JoinHandle<()>
where
    R: AsyncRead + Unpin + Send + 'static,
{
    tokio::spawn(async move {
        let mut lines = BufReader::new(reader).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if let Some(url) = extract_public_url_from_line(&line) {
                let mut discovered = discovered_public_url.lock().await;
                if discovered.is_none() {
                    *discovered = Some(url);
                }
            }
        }
    })
}

async fn sync_discovered_public_url(runtime: &mut CloudflareTunnelRuntime) {
    let discovered = runtime.discovered_public_url.lock().await.clone();
    if let Some(public_url) = discovered {
        runtime.status.public_url = Some(public_url.clone());
        runtime.status.suggested_wss_url = to_suggested_wss_url(&public_url);
    }
}

async fn refresh_cloudflare_runtime(runtime: &mut CloudflareTunnelRuntime) {
    let Some(child) = runtime.child.as_mut() else {
        if matches!(runtime.status.state, TcpDaemonState::Running) {
            runtime.status.state = TcpDaemonState::Stopped;
            runtime.status.pid = None;
            runtime.status.started_at_ms = None;
        }
        return;
    };

    match child.try_wait() {
        Ok(Some(status)) => {
            let pid = child.id();
            runtime.child = None;
            if status.success() {
                runtime.status.state = TcpDaemonState::Stopped;
                runtime.status.pid = pid;
                runtime.status.started_at_ms = None;
                runtime.status.last_error = None;
            } else {
                runtime.status.state = TcpDaemonState::Error;
                runtime.status.pid = pid;
                runtime.status.last_error =
                    Some(format!("Cloudflare tunnel exited with status: {status}."));
            }
            if let Some(task) = runtime.stdout_task.take() {
                task.abort();
            }
            if let Some(task) = runtime.stderr_task.take() {
                task.abort();
            }
        }
        Ok(None) => {
            runtime.status.state = TcpDaemonState::Running;
            runtime.status.pid = child.id();
        }
        Err(err) => {
            runtime.status.state = TcpDaemonState::Error;
            runtime.status.pid = child.id();
            runtime.status.last_error =
                Some(format!("Failed to inspect Cloudflare tunnel process: {err}"));
        }
    }
}

async fn ensure_local_target_reachable(local_url: &str) -> Result<(), String> {
    let Some(connect_addr) = local_url.strip_prefix("http://") else {
        return Err(format!(
            "Invalid Cloudflare local URL `{local_url}`. Expected format http://127.0.0.1:<port>."
        ));
    };
    let attempt = tokio::time::timeout(Duration::from_millis(1500), TcpStream::connect(connect_addr))
        .await
        .map_err(|_| {
            format!(
                "Timed out connecting to daemon WebSocket listener at {connect_addr}. Start mobile access daemon first."
            )
        })?;
    attempt.map_err(|err| {
        format!(
            "Cannot reach daemon WebSocket listener at {connect_addr}: {err}. Start mobile access daemon first."
        )
    })?;
    Ok(())
}

async fn wait_for_public_url(discovered_public_url: Arc<Mutex<Option<String>>>) -> Option<String> {
    let start = now_unix_ms();
    loop {
        if let Some(url) = discovered_public_url.lock().await.clone() {
            return Some(url);
        }
        if now_unix_ms() - start >= URL_WAIT_TIMEOUT_MS as i64 {
            return None;
        }
        sleep(Duration::from_millis(URL_WAIT_INTERVAL_MS)).await;
    }
}

#[tauri::command]
pub(crate) async fn cloudflare_tunnel_start(
    state: State<'_, AppState>,
) -> Result<CloudflareTunnelStatus, String> {
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        return Err(UNSUPPORTED_MESSAGE.to_string());
    }

    let settings = state.app_settings.lock().await.clone();
    let _token = settings
        .remote_backend_token
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "Set a remote backend token (password) before starting tunnel.".to_string())?;

    let (cloudflared_binary, version_output) = resolve_cloudflared_binary()
        .await?
        .ok_or_else(missing_cloudflared_message)?;
    let version = cloudflared_version_from_output(&version_output);
    let local_url = local_ws_target_url(&settings);
    let managed_label = managed_tunnel_label(&local_url);
    let pidfile_path = cloudflare_tunnel_pidfile_path(&state, &local_url);
    ensure_local_target_reachable(&local_url).await?;
    stop_managed_tunnels(&local_url, &managed_label, pidfile_path.as_ref()).await;
    if let Some(path) = &pidfile_path {
        remove_pidfile_if_exists(path);
    }

    let discovered_public_url = {
        let mut runtime = state.cloudflare_tunnel.lock().await;
        refresh_cloudflare_runtime(&mut runtime).await;
        sync_discovered_public_url(&mut runtime).await;

        runtime.status.installed = true;
        runtime.status.version = version.clone();
        runtime.status.local_url = Some(local_url.clone());

        if matches!(runtime.status.state, TcpDaemonState::Running) {
            return Ok(runtime.status.clone());
        }

        *runtime.discovered_public_url.lock().await = None;
        let mut command = tokio_command(cloudflared_binary.as_os_str());
        command
            .arg("--label")
            .arg(&managed_label)
            .arg("tunnel")
            .arg("--url")
            .arg(&local_url)
            .arg("--no-autoupdate")
            .arg("--protocol")
            .arg("http2")
            .arg("--loglevel")
            .arg("info");
        if let Some(path) = &pidfile_path {
            command.arg("--pidfile").arg(path);
        }
        let mut child = command
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|err| format!("Failed to start Cloudflare tunnel: {err}"))?;

        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        let pid = child.id();
        let discovered = Arc::clone(&runtime.discovered_public_url);
        runtime.stdout_task = stdout.map(|stream| spawn_log_reader_task(stream, Arc::clone(&discovered)));
        runtime.stderr_task = stderr.map(|stream| spawn_log_reader_task(stream, Arc::clone(&discovered)));
        runtime.child = Some(child);
        runtime.status = CloudflareTunnelStatus {
            state: TcpDaemonState::Running,
            pid,
            started_at_ms: Some(now_unix_ms()),
            last_error: None,
            local_url: Some(local_url.clone()),
            public_url: None,
            suggested_wss_url: None,
            installed: true,
            version: version.clone(),
        };
        discovered
    };

    let _ = wait_for_public_url(discovered_public_url).await;

    let mut runtime = state.cloudflare_tunnel.lock().await;
    refresh_cloudflare_runtime(&mut runtime).await;
    sync_discovered_public_url(&mut runtime).await;
    runtime.status.installed = true;
    runtime.status.version = version;
    runtime.status.local_url = Some(local_url);
    if matches!(runtime.status.state, TcpDaemonState::Running) && runtime.status.public_url.is_none() {
        runtime.status.last_error = Some(
            "Tunnel started but public URL is not ready yet. Click Refresh status in a few seconds."
                .to_string(),
        );
    }
    Ok(runtime.status.clone())
}

#[tauri::command]
pub(crate) async fn cloudflare_tunnel_stop(
    state: State<'_, AppState>,
) -> Result<CloudflareTunnelStatus, String> {
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        return Err(UNSUPPORTED_MESSAGE.to_string());
    }

    let settings = state.app_settings.lock().await.clone();
    let local_url = local_ws_target_url(&settings);
    let managed_label = managed_tunnel_label(&local_url);
    let pidfile_path = cloudflare_tunnel_pidfile_path(&state, &local_url);

    let mut runtime = state.cloudflare_tunnel.lock().await;
    if let Some(mut child) = runtime.child.take() {
        kill_child_process_tree(&mut child).await;
        let _ = child.wait().await;
    }
    if let Some(task) = runtime.stdout_task.take() {
        task.abort();
    }
    if let Some(task) = runtime.stderr_task.take() {
        task.abort();
    }
    *runtime.discovered_public_url.lock().await = None;
    stop_managed_tunnels(&local_url, &managed_label, pidfile_path.as_ref()).await;
    if let Some(path) = &pidfile_path {
        remove_pidfile_if_exists(path);
    }

    runtime.status.state = TcpDaemonState::Stopped;
    runtime.status.pid = None;
    runtime.status.started_at_ms = None;
    runtime.status.last_error = None;
    runtime.status.local_url = Some(local_url);
    runtime.status.public_url = None;
    runtime.status.suggested_wss_url = None;

    match resolve_cloudflared_binary().await {
        Ok(Some((_binary, version_output))) => {
            runtime.status.installed = true;
            runtime.status.version = cloudflared_version_from_output(&version_output);
        }
        Ok(None) => {
            runtime.status.installed = false;
            runtime.status.version = None;
            runtime.status.last_error = Some(missing_cloudflared_message());
        }
        Err(err) => {
            runtime.status.installed = true;
            runtime.status.last_error = Some(err);
        }
    }

    Ok(runtime.status.clone())
}

#[tauri::command]
pub(crate) async fn cloudflare_tunnel_status(
    state: State<'_, AppState>,
) -> Result<CloudflareTunnelStatus, String> {
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        return Err(UNSUPPORTED_MESSAGE.to_string());
    }

    let settings = state.app_settings.lock().await.clone();
    let local_url = local_ws_target_url(&settings);
    let managed_label = managed_tunnel_label(&local_url);
    let pidfile_path = cloudflare_tunnel_pidfile_path(&state, &local_url);

    let cloudflared = resolve_cloudflared_binary().await;
    let mut runtime = state.cloudflare_tunnel.lock().await;
    refresh_cloudflare_runtime(&mut runtime).await;
    sync_discovered_public_url(&mut runtime).await;
    let managed_pids = collect_managed_tunnel_pids(&local_url, &managed_label, pidfile_path.as_ref()).await;
    if managed_pids.len() > 1 {
        stop_selected_pids(&managed_pids[1..]).await;
    }
    if managed_pids.is_empty() {
        if let Some(path) = &pidfile_path {
            remove_pidfile_if_exists(path);
        }
    }
    if !matches!(runtime.status.state, TcpDaemonState::Running) {
        if let Some(pid) = managed_pids.first().copied() {
            runtime.status.state = TcpDaemonState::Running;
            runtime.status.pid = Some(pid);
            if runtime.status.started_at_ms.is_none() {
                runtime.status.started_at_ms = Some(now_unix_ms());
            }
            runtime.status.last_error = None;
        }
    }
    runtime.status.local_url = Some(local_url);

    match cloudflared {
        Ok(Some((_binary, version_output))) => {
            let missing_message = missing_cloudflared_message();
            runtime.status.installed = true;
            runtime.status.version = cloudflared_version_from_output(&version_output);
            if runtime.status.last_error.as_deref() == Some(missing_message.as_str()) {
                runtime.status.last_error = None;
            }
        }
        Ok(None) => {
            runtime.status.installed = false;
            runtime.status.version = None;
            if matches!(runtime.status.state, TcpDaemonState::Running) {
                runtime.status.last_error = Some(
                    "cloudflared CLI is unavailable in current environment.".to_string(),
                );
                runtime.status.state = TcpDaemonState::Error;
            } else {
                runtime.status.last_error = Some(missing_cloudflared_message());
            }
        }
        Err(err) => {
            runtime.status.installed = true;
            runtime.status.version = None;
            runtime.status.last_error = Some(err);
            if !matches!(runtime.status.state, TcpDaemonState::Running) {
                runtime.status.state = TcpDaemonState::Error;
            }
        }
    }

    Ok(runtime.status.clone())
}

#[tauri::command]
pub(crate) async fn cloudflare_tunnel_install(
    state: State<'_, AppState>,
) -> Result<CloudflareTunnelStatus, String> {
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        return Err(UNSUPPORTED_MESSAGE.to_string());
    }

    install_cloudflared_cli().await?;
    cloudflare_tunnel_status(state).await
}

#[cfg(test)]
mod tests {
    use super::{
        command_matches_legacy_managed_tunnel, command_matches_managed_tunnel,
        extract_https_host, extract_public_url_from_line, managed_tunnel_label,
        to_suggested_wss_url, ws_port_from_remote_host,
    };

    #[test]
    fn extracts_public_url_from_quick_tunnel_line() {
        let line = "Your quick Tunnel has been created! Visit it at https://abc.trycloudflare.com";
        let url = extract_public_url_from_line(line);
        assert_eq!(url.as_deref(), Some("https://abc.trycloudflare.com"));
    }

    #[test]
    fn ignores_non_tunnel_https_links() {
        let line = "Read docs: https://www.cloudflare.com/website-terms/) for details";
        let url = extract_public_url_from_line(line);
        assert_eq!(url, None);
    }

    #[test]
    fn extracts_https_host_with_user_info_and_port() {
        let host = extract_https_host("https://user:pass@abc.trycloudflare.com:443/path");
        assert_eq!(host.as_deref(), Some("abc.trycloudflare.com"));
    }

    #[test]
    fn converts_https_url_to_wss_url() {
        let wss = to_suggested_wss_url("https://abc.trycloudflare.com");
        assert_eq!(wss.as_deref(), Some("wss://abc.trycloudflare.com"));
    }

    #[test]
    fn ws_port_defaults_to_4733() {
        assert_eq!(ws_port_from_remote_host(""), 4733);
        assert_eq!(ws_port_from_remote_host("127.0.0.1:4732"), 4733);
        assert_eq!(ws_port_from_remote_host("127.0.0.1:9000"), 9001);
    }

    #[test]
    fn managed_label_tracks_ws_port() {
        assert_eq!(
            managed_tunnel_label("http://127.0.0.1:4733"),
            "codexmonitor-managed-ws-4733"
        );
        assert_eq!(
            managed_tunnel_label("http://127.0.0.1:9001"),
            "codexmonitor-managed-ws-9001"
        );
    }

    #[test]
    fn managed_tunnel_command_match_avoids_non_labeled_processes() {
        let label = "codexmonitor-managed-ws-4733";
        let local_url = "http://127.0.0.1:4733";
        let managed = "cloudflared --label codexmonitor-managed-ws-4733 tunnel --url http://127.0.0.1:4733 --pidfile /tmp/cf.pid";
        let other = "cloudflared tunnel --url http://127.0.0.1:4733";
        assert!(command_matches_managed_tunnel(managed, label, local_url));
        assert!(!command_matches_managed_tunnel(other, label, local_url));
    }

    #[test]
    fn legacy_managed_tunnel_signature_is_detected() {
        let local_url = "http://127.0.0.1:4733";
        let legacy = "cloudflared tunnel --url http://127.0.0.1:4733 --no-autoupdate --protocol http2 --loglevel info";
        let non_managed = "cloudflared tunnel run --token abc.def";
        assert!(command_matches_legacy_managed_tunnel(legacy, local_url));
        assert!(!command_matches_legacy_managed_tunnel(non_managed, local_url));
    }
}
