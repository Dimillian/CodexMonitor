#![allow(dead_code)]

use serde_json::Value;
use std::time::Duration;

use tokio::sync::Mutex;
use tokio::time::timeout;

use crate::backend::app_server::check_codex_installation;
use crate::shared::process_core::tokio_command;
use crate::types::AppSettings;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct CodexUpdateResult {
    ok: bool,
    method: String,
    package: Option<String>,
    before_version: Option<String>,
    after_version: Option<String>,
    upgraded: bool,
    output: Option<String>,
    details: Option<String>,
}

fn trim_lines(value: &str, max_len: usize) -> String {
    let trimmed = value.trim();
    if trimmed.len() <= max_len {
        return trimmed.to_string();
    }

    let mut shortened = trimmed[..max_len].to_string();
    shortened.push_str("…");
    shortened
}

async fn run_brew_check(args: &[&str]) -> Result<bool, String> {
    let mut command = tokio_command("brew");
    command.args(args);
    command.stdout(std::process::Stdio::piped());
    command.stderr(std::process::Stdio::piped());

    let output = match timeout(Duration::from_secs(8), command.output()).await {
        Ok(result) => match result {
            Ok(output) => output,
            Err(err) => {
                if err.kind() == std::io::ErrorKind::NotFound {
                    return Ok(false);
                }
                return Err(err.to_string());
            }
        },
        Err(_) => return Ok(false),
    };

    Ok(output.status.success())
}

async fn detect_brew_cask(name: &str) -> Result<bool, String> {
    run_brew_check(&["list", "--cask", "--versions", name]).await
}

async fn detect_brew_formula(name: &str) -> Result<bool, String> {
    run_brew_check(&["list", "--formula", "--versions", name]).await
}

async fn run_brew_upgrade(args: &[&str]) -> Result<(bool, String), String> {
    let mut command = tokio_command("brew");
    command.arg("upgrade");
    command.args(args);
    command.stdout(std::process::Stdio::piped());
    command.stderr(std::process::Stdio::piped());

    let output = match timeout(Duration::from_secs(60 * 10), command.output()).await {
        Ok(result) => result.map_err(|err| err.to_string())?,
        Err(_) => return Err("Timed out while running `brew upgrade`.".to_string()),
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let combined = format!("{}\n{}", stdout.trim_end(), stderr.trim_end());
    Ok((output.status.success(), combined.trim().to_string()))
}

fn brew_output_indicates_upgrade(output: &str) -> bool {
    let lower = output.to_ascii_lowercase();
    if lower.contains("already up-to-date") {
        return false;
    }
    if lower.contains("already installed") && lower.contains("latest") {
        return false;
    }
    if lower.contains("upgraded") {
        return true;
    }
    if lower.contains("installing") || lower.contains("pouring") {
        return true;
    }
    false
}

async fn npm_has_package(package: &str) -> Result<bool, String> {
    let mut command = tokio_command("npm");
    command.arg("list");
    command.arg("-g");
    command.arg(package);
    command.arg("--depth=0");
    command.stdout(std::process::Stdio::piped());
    command.stderr(std::process::Stdio::piped());

    let output = match timeout(Duration::from_secs(10), command.output()).await {
        Ok(result) => match result {
            Ok(output) => output,
            Err(err) => {
                if err.kind() == std::io::ErrorKind::NotFound {
                    return Ok(false);
                }
                return Err(err.to_string());
            }
        },
        Err(_) => return Ok(false),
    };

    Ok(output.status.success())
}

async fn run_npm_install_latest(package: &str) -> Result<(bool, String), String> {
    let mut command = tokio_command("npm");
    command.arg("install");
    command.arg("-g");
    command.arg(format!("{package}@latest"));
    command.stdout(std::process::Stdio::piped());
    command.stderr(std::process::Stdio::piped());

    let output = match timeout(Duration::from_secs(60 * 10), command.output()).await {
        Ok(result) => result.map_err(|err| err.to_string())?,
        Err(_) => return Err("Timed out while running `npm install -g`.".to_string()),
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let combined = format!("{}\n{}", stdout.trim_end(), stderr.trim_end());
    Ok((output.status.success(), combined.trim().to_string()))
}

pub(crate) async fn codex_update_core(
    app_settings: &Mutex<AppSettings>,
    codex_bin: Option<String>,
    codex_args: Option<String>,
) -> Result<Value, String> {
    let (default_bin, default_args) = {
        let settings = app_settings.lock().await;
        (settings.codex_bin.clone(), settings.codex_args.clone())
    };
    let resolved = codex_bin
        .clone()
        .filter(|value| !value.trim().is_empty())
        .or(default_bin);
    let resolved_args = codex_args
        .clone()
        .filter(|value| !value.trim().is_empty())
        .or(default_args);
    let _ = resolved_args;

    let before_version = check_codex_installation(resolved.clone())
        .await
        .ok()
        .flatten();

    let (method, package, upgrade_ok, output, upgraded) = if detect_brew_cask("codex").await? {
        let (ok, output) = run_brew_upgrade(&["--cask", "codex"]).await?;
        let upgraded = brew_output_indicates_upgrade(&output);
        (
            "brew_cask".to_string(),
            Some("codex".to_string()),
            ok,
            output,
            upgraded,
        )
    } else if detect_brew_formula("codex").await? {
        let (ok, output) = run_brew_upgrade(&["codex"]).await?;
        let upgraded = brew_output_indicates_upgrade(&output);
        (
            "brew_formula".to_string(),
            Some("codex".to_string()),
            ok,
            output,
            upgraded,
        )
    } else if npm_has_package("@openai/codex").await? {
        let (ok, output) = run_npm_install_latest("@openai/codex").await?;
        (
            "npm".to_string(),
            Some("@openai/codex".to_string()),
            ok,
            output,
            ok,
        )
    } else {
        (
            "unknown".to_string(),
            None,
            false,
            String::new(),
            false,
        )
    };

    let after_version = if method == "unknown" {
        None
    } else {
        match check_codex_installation(resolved.clone()).await {
            Ok(version) => version,
            Err(err) => {
                let result = CodexUpdateResult {
                    ok: false,
                    method,
                    package,
                    before_version,
                    after_version: None,
                    upgraded,
                    output: Some(trim_lines(&output, 8000)),
                    details: Some(err),
                };
                return serde_json::to_value(result).map_err(|e| e.to_string());
            }
        }
    };

    let details = if method == "unknown" {
        Some("Unable to detect Codex installation method (brew/npm).".to_string())
    } else if upgrade_ok {
        None
    } else {
        Some("Codex update failed.".to_string())
    };

    let result = CodexUpdateResult {
        ok: upgrade_ok,
        method,
        package,
        before_version,
        after_version,
        upgraded,
        output: Some(trim_lines(&output, 8000)),
        details,
    };

    serde_json::to_value(result).map_err(|err| err.to_string())
}
