use std::fmt::Write as _;
use std::time::{Duration, Instant};

use serde_json::{json, Value};
use tokio_tungstenite::connect_async;

use crate::types::{
    AppSettings, OrbitConnectTestResult, OrbitDeviceCodeStart, OrbitSignInPollResult,
    OrbitSignInStatus,
};

const DEFAULT_DEVICE_POLL_INTERVAL_SECONDS: u32 = 5;
const DEFAULT_DEVICE_EXPIRES_SECONDS: u32 = 600;
const MAX_ERROR_BODY_BYTES: usize = 400;

fn reqwest_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|err| format!("Failed to create HTTP client: {err}"))
}

fn normalize_auth_base_url(auth_url: &str) -> Result<String, String> {
    let trimmed = auth_url.trim();
    if trimmed.is_empty() {
        return Err("Orbit auth URL is required.".to_string());
    }
    if !(trimmed.starts_with("https://") || trimmed.starts_with("http://")) {
        return Err("orbitAuthUrl must start with https:// or http://".to_string());
    }
    Ok(trimmed.trim_end_matches('/').to_string())
}

fn auth_endpoint(base_url: &str, path: &str) -> String {
    let suffix = path.trim_start_matches('/');
    format!("{base_url}/{suffix}")
}

fn value_string<'a>(value: &'a Value, keys: &[&str]) -> Option<&'a str> {
    for key in keys {
        if let Some(found) = value.get(*key).and_then(Value::as_str) {
            if !found.trim().is_empty() {
                return Some(found);
            }
        }
    }
    None
}

fn value_u32(value: &Value, keys: &[&str]) -> Option<u32> {
    for key in keys {
        if let Some(found) = value.get(*key).and_then(Value::as_u64) {
            if found > 0 && found <= u32::MAX as u64 {
                return Some(found as u32);
            }
        }
    }
    None
}

fn response_body_excerpt(text: &str) -> String {
    let trimmed = text.trim();
    if trimmed.len() <= MAX_ERROR_BODY_BYTES {
        return trimmed.to_string();
    }
    let mut boundary = MAX_ERROR_BODY_BYTES;
    while boundary > 0 && !trimmed.is_char_boundary(boundary) {
        boundary -= 1;
    }
    let mut output = trimmed[..boundary].to_string();
    output.push_str("...");
    output
}

fn encode_query_component(value: &str) -> String {
    let mut output = String::with_capacity(value.len());
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'.' | b'_' | b'~') {
            output.push(char::from(byte));
        } else {
            let _ = write!(&mut output, "%{byte:02X}");
        }
    }
    output
}

fn append_query(url: &str, key: &str, value: &str) -> String {
    let (base, fragment) = match url.split_once('#') {
        Some((before_fragment, after_fragment)) => (before_fragment, Some(after_fragment)),
        None => (url, None),
    };

    let has_key = base
        .split_once('?')
        .map(|(_, query)| {
            query
                .split('&')
                .filter(|entry| !entry.is_empty())
                .any(|entry| {
                    entry
                        .split('=')
                        .next()
                        .map(|candidate| candidate == key)
                        .unwrap_or(false)
                })
        })
        .unwrap_or(false);
    if has_key {
        return url.to_string();
    }
    let separator = if base.contains('?') { '&' } else { '?' };
    let encoded_key = encode_query_component(key);
    let encoded_value = encode_query_component(value);
    let mut output = format!("{base}{separator}{encoded_key}={encoded_value}");
    if let Some(fragment) = fragment {
        output.push('#');
        output.push_str(fragment);
    }
    output
}

pub(crate) fn orbit_auth_url_from_settings(settings: &AppSettings) -> Result<String, String> {
    settings
        .orbit_auth_url
        .as_ref()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "Orbit auth URL is required in settings (orbitAuthUrl).".to_string())
}

pub(crate) fn orbit_ws_url_from_settings(settings: &AppSettings) -> Result<String, String> {
    settings
        .orbit_ws_url
        .as_ref()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "Orbit WS URL is required in settings (orbitWsUrl).".to_string())
}

