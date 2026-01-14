// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if let Err(err) = fix_path_env::fix() {
        eprintln!("Failed to sync PATH from shell: {err}");
    }

    let mut args = std::env::args().skip(1);
    match args.next().as_deref() {
        Some("--cloudkit-status") => {
            let container_id = args.next().unwrap_or_default();
            if container_id.trim().is_empty() {
                eprintln!("Usage: codex-monitor --cloudkit-status <container-id>");
                std::process::exit(2);
            }
            match codex_monitor_lib::cloudkit_cli_status_json(container_id) {
                Ok(payload) => {
                    println!("{payload}");
                    std::process::exit(0);
                }
                Err(error) => {
                    eprintln!("{error}");
                    std::process::exit(1);
                }
            }
        }
        Some("--cloudkit-test") => {
            let container_id = args.next().unwrap_or_default();
            if container_id.trim().is_empty() {
                eprintln!("Usage: codex-monitor --cloudkit-test <container-id>");
                std::process::exit(2);
            }
            match codex_monitor_lib::cloudkit_cli_test_json(container_id) {
                Ok(payload) => {
                    println!("{payload}");
                    std::process::exit(0);
                }
                Err(error) => {
                    eprintln!("{error}");
                    std::process::exit(1);
                }
            }
        }
        Some("--cloudkit-latest-runner") => {
            let container_id = args.next().unwrap_or_default();
            if container_id.trim().is_empty() {
                eprintln!("Usage: codex-monitor --cloudkit-latest-runner <container-id>");
                std::process::exit(2);
            }
            match codex_monitor_lib::cloudkit_cli_latest_runner_json(container_id) {
                Ok(payload) => {
                    println!("{payload}");
                    std::process::exit(0);
                }
                Err(error) => {
                    eprintln!("{error}");
                    std::process::exit(1);
                }
            }
        }
        Some("--cloudkit-upsert-runner") => {
            let container_id = args.next().unwrap_or_default();
            let runner_id = args.next().unwrap_or_default();
            if container_id.trim().is_empty() || runner_id.trim().is_empty() {
                eprintln!("Usage: codex-monitor --cloudkit-upsert-runner <container-id> <runner-id>");
                std::process::exit(2);
            }
            match codex_monitor_lib::cloudkit_cli_upsert_runner_json(container_id, runner_id) {
                Ok(payload) => {
                    println!("{payload}");
                    std::process::exit(0);
                }
                Err(error) => {
                    eprintln!("{error}");
                    std::process::exit(1);
                }
            }
        }
        Some("--cloudkit-get-snapshot") => {
            let container_id = args.next().unwrap_or_default();
            let runner_id = args.next().unwrap_or_default();
            let scope_key = args.next().unwrap_or_default();
            if container_id.trim().is_empty() || runner_id.trim().is_empty() || scope_key.trim().is_empty() {
                eprintln!(
                    "Usage: codex-monitor --cloudkit-get-snapshot <container-id> <runner-id> <scope-key>"
                );
                std::process::exit(2);
            }
            match codex_monitor_lib::cloudkit_cli_get_snapshot_json(container_id, runner_id, scope_key) {
                Ok(payload) => {
                    println!("{payload}");
                    std::process::exit(0);
                }
                Err(error) => {
                    eprintln!("{error}");
                    std::process::exit(1);
                }
            }
        }
        Some("--cloudkit-get-command-result") => {
            let container_id = args.next().unwrap_or_default();
            let runner_id = args.next().unwrap_or_default();
            let command_id = args.next().unwrap_or_default();
            if container_id.trim().is_empty() || runner_id.trim().is_empty() || command_id.trim().is_empty() {
                eprintln!(
                    "Usage: codex-monitor --cloudkit-get-command-result <container-id> <runner-id> <command-id>"
                );
                std::process::exit(2);
            }
            match codex_monitor_lib::cloudkit_cli_get_command_result_json(container_id, runner_id, command_id) {
                Ok(payload) => {
                    println!("{payload}");
                    std::process::exit(0);
                }
                Err(error) => {
                    eprintln!("{error}");
                    std::process::exit(1);
                }
            }
        }
        Some("--cloudkit-latest-command-result") => {
            let container_id = args.next().unwrap_or_default();
            let runner_id = args.next().unwrap_or_default();
            if container_id.trim().is_empty() || runner_id.trim().is_empty() {
                eprintln!(
                    "Usage: codex-monitor --cloudkit-latest-command-result <container-id> <runner-id>"
                );
                std::process::exit(2);
            }
            match codex_monitor_lib::cloudkit_cli_latest_command_result_json(container_id, runner_id) {
                Ok(payload) => {
                    println!("{payload}");
                    std::process::exit(0);
                }
                Err(error) => {
                    eprintln!("{error}");
                    std::process::exit(1);
                }
            }
        }
        Some("--cloudkit-submit-command") => {
            let container_id = args.next().unwrap_or_default();
            let runner_id = args.next().unwrap_or_default();
            let payload_json = args.next().unwrap_or_default();
            if container_id.trim().is_empty() || runner_id.trim().is_empty() || payload_json.trim().is_empty() {
                eprintln!(
                    "Usage: codex-monitor --cloudkit-submit-command <container-id> <runner-id> <payload-json>"
                );
                std::process::exit(2);
            }
            match codex_monitor_lib::cloudkit_cli_submit_command_json(container_id, runner_id, payload_json) {
                Ok(payload) => {
                    println!("{payload}");
                    std::process::exit(0);
                }
                Err(error) => {
                    eprintln!("{error}");
                    std::process::exit(1);
                }
            }
        }
        _ => {}
    }
    codex_monitor_lib::run()
}
