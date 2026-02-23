use chrono::DateTime;
use ignore::WalkBuilder;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::sync::{Mutex as StdMutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::Mutex;

use crate::codex::home::{resolve_default_codex_home, resolve_workspace_codex_home};
use crate::types::{
    LocalThreadUsageSnapshot, ThreadTokenUsageBreakdown, ThreadTokenUsageSnapshot, WorkspaceEntry,
};

#[derive(Default, Clone, Copy)]
struct UsageValues {
    total_tokens: i64,
    input_tokens: i64,
    cached_input_tokens: i64,
    output_tokens: i64,
    reasoning_output_tokens: i64,
}

impl UsageValues {
    fn add_assign(&mut self, other: UsageValues) {
        self.total_tokens += other.total_tokens;
        self.input_tokens += other.input_tokens;
        self.cached_input_tokens += other.cached_input_tokens;
        self.output_tokens += other.output_tokens;
        self.reasoning_output_tokens += other.reasoning_output_tokens;
    }

    fn saturating_delta(self, previous: UsageValues) -> UsageValues {
        UsageValues {
            total_tokens: (self.total_tokens - previous.total_tokens).max(0),
            input_tokens: (self.input_tokens - previous.input_tokens).max(0),
            cached_input_tokens: (self.cached_input_tokens - previous.cached_input_tokens).max(0),
            output_tokens: (self.output_tokens - previous.output_tokens).max(0),
            reasoning_output_tokens: (self.reasoning_output_tokens
                - previous.reasoning_output_tokens)
                .max(0),
        }
    }

    fn from_map(map: &serde_json::Map<String, Value>) -> UsageValues {
        let input_tokens = read_i64(map, &["input_tokens", "inputTokens"]);
        let cached_input_tokens = read_i64(
            map,
            &[
                "cached_input_tokens",
                "cache_read_input_tokens",
                "cachedInputTokens",
                "cacheReadInputTokens",
            ],
        );
        let output_tokens = read_i64(map, &["output_tokens", "outputTokens"]);
        let reasoning_output_tokens =
            read_i64(map, &["reasoning_output_tokens", "reasoningOutputTokens"]);
        let total_tokens = map
            .get("total_tokens")
            .or_else(|| map.get("totalTokens"))
            .and_then(|value| {
                value
                    .as_i64()
                    .or_else(|| value.as_f64().map(|value| value as i64))
            })
            .unwrap_or_else(|| input_tokens + output_tokens);
        UsageValues {
            total_tokens,
            input_tokens,
            cached_input_tokens,
            output_tokens,
            reasoning_output_tokens,
        }
    }

    fn to_breakdown(self) -> ThreadTokenUsageBreakdown {
        ThreadTokenUsageBreakdown {
            total_tokens: self.total_tokens,
            input_tokens: self.input_tokens,
            cached_input_tokens: self.cached_input_tokens,
            output_tokens: self.output_tokens,
            reasoning_output_tokens: self.reasoning_output_tokens,
        }
    }

    fn is_zero(self) -> bool {
        self.total_tokens == 0
            && self.input_tokens == 0
            && self.cached_input_tokens == 0
            && self.output_tokens == 0
            && self.reasoning_output_tokens == 0
    }
}

#[derive(Default)]
struct ThreadUsageAggregate {
    total: UsageValues,
    last: UsageValues,
    model_context_window: Option<i64>,
    latest_timestamp_ms: i64,
}

impl ThreadUsageAggregate {
    fn absorb(&mut self, update: ThreadUsageUpdate) {
        self.total.add_assign(update.total_delta);
        if update.timestamp_ms >= self.latest_timestamp_ms {
            self.latest_timestamp_ms = update.timestamp_ms;
            self.last = update.last;
            if update.model_context_window.is_some() {
                self.model_context_window = update.model_context_window;
            }
        }
    }

    fn into_snapshot(self) -> ThreadTokenUsageSnapshot {
        ThreadTokenUsageSnapshot {
            total: self.total.to_breakdown(),
            last: self.last.to_breakdown(),
            model_context_window: self.model_context_window,
        }
    }
}

#[derive(Default)]
struct ThreadUsageUpdate {
    total_delta: UsageValues,
    last: UsageValues,
    model_context_window: Option<i64>,
    timestamp_ms: i64,
}

// Bound full index refreshes so repeated snapshot calls do not walk the full sessions tree.
const SESSION_INDEX_REFRESH_INTERVAL_MS: i64 = 30_000;

static SESSION_FILE_INDEX: OnceLock<StdMutex<SessionFileIndex>> = OnceLock::new();

#[derive(Default)]
struct SessionFileIndex {
    by_root: HashMap<PathBuf, RootSessionIndex>,
}

#[derive(Default)]
struct RootSessionIndex {
    by_thread: HashMap<String, Vec<IndexedSessionFile>>,
    missing_thread_checked_at: HashMap<String, i64>,
    last_full_scan_ms: i64,
}

#[derive(Clone)]
struct IndexedSessionFile {
    path: PathBuf,
    cwd: Option<String>,
}

pub(crate) async fn local_thread_usage_snapshot_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    thread_ids: Vec<String>,
    workspace_path: Option<String>,
) -> Result<LocalThreadUsageSnapshot, String> {
    let thread_ids = sanitize_thread_ids(thread_ids);
    let updated_at = now_timestamp_ms();
    if thread_ids.is_empty() {
        return Ok(LocalThreadUsageSnapshot {
            updated_at,
            usage_by_thread: HashMap::new(),
        });
    }

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

    let usage_by_thread = tokio::task::spawn_blocking(move || {
        scan_thread_usage(&thread_ids, workspace_path.as_deref(), &sessions_roots)
    })
    .await
    .map_err(|err| err.to_string())??;

    Ok(LocalThreadUsageSnapshot {
        updated_at,
        usage_by_thread,
    })
}