pub(crate) fn orbit_auth_url_optional(settings: &AppSettings) -> Option<String> {
    settings
        .orbit_auth_url
        .as_ref()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

pub(crate) fn remote_backend_token_optional(settings: &AppSettings) -> Option<String> {
    settings
        .remote_backend_token
        .as_ref()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

pub(crate) fn build_orbit_ws_url(ws_url: &str, auth_token: Option<&str>) -> Result<String, String> {
    let raw_url = ws_url.trim();
    if raw_url.is_empty() {
        return Err("Orbit provider requires orbitWsUrl in app settings.".to_string());
    }

    let normalized = if let Some(rest) = raw_url.strip_prefix("https://") {
        format!("wss://{rest}")
    } else if let Some(rest) = raw_url.strip_prefix("http://") {
        format!("ws://{rest}")
    } else if raw_url.starts_with("wss://") || raw_url.starts_with("ws://") {
        raw_url.to_string()
    } else {
        return Err("orbitWsUrl must start with https://, http://, wss://, or ws://".to_string());
    };

    let Some(token) = auth_token.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(normalized);
    };

    Ok(append_query(&normalized, "token", token))
}

pub(crate) async fn orbit_connect_test_core(
    ws_url: &str,
    auth_token: Option<&str>,
) -> Result<OrbitConnectTestResult, String> {
    let ws_url = build_orbit_ws_url(ws_url, auth_token)?;
    let started = Instant::now();

    let _socket = connect_async(&ws_url)
        .await
        .map_err(|err| format!("Failed to connect to Orbit relay: {err}"))?;

    Ok(OrbitConnectTestResult {
        ok: true,
        latency_ms: Some(started.elapsed().as_millis() as u64),
        message: "Connected to Orbit relay.".to_string(),
        details: Some(ws_url),
    })
}

pub(crate) async fn orbit_sign_in_start_core(
    auth_url: &str,
    runner_name: Option<&str>,
) -> Result<OrbitDeviceCodeStart, String> {
    let auth_base = normalize_auth_base_url(auth_url)?;
    let endpoint = auth_endpoint(&auth_base, "/auth/device/code");

    let client = reqwest_client()?;
    let requested_name = runner_name
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("CodexMonitor");

    let response = client
        .post(&endpoint)
        .json(&json!({
            "client": "codex-monitor",
            "deviceName": requested_name,
        }))
        .send()
        .await
        .map_err(|err| format!("Failed to start Orbit device sign-in: {err}"))?;

    let status = response.status();
    let body_text = response
        .text()
        .await
        .map_err(|err| format!("Failed to read Orbit auth response: {err}"))?;

    if !status.is_success() {
        let excerpt = response_body_excerpt(&body_text);
        return Err(format!(
            "Orbit auth sign-in start failed ({}): {}",
            status.as_u16(),
            excerpt
        ));
    }

    let payload: Value = serde_json::from_str(&body_text)
        .map_err(|err| format!("Invalid Orbit auth response JSON: {err}"))?;

    let device_code = value_string(&payload, &["deviceCode", "device_code"])
        .ok_or_else(|| "Orbit auth response missing `deviceCode`.".to_string())?
        .to_string();
    let verification_uri = value_string(
        &payload,
        &[
            "verificationUri",
            "verification_uri",
            "verificationUrl",
            "verification_url",
        ],
    )
    .ok_or_else(|| "Orbit auth response missing `verificationUri`.".to_string())?
    .to_string();

    Ok(OrbitDeviceCodeStart {
        device_code,
        user_code: value_string(&payload, &["userCode", "user_code"]).map(str::to_string),
        verification_uri,
        verification_uri_complete: value_string(
            &payload,
            &["verificationUriComplete", "verification_uri_complete"],
        )
        .map(str::to_string),
        interval_seconds: value_u32(&payload, &["interval", "pollInterval", "poll_interval"])
            .unwrap_or(DEFAULT_DEVICE_POLL_INTERVAL_SECONDS),
        expires_in_seconds: value_u32(&payload, &["expiresIn", "expires_in"])
            .unwrap_or(DEFAULT_DEVICE_EXPIRES_SECONDS),
    })
}

pub(crate) async fn orbit_sign_in_poll_core(
    auth_url: &str,
    device_code: &str,
) -> Result<OrbitSignInPollResult, String> {
    let auth_base = normalize_auth_base_url(auth_url)?;
    let endpoint = auth_endpoint(&auth_base, "/auth/device/token");

    let trimmed_device_code = device_code.trim();
    if trimmed_device_code.is_empty() {
        return Err("Device code is required.".to_string());
    }

    let client = reqwest_client()?;
    let response = client
        .post(&endpoint)
        .json(&json!({
            "deviceCode": trimmed_device_code,
            "device_code": trimmed_device_code,
        }))
        .send()
        .await
        .map_err(|err| format!("Failed to poll Orbit auth token: {err}"))?;

    let status = response.status();
    let body_text = response
        .text()
        .await
        .map_err(|err| format!("Failed to read Orbit auth poll response: {err}"))?;

    let payload: Value = serde_json::from_str(&body_text).unwrap_or_else(|_| json!({}));

    if let Some(token) = value_string(&payload, &["token", "accessToken", "access_token", "jwt"]) {
        return Ok(OrbitSignInPollResult {
            status: OrbitSignInStatus::Authorized,
            token: Some(token.to_string()),
            message: Some("Orbit sign-in complete.".to_string()),
            interval_seconds: value_u32(&payload, &["interval", "pollInterval", "poll_interval"]),
        });
    }

    let status_label = value_string(&payload, &["status", "state"])
        .unwrap_or_default()
        .to_ascii_lowercase();

    if status == reqwest::StatusCode::ACCEPTED
        || status == reqwest::StatusCode::TOO_EARLY
        || status_label == "pending"
        || status_label == "authorization_pending"
    {
        return Ok(OrbitSignInPollResult {
            status: OrbitSignInStatus::Pending,
            token: None,
            message: Some("Waiting for Orbit device authorization.".to_string()),
            interval_seconds: value_u32(&payload, &["interval", "pollInterval", "poll_interval"])
                .or(Some(DEFAULT_DEVICE_POLL_INTERVAL_SECONDS)),
        });
    }

    if status == reqwest::StatusCode::GONE
        || status_label == "expired"
        || status_label == "expired_token"
    {
        return Ok(OrbitSignInPollResult {
            status: OrbitSignInStatus::Expired,
            token: None,
            message: Some("Orbit device code expired.".to_string()),
            interval_seconds: None,
        });
    }

    if status == reqwest::StatusCode::UNAUTHORIZED
        || status == reqwest::StatusCode::FORBIDDEN
        || status_label == "denied"
        || status_label == "access_denied"
    {
        return Ok(OrbitSignInPollResult {
            status: OrbitSignInStatus::Denied,
            token: None,
            message: Some("Orbit device authorization denied.".to_string()),
            interval_seconds: None,
        });
    }

    let excerpt = response_body_excerpt(&body_text);
    Ok(OrbitSignInPollResult {
        status: OrbitSignInStatus::Error,
        token: None,
        message: Some(format!(
            "Orbit token polling failed ({}): {}",
            status.as_u16(),
            excerpt
        )),
        interval_seconds: None,
    })
}

pub(crate) async fn orbit_sign_out_core(auth_url: &str, token: &str) -> Result<(), String> {
    let auth_base = normalize_auth_base_url(auth_url)?;
    let endpoint = auth_endpoint(&auth_base, "/auth/logout");

    let token = token.trim();
    if token.is_empty() {
        return Ok(());
    }

    let client = reqwest_client()?;
    let response = client
        .post(&endpoint)
        .bearer_auth(token)
        .send()
        .await
        .map_err(|err| format!("Failed to call Orbit auth logout: {err}"))?;

    if response.status().is_success() {
        return Ok(());
    }

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|err| format!("Failed to read Orbit logout response: {err}"))?;
    let excerpt = response_body_excerpt(&body);

    Err(format!(
        "Orbit sign-out failed ({}): {}",
        status.as_u16(),
        excerpt
    ))
}

