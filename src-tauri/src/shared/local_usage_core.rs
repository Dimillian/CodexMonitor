use chrono::{DateTime, Duration, Local, TimeZone, Utc};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::Mutex;

use crate::codex::home::{resolve_default_codex_home, resolve_workspace_codex_home};
use crate::types::{
    LocalUsageDay, LocalUsageModel, LocalUsageSnapshot, LocalUsageTotals, WorkspaceEntry,
};

#[derive(Default, Clone, Copy)]
struct DailyTotals {
    input: i64,
    cached: i64,
    output: i64,
    agent_ms: i64,
    agent_runs: i64,
}

#[derive(Default, Clone, Copy, PartialEq, Eq, Hash)]
struct UsageTotals {
    input: i64,
    cached: i64,
    output: i64,
}

#[derive(PartialEq, Eq, Hash)]
enum UsageIdentity {
    Request(String),
    Legacy(String, i64, UsageTotals),
}

struct UsageEntry {
    timestamp_ms: i64,
    usage: UsageTotals,
    model: String,
    identity: UsageIdentity,
}

const MAX_ACTIVITY_GAP_MS: i64 = 2 * 60 * 1000;

pub(crate) async fn local_usage_snapshot_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    days: Option<u32>,
    workspace_path: Option<String>,
) -> Result<LocalUsageSnapshot, String> {
    let days = days.unwrap_or(30).clamp(1, 90);
    let workspace_path = workspace_path.and_then(|value| {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(PathBuf::from(trimmed))
        }
    });
    let sessions_roots = {
        let workspaces = workspaces.lock().await;
        resolve_sessions_roots(&workspaces, workspace_path.as_deref())
    };
    let snapshot = tokio::task::spawn_blocking(move || {
        scan_local_usage(days, workspace_path.as_deref(), &sessions_roots)
    })
    .await
    .map_err(|err| err.to_string())??;
    Ok(snapshot)
}

fn scan_local_usage(
    days: u32,
    workspace_path: Option<&Path>,
    sessions_roots: &[PathBuf],
) -> Result<LocalUsageSnapshot, String> {
    let updated_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;

    let day_keys = make_day_keys(days);
    let mut daily: HashMap<String, DailyTotals> = day_keys
        .iter()
        .map(|key| (key.clone(), DailyTotals::default()))
        .collect();
    let mut model_totals: HashMap<String, i64> = HashMap::new();
    let mut seen_usage = HashSet::new();

    if sessions_roots.is_empty() {
        return Ok(build_snapshot(updated_at, day_keys, daily, HashMap::new()));
    }

    for root in sessions_roots {
        for day_key in &day_keys {
            let day_dir = day_dir_for_key(root, day_key);
            if !day_dir.exists() {
                continue;
            }
            let entries = match std::fs::read_dir(&day_dir) {
                Ok(entries) => entries,
                Err(_) => continue,
            };
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|ext| ext.to_str()) != Some("jsonl") {
                    continue;
                }
                scan_file(
                    &path,
                    &mut daily,
                    &mut model_totals,
                    workspace_path,
                    &mut seen_usage,
                )?;
            }
        }
    }

    Ok(build_snapshot(updated_at, day_keys, daily, model_totals))
}

fn build_snapshot(
    updated_at: i64,
    day_keys: Vec<String>,
    daily: HashMap<String, DailyTotals>,
    model_totals: HashMap<String, i64>,
) -> LocalUsageSnapshot {
    let mut days: Vec<LocalUsageDay> = Vec::with_capacity(day_keys.len());
    let mut total_tokens = 0;

    for day_key in &day_keys {
        let totals = daily.get(day_key).copied().unwrap_or_default();
        let total = totals.input + totals.output;
        total_tokens += total;
        days.push(LocalUsageDay {
            day: day_key.clone(),
            input_tokens: totals.input,
            cached_input_tokens: totals.cached,
            output_tokens: totals.output,
            total_tokens: total,
            agent_time_ms: totals.agent_ms,
            agent_runs: totals.agent_runs,
        });
    }

    let last7 = days.iter().rev().take(7).cloned().collect::<Vec<_>>();
    let last7_tokens: i64 = last7.iter().map(|day| day.total_tokens).sum();
    let last7_input: i64 = last7.iter().map(|day| day.input_tokens).sum();
    let last7_cached: i64 = last7.iter().map(|day| day.cached_input_tokens).sum();

    let average_daily_tokens = if last7.is_empty() {
        0
    } else {
        ((last7_tokens as f64) / (last7.len() as f64)).round() as i64
    };

    let cache_hit_rate_percent = if last7_input > 0 {
        ((last7_cached as f64) / (last7_input as f64) * 1000.0).round() / 10.0
    } else {
        0.0
    };

    let peak = days
        .iter()
        .max_by_key(|day| day.total_tokens)
        .filter(|day| day.total_tokens > 0);
    let peak_day = peak.map(|day| day.day.clone());
    let peak_day_tokens = peak.map(|day| day.total_tokens).unwrap_or(0);

    let mut top_models: Vec<LocalUsageModel> = model_totals
        .into_iter()
        .filter(|(model, tokens)| model != "unknown" && *tokens > 0)
        .map(|(model, tokens)| LocalUsageModel {
            model,
            tokens,
            share_percent: if total_tokens > 0 {
                ((tokens as f64) / (total_tokens as f64) * 1000.0).round() / 10.0
            } else {
                0.0
            },
        })
        .collect();
    top_models.sort_by(|a, b| b.tokens.cmp(&a.tokens));
    top_models.truncate(4);

    LocalUsageSnapshot {
        updated_at,
        days,
        totals: LocalUsageTotals {
            last7_days_tokens: last7_tokens,
            last30_days_tokens: total_tokens,
            average_daily_tokens,
            cache_hit_rate_percent,
            peak_day,
            peak_day_tokens,
        },
        top_models,
    }
}

