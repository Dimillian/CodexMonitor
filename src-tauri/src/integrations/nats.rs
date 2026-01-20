use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::time::Duration;

use async_nats::{Client, ConnectOptions};
use futures_util::StreamExt;
use serde_json::json;
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;

use crate::backend::events::AppServerEvent;
use crate::integrations::{handle_nats_command, NatsStatus};
use crate::types::NatsAuthMode;

#[derive(Clone, Debug)]
pub(crate) struct NatsConnectConfig {
    pub(crate) url: String,
    pub(crate) auth_mode: NatsAuthMode,
    pub(crate) username: Option<String>,
    pub(crate) password: Option<String>,
    pub(crate) creds: Option<String>,
}

pub(crate) fn config_key(config: &NatsConnectConfig) -> String {
    let mut hasher = DefaultHasher::new();
    config.url.hash(&mut hasher);
    config.auth_mode.hash(&mut hasher);
    config.username.hash(&mut hasher);
    config.password.hash(&mut hasher);
    config.creds.hash(&mut hasher);
    format!("nats:{:x}", hasher.finish())
}

fn parse_nats_auth(url: &str) -> (String, Option<String>) {
    // Accept `nats://token@host:4222` or `nats://user:pass@host:4222`.
    // We treat single "user" (no ':') as token for convenience.
    let Ok(parsed) = url::Url::parse(url) else {
        return (url.to_string(), None);
    };

    let username = parsed.username();
    let password = parsed.password();
    if username.is_empty() {
        return (url.to_string(), None);
    }

    let has_password = password.unwrap_or("").is_empty() == false;
    if has_password {
        // async-nats supports user/pass in URL directly, no special casing needed.
        return (url.to_string(), None);
    }

    // token
    let mut without_auth = parsed.clone();
    let _ = without_auth.set_username("");
    let _ = without_auth.set_password(None);
    (without_auth.to_string(), Some(username.to_string()))
}

fn strip_auth(url: &str) -> String {
    let Ok(mut parsed) = url::Url::parse(url) else {
        return url.to_string();
    };
    let _ = parsed.set_username("");
    let _ = parsed.set_password(None);
    parsed.to_string()
}

async fn connect(config: &NatsConnectConfig) -> Result<Client, String> {
    let url = config.url.trim();
    if url.is_empty() {
        return Err("NATS URL is empty.".to_string());
    }

    let mut opts = ConnectOptions::new();
    let url = match config.auth_mode {
        NatsAuthMode::Url => {
            let (url, token) = parse_nats_auth(url);
            if let Some(token) = token {
                opts = opts.token(token);
            }
            url
        }
        NatsAuthMode::Userpass => {
            let user = config
                .username
                .as_deref()
                .unwrap_or("")
                .trim()
                .to_string();
            let pass = config.password.as_deref().unwrap_or("").to_string();
            if user.is_empty() || pass.is_empty() {
                return Err("NATS username/password missing.".to_string());
            }
            opts = opts.user_and_password(user, pass);
            strip_auth(url)
        }
        NatsAuthMode::Creds => {
            let creds = config.creds.as_deref().unwrap_or("").trim();
            if creds.is_empty() {
                return Err("NATS creds are empty.".to_string());
            }
            opts = opts
                .credentials(creds)
                .map_err(|e| format!("Failed to parse NATS creds: {e}"))?;
            strip_auth(url)
        }
    };

    opts.connect(url)
        .await
        .map_err(|error| format!("Failed to connect to NATS: {error}"))
}

pub(crate) async fn nats_status(config: &NatsConnectConfig) -> Result<NatsStatus, String> {
    let client = match connect(config).await {
        Ok(client) => client,
        Err(error) => {
            return Ok(NatsStatus {
                ok: false,
                server: None,
                error: Some(error),
            });
        }
    };
    let info = client.server_info();
    Ok(NatsStatus {
        ok: true,
        server: Some(format!("{}:{}", info.host, info.port)),
        error: None,
    })
}

