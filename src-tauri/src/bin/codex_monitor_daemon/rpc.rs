use super::*;

#[path = "rpc/codex.rs"]
mod codex;
#[path = "rpc/daemon.rs"]
mod daemon;
#[path = "rpc/dispatcher.rs"]
mod dispatcher;
#[path = "rpc/git.rs"]
mod git;
#[path = "rpc/prompts.rs"]
mod prompts;
#[path = "rpc/workspace.rs"]
mod workspace;

pub(super) fn build_error_response(id: Option<u64>, message: &str) -> Option<String> {
    let id = id?;
    Some(
        serde_json::to_string(&json!({
            "id": id,
            "error": { "message": message }
        }))
        .unwrap_or_else(|_| {
            "{\"id\":0,\"error\":{\"message\":\"serialization failed\"}}".to_string()
        }),
    )
}

pub(super) fn build_result_response(id: Option<u64>, result: Value) -> Option<String> {
    let id = id?;
    Some(
        serde_json::to_string(&json!({ "id": id, "result": result })).unwrap_or_else(|_| {
            "{\"id\":0,\"error\":{\"message\":\"serialization failed\"}}".to_string()
        }),
    )
}

fn build_event_notification(event: DaemonEvent) -> Option<String> {
    let payload = match event {
        DaemonEvent::AppServer(payload) => json!({
            "method": "app-server-event",
            "params": payload,
        }),
        DaemonEvent::TerminalOutput(payload) => json!({
            "method": "terminal-output",
            "params": payload,
        }),
        DaemonEvent::TerminalExit(payload) => json!({
            "method": "terminal-exit",
            "params": payload,
        }),
    };
    serde_json::to_string(&payload).ok()
}

pub(super) fn parse_auth_token(params: &Value) -> Option<String> {
    match params {
        Value::String(value) => Some(value.clone()),
        Value::Object(map) => map
            .get("token")
            .and_then(|value| value.as_str())
            .map(|v| v.to_string()),
        _ => None,
    }
}

pub(super) fn parse_string(value: &Value, key: &str) -> Result<String, String> {
    match value {
        Value::Object(map) => map
            .get(key)
            .and_then(|value| value.as_str())
            .map(|value| value.to_string())
            .ok_or_else(|| format!("missing or invalid `{key}`")),
        _ => Err(format!("missing `{key}`")),
    }
}

pub(super) fn parse_optional_string(value: &Value, key: &str) -> Option<String> {
    match value {
        Value::Object(map) => map
            .get(key)
            .and_then(|value| value.as_str())
            .map(|v| v.to_string()),
        _ => None,
    }
}

pub(super) fn parse_optional_u32(value: &Value, key: &str) -> Result<Option<u32>, String> {
    match value {
        Value::Object(map) => match map.get(key) {
            None => Ok(None),
            Some(value) => {
                let raw = value
                    .as_u64()
                    .filter(|value| *value <= u32::MAX as u64)
                    .map(|value| value as u32);
                match raw {
                    Some(value) => Ok(Some(value)),
                    None => Err(format!("invalid `{key}`")),
                }
            }
        },
        _ => Err(format!("invalid `{key}`")),
    }
}

pub(super) fn parse_optional_bool(value: &Value, key: &str) -> Option<bool> {
    match value {
        Value::Object(map) => map.get(key).and_then(|value| value.as_bool()),
        _ => None,
    }
}

pub(super) fn parse_optional_string_array(
    value: &Value,
    key: &str,
) -> Result<Option<Vec<String>>, String> {
    match value {
        Value::Object(map) => match map.get(key) {
            None => Ok(None),
            Some(value) => {
                let Some(items) = value.as_array() else {
                    return Err(format!("invalid `{key}`"));
                };
                let parsed_items = items
                    .iter()
                    .map(|item| item.as_str().map(|value| value.to_string()))
                    .collect::<Option<Vec<_>>>();
                match parsed_items {
                    Some(items) => Ok(Some(items)),
                    None => Err(format!("invalid `{key}`")),
                }
            }
        },
        _ => Err(format!("invalid `{key}`")),
    }
}

pub(super) fn parse_string_array(value: &Value, key: &str) -> Result<Vec<String>, String> {
    parse_optional_string_array(value, key)?.ok_or_else(|| format!("missing `{key}`"))
}

pub(super) fn parse_optional_value(value: &Value, key: &str) -> Option<Value> {
    match value {
        Value::Object(map) => map.get(key).cloned(),
        _ => None,
    }
}

pub(super) async fn handle_rpc_request(
    state: &DaemonState,
    method: &str,
    params: Value,
    client_version: String,
) -> Result<Value, String> {
    dispatcher::dispatch_rpc_request(state, method, &params, &client_version).await
}

pub(super) async fn forward_events(
    mut rx: broadcast::Receiver<DaemonEvent>,
    out_tx_events: mpsc::UnboundedSender<String>,
) {
    loop {
        let event = match rx.recv().await {
            Ok(event) => event,
            Err(broadcast::error::RecvError::Lagged(_)) => continue,
            Err(broadcast::error::RecvError::Closed) => break,
        };

        let Some(payload) = build_event_notification(event) else {
            continue;
        };

        if out_tx_events.send(payload).is_err() {
            break;
        }
    }
}

pub(super) fn spawn_rpc_response_task(
    state: Arc<DaemonState>,
    out_tx: mpsc::UnboundedSender<String>,
    id: Option<u64>,
    method: String,
    params: Value,
    client_version: String,
    request_limiter: Arc<Semaphore>,
) {
    tokio::spawn(async move {
        let Ok(_permit) = request_limiter.acquire_owned().await else {
            return;
        };
        let result = handle_rpc_request(&state, &method, params, client_version).await;
        let response = match result {
            Ok(result) => build_result_response(id, result),
            Err(message) => build_error_response(id, &message),
        };
        if let Some(response) = response {
            let _ = out_tx.send(response);
        }
    });
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    #[test]
    fn parse_optional_u32_rejects_non_numeric_values() {
        let err = super::parse_optional_u32(&json!({ "limit": "20" }), "limit")
            .expect_err("limit should be invalid");
        assert_eq!(err, "invalid `limit`");
    }

    #[test]
    fn parse_optional_u32_rejects_overflow_values() {
        let err = super::parse_optional_u32(&json!({ "limit": 4294967296u64 }), "limit")
            .expect_err("limit should overflow u32");
        assert_eq!(err, "invalid `limit`");
    }

    #[test]
    fn parse_optional_u32_allows_missing_value() {
        let value = super::parse_optional_u32(&json!({ "depth": 5 }), "limit")
            .expect("parse should succeed");
        assert!(value.is_none());
    }

    #[test]
    fn parse_optional_string_array_rejects_non_array_values() {
        let err = super::parse_optional_string_array(&json!({ "images": "banner.png" }), "images")
            .expect_err("images should be an array");
        assert_eq!(err, "invalid `images`");
    }

    #[test]
    fn parse_optional_string_array_rejects_mixed_type_items() {
        let err =
            super::parse_optional_string_array(&json!({ "images": ["image.png", 5] }), "images")
                .expect_err("images should only contain strings");
        assert_eq!(err, "invalid `images`");
    }

    #[test]
    fn parse_optional_string_array_allows_missing_value() {
        let value = super::parse_optional_string_array(&json!({ "images": ["image.png"] }), "args")
            .expect("parse should succeed");
        assert!(value.is_none());
    }
}
