use super::*;

const DAEMON_RPC_TIMEOUT: Duration = Duration::from_millis(700);

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct DaemonInfo {
    pub(super) name: String,
    pub(super) version: String,
    pub(super) pid: Option<u32>,
    pub(super) mode: String,
    pub(super) binary_path: Option<String>,
}

#[derive(Debug, Clone)]
pub(super) enum DaemonProbe {
    NotReachable,
    Running {
        auth_ok: bool,
        auth_error: Option<String>,
        info: Option<DaemonInfo>,
    },
    NotDaemon,
}

type DaemonLines = tokio::io::Lines<BufReader<OwnedReadHalf>>;

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
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "daemon_info missing `name`".to_string())?
        .to_string();
    let version = value
        .get("version")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "daemon_info missing `version`".to_string())?
        .to_string();
    let mode = value
        .get("mode")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
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
        .filter(|value| !value.is_empty())
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

pub(super) async fn probe_daemon(listen_addr: &str, token: Option<&str>) -> DaemonProbe {
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

            let trimmed_token = token.map(str::trim).filter(|value| !value.is_empty());
            let Some(auth_token) = trimmed_token else {
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

pub(super) async fn request_daemon_shutdown(
    listen_addr: &str,
    token: Option<&str>,
) -> Result<(), String> {
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

pub(super) async fn wait_for_daemon_shutdown(listen_addr: &str, token: Option<&str>) -> bool {
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
