#[path = "../daemon_binary.rs"]
mod daemon_binary;
#[allow(dead_code)]
#[path = "../storage.rs"]
mod storage;
#[allow(dead_code)]
#[path = "../types.rs"]
mod types;

use daemon_binary::resolve_daemon_binary_path;
use serde_json::{json, Value};
use std::env;
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::tcp::{OwnedReadHalf, OwnedWriteHalf};
use tokio::net::TcpStream;
use tokio::process::Command;
use tokio::time::{sleep, timeout, Instant};

use types::{AppSettings, TailscaleDaemonCommandPreview, TcpDaemonState, TcpDaemonStatus};

const EXPECTED_DAEMON_NAME: &str = "codex-monitor-daemon";
const EXPECTED_DAEMON_MODE: &str = "tcp";
const CURRENT_APP_VERSION: &str = env!("CARGO_PKG_VERSION");
const DEFAULT_LISTEN_ADDR: &str = "0.0.0.0:4732";
const REMOTE_TOKEN_PLACEHOLDER: &str = "<remote-backend-token>";
const APP_IDENTIFIER: &str = "com.dimillian.codexmonitor";
const DAEMON_RPC_TIMEOUT: Duration = Duration::from_millis(700);

#[derive(Debug, Clone)]
struct CliArgs {
    command: CliCommand,
    listen: Option<String>,
    token: Option<String>,
    data_dir: Option<PathBuf>,
    daemon_path: Option<PathBuf>,
    json: bool,
    insecure_no_auth: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CliCommand {
    Start,
    Stop,
    Status,
    CommandPreview,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct DaemonInfo {
    name: String,
    version: String,
    pid: Option<u32>,
    mode: String,
    binary_path: Option<String>,
}

#[derive(Debug, Clone)]
enum DaemonProbe {
    NotReachable,
    Running {
        auth_ok: bool,
        auth_error: Option<String>,
        info: Option<DaemonInfo>,
    },
    NotDaemon,
}

type DaemonLines = tokio::io::Lines<BufReader<OwnedReadHalf>>;

fn main() {
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build();
    let result = match runtime {
        Ok(runtime) => runtime.block_on(run()),
        Err(err) => Err(format!("Failed to initialize async runtime: {err}")),
    };
    if let Err(err) = result {
        eprintln!("{err}");
        std::process::exit(1);
    }
}

async fn run() -> Result<(), String> {
    let args = parse_args()?;
    let data_dir = resolve_data_dir(args.data_dir);
    let settings = load_settings(&data_dir);

    let listen_addr = resolve_listen_addr(args.listen.as_deref(), settings.as_ref())?;
    let token = if args.insecure_no_auth {
        None
    } else {
        resolve_token(args.token.as_deref(), settings.as_ref())
    };

    match args.command {
        CliCommand::CommandPreview => {
            let daemon_path = resolve_daemon_path(args.daemon_path.as_deref())?;
            let preview = daemon_command_preview(
                &daemon_path,
                &data_dir,
                token.is_some(),
                &listen_addr,
                args.insecure_no_auth,
            );
            if args.json {
                println!(
                    "{}",
                    serde_json::to_string_pretty(&preview).map_err(|e| e.to_string())?
                );
            } else {
                println!("{}", preview.command);
            }
        }
        CliCommand::Status => {
            let status = daemon_status(&listen_addr, token.as_deref()).await;
            print_status(&status, args.json)?;
        }
        CliCommand::Stop => {
            let status = daemon_stop(&listen_addr, token.as_deref()).await;
            print_status(&status, args.json)?;
            if !matches!(status.state, TcpDaemonState::Stopped) {
                return Err(status
                    .last_error
                    .unwrap_or_else(|| "Daemon is still running after stop attempt.".to_string()));
            }
        }
        CliCommand::Start => {
            let daemon_path = resolve_daemon_path(args.daemon_path.as_deref())?;
            let status = daemon_start(
                &listen_addr,
                token.as_deref(),
                args.insecure_no_auth,
                &data_dir,
                &daemon_path,
            )
            .await?;
            print_status(&status, args.json)?;
        }
    }

    Ok(())
}

fn parse_args() -> Result<CliArgs, String> {
    let mut args = env::args().skip(1);

    let Some(first) = args.next() else {
        return Err(usage());
    };

    if matches!(first.as_str(), "-h" | "--help" | "help") {
        print!("{}", usage());
        std::process::exit(0);
    }

    let command = match first.as_str() {
        "start" => CliCommand::Start,
        "stop" => CliCommand::Stop,
        "status" => CliCommand::Status,
        "command-preview" => CliCommand::CommandPreview,
        _ => return Err(format!("Unknown command: {first}\n\n{}", usage())),
    };

    let mut listen: Option<String> = None;
    let mut token: Option<String> = None;
    let mut data_dir: Option<PathBuf> = None;
    let mut daemon_path: Option<PathBuf> = None;
    let mut json = false;
    let mut insecure_no_auth = false;

    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--listen" => {
                let value = args.next().ok_or("--listen requires a value")?;
                let trimmed = value.trim();
                if trimmed.is_empty() {
                    return Err("--listen requires a non-empty value".to_string());
                }
                listen = Some(trimmed.to_string());
            }
            "--token" => {
                let value = args.next().ok_or("--token requires a value")?;
                let trimmed = value.trim();
                if trimmed.is_empty() {
                    return Err("--token requires a non-empty value".to_string());
                }
                token = Some(trimmed.to_string());
            }
            "--data-dir" => {
                let value = args.next().ok_or("--data-dir requires a value")?;
                let trimmed = value.trim();
                if trimmed.is_empty() {
                    return Err("--data-dir requires a non-empty value".to_string());
                }
                data_dir = Some(PathBuf::from(trimmed));
            }
            "--daemon-path" => {
                let value = args.next().ok_or("--daemon-path requires a value")?;
                let trimmed = value.trim();
                if trimmed.is_empty() {
                    return Err("--daemon-path requires a non-empty value".to_string());
                }
                daemon_path = Some(PathBuf::from(trimmed));
            }
            "--json" => {
                json = true;
            }
            "--insecure-no-auth" => {
                insecure_no_auth = true;
                token = None;
            }
            "-h" | "--help" => {
                print!("{}", usage());
                std::process::exit(0);
            }
            _ => return Err(format!("Unknown argument: {arg}\n\n{}", usage())),
        }
    }

    Ok(CliArgs {
        command,
        listen,
        token,
        data_dir,
        daemon_path,
        json,
        insecure_no_auth,
    })
}

