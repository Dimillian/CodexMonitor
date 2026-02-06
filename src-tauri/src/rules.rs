use std::fs;
use std::fs::OpenOptions;
use std::path::{Path, PathBuf};
use std::thread;
use std::time::{Duration, Instant, SystemTime};

const RULES_DIR: &str = "rules";
const DEFAULT_RULES_FILE: &str = "default.rules";

pub(crate) fn default_rules_path(codex_home: &Path) -> PathBuf {
    codex_home.join(RULES_DIR).join(DEFAULT_RULES_FILE)
}

pub(crate) fn append_prefix_rule(path: &Path, pattern: &[String]) -> Result<(), String> {
    if pattern.is_empty() {
        return Err("empty command pattern".to_string());
    }

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }

    let _lock = acquire_rules_lock(path)?;
    let existing = fs::read_to_string(path).unwrap_or_default();
    if rule_already_present(&existing, pattern) {
        return Ok(());
    }
    let mut updated = existing;

    if !updated.is_empty() && !updated.ends_with('\n') {
        updated.push('\n');
    }
    if !updated.is_empty() {
        updated.push('\n');
    }

    let rule = format_prefix_rule(pattern);
    updated.push_str(&rule);

    if !updated.ends_with('\n') {
        updated.push('\n');
    }

    fs::write(path, updated).map_err(|err| err.to_string())
}

struct RulesFileLock {
    path: PathBuf,
}

impl Drop for RulesFileLock {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.path);
    }
}

fn acquire_rules_lock(path: &Path) -> Result<RulesFileLock, String> {
    let lock_path = path.with_extension("lock");
    let deadline = Instant::now() + Duration::from_secs(2);
    let stale_after = Duration::from_secs(30);

    loop {
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&lock_path)
        {
            Ok(_) => return Ok(RulesFileLock { path: lock_path }),
            Err(err) if err.kind() == std::io::ErrorKind::AlreadyExists => {
                if is_lock_stale(&lock_path, stale_after) {
                    let _ = fs::remove_file(&lock_path);
                    continue;
                }
                if Instant::now() >= deadline {
                    return Err("timed out waiting for rules file lock".to_string());
                }
                thread::sleep(Duration::from_millis(50));
            }
            Err(err) => return Err(err.to_string()),
        }
    }
}

fn is_lock_stale(path: &Path, stale_after: Duration) -> bool {
    let Ok(metadata) = fs::metadata(path) else {
        return false;
    };
    let Ok(modified) = metadata.modified() else {
        return false;
    };
    let Ok(age) = SystemTime::now().duration_since(modified) else {
        return false;
    };
    age > stale_after
}

fn format_prefix_rule(pattern: &[String]) -> String {
    let items = format_pattern_list(pattern);
    format!(
        "prefix_rule(\n    pattern = [{items}],\n    decision = \"allow\",\n)\n"
    )
}

fn format_pattern_list(pattern: &[String]) -> String {
    pattern
        .iter()
        .map(|item| format!("\"{}\"", escape_string(item)))
        .collect::<Vec<_>>()
        .join(", ")
}

fn rule_already_present(contents: &str, pattern: &[String]) -> bool {
    let target_pattern = normalize_rule_value(&format!("[{}]", format_pattern_list(pattern)));
    let mut in_rule = false;
    let mut pattern_matches = false;
    let mut decision_allows = false;

    for line in contents.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("prefix_rule(") {
            in_rule = true;
            pattern_matches = false;
            decision_allows = false;
            continue;
        }
        if !in_rule {
            continue;
        }
        if trimmed.starts_with("pattern") {
            if let Some((_, value)) = trimmed.split_once('=') {
                let candidate = value.trim().trim_end_matches(',');
                if normalize_rule_value(candidate) == target_pattern {
                    pattern_matches = true;
                }
            }
        } else if trimmed.starts_with("decision") {
            if let Some((_, value)) = trimmed.split_once('=') {
                let candidate = value.trim().trim_end_matches(',');
                if candidate.contains("\"allow\"") || candidate.contains("'allow'") {
                    decision_allows = true;
                }
            }
        } else if trimmed.starts_with(')') {
            if pattern_matches && decision_allows {
                return true;
            }
            in_rule = false;
        }
    }
    false
}

fn normalize_rule_value(value: &str) -> String {
    value.chars().filter(|ch| !ch.is_whitespace()).collect()
}

fn escape_string(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('\"', "\\\"")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
        .replace('\t', "\\t")
}