fn scan_file(
    path: &Path,
    daily: &mut HashMap<String, DailyTotals>,
    model_totals: &mut HashMap<String, i64>,
    workspace_path: Option<&Path>,
    seen_usage: &mut HashSet<UsageIdentity>,
) -> Result<(), String> {
    let file = match File::open(path) {
        Ok(file) => file,
        Err(_) => {
            return Ok(());
        }
    };
    let reader = BufReader::new(file);
    let mut previous_totals: Option<UsageTotals> = None;
    let mut session_id = path.to_string_lossy().into_owned();
    let mut legacy_usage = Vec::new();
    let mut has_request_usage = false;
    let mut current_model: Option<String> = None;
    let mut last_activity_ms: Option<i64> = None;
    let mut seen_runs: HashSet<i64> = HashSet::new();
    let mut match_known = workspace_path.is_none();
    let mut matches_workspace = workspace_path.is_none();

    for line in reader.lines() {
        let line = match line {
            Ok(line) => line,
            Err(_) => continue,
        };
        if line.len() > 512_000 {
            continue;
        }

        let value = match serde_json::from_str::<Value>(&line) {
            Ok(value) => value,
            Err(_) => continue,
        };
        let entry_type = value
            .get("type")
            .and_then(|value| value.as_str())
            .unwrap_or("");

        if entry_type == "session_meta" || entry_type == "turn_context" {
            if let Some(cwd) = extract_cwd(&value) {
                if let Some(filter) = workspace_path {
                    matches_workspace = path_matches_workspace(&cwd, filter);
                    match_known = true;
                    if !matches_workspace {
                        break;
                    }
                }
            }
        }

        if entry_type == "turn_context" {
            if let Some(model) = extract_model_from_turn_context(&value) {
                current_model = Some(model);
            }
            continue;
        }

        if entry_type == "session_meta" {
            if let Some(id) = value.pointer("/payload/id").and_then(Value::as_str) {
                session_id = id.to_string();
            }
            continue;
        }

        if !matches_workspace {
            if match_known {
                break;
            }
            continue;
        }

        if !match_known {
            continue;
        }

        if entry_type == "token_usage_record" {
            if let (Some(usage), Some(timestamp_ms)) = (
                value.pointer("/payload/usage").and_then(Value::as_object),
                read_timestamp_ms(&value),
            ) {
                has_request_usage = true;
                legacy_usage.clear();
                let usage = read_usage_totals(usage);
                let identity = value
                    .pointer("/payload/response_id")
                    .and_then(Value::as_str)
                    .filter(|id| !id.is_empty())
                    .map(|id| UsageIdentity::Request(id.to_string()))
                    .unwrap_or_else(|| {
                        UsageIdentity::Legacy(session_id.clone(), timestamp_ms, usage)
                    });
                record_usage(
                    UsageEntry {
                        timestamp_ms,
                        usage,
                        model: current_model
                            .clone()
                            .unwrap_or_else(|| "unknown".to_string()),
                        identity,
                    },
                    daily,
                    model_totals,
                    seen_usage,
                );
                track_activity(daily, &mut last_activity_ms, timestamp_ms);
            }
            continue;
        }

        if entry_type == "event_msg" || entry_type.is_empty() {
            let payload = value.get("payload").and_then(|value| value.as_object());
            let payload_type = payload
                .and_then(|payload| payload.get("type"))
                .and_then(|value| value.as_str());

            if payload_type == Some("agent_message") {
                if let Some(timestamp_ms) = read_timestamp_ms(&value) {
                    if seen_runs.insert(timestamp_ms) {
                        if let Some(day_key) = day_key_for_timestamp_ms(timestamp_ms) {
                            if let Some(entry) = daily.get_mut(&day_key) {
                                entry.agent_runs += 1;
                            }
                        }
                    }
                    track_activity(daily, &mut last_activity_ms, timestamp_ms);
                }
                continue;
            }

            if payload_type == Some("agent_reasoning") {
                if let Some(timestamp_ms) = read_timestamp_ms(&value) {
                    track_activity(daily, &mut last_activity_ms, timestamp_ms);
                }
                continue;
            }

            if payload_type != Some("token_count") {
                continue;
            }

            let timestamp_ms = read_timestamp_ms(&value);
            if !has_request_usage {
                if let Some(info) = payload
                    .and_then(|payload| payload.get("info"))
                    .and_then(Value::as_object)
                {
                    if let (Some(usage), Some(timestamp_ms)) =
                        (legacy_usage_delta(info, &mut previous_totals), timestamp_ms)
                    {
                        legacy_usage.push(UsageEntry {
                            timestamp_ms,
                            usage,
                            model: current_model
                                .clone()
                                .or_else(|| extract_model_from_token_count(&value))
                                .unwrap_or_else(|| "unknown".to_string()),
                            identity: UsageIdentity::Legacy(
                                session_id.clone(),
                                timestamp_ms,
                                usage,
                            ),
                        });
                    }
                }
            }

            if let Some(timestamp_ms) = timestamp_ms {
                track_activity(daily, &mut last_activity_ms, timestamp_ms);
            }
            continue;
        }

        if entry_type == "response_item" {
            let payload = value.get("payload").and_then(|value| value.as_object());
            let payload_type = payload
                .and_then(|payload| payload.get("type"))
                .and_then(|value| value.as_str());
            let role = payload
                .and_then(|payload| payload.get("role"))
                .and_then(|value| value.as_str())
                .unwrap_or("");

            if role == "assistant" {
                if let Some(timestamp_ms) = read_timestamp_ms(&value) {
                    if seen_runs.insert(timestamp_ms) {
                        if let Some(day_key) = day_key_for_timestamp_ms(timestamp_ms) {
                            if let Some(entry) = daily.get_mut(&day_key) {
                                entry.agent_runs += 1;
                            }
                        }
                    }
                    track_activity(daily, &mut last_activity_ms, timestamp_ms);
                }
            } else if payload_type != Some("message") {
                if let Some(timestamp_ms) = read_timestamp_ms(&value) {
                    track_activity(daily, &mut last_activity_ms, timestamp_ms);
                }
            }
        }
    }

    // Request records are authoritative for modern files. Buffer legacy counters so
    // display events preceding (or delayed after) a request cannot count it twice.
    if !has_request_usage {
        for entry in legacy_usage {
            record_usage(entry, daily, model_totals, seen_usage);
        }
    }

    Ok(())
}

