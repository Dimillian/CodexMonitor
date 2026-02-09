use serde_json::{json, Value};

pub(crate) const DEFAULT_REMOTE_HOST: &str = "127.0.0.1:4732";
pub(crate) const DISCONNECTED_MESSAGE: &str = "remote backend disconnected";

pub(crate) enum IncomingMessage {
    Response {
        id: u64,
        payload: Result<Value, String>,
    },
    Notification {
        method: String,
        params: Value,
    },
}

pub(crate) fn build_request_line(id: u64, method: &str, params: Value) -> Result<String, String> {
    let request = json!({
        "id": id,
        "method": method,
        "params": params,
    });
    serde_json::to_string(&request).map_err(|err| err.to_string())
}

pub(crate) fn parse_incoming_line(line: &str) -> Option<IncomingMessage> {
    let message: Value = serde_json::from_str(line).ok()?;

    if let Some(id) = message.get("id").and_then(|value| value.as_u64()) {
        if let Some(error) = message.get("error") {
            let error_message = error
                .get("message")
                .and_then(|value| value.as_str())
                .unwrap_or("remote error")
                .to_string();
            return Some(IncomingMessage::Response {
                id,
                payload: Err(error_message),
            });
        }

        let result = message.get("result").cloned().unwrap_or(Value::Null);
        return Some(IncomingMessage::Response {
            id,
            payload: Ok(result),
        });
    }

    let method = message
        .get("method")
        .and_then(|value| value.as_str())
        .unwrap_or("");
    if method.is_empty() {
        return None;
    }
    let params = message.get("params").cloned().unwrap_or(Value::Null);
    Some(IncomingMessage::Notification {
        method: method.to_string(),
        params,
    })
}