fn sanitize_thread_ids(thread_ids: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    thread_ids
        .into_iter()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .filter(|value| seen.insert(value.clone()))
        .collect()
}

fn scan_thread_usage(
    thread_ids: &[String],
    workspace_path: Option<&Path>,
    sessions_roots: &[PathBuf],
) -> Result<HashMap<String, ThreadTokenUsageSnapshot>, String> {
    let requested: HashSet<String> = thread_ids.iter().cloned().collect();
    if requested.is_empty() || sessions_roots.is_empty() {
        return Ok(HashMap::new());
    }

    let candidates = collect_candidate_session_files(&requested, workspace_path, sessions_roots);

    let mut aggregate_by_thread: HashMap<String, ThreadUsageAggregate> = HashMap::new();
    for candidate in candidates {
        if let Some((thread_id, usage)) =
            scan_session_file(&candidate.path, &requested, workspace_path)?
        {
            aggregate_by_thread
                .entry(thread_id)
                .or_default()
                .absorb(usage);
        }
    }

    let usage_by_thread = aggregate_by_thread
        .into_iter()
        .map(|(thread_id, aggregate)| (thread_id, aggregate.into_snapshot()))
        .collect();

    Ok(usage_by_thread)
}

fn collect_candidate_session_files(
    requested_ids: &HashSet<String>,
    workspace_path: Option<&Path>,
    sessions_roots: &[PathBuf],
) -> Vec<IndexedSessionFile> {
    if requested_ids.is_empty() || sessions_roots.is_empty() {
        return Vec::new();
    }

    let now_ms = now_timestamp_ms();
    let mut seen_paths: HashSet<PathBuf> = HashSet::new();
    let mut candidates = Vec::new();

    let index_lock = SESSION_FILE_INDEX.get_or_init(|| StdMutex::new(SessionFileIndex::default()));
    let mut index = match index_lock.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    };

    for root in sessions_roots {
        if !root.exists() {
            continue;
        }

        let root_index = index.by_root.entry(root.clone()).or_default();
        let mut refreshed = false;

        if root_index.last_full_scan_ms == 0 {
            rebuild_root_session_index(root_index, root);
            refreshed = true;
        }

        let missing_requested: Vec<&String> = requested_ids
            .iter()
            .filter(|thread_id| !root_index.by_thread.contains_key(*thread_id))
            .collect();
        let missing_refresh_due = missing_requested.iter().any(|thread_id| {
            match root_index.missing_thread_checked_at.get(*thread_id) {
                None => true,
                Some(last_checked) => {
                    now_ms.saturating_sub(*last_checked) >= SESSION_INDEX_REFRESH_INTERVAL_MS
                }
            }
        });

        if missing_refresh_due && !refreshed {
            rebuild_root_session_index(root_index, root);
            refreshed = true;
        }

        let refresh_due = now_ms.saturating_sub(root_index.last_full_scan_ms)
            >= SESSION_INDEX_REFRESH_INTERVAL_MS;

        if refresh_due && !refreshed {
            rebuild_root_session_index(root_index, root);
            refreshed = true;
        }

        if refreshed {
            let known_present: HashSet<String> = root_index.by_thread.keys().cloned().collect();
            root_index
                .missing_thread_checked_at
                .retain(|thread_id, _| !known_present.contains(thread_id));
        }

        for thread_id in requested_ids {
            if let Some(files) = root_index.by_thread.get(thread_id) {
                root_index.missing_thread_checked_at.remove(thread_id);
                for file in files {
                    if let Some(workspace_path) = workspace_path {
                        if let Some(cwd) = file.cwd.as_deref() {
                            if !path_matches_workspace(cwd, workspace_path) {
                                continue;
                            }
                        }
                    }
                    if seen_paths.insert(file.path.clone()) {
                        candidates.push(file.clone());
                    }
                }
            } else if refreshed {
                root_index
                    .missing_thread_checked_at
                    .insert(thread_id.clone(), now_ms);
            } else {
                root_index
                    .missing_thread_checked_at
                    .entry(thread_id.clone())
                    .or_insert(now_ms);
            }
        }
    }

    candidates
}

