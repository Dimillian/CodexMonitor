use std::path::Path;

use serde::Deserialize;
use serde_json::Value;

use crate::types::{TailscaleDaemonCommandPreview, TailscaleStatus};

const DEFAULT_DAEMON_LISTEN_ADDR: &str = "0.0.0.0:4732";
const REMOTE_TOKEN_PLACEHOLDER: &str = "<remote-backend-token>";

pub(crate) fn unavailable_status(version: Option<String>, message: String) -> TailscaleStatus {
    TailscaleStatus {
        installed: false,
        running: false,
        version,
        dns_name: None,
        host_name: None,
        tailnet_name: None,
        ipv4: Vec::new(),
        ipv6: Vec::new(),
        suggested_remote_host: None,
        message,
    }
}

fn parse_status_json(payload: &str) -> Result<Value, String> {
    fn tailscale_status_score(value: &Value) -> u8 {
        let backend_state_score = value
            .get("BackendState")
            .is_some_and(|backend_state| backend_state.is_string())
            as u8;

        let self_score = value
            .get("Self")
            .and_then(Value::as_object)
            .map(|self_node| {
                let mut score = 3u8;
                if self_node
                    .get("DNSName")
                    .is_some_and(|dns_name| dns_name.is_string())
                {
                    score += 1;
                }
                if self_node
                    .get("TailscaleIPs")
                    .is_some_and(|tailscale_ips| tailscale_ips.is_array())
                {
                    score += 1;
                }
                score
            })
            .unwrap_or(0);

        let tailnet_score = value
            .get("CurrentTailnet")
            .and_then(Value::as_object)
            .map(|tailnet| {
                let mut score = 2u8;
                if tailnet
                    .get("Name")
                    .is_some_and(|tailnet_name| tailnet_name.is_string())
                {
                    score += 1;
                }
                score
            })
            .unwrap_or(0);

        backend_state_score + self_score + tailnet_score
    }

    fn candidate_start_offsets(payload: &str) -> Vec<usize> {
        let mut line_start_offsets = Vec::new();
        let mut marker_offsets = Vec::new();
        let mut line_head = 0usize;

        for (index, ch) in payload.char_indices() {
            if matches!(ch, '\n' | '\r') {
                line_head = index + ch.len_utf8();
                continue;
            }
            if !matches!(ch, '{' | '[') {
                continue;
            }
            marker_offsets.push(index);
            if payload[line_head..index].trim().is_empty() {
                line_start_offsets.push(index);
            }
        }

        for marker in marker_offsets {
            if !line_start_offsets.contains(&marker) {
                line_start_offsets.push(marker);
            }
        }
        line_start_offsets
    }

    let trimmed = payload.trim_matches(|ch: char| ch.is_whitespace() || ch == '\u{feff}');
    if trimmed.is_empty() {
        return Err("Invalid tailscale status JSON: empty payload".to_string());
    }

    let mut best_candidate: Option<(u8, Value)> = None;
    let mut last_error = match serde_json::from_str::<Value>(trimmed) {
        Ok(parsed) => {
            let score = tailscale_status_score(&parsed);
            if score > 0 {
                return Ok(parsed);
            }
            "JSON payload is missing expected Tailscale status fields".to_string()
        }
        Err(err) => err.to_string(),
    };

    for start_offset in candidate_start_offsets(trimmed) {
        let candidate = &trimmed[start_offset..];
        let mut deserializer = serde_json::Deserializer::from_str(candidate);
        match Value::deserialize(&mut deserializer) {
            Ok(value) => {
                let score = tailscale_status_score(&value);
                if score > 0 {
                    match best_candidate.as_ref() {
                        Some((best_score, _)) if *best_score >= score => {}
                        _ => best_candidate = Some((score, value)),
                    }
                } else {
                    last_error =
                        "JSON payload is missing expected Tailscale status fields".to_string();
                }
            }
            Err(err) => {
                last_error = err.to_string();
            }
        }
    }

    if let Some((_, value)) = best_candidate {
        return Ok(value);
    }

    Err(format!("Invalid tailscale status JSON: {last_error}"))
}

