#[cfg(target_os = "windows")]
use std::env;
use std::ffi::OsStr;
#[cfg(target_os = "windows")]
use std::path::{Path, PathBuf};
#[cfg(windows)]
use std::process::Stdio;

use tokio::process::{Child, Command};

/// On Windows, spawning a console app from a GUI subsystem app will open a new
/// console window unless we explicitly disable it.
fn hide_console_on_windows(_command: &mut std::process::Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        _command.creation_flags(CREATE_NO_WINDOW);
    }
}

pub(crate) fn tokio_command(program: impl AsRef<OsStr>) -> Command {
    let mut command = Command::new(program);
    hide_console_on_windows(command.as_std_mut());
    command
}

pub(crate) fn std_command(program: impl AsRef<OsStr>) -> std::process::Command {
    let mut command = std::process::Command::new(program);
    hide_console_on_windows(&mut command);
    command
}

pub(crate) async fn kill_child_process_tree(child: &mut Child) {
    #[cfg(windows)]
    {
        if let Some(pid) = child.id() {
            let _ = tokio_command("taskkill")
                .arg("/PID")
                .arg(pid.to_string())
                .arg("/T")
                .arg("/F")
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status()
                .await;
        }
    }

    let _ = child.kill().await;
}

#[cfg(target_os = "windows")]
pub(crate) fn resolve_windows_executable(program: &str, path_env: Option<&str>) -> Option<PathBuf> {
    let trimmed = program.trim();
    if trimmed.is_empty() {
        return None;
    }

    let program = trimmed
        .strip_prefix('"')
        .and_then(|value| value.strip_suffix('"'))
        .unwrap_or(trimmed)
        .trim();

    if program.is_empty() {
        return None;
    }

    let has_separators = program.contains('\\') || program.contains('/');
    let has_drive = matches!(program.as_bytes().get(1), Some(b':'));
    let looks_like_path = has_separators || has_drive;

    let path_candidates = if Path::new(program).extension().is_some() {
        vec![program.to_string()]
    } else {
        vec![
            format!("{program}.exe"),
            format!("{program}.cmd"),
            format!("{program}.bat"),
            format!("{program}.com"),
        ]
    };

    if looks_like_path {
        for candidate in path_candidates {
            let path = PathBuf::from(candidate);
            if path.is_file() {
                return Some(path);
            }
        }
        return None;
    }

    let paths: Vec<PathBuf> = if let Some(value) = path_env {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            Vec::new()
        } else {
            env::split_paths(trimmed).collect()
        }
    } else {
        env::var_os("PATH")
            .map(|value| env::split_paths(&value).collect())
            .unwrap_or_default()
    };

    for root in paths {
        for candidate in &path_candidates {
            let path = root.join(candidate);
            if path.is_file() {
                return Some(path);
            }
        }
    }

    None
}

#[cfg(target_os = "windows")]
fn validate_cmd_token(value: &str) -> Result<(), String> {
    if value.contains('\0') {
        return Err("Windows cmd wrapper does not support NUL bytes.".to_string());
    }
    if value.contains('\n') || value.contains('\r') {
        return Err("Windows cmd wrapper does not support newline characters.".to_string());
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn quote_cmd_token(value: &str) -> Result<String, String> {
    validate_cmd_token(value)?;
    let mut escaped = String::with_capacity(value.len());
    for ch in value.chars() {
        match ch {
            '^' => escaped.push_str("^^"),
            '"' => escaped.push_str("^\""),
            '%' => escaped.push_str("^%"),
            '!' => escaped.push_str("^!"),
            _ => escaped.push(ch),
        }
    }
    Ok(format!("\"{escaped}\""))
}

/// Builds a single `cmd.exe /C "<command>"` payload that safely treats each argument as data
/// (protects cmd metacharacters like `&`, `|`, `>`, `<`) by always quoting tokens and escaping
/// command-processor syntax in the token text (`^`, `"`, `%`, `!`).
///
/// Returns a string that already includes the required outer quotes, suitable to be passed as
/// *one* argument after `/C` (usually with `/S`).
#[cfg(target_os = "windows")]
pub(crate) fn build_cmd_c_command(program: &Path, args: &[String]) -> Result<String, String> {
    let program_str = program.to_string_lossy();
    let mut parts: Vec<String> = Vec::with_capacity(args.len() + 1);
    parts.push(quote_cmd_token(program_str.as_ref())?);
    for arg in args {
        parts.push(quote_cmd_token(arg)?);
    }
    let inner = parts.join(" ");
    Ok(format!("\"{inner}\""))
}
