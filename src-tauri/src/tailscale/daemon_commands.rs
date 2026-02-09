use super::rpc_client::{
    probe_daemon, request_daemon_shutdown, wait_for_daemon_shutdown, DaemonInfo, DaemonProbe,
};
use super::*;

const EXPECTED_DAEMON_NAME: &str = "codex-monitor-daemon";
const EXPECTED_DAEMON_MODE: &str = "tcp";
const CURRENT_APP_VERSION: &str = env!("CARGO_PKG_VERSION");

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

async fn resolve_daemon_pid(listen_port: u16, info: Option<&DaemonInfo>) -> Option<u32> {
    match info.and_then(|entry| entry.pid) {
        Some(pid) => Some(pid),
        None => find_listener_pid(listen_port).await,
    }
}

pub(super) async fn tailscale_daemon_command_preview(
    state: State<'_, AppState>,
) -> Result<TailscaleDaemonCommandPreview, String> {
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        return Err(UNSUPPORTED_MESSAGE.to_string());
    }

    let daemon_path = resolve_daemon_binary_path()?;
    let data_dir = state
        .settings_path
        .parent()
        .map(|path| path.to_path_buf())
        .ok_or_else(|| "Unable to resolve app data directory".to_string())?;
    let settings = state.app_settings.lock().await.clone();
    let token_configured = settings
        .remote_backend_token
        .as_deref()
        .map(str::trim)
        .map(|value| !value.is_empty())
        .unwrap_or(false);

    Ok(tailscale_core::daemon_command_preview(
        &daemon_path,
        &data_dir,
        token_configured,
    ))
}