fn usage() -> String {
    format!(
        "\
USAGE:\n  codex-monitor-daemonctl <command> [options]\n\n\
COMMANDS:\n  start              Start daemon (auto-restarts mismatched daemon if safe)\n  stop               Stop daemon\n  status             Show daemon status\n  command-preview    Print equivalent daemon start command\n\n\
OPTIONS:\n  --listen <addr>        Bind/listen address (default derived from settings, fallback: {DEFAULT_LISTEN_ADDR})\n  --token <token>        Remote backend token override\n  --data-dir <path>      App data dir (contains settings.json/workspaces.json)\n  --daemon-path <path>   Explicit path to codex-monitor-daemon binary\n  --insecure-no-auth     Start/probe daemon without auth token (dev only)\n  --json                 Print JSON output\n  -h, --help             Show this help\n\n\
NOTES:\n  - Defaults read token/host from <data-dir>/settings.json\n  - If no --data-dir is provided, default app data dir is used for this platform\n"
    )
}

fn resolve_data_dir(data_dir: Option<PathBuf>) -> PathBuf {
    data_dir.unwrap_or_else(default_app_data_dir)
}

fn default_app_data_dir() -> PathBuf {
    #[cfg(target_os = "macos")]
    {
        let home = env::var("HOME").unwrap_or_else(|_| ".".to_string());
        return PathBuf::from(home)
            .join("Library")
            .join("Application Support")
            .join(APP_IDENTIFIER);
    }

    #[cfg(target_os = "windows")]
    {
        if let Ok(appdata) = env::var("APPDATA") {
            let trimmed = appdata.trim();
            if !trimmed.is_empty() {
                return PathBuf::from(trimmed).join(APP_IDENTIFIER);
            }
        }
        let user = env::var("USERPROFILE").unwrap_or_else(|_| ".".to_string());
        return PathBuf::from(user)
            .join("AppData")
            .join("Roaming")
            .join(APP_IDENTIFIER);
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        if let Ok(xdg) = env::var("XDG_DATA_HOME") {
            let trimmed = xdg.trim();
            if !trimmed.is_empty() {
                return PathBuf::from(trimmed).join(APP_IDENTIFIER);
            }
        }
        let home = env::var("HOME").unwrap_or_else(|_| ".".to_string());
        PathBuf::from(home)
            .join(".local")
            .join("share")
            .join(APP_IDENTIFIER)
    }
}

fn load_settings(data_dir: &Path) -> Option<AppSettings> {
    let settings_path = data_dir.join("settings.json");
    storage::read_settings(&settings_path).ok()
}