fn read_usage_totals(map: &serde_json::Map<String, Value>) -> UsageTotals {
    UsageTotals {
        input: read_i64(map, &["input_tokens", "inputTokens"]).max(0),
        cached: read_i64(
            map,
            &[
                "cached_input_tokens",
                "cache_read_input_tokens",
                "cachedInputTokens",
                "cacheReadInputTokens",
            ],
        )
        .max(0),
        output: read_i64(map, &["output_tokens", "outputTokens"]).max(0),
    }
}

fn legacy_usage_delta(
    info: &serde_json::Map<String, Value>,
    previous_totals: &mut Option<UsageTotals>,
) -> Option<UsageTotals> {
    let total =
        find_usage_map(info, &["total_token_usage", "totalTokenUsage"]).map(read_usage_totals);
    let last = find_usage_map(info, &["last_token_usage", "lastTokenUsage"]).map(read_usage_totals);
    if let Some(total) = total {
        let previous = previous_totals.replace(total);
        if let Some(previous) = previous {
            // Repeated display snapshots and counter resets are not new requests.
            if total == previous
                || total.input < previous.input
                || total.cached < previous.cached
                || total.output < previous.output
            {
                return None;
            }
            return last.or(Some(UsageTotals {
                input: total.input - previous.input,
                cached: total.cached - previous.cached,
                output: total.output - previous.output,
            }));
        }
        // A continuation can inherit arbitrary history; only its per-request
        // usage is countable. Cumulative-only first records establish a baseline.
        return last;
    }
    if let (Some(last), Some(previous)) = (last, previous_totals.as_mut()) {
        previous.input += last.input;
        previous.cached += last.cached;
        previous.output += last.output;
    }
    last
}

fn record_usage(
    entry: UsageEntry,
    daily: &mut HashMap<String, DailyTotals>,
    model_totals: &mut HashMap<String, i64>,
    seen_usage: &mut HashSet<UsageIdentity>,
) {
    let Some(day_key) = day_key_for_timestamp_ms(entry.timestamp_ms) else {
        return;
    };
    let Some(totals) = daily.get_mut(&day_key) else {
        return;
    };
    if !seen_usage.insert(entry.identity) {
        return;
    }
    totals.input += entry.usage.input;
    totals.cached += entry.usage.cached.min(entry.usage.input);
    totals.output += entry.usage.output;
    *model_totals.entry(entry.model).or_insert(0) += entry.usage.input + entry.usage.output;
}

