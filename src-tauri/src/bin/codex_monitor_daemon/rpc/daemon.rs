use super::*;

pub(super) async fn try_handle(
    state: &DaemonState,
    method: &str,
    params: &Value,
) -> Option<Result<Value, String>> {
    match method {
        "ping" => Some(Ok(json!({ "ok": true }))),
        "daemon_info" => Some(Ok(state.daemon_info())),
        "daemon_shutdown" => {
            tokio::spawn(async {
                tokio::time::sleep(std::time::Duration::from_millis(100)).await;
                std::process::exit(0);
            });
            Some(Ok(json!({ "ok": true })))
        }
        "menu_set_accelerators" => {
            let updates: Vec<Value> = match params {
                Value::Object(map) => match map
                    .get("updates")
                    .cloned()
                    .map(serde_json::from_value)
                    .transpose()
                {
                    Ok(value) => value.unwrap_or_default(),
                    Err(err) => return Some(Err(err.to_string())),
                },
                _ => Vec::new(),
            };
            Some(
                state
                    .menu_set_accelerators(updates)
                    .await
                    .map(|_| json!({ "ok": true })),
            )
        }
        "is_macos_debug_build" => {
            let is_debug = state.is_macos_debug_build().await;
            Some(Ok(Value::Bool(is_debug)))
        }
        "send_notification_fallback" => {
            let title = match parse_string(params, "title") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let body = match parse_string(params, "body") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(
                state
                    .send_notification_fallback(title, body)
                    .await
                    .map(|_| json!({ "ok": true })),
            )
        }
        _ => None,
    }
}