fn resolve_listen_addr(
    listen_arg: Option<&str>,
    settings: Option<&AppSettings>,
) -> Result<String, String> {
    if let Some(value) = trim_non_empty(listen_arg) {
        value
            .parse::<SocketAddr>()
            .map_err(|err| format!("Invalid --listen address `{value}`: {err}"))?;
        return Ok(value);
    }

    let from_settings = settings.map(|value| daemon_listen_addr(&value.remote_backend_host));
    let resolved = from_settings.unwrap_or_else(|| DEFAULT_LISTEN_ADDR.to_string());
    resolved
        .parse::<SocketAddr>()
        .map_err(|err| format!("Invalid listen address `{resolved}`: {err}"))?;
    Ok(resolved)
}

fn resolve_token(token_arg: Option<&str>, settings: Option<&AppSettings>) -> Option<String> {
    trim_non_empty(token_arg)
        .or_else(|| trim_non_empty(env::var("CODEX_MONITOR_DAEMON_TOKEN").ok().as_deref()))
        .or_else(|| {
            settings.and_then(|value| trim_non_empty(value.remote_backend_token.as_deref()))
        })
}

fn resolve_daemon_path(daemon_path: Option<&Path>) -> Result<PathBuf, String> {
    if let Some(path) = daemon_path {
        let canonical = path
            .canonicalize()
            .map_err(|err| format!("Failed to resolve --daemon-path {}: {err}", path.display()))?;
        if !canonical.is_file() {
            return Err(format!(
                "Daemon binary path is not a file: {}",
                canonical.display()
            ));
        }
        return Ok(canonical);
    }

    resolve_daemon_binary_path().map_err(|err| {
        format!(
            "{err}. If running from source, build the daemon binary first or pass --daemon-path."
        )
    })
}

fn daemon_listen_addr(remote_host: &str) -> String {
    let port = parse_port_from_remote_host(remote_host).unwrap_or(4732);
    format!("0.0.0.0:{port}")
}

fn parse_port_from_remote_host(remote_host: &str) -> Option<u16> {
    if remote_host.trim().is_empty() {
        return None;
    }
    if let Ok(addr) = remote_host.trim().parse::<SocketAddr>() {
        return Some(addr.port());
    }
    remote_host
        .trim()
        .rsplit_once(':')
        .and_then(|(_, port)| port.parse::<u16>().ok())
}

fn daemon_connect_addr(listen_addr: &str) -> Option<String> {
    let addr = listen_addr.trim().parse::<SocketAddr>().ok()?;
    let connect_addr = match addr.ip() {
        std::net::IpAddr::V4(ip) if ip.is_unspecified() => {
            SocketAddr::from(([127, 0, 0, 1], addr.port()))
        }
        std::net::IpAddr::V6(ip) if ip.is_unspecified() => {
            SocketAddr::from((std::net::Ipv6Addr::LOCALHOST, addr.port()))
        }
        _ => addr,
    };
    Some(connect_addr.to_string())
}

fn daemon_command_preview(
    daemon_path: &Path,
    data_dir: &Path,
    token_configured: bool,
    listen_addr: &str,
    insecure_no_auth: bool,
) -> TailscaleDaemonCommandPreview {
    let daemon_path_str = daemon_path.to_string_lossy().to_string();
    let data_dir_str = data_dir.to_string_lossy().to_string();

    let args = if insecure_no_auth {
        vec![
            "--listen".to_string(),
            listen_addr.to_string(),
            "--data-dir".to_string(),
            data_dir_str.clone(),
            "--insecure-no-auth".to_string(),
        ]
    } else {
        vec![
            "--listen".to_string(),
            listen_addr.to_string(),
            "--data-dir".to_string(),
            data_dir_str.clone(),
            "--token".to_string(),
            REMOTE_TOKEN_PLACEHOLDER.to_string(),
        ]
    };

    let mut rendered = Vec::with_capacity(args.len() + 1);
    rendered.push(shell_quote(&daemon_path_str));
    rendered.extend(args.iter().map(|value| shell_quote(value)));

    TailscaleDaemonCommandPreview {
        command: rendered.join(" "),
        daemon_path: daemon_path_str,
        args,
        token_configured,
    }
}

fn shell_quote(value: &str) -> String {
    if value.is_empty() {
        return "''".to_string();
    }
    if cfg!(windows) {
        format!("\"{}\"", value.replace('"', "\\\""))
    } else {
        format!("'{}'", value.replace('\'', "'\"'\"'"))
    }
}

fn trim_non_empty(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|entry| !entry.is_empty())
        .map(str::to_string)
}