pub(crate) fn status_from_json(
    version: Option<String>,
    payload: &str,
) -> Result<TailscaleStatus, String> {
    let json = parse_status_json(payload)?;
    let backend_state = json
        .get("BackendState")
        .and_then(Value::as_str)
        .map(str::to_string);
    let running = backend_state
        .as_deref()
        .map(|value| value.eq_ignore_ascii_case("running"))
        .unwrap_or(false);

    let self_node = json.get("Self").and_then(Value::as_object);
    let dns_name = self_node
        .and_then(|node| node.get("DNSName"))
        .and_then(Value::as_str)
        .map(trim_dns_name)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let host_name = self_node
        .and_then(|node| node.get("HostName"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let tailnet_name = json
        .get("CurrentTailnet")
        .and_then(Value::as_object)
        .and_then(|node| node.get("Name"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);

    let ip_values = self_node
        .and_then(|node| node.get("TailscaleIPs"))
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let mut ipv4 = Vec::new();
    let mut ipv6 = Vec::new();
    for ip in ip_values {
        if ip.contains(':') {
            ipv6.push(ip);
        } else {
            ipv4.push(ip);
        }
    }

    let suggested_remote_host = suggested_remote_host(dns_name.as_deref(), &ipv4, &ipv6);
    let message = if running {
        if let Some(name) = dns_name.as_deref() {
            format!("Tailscale is connected as {name}.")
        } else {
            "Tailscale is connected.".to_string()
        }
    } else if let Some(state) = backend_state.as_deref() {
        format!("Tailscale backend state: {state}.")
    } else {
        "Tailscale is not running.".to_string()
    };

    Ok(TailscaleStatus {
        installed: true,
        running,
        version,
        dns_name,
        host_name,
        tailnet_name,
        ipv4,
        ipv6,
        suggested_remote_host,
        message,
    })
}

pub(crate) fn suggested_remote_host(
    dns_name: Option<&str>,
    ipv4: &[String],
    ipv6: &[String],
) -> Option<String> {
    if let Some(name) = dns_name
        .map(trim_dns_name)
        .filter(|value| !value.is_empty())
    {
        return Some(format!("{name}:4732"));
    }
    if let Some(ip) = ipv4.first() {
        return Some(format!("{ip}:4732"));
    }
    if let Some(ip) = ipv6.first() {
        return Some(format!("[{ip}]:4732"));
    }
    None
}

pub(crate) fn daemon_command_preview(
    daemon_path: &Path,
    data_dir: &Path,
    token_configured: bool,
) -> TailscaleDaemonCommandPreview {
    let daemon_path_str = daemon_path.to_string_lossy().to_string();
    let data_dir_str = data_dir.to_string_lossy().to_string();
    let args = vec![
        "--listen".to_string(),
        DEFAULT_DAEMON_LISTEN_ADDR.to_string(),
        "--data-dir".to_string(),
        data_dir_str.clone(),
        "--token".to_string(),
        REMOTE_TOKEN_PLACEHOLDER.to_string(),
    ];
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

fn trim_dns_name(value: &str) -> &str {
    value.trim().trim_end_matches('.')
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

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::{daemon_command_preview, status_from_json, suggested_remote_host};

    #[test]
    fn status_from_json_extracts_running_fields() {
        let payload = r#"{
          "BackendState": "Running",
          "CurrentTailnet": { "Name": "example.ts.net" },
          "Self": {
            "DNSName": "macbook.example.ts.net.",
            "HostName": "macbook",
            "TailscaleIPs": ["100.10.10.1", "fd7a:115c:a1e0::1"]
          }
        }"#;

        let status = status_from_json(Some("1.80.0".to_string()), payload).expect("status");
        assert!(status.installed);
        assert!(status.running);
        assert_eq!(status.version.as_deref(), Some("1.80.0"));
        assert_eq!(status.dns_name.as_deref(), Some("macbook.example.ts.net"));
        assert_eq!(status.tailnet_name.as_deref(), Some("example.ts.net"));
        assert_eq!(status.ipv4, vec!["100.10.10.1".to_string()]);
        assert_eq!(status.ipv6, vec!["fd7a:115c:a1e0::1".to_string()]);
        assert_eq!(
            status.suggested_remote_host.as_deref(),
            Some("macbook.example.ts.net:4732")
        );
    }

    #[test]
    fn status_from_json_accepts_backend_state_only_payload() {
        let payload = r#"{"BackendState":"NeedsLogin"}"#;

        let status = status_from_json(None, payload).expect("status");
        assert!(!status.running);
        assert!(status.message.contains("NeedsLogin"));
    }

    #[test]
    fn status_from_json_tolerates_prefix_before_json() {
        let payload = r#"warning: client/server version mismatch
{
  "BackendState": "Running",
  "Self": {
    "DNSName": "host.example.ts.net.",
    "TailscaleIPs": ["100.64.0.1"]
  }
}"#;

        let status = status_from_json(None, payload).expect("status");
        assert!(status.running);
        assert_eq!(status.dns_name.as_deref(), Some("host.example.ts.net"));
    }

    #[test]
    fn status_from_json_ignores_braces_in_prefix_text() {
        let payload = r#"warning {mismatch} reported by daemon
{
  "BackendState": "Running",
  "Self": {
    "DNSName": "host.example.ts.net.",
    "TailscaleIPs": ["100.64.0.1"]
  }
}"#;

        let status = status_from_json(None, payload).expect("status");
        assert!(status.running);
        assert_eq!(status.dns_name.as_deref(), Some("host.example.ts.net"));
    }

    #[test]
    fn status_from_json_prefers_tailscale_object_after_json_prefix() {
        let payload = r#"{"level":"warn","msg":"diagnostic"}
{"BackendState":"Running","Self":{"DNSName":"host.example.ts.net.","TailscaleIPs":["100.64.0.1"]}}"#;

        let status = status_from_json(None, payload).expect("status");
        assert!(status.running);
        assert_eq!(status.dns_name.as_deref(), Some("host.example.ts.net"));
    }

    #[test]
    fn status_from_json_prefers_tailscale_object_in_same_line_noise() {
        let payload = r#"warning {"level":"warn"} {"BackendState":"Running","Self":{"DNSName":"host.example.ts.net.","TailscaleIPs":["100.64.0.1"]}}"#;

        let status = status_from_json(None, payload).expect("status");
        assert!(status.running);
        assert_eq!(status.dns_name.as_deref(), Some("host.example.ts.net"));
    }

    #[test]
    fn status_from_json_ignores_false_positive_keys_with_wrong_types() {
        let payload = r#"{"Self":"diagnostic"}
{"BackendState":"Running","Self":{"DNSName":"host.example.ts.net.","TailscaleIPs":["100.64.0.1"]}}"#;

        let status = status_from_json(None, payload).expect("status");
        assert!(status.running);
        assert_eq!(status.dns_name.as_deref(), Some("host.example.ts.net"));
    }

    #[test]
    fn status_from_json_ignores_backend_state_only_prefix_object() {
        let payload = r#"{"BackendState":"warn"}
{"BackendState":"Running","Self":{"DNSName":"host.example.ts.net.","TailscaleIPs":["100.64.0.1"]}}"#;

        let status = status_from_json(None, payload).expect("status");
        assert!(status.running);
        assert_eq!(status.dns_name.as_deref(), Some("host.example.ts.net"));
    }

    #[test]
    fn status_from_json_tolerates_trailing_lines_after_json() {
        let payload = r#"{
  "BackendState": "Running",
  "Self": {
    "DNSName": "host.example.ts.net.",
    "TailscaleIPs": ["100.64.0.1"]
  }
}
extra diagnostics line"#;

        let status = status_from_json(None, payload).expect("status");
        assert!(status.running);
        assert_eq!(status.dns_name.as_deref(), Some("host.example.ts.net"));
    }

    #[test]
    fn suggested_remote_host_falls_back_to_ipv6() {
        let host = suggested_remote_host(None, &[], &[String::from("fd7a:115c:a1e0::1")]);
        assert_eq!(host.as_deref(), Some("[fd7a:115c:a1e0::1]:4732"));
    }

    #[test]
    fn daemon_command_preview_uses_placeholder_token() {
        let preview = daemon_command_preview(
            Path::new("/tmp/codex_monitor_daemon"),
            Path::new("/tmp/data-dir"),
            true,
        );
        assert!(preview.command.contains("--listen"));
        assert!(preview.command.contains("0.0.0.0:4732"));
        assert!(preview.command.contains("<remote-backend-token>"));
        assert!(preview.token_configured);
    }
}