fn rebuild_root_session_index(root_index: &mut RootSessionIndex, root: &Path) {
    let mut by_thread: HashMap<String, Vec<IndexedSessionFile>> = HashMap::new();

    let walker = WalkBuilder::new(root)
        .hidden(false)
        .follow_links(false)
        .require_git(false)
        .build();

    for entry in walker {
        let Ok(entry) = entry else {
            continue;
        };
        let path = entry.path();
        if !entry
            .file_type()
            .is_some_and(|file_type| file_type.is_file())
        {
            continue;
        }
        if path.extension().and_then(|ext| ext.to_str()) != Some("jsonl") {
            continue;
        }

        let Some((thread_id, cwd)) = read_session_index_metadata(path) else {
            continue;
        };

        by_thread
            .entry(thread_id)
            .or_default()
            .push(IndexedSessionFile {
                path: path.to_path_buf(),
                cwd,
            });
    }

    root_index.by_thread = by_thread;
    root_index.last_full_scan_ms = now_timestamp_ms();
}

fn read_session_index_metadata(path: &Path) -> Option<(String, Option<String>)> {
    let file = File::open(path).ok()?;
    let reader = BufReader::new(file);

    for (line_index, line) in reader.lines().enumerate() {
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
        let Some(thread_id) = extract_session_thread_id(&value) else {
            if line_index > 32 {
                return None;
            }
            continue;
        };
        return Some((thread_id, extract_cwd(&value)));
    }

    None
}