pub(super) async fn tailscale_daemon_start(
    state: State<'_, AppState>,
) -> Result<TcpDaemonStatus, String> {
    if cfg!(any(target_os = "android", target_os = "ios")) {
        return Err("Tailscale daemon start is only supported on desktop.".to_string());
    }

    let settings = state.app_settings.lock().await.clone();
    let token = settings
        .remote_backend_token
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            "Set a Remote backend token before starting mobile access daemon.".to_string()
        })?;
    let listen_addr = configured_daemon_listen_addr(&settings);
    let listen_port = parse_port_from_remote_host(&listen_addr)
        .ok_or_else(|| format!("Invalid daemon listen address: {listen_addr}"))?;
    let daemon_binary = resolve_daemon_binary_path()?;

    let data_dir = state
        .settings_path
        .parent()
        .map(|path| path.to_path_buf())
        .ok_or_else(|| "Unable to resolve app data directory".to_string())?;

    let mut runtime = state.tcp_daemon.lock().await;
    refresh_tcp_daemon_runtime(&mut runtime).await;

    match probe_daemon(&listen_addr, Some(token)).await {
        DaemonProbe::Running {
            auth_ok,
            auth_error,
            info,
        } => {
            let pid = resolve_daemon_pid(listen_port, info.as_ref()).await;
            let restart_required = should_restart_daemon(info.as_ref());
            let restart_reason = if restart_required {
                Some(daemon_restart_reason(info.as_ref()))
            } else {
                None
            };

            runtime.child = None;
            runtime.status = TcpDaemonStatus {
                state: TcpDaemonState::Running,
                pid,
                started_at_ms: runtime.status.started_at_ms,
                last_error: auth_error.clone(),
                listen_addr: Some(listen_addr.clone()),
            };
            if !auth_ok {
                return Err(auth_error.unwrap_or_else(|| {
                    "Daemon is already running but authentication failed.".to_string()
                }));
            }
            if !restart_required {
                return Ok(runtime.status.clone());
            }

            let force_kill_allowed = can_force_stop_daemon(auth_ok, info.as_ref());
            let pid_for_control = pid;
            if let Err(shutdown_error) = request_daemon_shutdown(&listen_addr, Some(token)).await {
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

            if !wait_for_daemon_shutdown(&listen_addr, Some(token)).await {
                if !force_kill_allowed {
                    return Err(format!(
                        "{}; daemon acknowledged shutdown but is still reachable",
                        restart_reason.unwrap_or_else(|| "Daemon restart required".to_string())
                    ));
                }
                if let Some(pid) = resolve_daemon_pid(listen_port, info.as_ref()).await {
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

            runtime.status = TcpDaemonStatus {
                state: TcpDaemonState::Stopped,
                pid: None,
                started_at_ms: None,
                last_error: None,
                listen_addr: Some(listen_addr.clone()),
            };
        }
        DaemonProbe::NotDaemon => {
            return Err(format!(
                "Cannot start mobile access daemon because {listen_addr} is already in use by another process."
            ));
        }
        DaemonProbe::NotReachable => {}
    }

    ensure_listen_addr_available(&listen_addr).await?;

    let child = tokio_command(&daemon_binary)
        .arg("--listen")
        .arg(&listen_addr)
        .arg("--data-dir")
        .arg(data_dir)
        .arg("--token")
        .arg(token)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|err| format!("Failed to start mobile access daemon: {err}"))?;

    runtime.status = TcpDaemonStatus {
        state: TcpDaemonState::Running,
        pid: child.id(),
        started_at_ms: Some(now_unix_ms()),
        last_error: None,
        listen_addr: Some(listen_addr),
    };
    runtime.child = Some(child);

    Ok(runtime.status.clone())
}

pub(super) async fn tailscale_daemon_stop(
    state: State<'_, AppState>,
) -> Result<TcpDaemonStatus, String> {
    let settings = state.app_settings.lock().await.clone();
    let configured_listen_addr = configured_daemon_listen_addr(&settings);
    let listen_port = parse_port_from_remote_host(&configured_listen_addr);

    let mut runtime = state.tcp_daemon.lock().await;
    let mut stop_error: Option<String> = None;
    if let Some(mut child) = runtime.child.take() {
        kill_child_process_tree(&mut child).await;
        let _ = child.wait().await;
    } else if let Some(port) = listen_port {
        match probe_daemon(
            &configured_listen_addr,
            settings.remote_backend_token.as_deref(),
        )
        .await
        {
            DaemonProbe::Running { auth_ok, info, .. } => {
                let force_kill_allowed = can_force_stop_daemon(auth_ok, info.as_ref());
                if let Err(shutdown_error) = request_daemon_shutdown(
                    &configured_listen_addr,
                    settings.remote_backend_token.as_deref(),
                )
                .await
                {
                    let pid = resolve_daemon_pid(port, info.as_ref()).await;
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
                } else if !wait_for_daemon_shutdown(
                    &configured_listen_addr,
                    settings.remote_backend_token.as_deref(),
                )
                .await
                {
                    if force_kill_allowed {
                        let pid = resolve_daemon_pid(port, info.as_ref()).await;
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

    let probe_after_stop = probe_daemon(
        &configured_listen_addr,
        settings.remote_backend_token.as_deref(),
    )
    .await;
    let pid_after_stop = match listen_port {
        Some(port) => find_listener_pid(port).await,
        None => None,
    };
    runtime.status = match probe_after_stop {
        DaemonProbe::Running { auth_error, .. } => TcpDaemonStatus {
            state: TcpDaemonState::Error,
            pid: pid_after_stop,
            started_at_ms: runtime.status.started_at_ms,
            last_error: Some(
                stop_error
                    .or(auth_error)
                    .unwrap_or_else(|| "Daemon is still running after stop attempt.".to_string()),
            ),
            listen_addr: runtime.status.listen_addr.clone(),
        },
        DaemonProbe::NotDaemon => TcpDaemonStatus {
            state: TcpDaemonState::Error,
            pid: pid_after_stop,
            started_at_ms: runtime.status.started_at_ms,
            last_error: Some(stop_error.unwrap_or_else(|| {
                "Configured port is now occupied by a non-daemon process.".to_string()
            })),
            listen_addr: runtime.status.listen_addr.clone(),
        },
        DaemonProbe::NotReachable => TcpDaemonStatus {
            state: TcpDaemonState::Stopped,
            pid: None,
            started_at_ms: None,
            last_error: stop_error,
            listen_addr: runtime.status.listen_addr.clone(),
        },
    };
    sync_tcp_daemon_listen_addr(&mut runtime.status, &configured_listen_addr);

    Ok(runtime.status.clone())
}

pub(super) async fn tailscale_daemon_status(
    state: State<'_, AppState>,
) -> Result<TcpDaemonStatus, String> {
    let settings = state.app_settings.lock().await.clone();
    let configured_listen_addr = configured_daemon_listen_addr(&settings);
    let listen_port = parse_port_from_remote_host(&configured_listen_addr);

    let mut runtime = state.tcp_daemon.lock().await;
    refresh_tcp_daemon_runtime(&mut runtime).await;

    if !matches!(runtime.status.state, TcpDaemonState::Running) {
        let pid = match listen_port {
            Some(port) => find_listener_pid(port).await,
            None => None,
        };
        runtime.status = match probe_daemon(
            &configured_listen_addr,
            settings.remote_backend_token.as_deref(),
        )
        .await
        {
            DaemonProbe::Running {
                auth_ok: _,
                auth_error,
                info: _,
            } => TcpDaemonStatus {
                state: TcpDaemonState::Running,
                pid,
                started_at_ms: runtime.status.started_at_ms,
                last_error: auth_error,
                listen_addr: runtime.status.listen_addr.clone(),
            },
            DaemonProbe::NotDaemon => TcpDaemonStatus {
                state: TcpDaemonState::Error,
                pid,
                started_at_ms: runtime.status.started_at_ms,
                last_error: Some(format!(
                    "Configured daemon port {configured_listen_addr} is occupied by a non-daemon process."
                )),
                listen_addr: runtime.status.listen_addr.clone(),
            },
            DaemonProbe::NotReachable => TcpDaemonStatus {
                state: runtime.status.state.clone(),
                pid: runtime.status.pid,
                started_at_ms: runtime.status.started_at_ms,
                last_error: runtime.status.last_error.clone(),
                listen_addr: runtime.status.listen_addr.clone(),
            },
        };
    }

    sync_tcp_daemon_listen_addr(&mut runtime.status, &configured_listen_addr);

    Ok(runtime.status.clone())
}

#[cfg(test)]
mod tests {
    use super::{
        can_force_stop_daemon, should_restart_daemon, DaemonInfo, CURRENT_APP_VERSION,
        EXPECTED_DAEMON_MODE, EXPECTED_DAEMON_NAME,
    };

    fn daemon_info(version: &str) -> DaemonInfo {
        DaemonInfo {
            name: EXPECTED_DAEMON_NAME.to_string(),
            version: version.to_string(),
            pid: Some(42),
            mode: EXPECTED_DAEMON_MODE.to_string(),
            binary_path: Some("/tmp/codex-monitor-daemon".to_string()),
        }
    }

    #[test]
    fn restart_required_for_old_version() {
        let info = daemon_info("0.1.0");
        assert!(should_restart_daemon(Some(&info)));
    }

    #[test]
    fn no_restart_for_same_version_and_mode() {
        let info = daemon_info(CURRENT_APP_VERSION);
        assert!(!should_restart_daemon(Some(&info)));
    }

    #[test]
    fn force_stop_requires_verified_daemon_identity() {
        let mut info = daemon_info(CURRENT_APP_VERSION);
        info.name = "unknown-daemon".to_string();
        assert!(!can_force_stop_daemon(true, Some(&info)));
        assert!(!can_force_stop_daemon(false, Some(&info)));
        assert!(!can_force_stop_daemon(true, None));
    }
}
