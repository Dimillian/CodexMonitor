use std::path::Path;

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

pub(crate) fn status_from_json(
    version: Option<String>,
    payload: &str,
) -> Result<TailscaleStatus, String> {
    let json: Value = serde_json::from_str(payload)
        .map_err(|err| format!("Invalid tailscale status JSON: {err}"))?;
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