fn scan_session_file(
    path: &Path,
    requested_ids: &HashSet<String>,
    workspace_path: Option<&Path>,
) -> Result<Option<(String, ThreadUsageUpdate)>, String> {
    let file = match File::open(path) {
        Ok(file) => file,
        Err(_) => return Ok(None),
    };

    let reader = BufReader::new(file);
    let mut matched_thread_id: Option<String> = None;
    let mut match_known = false;

    let mut workspace_match_known = workspace_path.is_none();
    let mut matches_workspace = workspace_path.is_none();

    let mut previous_totals: UsageValues = UsageValues::default();
    let mut update = ThreadUsageUpdate::default();

    for (line_index, line) in reader.lines().enumerate() {
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

        if !match_known {
            if let Some(thread_id) = extract_session_thread_id(&value) {
                match_known = true;
                if requested_ids.contains(&thread_id) {
                    matched_thread_id = Some(thread_id);
                } else {
                    return Ok(None);
                }
            } else if line_index > 32 {
                // Session metadata should appear near the top; if not, skip unknown files.
                return Ok(None);
            }
        }

        if workspace_path.is_some() {
            let entry_type = value
                .get("type")
                .and_then(|value| value.as_str())
                .unwrap_or("");
            if (entry_type == "session_meta" || entry_type == "turn_context")
                && !workspace_match_known
            {
                if let Some(cwd) = extract_cwd(&value) {
                    workspace_match_known = true;
                    matches_workspace = workspace_path
                        .map(|workspace_path| path_matches_workspace(&cwd, workspace_path))
                        .unwrap_or(true);
                    if !matches_workspace {
                        return Ok(None);
                    }
                }
            }
        }

        if !match_known || matched_thread_id.is_none() {
            continue;
        }
        if !workspace_match_known || !matches_workspace {
            continue;
        }

        let Some(token_info) = extract_token_usage(&value) else {
            continue;
        };

        let mut total_delta = UsageValues::default();
        let mut next_last = UsageValues::default();

        if let Some(total_usage) = token_info.total {
            total_delta = total_usage.saturating_delta(previous_totals);
            previous_totals = total_usage;
            next_last = token_info.last.unwrap_or(total_delta);
        } else if let Some(last_usage) = token_info.last {
            total_delta = last_usage;
            next_last = last_usage;
            // Keep cumulative totals in sync so future total snapshots compute correct deltas.
            previous_totals.add_assign(last_usage);
        }

        if !total_delta.is_zero() {
            update.total_delta.add_assign(total_delta);
        }
        if !next_last.is_zero() {
            update.last = next_last;
        }
        if token_info.model_context_window.is_some() {
            update.model_context_window = token_info.model_context_window;
        }
        let timestamp_ms = token_info.timestamp_ms;
        if timestamp_ms > update.timestamp_ms {
            update.timestamp_ms = timestamp_ms;
        }
    }

    let Some(thread_id) = matched_thread_id else {
        return Ok(None);
    };

    if update.total_delta.is_zero() && update.last.is_zero() {
        return Ok(None);
    }

    Ok(Some((thread_id, update)))
}

fn now_timestamp_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

fn extract_session_thread_id(value: &Value) -> Option<String> {
    let entry_type = value.get("type")?.as_str()?;
    if entry_type != "session_meta" {
        return None;
    }
    value
        .get("payload")
        .and_then(|payload| payload.get("id"))
        .and_then(|id| id.as_str())
        .map(|id| id.to_string())
}

struct TokenUsageInfo {
    total: Option<UsageValues>,
    last: Option<UsageValues>,
    model_context_window: Option<i64>,
    timestamp_ms: i64,
}