fn parse_daemon_error_message(response: &Value) -> Option<String> {
    response
        .get("error")
        .and_then(|error| error.get("message"))
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn is_auth_error_message(message: &str) -> bool {
    let lower = message.to_ascii_lowercase();
    lower.contains("unauthorized") || lower.contains("invalid token")
}

fn parse_daemon_info(value: &Value) -> Result<DaemonInfo, String> {
    let name = value
        .get("name")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|entry| !entry.is_empty())
        .ok_or_else(|| "daemon_info missing `name`".to_string())?
        .to_string();
    let version = value
        .get("version")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|entry| !entry.is_empty())
        .ok_or_else(|| "daemon_info missing `version`".to_string())?
        .to_string();
    let mode = value
        .get("mode")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|entry| !entry.is_empty())
        .ok_or_else(|| "daemon_info missing `mode`".to_string())?
        .to_string();
    let pid = value
        .get("pid")
        .and_then(Value::as_u64)
        .and_then(|value| u32::try_from(value).ok());
    let binary_path = value
        .get("binaryPath")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|entry| !entry.is_empty())
        .map(str::to_string);

    Ok(DaemonInfo {
        name,
        version,
        pid,
        mode,
        binary_path,
    })
}

async fn send_rpc_request(
    writer: &mut OwnedWriteHalf,
    id: u64,
    method: &str,
    params: Value,
) -> Result<(), String> {
    let mut payload = serde_json::to_string(&json!({
        "id": id,
        "method": method,
        "params": params,
    }))
    .map_err(|err| err.to_string())?;
    payload.push('\n');
    writer
        .write_all(payload.as_bytes())
        .await
        .map_err(|err| err.to_string())
}

async fn read_rpc_response(lines: &mut DaemonLines, expected_id: u64) -> Result<Value, String> {
    let deadline = Instant::now() + DAEMON_RPC_TIMEOUT;
    loop {
        let now = Instant::now();
        if now >= deadline {
            return Err("timed out waiting for daemon response".to_string());
        }
        let remaining = deadline - now;

        let line = match timeout(remaining, lines.next_line()).await {
            Ok(Ok(Some(line))) => line,
            Ok(Ok(None)) => return Err("connection closed".to_string()),
            Ok(Err(err)) => return Err(err.to_string()),
            Err(_) => return Err("timed out waiting for daemon response".to_string()),
        };
        if line.trim().is_empty() {
            continue;
        }

        let parsed: Value = serde_json::from_str(&line).map_err(|err| err.to_string())?;
        let id = parsed.get("id").and_then(Value::as_u64);
        if id == Some(expected_id) {
            return Ok(parsed);
        }
    }
}

async fn send_and_expect_result(
    writer: &mut OwnedWriteHalf,
    lines: &mut DaemonLines,
    id: u64,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    send_rpc_request(writer, id, method, params).await?;
    let response = read_rpc_response(lines, id).await?;
    if let Some(message) = parse_daemon_error_message(&response) {
        return Err(message);
    }
    response
        .get("result")
        .cloned()
        .ok_or_else(|| "daemon response missing result".to_string())
}

async fn request_daemon_info(
    writer: &mut OwnedWriteHalf,
    lines: &mut DaemonLines,
    id: u64,
) -> Result<DaemonInfo, String> {
    let result = send_and_expect_result(writer, lines, id, "daemon_info", json!({})).await?;
    parse_daemon_info(&result)
}

async fn probe_daemon(listen_addr: &str, token: Option<&str>) -> DaemonProbe {
    let Some(connect_addr) = daemon_connect_addr(listen_addr) else {
        return DaemonProbe::NotReachable;
    };

    let stream = match timeout(DAEMON_RPC_TIMEOUT, TcpStream::connect(&connect_addr)).await {
        Ok(Ok(stream)) => stream,
        Ok(Err(_)) | Err(_) => return DaemonProbe::NotReachable,
    };

    let (reader, mut writer) = stream.into_split();
    let mut lines = BufReader::new(reader).lines();

    match send_and_expect_result(&mut writer, &mut lines, 1, "ping", json!({})).await {
        Ok(_) => DaemonProbe::Running {
            auth_ok: true,
            auth_error: None,
            info: request_daemon_info(&mut writer, &mut lines, 2).await.ok(),
        },
        Err(message) => {
            if !is_auth_error_message(&message) {
                return DaemonProbe::NotDaemon;
            }

            let auth_token = token
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string);
            let Some(auth_token) = auth_token else {
                return DaemonProbe::Running {
                    auth_ok: false,
                    auth_error: Some(
                        "Daemon is running but requires a remote backend token.".to_string(),
                    ),
                    info: None,
                };
            };

            match send_and_expect_result(
                &mut writer,
                &mut lines,
                10,
                "auth",
                json!({ "token": auth_token }),
            )
            .await
            {
                Ok(_) => {
                    match send_and_expect_result(&mut writer, &mut lines, 11, "ping", json!({}))
                        .await
                    {
                        Ok(_) => DaemonProbe::Running {
                            auth_ok: true,
                            auth_error: None,
                            info: request_daemon_info(&mut writer, &mut lines, 12).await.ok(),
                        },
                        Err(ping_error) => DaemonProbe::Running {
                            auth_ok: false,
                            auth_error: Some(format!(
                                "Daemon is running but ping failed after auth: {ping_error}"
                            )),
                            info: None,
                        },
                    }
                }
                Err(auth_error) => {
                    if is_auth_error_message(&auth_error) {
                        DaemonProbe::Running {
                            auth_ok: false,
                            auth_error: Some(format!(
                                "Daemon is running but token authentication failed: {auth_error}"
                            )),
                            info: None,
                        }
                    } else {
                        DaemonProbe::NotDaemon
                    }
                }
            }
        }
    }
}