#[cfg(test)]
mod tests {
    use super::{build_orbit_ws_url, response_body_excerpt, MAX_ERROR_BODY_BYTES};

    #[test]
    fn build_orbit_ws_url_converts_http_scheme() {
        let value = build_orbit_ws_url("https://example.com/ws/client", None).expect("ws url");
        assert_eq!(value, "wss://example.com/ws/client");
    }

    #[test]
    fn build_orbit_ws_url_appends_token_query() {
        let value = build_orbit_ws_url("wss://example.com/ws/client", Some("abc")).expect("ws url");
        assert_eq!(value, "wss://example.com/ws/client?token=abc");
    }

    #[test]
    fn build_orbit_ws_url_appends_token_when_id_token_present() {
        let value = build_orbit_ws_url("wss://example.com/ws/client?id_token=abc", Some("def"))
            .expect("ws url");
        assert_eq!(value, "wss://example.com/ws/client?id_token=abc&token=def");
    }

    #[test]
    fn build_orbit_ws_url_does_not_append_duplicate_token_query() {
        let value = build_orbit_ws_url(
            "wss://example.com/ws/client?token=abc&id_token=def",
            Some("xyz"),
        )
        .expect("ws url");
        assert_eq!(value, "wss://example.com/ws/client?token=abc&id_token=def");
    }

    #[test]
    fn build_orbit_ws_url_appends_token_before_fragment() {
        let value =
            build_orbit_ws_url("wss://example.com/ws/client#frag", Some("abc")).expect("ws url");
        assert_eq!(value, "wss://example.com/ws/client?token=abc#frag");
    }

    #[test]
    fn build_orbit_ws_url_encodes_query_token() {
        let value =
            build_orbit_ws_url("wss://example.com/ws/client", Some("a&b#c+d%e")).expect("ws url");
        assert_eq!(value, "wss://example.com/ws/client?token=a%26b%23c%2Bd%25e");
    }

    #[test]
    fn response_body_excerpt_preserves_utf8_boundaries() {
        let text = format!("{}étail", "a".repeat(MAX_ERROR_BODY_BYTES - 1));
        let excerpt = response_body_excerpt(&text);
        assert_eq!(
            excerpt,
            format!("{}...", "a".repeat(MAX_ERROR_BODY_BYTES - 1))
        );
    }
}