fn extract_token_usage(value: &Value) -> Option<TokenUsageInfo> {
    let entry_type = value
        .get("type")
        .and_then(|value| value.as_str())
        .unwrap_or("");
    if entry_type != "event_msg" && !entry_type.is_empty() {
        return None;
    }

    let payload = value.get("payload")?.as_object()?;
    let payload_type = payload
        .get("type")
        .and_then(|value| value.as_str())
        .unwrap_or("");
    if payload_type != "token_count" {
        return None;
    }

    let info = payload.get("info")?.as_object()?;
    let total =
        find_usage_map(info, &["total_token_usage", "totalTokenUsage"]).map(UsageValues::from_map);
    let last =
        find_usage_map(info, &["last_token_usage", "lastTokenUsage"]).map(UsageValues::from_map);

    if total.is_none() && last.is_none() {
        return None;
    }

    let model_context_window = info
        .get("model_context_window")
        .or_else(|| info.get("modelContextWindow"))
        .and_then(|value| {
            value
                .as_i64()
                .or_else(|| value.as_f64().map(|value| value as i64))
        });

    let timestamp_ms = read_timestamp_ms(value).unwrap_or_default();

    Some(TokenUsageInfo {
        total,
        last,
        model_context_window,
        timestamp_ms,
    })
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
    workspaces: &HashMap<String, WorkspaceEntry>,
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::time::Duration;
    use uuid::Uuid;

    fn clear_session_index_cache() {
        let Some(index_lock) = SESSION_FILE_INDEX.get() else {
            return;
        };
        match index_lock.lock() {
            Ok(mut index) => index.by_root.clear(),
            Err(poisoned) => poisoned.into_inner().by_root.clear(),
        }
    }

    fn last_full_scan_ms_for_root(root: &Path) -> Option<i64> {
        let index_lock = SESSION_FILE_INDEX.get()?;
        let index = match index_lock.lock() {
            Ok(index) => index,
            Err(poisoned) => poisoned.into_inner(),
        };
        index.by_root.get(root).map(|root_index| root_index.last_full_scan_ms)
    }

    fn make_temp_sessions_root() -> PathBuf {
        let mut root = std::env::temp_dir();
        root.push(format!("codexmonitor-thread-usage-root-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&root).expect("create temp root");
        root
    }

    fn write_session_file(root: &Path, file_name: &str, lines: &[&str]) -> PathBuf {
        let day_dir = root.join("2026").join("02").join("01");
        std::fs::create_dir_all(&day_dir).expect("create day dir");
        let path = day_dir.join(file_name);
        let mut file = File::create(&path).expect("create session file");
        for line in lines {
            writeln!(file, "{line}").expect("write line");
        }
        path
    }

    #[test]
    fn scan_thread_usage_aggregates_total_without_double_counting_last() {
        clear_session_index_cache();

        let root = make_temp_sessions_root();
        let thread_id = "thread-abc";
        write_session_file(
            &root,
            "rollout-2026-02-01-thread-abc.jsonl",
            &[
                r#"{"timestamp":"2026-02-01T10:00:00.000Z","type":"session_meta","payload":{"id":"thread-abc","cwd":"/tmp/project"}}"#,
                r#"{"timestamp":"2026-02-01T10:00:01.000Z","type":"event_msg","payload":{"type":"token_count","info":{"last_token_usage":{"input_tokens":10,"cached_input_tokens":0,"output_tokens":5,"reasoning_output_tokens":2,"total_tokens":15}}}}"#,
                r#"{"timestamp":"2026-02-01T10:00:02.000Z","type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":10,"cached_input_tokens":0,"output_tokens":5,"reasoning_output_tokens":2,"total_tokens":15},"last_token_usage":{"input_tokens":10,"cached_input_tokens":0,"output_tokens":5,"reasoning_output_tokens":2,"total_tokens":15},"model_context_window":200000}}}"#,
                r#"{"timestamp":"2026-02-01T10:00:03.000Z","type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":12,"cached_input_tokens":0,"output_tokens":6,"reasoning_output_tokens":2,"total_tokens":18},"last_token_usage":{"input_tokens":2,"cached_input_tokens":0,"output_tokens":1,"reasoning_output_tokens":0,"total_tokens":3}}}}"#,
            ],
        );

        let usage = scan_thread_usage(&[thread_id.to_string()], None, &[root]).expect("scan usage");
        let thread_usage = usage.get(thread_id).expect("thread usage");

        assert_eq!(thread_usage.total.input_tokens, 12);
        assert_eq!(thread_usage.total.output_tokens, 6);
        assert_eq!(thread_usage.total.total_tokens, 18);
        assert_eq!(thread_usage.last.input_tokens, 2);
        assert_eq!(thread_usage.last.output_tokens, 1);
        assert_eq!(thread_usage.model_context_window, Some(200000));
    }

    #[test]
    fn scan_thread_usage_respects_workspace_filter() {
        clear_session_index_cache();

        let root = make_temp_sessions_root();
        write_session_file(
            &root,
            "rollout-2026-02-01-thread-mismatch.jsonl",
            &[
                r#"{"timestamp":"2026-02-01T10:00:00.000Z","type":"session_meta","payload":{"id":"thread-mismatch","cwd":"/tmp/other"}}"#,
                r#"{"timestamp":"2026-02-01T10:00:01.000Z","type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":10,"cached_input_tokens":0,"output_tokens":5,"total_tokens":15}}}}"#,
            ],
        );

        let usage = scan_thread_usage(
            &["thread-mismatch".to_string()],
            Some(Path::new("/tmp/project")),
            &[root],
        )
        .expect("scan usage");

        assert!(usage.is_empty());
    }

    #[test]
    fn scan_thread_usage_uses_session_meta_id_not_filename_substring() {
        clear_session_index_cache();

        let root = make_temp_sessions_root();
        write_session_file(
            &root,
            "rollout-2026-02-01-thread-12.jsonl",
            &[
                r#"{"timestamp":"2026-02-01T10:00:00.000Z","type":"session_meta","payload":{"id":"thread-12","cwd":"/tmp/project"}}"#,
                r#"{"timestamp":"2026-02-01T10:00:01.000Z","type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":10,"cached_input_tokens":0,"output_tokens":5,"total_tokens":15}}}}"#,
            ],
        );

        let usage =
            scan_thread_usage(&["thread-1".to_string()], None, &[root]).expect("scan usage");

        assert!(usage.is_empty());
    }

    #[test]
    fn scan_thread_usage_refreshes_index_when_requested_thread_is_missing() {
        clear_session_index_cache();

        let root = make_temp_sessions_root();
        write_session_file(
            &root,
            "rollout-2026-02-01-thread-a.jsonl",
            &[
                r#"{"timestamp":"2026-02-01T10:00:00.000Z","type":"session_meta","payload":{"id":"thread-a","cwd":"/tmp/project"}}"#,
                r#"{"timestamp":"2026-02-01T10:00:01.000Z","type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":10,"cached_input_tokens":0,"output_tokens":5,"total_tokens":15}}}}"#,
            ],
        );

        let initial_usage =
            scan_thread_usage(&["thread-a".to_string()], None, std::slice::from_ref(&root))
                .expect("scan usage");
        assert_eq!(
            initial_usage
                .get("thread-a")
                .expect("thread-a usage")
                .total
                .total_tokens,
            15
        );

        write_session_file(
            &root,
            "rollout-2026-02-01-thread-b.jsonl",
            &[
                r#"{"timestamp":"2026-02-01T11:00:00.000Z","type":"session_meta","payload":{"id":"thread-b","cwd":"/tmp/project"}}"#,
                r#"{"timestamp":"2026-02-01T11:00:01.000Z","type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":4,"cached_input_tokens":0,"output_tokens":2,"total_tokens":6}}}}"#,
            ],
        );

        let usage =
            scan_thread_usage(&["thread-b".to_string()], None, std::slice::from_ref(&root))
                .expect("scan usage");
        assert_eq!(
            usage.get("thread-b").expect("thread-b usage").total.total_tokens,
            6
        );
    }

    #[test]
    fn scan_thread_usage_throttles_repeated_missing_thread_rebuilds() {
        clear_session_index_cache();

        let root = make_temp_sessions_root();
        write_session_file(
            &root,
            "rollout-2026-02-01-thread-a.jsonl",
            &[
                r#"{"timestamp":"2026-02-01T10:00:00.000Z","type":"session_meta","payload":{"id":"thread-a","cwd":"/tmp/project"}}"#,
                r#"{"timestamp":"2026-02-01T10:00:01.000Z","type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":10,"cached_input_tokens":0,"output_tokens":5,"total_tokens":15}}}}"#,
            ],
        );

        let missing_thread_id = "thread-missing".to_string();
        let first_usage =
            scan_thread_usage(std::slice::from_ref(&missing_thread_id), None, std::slice::from_ref(&root))
                .expect("scan usage");
        assert!(first_usage.is_empty());

        let first_scan_ms = last_full_scan_ms_for_root(&root).expect("first scan timestamp");
        std::thread::sleep(Duration::from_millis(5));

        let second_usage =
            scan_thread_usage(std::slice::from_ref(&missing_thread_id), None, std::slice::from_ref(&root))
                .expect("scan usage");
        assert!(second_usage.is_empty());

        let second_scan_ms = last_full_scan_ms_for_root(&root).expect("second scan timestamp");
        assert_eq!(second_scan_ms, first_scan_ms);
    }
}