fn extract_model_from_turn_context(value: &Value) -> Option<String> {
    let payload = value.get("payload").and_then(|value| value.as_object())?;
    if let Some(model) = payload.get("model").and_then(|value| value.as_str()) {
        return Some(model.to_string());
    }
    let info = payload.get("info").and_then(|value| value.as_object())?;
    info.get("model")
        .and_then(|value| value.as_str())
        .map(|value| value.to_string())
}

fn extract_model_from_token_count(value: &Value) -> Option<String> {
    let payload = value.get("payload").and_then(|value| value.as_object())?;
    let info = payload.get("info").and_then(|value| value.as_object());
    let model = info
        .and_then(|info| {
            info.get("model")
                .or_else(|| info.get("model_name"))
                .and_then(|value| value.as_str())
        })
        .or_else(|| payload.get("model").and_then(|value| value.as_str()))
        .or_else(|| value.get("model").and_then(|value| value.as_str()));
    model.map(|value| value.to_string())
}

fn find_usage_map<'a>(
    info: &'a serde_json::Map<String, Value>,
    keys: &[&str],
) -> Option<&'a serde_json::Map<String, Value>> {
    keys.iter()
        .find_map(|key| info.get(*key).and_then(|value| value.as_object()))
}

fn read_i64(map: &serde_json::Map<String, Value>, keys: &[&str]) -> i64 {
    keys.iter()
        .find_map(|key| map.get(*key))
        .and_then(|value| {
            value
                .as_i64()
                .or_else(|| value.as_f64().map(|value| value as i64))
        })
        .unwrap_or(0)
}

fn read_timestamp_ms(value: &Value) -> Option<i64> {
    let raw = value.get("timestamp")?;
    if let Some(text) = raw.as_str() {
        return DateTime::parse_from_rfc3339(text)
            .map(|value| value.timestamp_millis())
            .ok();
    }
    let numeric = raw
        .as_i64()
        .or_else(|| raw.as_f64().map(|value| value as i64))?;
    if numeric > 0 && numeric < 1_000_000_000_000 {
        return Some(numeric * 1000);
    }
    Some(numeric)
}

fn track_activity(
    daily: &mut HashMap<String, DailyTotals>,
    last_activity_ms: &mut Option<i64>,
    timestamp_ms: i64,
) {
    if let Some(prev_ms) = *last_activity_ms {
        let delta = timestamp_ms - prev_ms;
        if delta > 0 && delta <= MAX_ACTIVITY_GAP_MS {
            if let Some(day_key) = day_key_for_timestamp_ms(timestamp_ms) {
                if let Some(entry) = daily.get_mut(&day_key) {
                    entry.agent_ms += delta;
                }
            }
        }
    }
    *last_activity_ms = Some(timestamp_ms);
}

fn day_key_for_timestamp_ms(timestamp_ms: i64) -> Option<String> {
    let utc = Utc.timestamp_millis_opt(timestamp_ms).single()?;
    Some(utc.with_timezone(&Local).format("%Y-%m-%d").to_string())
}

fn extract_cwd(value: &Value) -> Option<String> {
    value
        .get("payload")
        .and_then(|payload| payload.get("cwd"))
        .and_then(|cwd| cwd.as_str())
        .map(|cwd| cwd.to_string())
}

fn path_matches_workspace(cwd: &str, workspace_path: &Path) -> bool {
    let cwd_path = Path::new(cwd);
    cwd_path == workspace_path || cwd_path.starts_with(workspace_path)
}

fn make_day_keys(days: u32) -> Vec<String> {
    let today = Local::now().date_naive();
    (0..days)
        .rev()
        .map(|offset| {
            let day = today - Duration::days(offset as i64);
            day.format("%Y-%m-%d").to_string()
        })
        .collect()
}

fn resolve_codex_sessions_root(codex_home_override: Option<PathBuf>) -> Option<PathBuf> {
    codex_home_override
        .or_else(resolve_default_codex_home)
        .map(|home| home.join("sessions"))
}

fn resolve_sessions_roots(
    workspaces: &HashMap<String, WorkspaceEntry>,
    workspace_path: Option<&Path>,
) -> Vec<PathBuf> {
    if let Some(workspace_path) = workspace_path {
        let codex_home_override =
            resolve_workspace_codex_home_for_path(workspaces, Some(workspace_path));
        return resolve_codex_sessions_root(codex_home_override)
            .into_iter()
            .collect();
    }

    let mut roots = Vec::new();
    let mut seen = HashSet::new();

    if let Some(root) = resolve_codex_sessions_root(None) {
        if seen.insert(root.clone()) {
            roots.push(root);
        }
    }

    for entry in workspaces.values() {
        let parent_entry = entry
            .parent_id
            .as_ref()
            .and_then(|parent_id| workspaces.get(parent_id));
        let Some(codex_home) = resolve_workspace_codex_home(entry, parent_entry) else {
            continue;
        };
        if let Some(root) = resolve_codex_sessions_root(Some(codex_home)) {
            if seen.insert(root.clone()) {
                roots.push(root);
            }
        }
    }

    roots
}