async fn request_daemon_shutdown(listen_addr: &str, token: Option<&str>) -> Result<(), String> {
    let Some(connect_addr) = daemon_connect_addr(listen_addr) else {
        return Err("invalid daemon listen address".to_string());
    };

    let stream = timeout(DAEMON_RPC_TIMEOUT, TcpStream::connect(&connect_addr))
        .await
        .map_err(|_| format!("Timed out connecting to daemon at {connect_addr}"))?
        .map_err(|err| format!("Failed to connect to daemon at {connect_addr}: {err}"))?;

    let (reader, mut writer) = stream.into_split();
    let mut lines = BufReader::new(reader).lines();

    match send_and_expect_result(&mut writer, &mut lines, 1, "ping", json!({})).await {
        Ok(_) => {}
        Err(message) if is_auth_error_message(&message) => {
            let auth_token = token
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .ok_or_else(|| {
                    "Daemon is running but requires a remote backend token.".to_string()
                })?;
            send_and_expect_result(
                &mut writer,
                &mut lines,
                2,
                "auth",
                json!({ "token": auth_token }),
            )
            .await
            .map_err(|err| format!("Daemon authentication failed: {err}"))?;
        }
        Err(message) => {
            return Err(format!("Daemon ping failed: {message}"));
        }
    }

    send_and_expect_result(&mut writer, &mut lines, 3, "daemon_shutdown", json!({}))
        .await
        .map(|_| ())
        .map_err(|err| format!("Daemon shutdown request failed: {err}"))
}

async fn wait_for_daemon_shutdown(listen_addr: &str, token: Option<&str>) -> bool {
    for _ in 0..20 {
        if matches!(
            probe_daemon(listen_addr, token).await,
            DaemonProbe::NotReachable
        ) {
            return true;
        }
        sleep(Duration::from_millis(100)).await;
    }
    false
}

fn is_managed_daemon(info: &DaemonInfo) -> bool {
    info.name == EXPECTED_DAEMON_NAME
}

fn can_force_stop_daemon(auth_ok: bool, info: Option<&DaemonInfo>) -> bool {
    auth_ok && info.is_some_and(is_managed_daemon)
}

fn should_restart_daemon(info: Option<&DaemonInfo>) -> bool {
    let Some(info) = info else {
        return true;
    };
    !is_managed_daemon(info)
        || info.version != CURRENT_APP_VERSION
        || info.mode != EXPECTED_DAEMON_MODE
}

fn daemon_restart_reason(info: Option<&DaemonInfo>) -> String {
    let Some(info) = info else {
        return "Daemon is running but did not report identity/version metadata".to_string();
    };
    if !is_managed_daemon(info) {
        return format!("Daemon identity mismatch (`{}`)", info.name);
    }
    if info.version != CURRENT_APP_VERSION {
        return format!(
            "Daemon version {} is different from app version {}",
            info.version, CURRENT_APP_VERSION
        );
    }
    if info.mode != EXPECTED_DAEMON_MODE {
        return format!(
            "Daemon mode `{}` does not match expected `{}`",
            info.mode, EXPECTED_DAEMON_MODE
        );
    }
    "Daemon restart required".to_string()
}

fn now_unix_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
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
    if let Some(pid) = find_listener_pid_with_lsof(port).await {
        return Some(pid);
    }

    #[cfg(target_os = "linux")]
    {
        if let Some(pid) = find_listener_pid_with_ss(port).await {
            return Some(pid);
        }
        if let Some(pid) = find_listener_pid_with_netstat(port).await {
            return Some(pid);
        }
    }

    None
}

#[cfg(any(test, target_os = "linux"))]
fn parse_ss_listener_pid(output: &str, port: u16) -> Option<u32> {
    let needle = format!(":{port}");
    for line in output.lines() {
        if !line.contains("LISTEN") || !line.contains(&needle) {
            continue;
        }
        for token in line.split(|ch: char| ch.is_whitespace() || matches!(ch, '(' | ')' | ',')) {
            if let Some(value) = token.strip_prefix("pid=") {
                if let Ok(pid) = value.parse::<u32>() {
                    return Some(pid);
                }
            }
        }
    }
    None
}