pub(crate) async fn run_nats_cloud(
    app: AppHandle,
    runner_id: String,
    config: NatsConnectConfig,
    mut events: mpsc::UnboundedReceiver<AppServerEvent>,
) {
    let cmd_subject = format!("cm.cmd.{runner_id}");
    let res_subject = format!("cm.res.{runner_id}");

    let mut presence_interval = tokio::time::interval(Duration::from_secs(5));
    presence_interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

    loop {
        let client = match connect(&config).await {
            Ok(client) => client,
            Err(err) => {
                eprintln!("[nats] {err}");
                tokio::time::sleep(Duration::from_secs(2)).await;
                continue;
            }
        };

        let mut sub = match client.subscribe(cmd_subject.clone()).await {
            Ok(sub) => sub,
            Err(err) => {
                eprintln!("[nats] Failed to subscribe to commands: {err}");
                tokio::time::sleep(Duration::from_secs(2)).await;
                continue;
            }
        };

        // Emit presence immediately.
        let _ = client
            .publish(
                format!("cm.presence.{runner_id}"),
                json!({ "runnerId": runner_id, "ok": true })
                    .to_string()
                    .into(),
            )
            .await;

        loop {
            tokio::select! {
                _ = presence_interval.tick() => {
                    if client.publish(
                        format!("cm.presence.{runner_id}"),
                        json!({ "runnerId": runner_id, "ok": true })
                            .to_string()
                            .into(),
                    ).await.is_err() {
                        break;
                    }
                }
                msg = sub.next() => {
                    let Some(msg) = msg else {
                        break;
                    };
                    let payload = String::from_utf8_lossy(&msg.payload).to_string();
                    if let Some(response_json) = handle_nats_command(&app, &payload).await {
                        if let Some(reply) = msg.reply {
                            let _ = client.publish(reply, response_json.into()).await;
                        } else {
                            let _ = client.publish(res_subject.clone(), response_json.into()).await;
                        }
                    }
                }
                event = events.recv() => {
                    let Some(event) = event else {
                        return;
                    };
                    let subject = format!("cm.ev.{runner_id}.{}", event.workspace_id);
                    let payload = serde_json::to_string(&event).unwrap_or_default();
                    if client.publish(subject, payload.into()).await.is_err() {
                        break;
                    }
                }
            }
        }

        tokio::time::sleep(Duration::from_secs(1)).await;
    }
}

pub(crate) async fn nats_request(
    config: &NatsConnectConfig,
    subject: String,
    payload: String,
    timeout_ms: u64,
) -> Result<String, String> {
    let client = connect(config).await?;
    let fut = client.request(subject, payload.into());
    let msg = tokio::time::timeout(Duration::from_millis(timeout_ms), fut)
        .await
        .map_err(|_| "Timed out waiting for NATS reply.".to_string())?
        .map_err(|e| format!("NATS request failed: {e}"))?;
    Ok(String::from_utf8_lossy(&msg.payload).to_string())
}

pub(crate) async fn nats_discover_runner(
    config: &NatsConnectConfig,
    timeout_ms: u64,
) -> Result<Option<String>, String> {
    let client = connect(config).await?;
    let mut sub = client
        .subscribe("cm.presence.*".to_string())
        .await
        .map_err(|e| format!("Failed to subscribe to presence: {e}"))?;
    let deadline = tokio::time::sleep(Duration::from_millis(timeout_ms));
    tokio::pin!(deadline);
    let mut last: Option<String> = None;
    loop {
        tokio::select! {
            _ = &mut deadline => {
                return Ok(last);
            }
            msg = sub.next() => {
                let Some(msg) = msg else {
                    return Ok(last);
                };
                let payload = String::from_utf8_lossy(&msg.payload).to_string();
                if let Ok(value) = serde_json::from_str::<serde_json::Value>(&payload) {
                    if let Some(runner_id) = value.get("runnerId").and_then(|v| v.as_str()) {
                        last = Some(runner_id.to_string());
                    }
                }
            }
        }
    }
}

pub(crate) async fn run_nats_event_listener(
    app: AppHandle,
    runner_id: String,
    config: NatsConnectConfig,
) {
    let subject = format!("cm.ev.{runner_id}.*");
    loop {
        let client = match connect(&config).await {
            Ok(client) => client,
            Err(err) => {
                eprintln!("[nats-client] {err}");
                tokio::time::sleep(Duration::from_secs(2)).await;
                continue;
            }
        };

        let mut sub = match client.subscribe(subject.clone()).await {
            Ok(sub) => sub,
            Err(err) => {
                eprintln!("[nats-client] Failed to subscribe to events: {err}");
                tokio::time::sleep(Duration::from_secs(2)).await;
                continue;
            }
        };

        loop {
            let msg = sub.next().await;
            let Some(msg) = msg else {
                break;
            };
            let payload = String::from_utf8_lossy(&msg.payload).to_string();
            match serde_json::from_str::<AppServerEvent>(&payload) {
                Ok(event) => {
                    let _ = app.emit("app-server-event", event);
                }
                Err(err) => {
                    eprintln!("[nats-client] Failed to parse AppServerEvent: {err}");
                }
            }
        }

        tokio::time::sleep(Duration::from_secs(1)).await;
    }
}