fn resolve_workspace_codex_home_for_path(
    workspaces: &HashMap<String, crate::types::WorkspaceEntry>,
    workspace_path: Option<&Path>,
) -> Option<PathBuf> {
    let workspace_path = workspace_path?;
    let entry = workspaces
        .values()
        .filter(|entry| {
            let entry_path = Path::new(&entry.path);
            workspace_path == entry_path || workspace_path.starts_with(entry_path)
        })
        .max_by_key(|entry| entry.path.len())?;

    let parent_entry = entry
        .parent_id
        .as_ref()
        .and_then(|parent_id| workspaces.get(parent_id));

    resolve_workspace_codex_home(entry, parent_entry)
}

fn day_dir_for_key(root: &Path, day_key: &str) -> PathBuf {
    let mut parts = day_key.split('-');
    let year = parts.next().unwrap_or("1970");
    let month = parts.next().unwrap_or("01");
    let day = parts.next().unwrap_or("01");
    root.join(year).join(month).join(day)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{WorkspaceKind, WorkspaceSettings};
    use chrono::NaiveDateTime;
    use std::io::Write;
    use std::path::Path;
    use std::{fs, path::PathBuf};
    use uuid::Uuid;

    fn write_temp_jsonl(lines: &[&str]) -> PathBuf {
        let mut path = std::env::temp_dir();
        path.push(format!(
            "codexmonitor-local-usage-test-{}.jsonl",
            Uuid::new_v4()
        ));
        let mut file = File::create(&path).expect("create temp jsonl");
        for line in lines {
            writeln!(file, "{line}").expect("write jsonl line");
        }
        path
    }

    fn make_temp_sessions_root() -> PathBuf {
        let mut root = std::env::temp_dir();
        root.push(format!("codexmonitor-local-usage-root-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).expect("create temp root");
        root
    }

    fn write_session_file(root: &Path, day_key: &str, lines: &[String]) -> PathBuf {
        let day_dir = day_dir_for_key(root, day_key);
        fs::create_dir_all(&day_dir).expect("create day dir");
        let path = day_dir.join(format!("usage-{}.jsonl", Uuid::new_v4()));
        let mut file = File::create(&path).expect("create session jsonl");
        for line in lines {
            writeln!(file, "{line}").expect("write jsonl line");
        }
        path
    }

    #[test]
    fn scan_file_does_not_double_count_last_and_total_usage() {
        let day_key = "2026-01-19";
        let path = write_temp_jsonl(&[
            r#"{"timestamp":"2026-01-19T12:00:00.000Z","payload":{"type":"token_count","info":{"last_token_usage":{"input_tokens":10,"cached_input_tokens":0,"output_tokens":5}}}}"#,
            r#"{"timestamp":"2026-01-19T12:00:01.000Z","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":10,"cached_input_tokens":0,"output_tokens":5}}}}"#,
        ]);

        let mut daily: HashMap<String, DailyTotals> = HashMap::new();
        daily.insert(day_key.to_string(), DailyTotals::default());
        let mut model_totals: HashMap<String, i64> = HashMap::new();
        scan_file(
            &path,
            &mut daily,
            &mut model_totals,
            None,
            &mut HashSet::new(),
        )
        .expect("scan file");

        let totals = daily.get(day_key).copied().unwrap_or_default();
        assert_eq!(totals.input, 10);
        assert_eq!(totals.output, 5);
    }

    #[test]
    fn scan_file_treats_first_total_after_last_as_baseline() {
        let day_key = "2026-01-19";
        let path = write_temp_jsonl(&[
            r#"{"timestamp":"2026-01-19T12:00:00.000Z","payload":{"type":"token_count","info":{"last_token_usage":{"input_tokens":10,"cached_input_tokens":0,"output_tokens":5}}}}"#,
            r#"{"timestamp":"2026-01-19T12:00:01.000Z","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":20,"cached_input_tokens":0,"output_tokens":10}}}}"#,
        ]);

        let mut daily: HashMap<String, DailyTotals> = HashMap::new();
        daily.insert(day_key.to_string(), DailyTotals::default());
        let mut model_totals: HashMap<String, i64> = HashMap::new();
        scan_file(
            &path,
            &mut daily,
            &mut model_totals,
            None,
            &mut HashSet::new(),
        )
        .expect("scan file");

        let totals = daily.get(day_key).copied().unwrap_or_default();
        assert_eq!(totals.input, 10);
        assert_eq!(totals.output, 5);
    }

    #[test]
    fn scan_file_does_not_double_count_last_between_total_snapshots() {
        let day_key = "2026-01-19";
        let path = write_temp_jsonl(&[
            r#"{"timestamp":"2026-01-19T12:00:00.000Z","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":10,"cached_input_tokens":0,"output_tokens":5}}}}"#,
            r#"{"timestamp":"2026-01-19T12:00:01.000Z","payload":{"type":"token_count","info":{"last_token_usage":{"input_tokens":2,"cached_input_tokens":0,"output_tokens":1}}}}"#,
            r#"{"timestamp":"2026-01-19T12:00:02.000Z","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":12,"cached_input_tokens":0,"output_tokens":6}}}}"#,
        ]);

        let mut daily: HashMap<String, DailyTotals> = HashMap::new();
        daily.insert(day_key.to_string(), DailyTotals::default());
        let mut model_totals: HashMap<String, i64> = HashMap::new();
        scan_file(
            &path,
            &mut daily,
            &mut model_totals,
            None,
            &mut HashSet::new(),
        )
        .expect("scan file");

        let totals = daily.get(day_key).copied().unwrap_or_default();
        assert_eq!(totals.input, 2);
        assert_eq!(totals.output, 1);
    }

    #[test]
    fn scan_file_tracks_agent_time_from_activity() {
        let day_key = "2026-01-19";
        let path = write_temp_jsonl(&[
            r#"{"timestamp":"2026-01-19T12:00:00.000Z","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":1,"cached_input_tokens":0,"output_tokens":1}}}}"#,
            r#"{"timestamp":"2026-01-19T12:00:05.000Z","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":2,"cached_input_tokens":0,"output_tokens":2}}}}"#,
        ]);

        let mut daily: HashMap<String, DailyTotals> = HashMap::new();
        daily.insert(day_key.to_string(), DailyTotals::default());
        let mut model_totals: HashMap<String, i64> = HashMap::new();
        scan_file(
            &path,
            &mut daily,
            &mut model_totals,
            None,
            &mut HashSet::new(),
        )
        .expect("scan file");

        let totals = daily.get(day_key).copied().unwrap_or_default();
        assert_eq!(totals.agent_ms, 5_000);
    }

    #[test]
    fn scan_file_counts_runs_from_assistant_messages() {
        let day_key = "2026-01-19";
        let path = write_temp_jsonl(&[
            r#"{"timestamp":"2026-01-19T12:00:05.000Z","type":"response_item","payload":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"a"}]}}"#,
            r#"{"timestamp":"2026-01-19T12:00:10.000Z","type":"response_item","payload":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"b"}]}}"#,
        ]);

        let mut daily: HashMap<String, DailyTotals> = HashMap::new();
        daily.insert(day_key.to_string(), DailyTotals::default());
        let mut model_totals: HashMap<String, i64> = HashMap::new();
        scan_file(
            &path,
            &mut daily,
            &mut model_totals,
            None,
            &mut HashSet::new(),
        )
        .expect("scan file");

        let totals = daily.get(day_key).copied().unwrap_or_default();
        assert_eq!(totals.agent_runs, 2);
    }

    #[test]
    fn scan_file_ignores_large_gaps_between_activity() {
        let day_key = "2026-01-19";
        let path = write_temp_jsonl(&[
            r#"{"timestamp":"2026-01-19T12:00:00.000Z","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":1,"cached_input_tokens":0,"output_tokens":1}}}}"#,
            r#"{"timestamp":"2026-01-19T12:10:00.000Z","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":2,"cached_input_tokens":0,"output_tokens":2}}}}"#,
            r#"{"timestamp":"2026-01-19T12:10:10.000Z","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":3,"cached_input_tokens":0,"output_tokens":3}}}}"#,
        ]);

        let mut daily: HashMap<String, DailyTotals> = HashMap::new();
        daily.insert(day_key.to_string(), DailyTotals::default());
        let mut model_totals: HashMap<String, i64> = HashMap::new();
        scan_file(
            &path,
            &mut daily,
            &mut model_totals,
            None,
            &mut HashSet::new(),
        )
        .expect("scan file");

        let totals = daily.get(day_key).copied().unwrap_or_default();
        assert_eq!(totals.agent_ms, 10_000);
    }

    #[test]
    fn scan_file_skips_workspace_mismatch() {
        let day_key = "2026-01-19";
        let path = write_temp_jsonl(&[
            r#"{"timestamp":"2026-01-19T12:00:00.000Z","type":"session_meta","payload":{"cwd":"/tmp/project-alpha"}}"#,
            r#"{"timestamp":"2026-01-19T12:00:10.000Z","type":"response_item","payload":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"ok"}]}}"#,
            r#"{"timestamp":"2026-01-19T12:00:12.000Z","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":10,"cached_input_tokens":0,"output_tokens":5}}}}"#,
        ]);

        let mut daily: HashMap<String, DailyTotals> = HashMap::new();
        daily.insert(day_key.to_string(), DailyTotals::default());
        let mut model_totals: HashMap<String, i64> = HashMap::new();
        scan_file(
            &path,
            &mut daily,
            &mut model_totals,
            Some(Path::new("/tmp/other-project")),
            &mut HashSet::new(),
        )
        .expect("scan file");

        let totals = daily.get(day_key).copied().unwrap_or_default();
        assert_eq!(totals.agent_ms, 0);
        assert_eq!(totals.input, 0);
    }

    #[test]
    fn scan_local_usage_aggregates_multiple_session_roots() {
        let day_keys = make_day_keys(2);
        let day_key = day_keys
            .last()
            .cloned()
            .unwrap_or_else(|| Local::now().format("%Y-%m-%d").to_string());
        let naive =
            NaiveDateTime::parse_from_str(&format!("{day_key} 12:00:00"), "%Y-%m-%d %H:%M:%S")
                .expect("timestamp");
        let timestamp_ms = Local
            .from_local_datetime(&naive)
            .single()
            .expect("timestamp")
            .timestamp_millis();

        let root_a = make_temp_sessions_root();
        let root_b = make_temp_sessions_root();

        let line_a = format!(
            r#"{{"timestamp":{timestamp_ms},"payload":{{"type":"token_count","info":{{"last_token_usage":{{"input_tokens":5,"cached_input_tokens":0,"output_tokens":2}}}}}}}}"#
        );
        let line_b = format!(
            r#"{{"timestamp":{timestamp_ms},"payload":{{"type":"token_count","info":{{"last_token_usage":{{"input_tokens":3,"cached_input_tokens":0,"output_tokens":1}}}}}}}}"#
        );

        write_session_file(&root_a, &day_key, &[line_a]);
        write_session_file(&root_b, &day_key, &[line_b]);

        let snapshot = scan_local_usage(2, None, &[root_a, root_b]).expect("scan usage");
        let day = snapshot
            .days
            .iter()
            .find(|entry| entry.day == day_key)
            .expect("day entry");

        assert_eq!(day.input_tokens, 8);
        assert_eq!(day.output_tokens, 3);
        assert_eq!(snapshot.totals.last30_days_tokens, 11);
    }

    fn fixture_timestamp() -> i64 {
        Local::now().timestamp_millis()
    }

    fn legacy_record(timestamp: i64, total: i64, last: Option<i64>) -> Value {
        let mut info = serde_json::json!({
            "total_token_usage": {"input_tokens": total, "output_tokens": 0}
        });
        if let Some(last) = last {
            info["last_token_usage"] =
                serde_json::json!({"input_tokens": last, "output_tokens": 0});
        }
        serde_json::json!({
            "timestamp": timestamp, "type": "event_msg",
            "payload": {"type": "token_count", "info": info}
        })
    }

    fn request_record(timestamp: i64, response_id: &str, usage: Value) -> Value {
        serde_json::json!({
            "timestamp": timestamp, "type": "token_usage_record",
            "payload": {"response_id": response_id, "usage": usage}
        })
    }

    fn scan_usage_fixtures(fixtures: Vec<Vec<Value>>, filter: Option<&Path>) -> LocalUsageSnapshot {
        let day_keys = make_day_keys(1);
        let mut daily = HashMap::from([(day_keys[0].clone(), DailyTotals::default())]);
        let mut models = HashMap::new();
        let mut seen = HashSet::new();
        for fixture in fixtures {
            let mut lines = vec![
                serde_json::json!({"type":"session_meta","payload":{"id":"session-a","cwd":"/tmp/project-a"}}).to_string(),
                serde_json::json!({"type":"turn_context","payload":{"model":"test-model"}}).to_string(),
            ];
            lines.extend(fixture.into_iter().map(|value| value.to_string()));
            let refs: Vec<&str> = lines.iter().map(String::as_str).collect();
            let path = write_temp_jsonl(&refs);
            scan_file(&path, &mut daily, &mut models, filter, &mut seen).expect("scan fixture");
            fs::remove_file(path).expect("remove fixture");
        }
        build_snapshot(0, day_keys, daily, models)
    }

    #[test]
    fn resumed_legacy_file_counts_last_usage_and_deduplicates_copied_events() {
        let timestamp = fixture_timestamp();
        let record = legacy_record(timestamp, 1_000_010, Some(10));
        let snapshot = scan_usage_fixtures(
            vec![vec![record.clone(), record.clone()], vec![record]],
            None,
        );
        assert_eq!(snapshot.totals.last30_days_tokens, 10);
        assert_eq!(snapshot.top_models[0].tokens, 10);
    }

    #[test]
    fn cumulative_only_records_establish_baselines_after_start_and_reset() {
        let timestamp = fixture_timestamp();
        let snapshot = scan_usage_fixtures(
            vec![vec![
                legacy_record(timestamp, 1000, None),
                legacy_record(timestamp + 1, 1020, None),
                legacy_record(timestamp + 2, 3, None),
                legacy_record(timestamp + 3, 8, None),
            ]],
            None,
        );
        assert_eq!(snapshot.days[0].input_tokens, 25);
    }

    #[test]
    fn request_records_override_display_counters_regardless_of_event_order() {
        let timestamp = fixture_timestamp();
        let snapshot = scan_usage_fixtures(
            vec![vec![
                legacy_record(timestamp, 1_000_010, Some(10)),
                request_record(
                    timestamp + 1,
                    "response-a",
                    serde_json::json!({"input_tokens":10,"output_tokens":5}),
                ),
                legacy_record(timestamp + 5000, 1_000_010, Some(10)),
            ]],
            None,
        );
        assert_eq!(snapshot.days[0].input_tokens, 10);
        assert_eq!(snapshot.days[0].output_tokens, 5);
        assert_eq!(snapshot.top_models[0].tokens, 15);
    }

    #[test]
    fn request_totals_include_cache_once_and_do_not_add_reasoning_or_stale_totals() {
        let timestamp = fixture_timestamp();
        let snapshot = scan_usage_fixtures(
            vec![vec![
                request_record(
                    timestamp,
                    "response-a",
                    serde_json::json!({
                        "input_tokens":100,"cached_input_tokens":80,"output_tokens":20,
                        "reasoning_output_tokens":15,"total_tokens":999999
                    }),
                ),
                request_record(
                    timestamp + 1,
                    "response-b",
                    serde_json::json!({
                        "input_tokens":10,"cached_input_tokens":50,"output_tokens":2
                    }),
                ),
            ]],
            None,
        );
        assert_eq!(snapshot.days[0].input_tokens, 110);
        assert_eq!(snapshot.days[0].cached_input_tokens, 90);
        assert_eq!(snapshot.days[0].output_tokens, 22);
        assert_eq!(snapshot.days[0].total_tokens, 132);
    }

    #[test]
    fn request_deduplication_spans_session_roots_without_dropping_distinct_requests() {
        let timestamp = fixture_timestamp();
        let day_key = day_key_for_timestamp_ms(timestamp).expect("day key");
        let roots = [make_temp_sessions_root(), make_temp_sessions_root()];
        let record = request_record(
            timestamp,
            "response-a",
            serde_json::json!({"input_tokens":10,"output_tokens":5}),
        );
        write_session_file(&roots[0], &day_key, &[record.to_string()]);
        write_session_file(
            &roots[1],
            &day_key,
            &[
                record.to_string(),
                request_record(
                    timestamp,
                    "response-b",
                    serde_json::json!({"input_tokens":10,"output_tokens":5}),
                )
                .to_string(),
            ],
        );
        let snapshot = scan_local_usage(1, None, &roots).expect("scan roots");
        assert_eq!(snapshot.totals.last30_days_tokens, 30);
        for root in roots {
            fs::remove_dir_all(root).expect("remove root");
        }
    }

    #[test]
    fn workspace_filter_also_applies_to_request_records() {
        let snapshot = scan_usage_fixtures(
            vec![vec![request_record(
                fixture_timestamp(),
                "response-a",
                serde_json::json!({"input_tokens":10,"output_tokens":5}),
            )]],
            Some(Path::new("/tmp/other-project")),
        );
        assert_eq!(snapshot.totals.last30_days_tokens, 0);
        assert!(snapshot.top_models.is_empty());
    }

    #[test]
    fn legacy_usage_accepts_camel_case_counters() {
        let snapshot = scan_usage_fixtures(
            vec![vec![serde_json::json!({
                "timestamp":fixture_timestamp(),"payload":{"type":"token_count","info":{
                    "totalTokenUsage":{"inputTokens":1000,"outputTokens":500},
                    "lastTokenUsage":{"inputTokens":10,"cachedInputTokens":8,"outputTokens":5}
                }}
            })]],
            None,
        );
        assert_eq!(snapshot.days[0].input_tokens, 10);
        assert_eq!(snapshot.days[0].cached_input_tokens, 8);
        assert_eq!(snapshot.days[0].output_tokens, 5);
    }

    #[test]
    fn resolve_sessions_roots_uses_single_default_root() {
        let mut workspaces = HashMap::new();
        let entry_a = WorkspaceEntry {
            id: "a".to_string(),
            name: "A".to_string(),
            path: "/tmp/project-a".to_string(),
            kind: WorkspaceKind::Main,
            parent_id: None,
            worktree: None,
            settings: WorkspaceSettings::default(),
        };
        let entry_b = WorkspaceEntry {
            id: "b".to_string(),
            name: "B".to_string(),
            path: "/tmp/project-b".to_string(),
            kind: WorkspaceKind::Main,
            parent_id: None,
            worktree: None,
            settings: WorkspaceSettings::default(),
        };
        workspaces.insert(entry_a.id.clone(), entry_a.clone());
        workspaces.insert(entry_b.id.clone(), entry_b.clone());

        let roots = resolve_sessions_roots(&workspaces, None);
        let expected = resolve_codex_sessions_root(None)
            .map(|root| vec![root])
            .unwrap_or_default();
        assert_eq!(roots, expected);
    }
}