#[cfg(any(test, target_os = "linux"))]
fn parse_netstat_listener_pid(output: &str, port: u16) -> Option<u32> {
    let needle = format!(":{port}");
    for line in output.lines() {
        if !line.contains("LISTEN") || !line.contains(&needle) {
            continue;
        }
        for token in line.split_whitespace().rev() {
            if token == "-" {
                continue;
            }
            if let Some((pid_str, _)) = token.split_once('/') {
                if let Ok(pid) = pid_str.parse::<u32>() {
                    return Some(pid);
                }
            }
        }
    }
    None
}

#[cfg(unix)]
async fn find_listener_pid_with_lsof(port: u16) -> Option<u32> {
    let target = format!(":{port}");
    let output = match Command::new("lsof")
        .args(["-nP", "-iTCP"])
        .arg(&target)
        .args(["-sTCP:LISTEN", "-t"])
        .output()
        .await
    {
        Ok(output) => output,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return None,
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

#[cfg(target_os = "linux")]
async fn find_listener_pid_with_ss(port: u16) -> Option<u32> {
    let output = match Command::new("ss").args(["-ltnp"]).output().await {
        Ok(output) => output,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return None,
        Err(_) => return None,
    };
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    parse_ss_listener_pid(&stdout, port)
}

#[cfg(target_os = "linux")]
async fn find_listener_pid_with_netstat(port: u16) -> Option<u32> {
    let output = match Command::new("netstat").args(["-ltnp"]).output().await {
        Ok(output) => output,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return None,
        Err(_) => return None,
    };
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    parse_netstat_listener_pid(&stdout, port)
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

fn safe_force_stop_pid(pid: u32) -> Option<u32> {
    if pid <= 1 {
        None
    } else {
        Some(pid)
    }
}

async fn resolve_daemon_pid(listen_port: u16) -> Option<u32> {
    find_listener_pid(listen_port)
        .await
        .and_then(safe_force_stop_pid)
}

async fn daemon_start(
    listen_addr: &str,
    token: Option<&str>,
    insecure_no_auth: bool,
    data_dir: &Path,
    daemon_binary: &Path,
) -> Result<TcpDaemonStatus, String> {
    if !insecure_no_auth && token.is_none() {
        return Err("Set a Remote backend token before starting mobile access daemon (or pass --insecure-no-auth for development).".to_string());
    }

    let listen_port = parse_port_from_remote_host(listen_addr)
        .ok_or_else(|| format!("Invalid daemon listen address: {listen_addr}"))?;

    match probe_daemon(listen_addr, token).await {
        DaemonProbe::Running {
            auth_ok,
            auth_error,
            info,
        } => {
            let pid = resolve_daemon_pid(listen_port).await;
            let restart_required = should_restart_daemon(info.as_ref());
            let restart_reason = if restart_required {
                Some(daemon_restart_reason(info.as_ref()))
            } else {
                None
            };

            if !auth_ok {
                return Err(auth_error.unwrap_or_else(|| {
                    "Daemon is already running but authentication failed.".to_string()
                }));
            }
            if !restart_required {
                return Ok(TcpDaemonStatus {
                    state: TcpDaemonState::Running,
                    pid,
                    started_at_ms: None,
                    last_error: None,
                    listen_addr: Some(listen_addr.to_string()),
                });
            }

            let force_kill_allowed = can_force_stop_daemon(auth_ok, info.as_ref());
            let pid_for_control = pid;
            if let Err(shutdown_error) = request_daemon_shutdown(listen_addr, token).await {
                if !force_kill_allowed {
                    return Err(format!(
                        "{}; automatic restart aborted because daemon ownership could not be verified: {}",
                        restart_reason.unwrap_or_else(|| "Daemon restart required".to_string()),
                        shutdown_error
                    ));
                }
                if let Some(pid) = pid_for_control {
                    kill_pid_gracefully(pid).await.map_err(|err| {
                        format!(
                            "{}; graceful shutdown failed ({shutdown_error}) and forced stop failed: {err}",
                            restart_reason
                                .clone()
                                .unwrap_or_else(|| "Daemon restart required".to_string())
                        )
                    })?;
                } else {
                    return Err(format!(
                        "{}; daemon did not stop and no PID could be resolved for safe forced stop ({shutdown_error})",
                        restart_reason.unwrap_or_else(|| "Daemon restart required".to_string())
                    ));
                }
            }

            if !wait_for_daemon_shutdown(listen_addr, token).await {
                if !force_kill_allowed {
                    return Err(format!(
                        "{}; daemon acknowledged shutdown but is still reachable",
                        restart_reason.unwrap_or_else(|| "Daemon restart required".to_string())
                    ));
                }
                if let Some(pid) = resolve_daemon_pid(listen_port).await {
                    kill_pid_gracefully(pid).await.map_err(|err| {
                        format!(
                            "{}; daemon remained reachable and forced stop failed: {err}",
                            restart_reason
                                .clone()
                                .unwrap_or_else(|| "Daemon restart required".to_string())
                        )
                    })?;
                } else {
                    return Err(format!(
                        "{}; daemon remained reachable and no PID could be resolved for safe forced stop",
                        restart_reason.unwrap_or_else(|| "Daemon restart required".to_string())
                    ));
                }
            }
        }
        DaemonProbe::NotDaemon => {
            return Err(format!(
                "Cannot start mobile access daemon because {listen_addr} is already in use by another process."
            ));
        }
        DaemonProbe::NotReachable => {}
    }

    ensure_listen_addr_available(listen_addr).await?;

    let mut command = Command::new(daemon_binary);
    command
        .arg("--listen")
        .arg(listen_addr)
        .arg("--data-dir")
        .arg(data_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    if insecure_no_auth {
        command.arg("--insecure-no-auth");
    } else {
        let token = token.ok_or_else(|| "Missing remote backend token".to_string())?;
        command.arg("--token").arg(token);
    }

    let child = command
        .spawn()
        .map_err(|err| format!("Failed to start mobile access daemon: {err}"))?;

    Ok(TcpDaemonStatus {
        state: TcpDaemonState::Running,
        pid: child.id(),
        started_at_ms: Some(now_unix_ms()),
        last_error: None,
        listen_addr: Some(listen_addr.to_string()),
    })
}

async fn daemon_stop(listen_addr: &str, token: Option<&str>) -> TcpDaemonStatus {
    let listen_port = parse_port_from_remote_host(listen_addr);
    let mut stop_error: Option<String> = None;

    if let Some(port) = listen_port {
        match probe_daemon(listen_addr, token).await {
            DaemonProbe::Running { auth_ok, info, .. } => {
                let force_kill_allowed = can_force_stop_daemon(auth_ok, info.as_ref());
                if let Err(shutdown_error) = request_daemon_shutdown(listen_addr, token).await {
                    let pid = resolve_daemon_pid(port).await;
                    if let Some(pid) = pid {
                        if force_kill_allowed {
                            if let Err(err) = kill_pid_gracefully(pid).await {
                                stop_error = Some(format!("{shutdown_error}; {err}"));
                            } else {
                                stop_error = None;
                            }
                        } else {
                            stop_error = Some(format!(
                                "{shutdown_error}; refusing forced stop because daemon ownership could not be verified"
                            ));
                        }
                    } else {
                        stop_error = Some(shutdown_error);
                    }
                } else if !wait_for_daemon_shutdown(listen_addr, token).await {
                    if force_kill_allowed {
                        let pid = resolve_daemon_pid(port).await;
                        if let Some(pid) = pid {
                            if let Err(err) = kill_pid_gracefully(pid).await {
                                stop_error = Some(format!(
                                    "Daemon acknowledged shutdown but remained reachable; {err}"
                                ));
                            } else {
                                stop_error = None;
                            }
                        } else {
                            stop_error = Some(
                                "Daemon acknowledged shutdown but remained reachable and PID could not be resolved."
                                    .to_string(),
                            );
                        }
                    } else {
                        stop_error = Some(
                            "Daemon acknowledged shutdown but is still reachable; refusing forced stop because daemon ownership could not be verified."
                                .to_string(),
                        );
                    }
                }
            }
            DaemonProbe::NotDaemon => {
                stop_error = Some(format!(
                    "Port {port} is in use by a non-daemon process; refusing to stop it."
                ));
            }
            DaemonProbe::NotReachable => {}
        }
    }

    let probe_after_stop = probe_daemon(listen_addr, token).await;
    let pid_after_stop = match listen_port {
        Some(port) => find_listener_pid(port).await,
        None => None,
    };

    match probe_after_stop {
        DaemonProbe::Running { auth_error, .. } => TcpDaemonStatus {
            state: TcpDaemonState::Error,
            pid: pid_after_stop,
            started_at_ms: None,
            last_error: Some(
                stop_error
                    .or(auth_error)
                    .unwrap_or_else(|| "Daemon is still running after stop attempt.".to_string()),
            ),
            listen_addr: Some(listen_addr.to_string()),
        },
        DaemonProbe::NotDaemon => TcpDaemonStatus {
            state: TcpDaemonState::Error,
            pid: pid_after_stop,
            started_at_ms: None,
            last_error: Some(stop_error.unwrap_or_else(|| {
                "Configured port is now occupied by a non-daemon process.".to_string()
            })),
            listen_addr: Some(listen_addr.to_string()),
        },
        DaemonProbe::NotReachable => TcpDaemonStatus {
            state: TcpDaemonState::Stopped,
            pid: None,
            started_at_ms: None,
            last_error: stop_error,
            listen_addr: Some(listen_addr.to_string()),
        },
    }
}

async fn daemon_status(listen_addr: &str, token: Option<&str>) -> TcpDaemonStatus {
    let listen_port = parse_port_from_remote_host(listen_addr);
    let pid = match listen_port {
        Some(port) => find_listener_pid(port).await,
        None => None,
    };

    match probe_daemon(listen_addr, token).await {
        DaemonProbe::Running { auth_error, .. } => TcpDaemonStatus {
            state: TcpDaemonState::Running,
            pid,
            started_at_ms: None,
            last_error: auth_error,
            listen_addr: Some(listen_addr.to_string()),
        },
        DaemonProbe::NotDaemon => TcpDaemonStatus {
            state: TcpDaemonState::Error,
            pid,
            started_at_ms: None,
            last_error: Some(format!(
                "Configured daemon port {listen_addr} is occupied by a non-daemon process."
            )),
            listen_addr: Some(listen_addr.to_string()),
        },
        DaemonProbe::NotReachable => TcpDaemonStatus {
            state: TcpDaemonState::Stopped,
            pid: None,
            started_at_ms: None,
            last_error: None,
            listen_addr: Some(listen_addr.to_string()),
        },
    }
}

fn print_status(status: &TcpDaemonStatus, as_json: bool) -> Result<(), String> {
    if as_json {
        println!(
            "{}",
            serde_json::to_string_pretty(status).map_err(|err| err.to_string())?
        );
        return Ok(());
    }

    let state = match status.state {
        TcpDaemonState::Stopped => "stopped",
        TcpDaemonState::Running => "running",
        TcpDaemonState::Error => "error",
    };
    println!("state: {state}");
    if let Some(listen_addr) = status.listen_addr.as_deref() {
        println!("listen: {listen_addr}");
    }
    if let Some(pid) = status.pid {
        println!("pid: {pid}");
    }
    if let Some(error) = status.last_error.as_deref() {
        println!("error: {error}");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        daemon_connect_addr, daemon_listen_addr, parse_netstat_listener_pid,
        parse_port_from_remote_host, parse_ss_listener_pid, resolve_listen_addr,
        safe_force_stop_pid, shell_quote,
    };

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
    fn shell_quote_handles_single_quotes() {
        assert_eq!(shell_quote("abc'def"), "'abc'\"'\"'def'");
    }

    #[test]
    fn connect_addr_keeps_non_loopback_host() {
        assert_eq!(
            daemon_connect_addr("100.101.102.103:4732").as_deref(),
            Some("100.101.102.103:4732")
        );
    }

    #[test]
    fn connect_addr_maps_unspecified_hosts_to_loopback() {
        assert_eq!(
            daemon_connect_addr("0.0.0.0:4732").as_deref(),
            Some("127.0.0.1:4732")
        );
        assert_eq!(
            daemon_connect_addr("[::]:4732").as_deref(),
            Some("[::1]:4732")
        );
    }

    #[test]
    fn listen_addr_works_without_settings() {
        assert_eq!(
            resolve_listen_addr(None, None).expect("default listen addr"),
            "0.0.0.0:4732"
        );
        assert_eq!(
            resolve_listen_addr(Some("127.0.0.1:9999"), None).expect("override listen addr"),
            "127.0.0.1:9999"
        );
    }

    #[test]
    fn safe_force_stop_pid_rejects_reserved_values() {
        assert_eq!(safe_force_stop_pid(0), None);
        assert_eq!(safe_force_stop_pid(1), None);
        assert_eq!(safe_force_stop_pid(2), Some(2));
    }

    #[test]
    fn parses_pid_from_ss_output() {
        let output = r#"State  Recv-Q Send-Q Local Address:Port Peer Address:PortProcess
LISTEN 0      4096   0.0.0.0:4732      0.0.0.0:*    users:(("codex-monitor-da",pid=12345,fd=7))
"#;
        assert_eq!(parse_ss_listener_pid(output, 4732), Some(12345));
        assert_eq!(parse_ss_listener_pid(output, 9000), None);
    }

    #[test]
    fn parses_pid_from_netstat_output() {
        let output = r#"Active Internet connections (only servers)
Proto Recv-Q Send-Q Local Address           Foreign Address         State       PID/Program name
tcp        0      0 0.0.0.0:4732            0.0.0.0:*               LISTEN      6789/codex-monitor-da
"#;
        assert_eq!(parse_netstat_listener_pid(output, 4732), Some(6789));
        assert_eq!(parse_netstat_listener_pid(output, 9000), None);
    }
}
