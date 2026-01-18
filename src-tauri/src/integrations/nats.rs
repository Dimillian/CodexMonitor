use std::time::Duration;

use async_nats::{Client, ConnectOptions};
use futures_util::StreamExt;
use serde_json::json;
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;

use crate::backend::events::AppServerEvent;
use crate::integrations::{handle_nats_command, NatsStatus};

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

async fn connect(url: &str) -> Result<Client, String> {
    let (url, token) = parse_nats_auth(url);
    let mut opts = ConnectOptions::new();
    if let Some(token) = token {
        opts = opts.token(token);
    }
    opts.connect(url)
        .await
        .map_err(|error| format!("Failed to connect to NATS: {error}"))
}

pub(crate) async fn nats_status(url: String) -> Result<NatsStatus, String> {
    if url.trim().is_empty() {
        return Ok(NatsStatus {
            ok: false,
            server: None,
            error: Some("NATS URL is empty.".to_string()),
        });
    }
    let client = connect(&url).await?;
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
    url: String,
    mut events: mpsc::UnboundedReceiver<AppServerEvent>,
) {
    let cmd_subject = format!("cm.cmd.{runner_id}");
    let res_subject = format!("cm.res.{runner_id}");

    let mut presence_interval = tokio::time::interval(Duration::from_secs(5));
    presence_interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

    loop {
        let client = match connect(&url).await {
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
    url: &str,
    subject: String,
    payload: String,
    timeout_ms: u64,
) -> Result<String, String> {
    let client = connect(url).await?;
    let fut = client.request(subject, payload.into());
    let msg = tokio::time::timeout(Duration::from_millis(timeout_ms), fut)
        .await
        .map_err(|_| "Timed out waiting for NATS reply.".to_string())?
        .map_err(|e| format!("NATS request failed: {e}"))?;
    Ok(String::from_utf8_lossy(&msg.payload).to_string())
}

pub(crate) async fn nats_discover_runner(url: &str, timeout_ms: u64) -> Result<Option<String>, String> {
    let client = connect(url).await?;
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

pub(crate) async fn run_nats_event_listener(app: AppHandle, runner_id: String, url: String) {
    let subject = format!("cm.ev.{runner_id}.*");
    loop {
        let client = match connect(&url).await {
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
