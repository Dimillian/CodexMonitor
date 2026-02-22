use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, VecDeque};
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct ThreadCodexMetadata {
    #[serde(default, rename = "modelId", alias = "model_id")]
    pub(crate) model_id: Option<String>,
    #[serde(default)]
    pub(crate) effort: Option<String>,
}

const MODEL_KEYS: &[&str] = &["modelId", "model_id", "model", "modelName", "model_name"];
const EFFORT_KEYS: &[&str] = &[
    "effort",
    "reasoningEffort",
    "reasoning_effort",
    "modelReasoningEffort",
    "model_reasoning_effort",
];

fn as_non_empty_string(value: Option<&Value>) -> Option<String> {
    let text = value?.as_str()?.trim();
    if text.is_empty() {
        return None;
    }
    Some(text.to_string())
}

fn normalize_effort(value: Option<String>) -> Option<String> {
    let normalized = value?.trim().to_lowercase();
    if normalized.is_empty() || normalized == "default" || normalized == "unknown" {
        return None;
    }
    Some(normalized)
}

fn pick_model(record: &serde_json::Map<String, Value>) -> Option<String> {
    for key in MODEL_KEYS {
        let value = as_non_empty_string(record.get(*key));
        if value.is_some() {
            return value;
        }
    }
    None
}

fn pick_effort(record: &serde_json::Map<String, Value>) -> Option<String> {
    for key in EFFORT_KEYS {
        let value = normalize_effort(as_non_empty_string(record.get(*key)));
        if value.is_some() {
            return value;
        }
    }
    None
}

fn pick_deep_model(record: &serde_json::Map<String, Value>) -> Option<String> {
    let mut queue: VecDeque<&Value> = VecDeque::new();
    let mut best = None;

    for (key, value) in record {
        if MODEL_KEYS.iter().any(|candidate| *candidate == key) {
            if let Some(model) = as_non_empty_string(Some(value)) {
                best = Some(model);
            }
        }
        queue.push_back(value);
    }

    while let Some(current) = queue.pop_front() {
        match current {
            Value::Array(items) => {
                for item in items {
                    queue.push_back(item);
                }
            }
            Value::Object(map) => {
                for (key, value) in map {
                    if MODEL_KEYS.iter().any(|candidate| *candidate == key) {
                        if let Some(model) = as_non_empty_string(Some(value)) {
                            best = Some(model);
                        }
                    }
                    queue.push_back(value);
                }
            }
            _ => {}
        }
    }

    best
}

fn pick_deep_effort(record: &serde_json::Map<String, Value>) -> Option<String> {
    let mut queue: VecDeque<&Value> = VecDeque::new();
    let mut best = None;

    for (key, value) in record {
        if EFFORT_KEYS.iter().any(|candidate| *candidate == key) {
            if let Some(effort) = normalize_effort(as_non_empty_string(Some(value))) {
                best = Some(effort);
            }
        }
        queue.push_back(value);
    }

    while let Some(current) = queue.pop_front() {
        match current {
            Value::Array(items) => {
                for item in items {
                    queue.push_back(item);
                }
            }
            Value::Object(map) => {
                for (key, value) in map {
                    if EFFORT_KEYS.iter().any(|candidate| *candidate == key) {
                        if let Some(effort) = normalize_effort(as_non_empty_string(Some(value))) {
                            best = Some(effort);
                        }
                    }
                    queue.push_back(value);
                }
            }
            _ => {}
        }
    }

    best
}

fn as_object(value: Option<&Value>) -> Option<&serde_json::Map<String, Value>> {
    value?.as_object()
}

fn extract_from_record(record: &serde_json::Map<String, Value>) -> ThreadCodexMetadata {
    let payload = as_object(record.get("payload"));
    let containers = [
        payload,
        payload.and_then(|entry| as_object(entry.get("info"))),
        payload.and_then(|entry| as_object(entry.get("settings"))),
        payload.and_then(|entry| as_object(entry.get("params"))),
        payload.and_then(|entry| as_object(entry.get("context"))),
        payload.and_then(|entry| as_object(entry.get("turnContext"))),
        payload.and_then(|entry| as_object(entry.get("turn_context"))),
        payload.and_then(|entry| as_object(entry.get("config"))),
        Some(record),
        as_object(record.get("info")),
        as_object(record.get("metadata")),
        as_object(record.get("context")),
        as_object(record.get("turnContext")),
        as_object(record.get("turn_context")),
        as_object(record.get("params")),
        as_object(record.get("settings")),
        as_object(record.get("config")),
    ];

    let mut metadata = ThreadCodexMetadata::default();
    for container in containers.into_iter().flatten() {
        if metadata.model_id.is_none() {
            metadata.model_id = pick_model(container);
        }
        if metadata.effort.is_none() {
            metadata.effort = pick_effort(container);
        }
        if metadata.model_id.is_none() {
            metadata.model_id = pick_deep_model(container);
        }
        if metadata.effort.is_none() {
            metadata.effort = pick_deep_effort(container);
        }
        if metadata.model_id.is_some() && metadata.effort.is_some() {
            break;
        }
    }
    metadata
}

fn extract_from_turn(turn: &serde_json::Map<String, Value>) -> ThreadCodexMetadata {
    let mut metadata = extract_from_record(turn);
    let mut item_model_id: Option<String> = None;
    let mut item_effort: Option<String> = None;
    let items = turn
        .get("items")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    for item in items.into_iter().rev() {
        let Some(record) = item.as_object() else {
            continue;
        };
        let item_meta = extract_from_record(record);
        if item_model_id.is_none() && item_meta.model_id.is_some() {
            item_model_id = item_meta.model_id;
        }
        if item_effort.is_none() && item_meta.effort.is_some() {
            item_effort = item_meta.effort;
        }
        if item_model_id.is_some() && item_effort.is_some() {
            break;
        }
    }
    if item_model_id.is_some() {
        metadata.model_id = item_model_id;
    }
    if item_effort.is_some() {
        metadata.effort = item_effort;
    }
    metadata
}

pub(crate) fn extract_thread_codex_metadata(thread: &Value) -> ThreadCodexMetadata {
    let Some(thread_object) = thread.as_object() else {
        return ThreadCodexMetadata::default();
    };

    if let Some(turns) = thread_object.get("turns").and_then(Value::as_array) {
        let mut metadata = ThreadCodexMetadata::default();
        for turn in turns.iter().rev() {
            let Some(turn_object) = turn.as_object() else {
                continue;
            };
            let extracted = extract_from_turn(turn_object);
            if metadata.model_id.is_none() && extracted.model_id.is_some() {
                metadata.model_id = extracted.model_id;
            }
            if metadata.effort.is_none() && extracted.effort.is_some() {
                metadata.effort = extracted.effort;
            }
            if metadata.model_id.is_some() && metadata.effort.is_some() {
                break;
            }
        }
        if metadata.model_id.is_some() && metadata.effort.is_some() {
            return metadata;
        }
        let thread_level = extract_from_record(thread_object);
        if metadata.model_id.is_none() {
            metadata.model_id = thread_level.model_id;
        }
        if metadata.effort.is_none() {
            metadata.effort = thread_level.effort;
        }
        return metadata;
    }

    extract_from_record(thread_object)
}

pub(crate) fn apply_metadata_to_thread(thread: &mut Value, metadata: &ThreadCodexMetadata) {
    let Some(thread_object) = thread.as_object_mut() else {
        return;
    };
    if let Some(model_id) = metadata.model_id.as_ref() {
        thread_object.insert("model".to_string(), Value::String(model_id.clone()));
        thread_object.insert("modelId".to_string(), Value::String(model_id.clone()));
        thread_object.insert("model_id".to_string(), Value::String(model_id.clone()));
        thread_object.insert("modelName".to_string(), Value::String(model_id.clone()));
        thread_object.insert("model_name".to_string(), Value::String(model_id.clone()));
    }
    if let Some(effort) = metadata.effort.as_ref() {
        thread_object.insert("effort".to_string(), Value::String(effort.clone()));
        thread_object.insert("reasoningEffort".to_string(), Value::String(effort.clone()));
        thread_object.insert(
            "reasoning_effort".to_string(),
            Value::String(effort.clone()),
        );
        thread_object.insert(
            "modelReasoningEffort".to_string(),
            Value::String(effort.clone()),
        );
        thread_object.insert(
            "model_reasoning_effort".to_string(),
            Value::String(effort.clone()),
        );
    }
}

pub(crate) fn thread_id_from_value(thread: &Value) -> Option<String> {
    let object = thread.as_object()?;
    as_non_empty_string(object.get("id"))
}

pub(crate) fn metadata_key(workspace_id: &str, thread_id: &str) -> Option<String> {
    let workspace = workspace_id.trim();
    let thread = thread_id.trim();
    if workspace.is_empty() || thread.is_empty() {
        return None;
    }
    Some(format!("{workspace}:{thread}"))
}

pub(crate) fn remember_thread_codex_metadata(
    metadata: &mut HashMap<String, ThreadCodexMetadata>,
    workspace_id: &str,
    thread_id: &str,
    model_id: Option<String>,
    effort: Option<String>,
) -> bool {
    let Some(key) = metadata_key(workspace_id, thread_id) else {
        return false;
    };
    if model_id.is_none() && effort.is_none() {
        return false;
    }
    let entry = metadata.entry(key).or_default();
    let mut changed = false;

    if let Some(next_model_id) = model_id {
        if entry.model_id.as_deref() != Some(next_model_id.as_str()) {
            entry.model_id = Some(next_model_id);
            changed = true;
        }
    }
    if let Some(next_effort) = effort {
        if entry.effort.as_deref() != Some(next_effort.as_str()) {
            entry.effort = Some(next_effort);
            changed = true;
        }
    }

    changed
}

pub(crate) fn metadata_for_thread(
    metadata: &HashMap<String, ThreadCodexMetadata>,
    workspace_id: &str,
    thread_id: &str,
) -> Option<ThreadCodexMetadata> {
    let key = metadata_key(workspace_id, thread_id)?;
    metadata.get(&key).cloned()
}

pub(crate) fn enrich_thread_with_codex_metadata(
    metadata_cache: &mut HashMap<String, ThreadCodexMetadata>,
    workspace_id: &str,
    thread: &mut Value,
) -> bool {
    enrich_thread_with_codex_home_metadata(metadata_cache, workspace_id, thread, None)
}

pub(crate) fn enrich_thread_with_codex_home_metadata(
    metadata_cache: &mut HashMap<String, ThreadCodexMetadata>,
    workspace_id: &str,
    thread: &mut Value,
    codex_home: Option<&Path>,
) -> bool {
    let extracted = extract_thread_codex_metadata(thread);
    let thread_id = thread_id_from_value(thread);
    let stored = thread_id
        .as_ref()
        .and_then(|id| metadata_for_thread(metadata_cache, workspace_id, id));
    let session_fallback =
        if (extracted.model_id.is_none() || extracted.effort.is_none()) && thread_id.is_some() {
            match (codex_home, thread_id.as_deref()) {
                (Some(home), Some(id)) => extract_thread_codex_metadata_from_codex_home(home, id),
                _ => None,
            }
        } else {
            None
        };
    let merged = ThreadCodexMetadata {
        model_id: extracted
            .model_id
            .or_else(|| {
                session_fallback
                    .as_ref()
                    .and_then(|item| item.model_id.clone())
            })
            .or_else(|| stored.as_ref().and_then(|item| item.model_id.clone())),
        effort: extracted
            .effort
            .or_else(|| {
                session_fallback
                    .as_ref()
                    .and_then(|item| item.effort.clone())
            })
            .or_else(|| stored.as_ref().and_then(|item| item.effort.clone())),
    };

    let mut changed = false;
    if let Some(thread_id) = thread_id {
        changed = remember_thread_codex_metadata(
            metadata_cache,
            workspace_id,
            &thread_id,
            merged.model_id.clone(),
            merged.effort.clone(),
        );
    }
    apply_metadata_to_thread(thread, &merged);
    changed
}

fn session_search_roots(codex_home: &Path) -> [PathBuf; 2] {
    [
        codex_home.join("sessions"),
        codex_home.join("archived_sessions"),
    ]
}

fn find_thread_session_file(codex_home: &Path, thread_id: &str) -> Option<PathBuf> {
    let thread_id = thread_id.trim();
    if thread_id.is_empty() {
        return None;
    }

    for root in session_search_roots(codex_home) {
        if !root.exists() {
            continue;
        }
        let mut queue = vec![root];
        while let Some(dir) = queue.pop() {
            let Ok(entries) = std::fs::read_dir(&dir) else {
                continue;
            };
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    queue.push(path);
                    continue;
                }
                if !path
                    .extension()
                    .and_then(|ext| ext.to_str())
                    .is_some_and(|ext| ext.eq_ignore_ascii_case("jsonl"))
                {
                    continue;
                }
                let Some(file_name) = path.file_name().and_then(|value| value.to_str()) else {
                    continue;
                };
                if file_name.contains(thread_id) {
                    return Some(path);
                }
            }
        }
    }
    None
}

fn extract_from_session_line(line: &str) -> ThreadCodexMetadata {
    let Ok(value) = serde_json::from_str::<Value>(line) else {
        return ThreadCodexMetadata::default();
    };
    let mut merged = ThreadCodexMetadata::default();
    if let Some(object) = value.as_object() {
        let top_level = extract_from_record(object);
        merged.model_id = top_level.model_id;
        merged.effort = top_level.effort;
        if let Some(payload) = object.get("payload").and_then(Value::as_object) {
            let payload_metadata = extract_from_record(payload);
            if merged.model_id.is_none() {
                merged.model_id = payload_metadata.model_id;
            }
            if merged.effort.is_none() {
                merged.effort = payload_metadata.effort;
            }
        }
    }
    merged
}

pub(crate) fn extract_thread_codex_metadata_from_session_file(
    path: &Path,
) -> Option<ThreadCodexMetadata> {
    let file = File::open(path).ok()?;
    let reader = BufReader::new(file);
    let mut merged = ThreadCodexMetadata::default();

    for line in reader.lines().map_while(Result::ok) {
        let line_metadata = extract_from_session_line(&line);
        if let Some(model_id) = line_metadata.model_id {
            merged.model_id = Some(model_id);
        }
        if let Some(effort) = line_metadata.effort {
            merged.effort = Some(effort);
        }
    }

    if merged.model_id.is_none() && merged.effort.is_none() {
        None
    } else {
        Some(merged)
    }
}

pub(crate) fn extract_thread_codex_metadata_from_codex_home(
    codex_home: &Path,
    thread_id: &str,
) -> Option<ThreadCodexMetadata> {
    let session_path = find_thread_session_file(codex_home, thread_id)?;
    extract_thread_codex_metadata_from_session_file(&session_path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn extracts_from_thread_level() {
        let metadata = extract_thread_codex_metadata(&json!({
            "model": "gpt-5.3-codex",
            "reasoning_effort": "high"
        }));
        assert_eq!(
            metadata,
            ThreadCodexMetadata {
                model_id: Some("gpt-5.3-codex".to_string()),
                effort: Some("high".to_string())
            }
        );
    }

    #[test]
    fn prefers_latest_turn_item_over_turn_fallback() {
        let metadata = extract_thread_codex_metadata(&json!({
            "turns": [
                {
                    "model": "gpt-5.3-codex",
                    "reasoning_effort": "medium",
                    "items": [
                        {
                            "payload": {
                                "info": { "model": "gpt-5.3-codex" },
                                "settings": { "reasoning_effort": "high" }
                            }
                        }
                    ]
                }
            ]
        }));
        assert_eq!(
            metadata,
            ThreadCodexMetadata {
                model_id: Some("gpt-5.3-codex".to_string()),
                effort: Some("high".to_string())
            }
        );
    }

    #[test]
    fn extracts_from_deeply_nested_effort_fields() {
        let metadata = extract_thread_codex_metadata(&json!({
            "turns": [
                {
                    "payload": {
                        "settings": {
                            "reasoning": {
                                "effort": "high"
                            },
                            "info": {
                                "model_name": "gpt-5.3-codex"
                            }
                        }
                    }
                }
            ]
        }));
        assert_eq!(
            metadata,
            ThreadCodexMetadata {
                model_id: Some("gpt-5.3-codex".to_string()),
                effort: Some("high".to_string())
            }
        );
    }

    #[test]
    fn prefers_latest_turn_item_effort_over_older_items() {
        let metadata = extract_thread_codex_metadata(&json!({
            "model": "gpt-5.3-codex",
            "turns": [
                {
                    "items": [
                        {
                            "payload": {
                                "settings": { "reasoning_effort": "medium" }
                            }
                        },
                        {
                            "payload": {
                                "settings": { "reasoning_effort": "high" }
                            }
                        }
                    ]
                }
            ]
        }));
        assert_eq!(
            metadata,
            ThreadCodexMetadata {
                model_id: Some("gpt-5.3-codex".to_string()),
                effort: Some("high".to_string())
            }
        );
    }

    #[test]
    fn applies_metadata_fields_to_thread() {
        let mut thread = json!({ "id": "thread-1", "preview": "hello" });
        apply_metadata_to_thread(
            &mut thread,
            &ThreadCodexMetadata {
                model_id: Some("gpt-5-codex".to_string()),
                effort: Some("high".to_string()),
            },
        );
        assert_eq!(thread["model"], "gpt-5-codex");
        assert_eq!(thread["modelId"], "gpt-5-codex");
        assert_eq!(thread["model_id"], "gpt-5-codex");
        assert_eq!(thread["modelName"], "gpt-5-codex");
        assert_eq!(thread["model_name"], "gpt-5-codex");
        assert_eq!(thread["effort"], "high");
        assert_eq!(thread["reasoningEffort"], "high");
        assert_eq!(thread["reasoning_effort"], "high");
        assert_eq!(thread["modelReasoningEffort"], "high");
        assert_eq!(thread["model_reasoning_effort"], "high");
    }

    #[test]
    fn remember_updates_only_on_change() {
        let mut cache = HashMap::new();
        assert!(remember_thread_codex_metadata(
            &mut cache,
            "ws-1",
            "thread-1",
            Some("gpt-5.3-codex".to_string()),
            Some("high".to_string())
        ));
        assert!(!remember_thread_codex_metadata(
            &mut cache,
            "ws-1",
            "thread-1",
            Some("gpt-5.3-codex".to_string()),
            Some("high".to_string())
        ));
    }

    #[test]
    fn enrich_merges_extracted_and_cached_values() {
        let mut cache = HashMap::new();
        remember_thread_codex_metadata(
            &mut cache,
            "ws-1",
            "thread-1",
            Some("gpt-5.3-codex".to_string()),
            Some("medium".to_string()),
        );

        let mut thread = json!({
            "id": "thread-1",
            "turns": [
                {
                    "items": [
                        {
                            "payload": {
                                "settings": {
                                    "reasoning_effort": "high"
                                }
                            }
                        }
                    ]
                }
            ]
        });

        assert!(enrich_thread_with_codex_metadata(
            &mut cache,
            "ws-1",
            &mut thread
        ));
        assert_eq!(
            thread.get("modelId").and_then(Value::as_str),
            Some("gpt-5.3-codex")
        );
        assert_eq!(thread.get("effort").and_then(Value::as_str), Some("high"));
        let cached = metadata_for_thread(&cache, "ws-1", "thread-1").expect("cache entry");
        assert_eq!(cached.model_id.as_deref(), Some("gpt-5.3-codex"));
        assert_eq!(cached.effort.as_deref(), Some("high"));
    }

    #[test]
    fn extracts_metadata_from_session_file_lines() {
        let temp_dir = std::env::temp_dir().join(format!(
            "codex-monitor-thread-metadata-test-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&temp_dir).expect("create temp dir");
        let session_path = temp_dir.join("rollout-2026-02-22T18-06-08-thread-1.jsonl");
        std::fs::write(
            &session_path,
            r#"{"type":"session_meta","payload":{"model_provider":"openai"}}
{"type":"turn_context","payload":{"model":"gpt-5.3-codex","reasoning_effort":"high"}}"#,
        )
        .expect("write session file");

        let metadata =
            extract_thread_codex_metadata_from_session_file(&session_path).expect("metadata");
        assert_eq!(metadata.model_id.as_deref(), Some("gpt-5.3-codex"));
        assert_eq!(metadata.effort.as_deref(), Some("high"));
    }

    #[test]
    fn extracts_metadata_from_codex_home_session_tree() {
        let temp_dir = std::env::temp_dir().join(format!(
            "codex-monitor-thread-metadata-home-test-{}",
            uuid::Uuid::new_v4()
        ));
        let sessions_dir = temp_dir.join("sessions/2026/02/22");
        std::fs::create_dir_all(&sessions_dir).expect("create sessions tree");
        let session_path = sessions_dir.join("rollout-2026-02-22T18-06-08-thread-abc.jsonl");
        std::fs::write(
            &session_path,
            r#"{"type":"turn_context","payload":{"model":"gpt-5.3-codex","reasoning_effort":"xhigh"}}"#,
        )
        .expect("write session file");

        let metadata = extract_thread_codex_metadata_from_codex_home(&temp_dir, "thread-abc")
            .expect("metadata");
        assert_eq!(metadata.model_id.as_deref(), Some("gpt-5.3-codex"));
        assert_eq!(metadata.effort.as_deref(), Some("xhigh"));
    }

    #[test]
    fn codex_home_fallback_overrides_stale_cached_effort() {
        let temp_dir = std::env::temp_dir().join(format!(
            "codex-monitor-thread-metadata-fallback-test-{}",
            uuid::Uuid::new_v4()
        ));
        let sessions_dir = temp_dir.join("sessions/2026/02/22");
        std::fs::create_dir_all(&sessions_dir).expect("create sessions tree");
        let session_path = sessions_dir.join("rollout-2026-02-22T18-06-08-thread-fallback.jsonl");
        std::fs::write(
            &session_path,
            r#"{"type":"turn_context","payload":{"model":"gpt-5.3-codex","reasoning_effort":"high"}}"#,
        )
        .expect("write session file");

        let mut cache = HashMap::new();
        remember_thread_codex_metadata(
            &mut cache,
            "ws-1",
            "thread-fallback",
            Some("gpt-5.3-codex".to_string()),
            Some("medium".to_string()),
        );

        let mut thread = json!({
            "id": "thread-fallback",
            "turns": [{ "id": "turn-1" }]
        });

        assert!(enrich_thread_with_codex_home_metadata(
            &mut cache,
            "ws-1",
            &mut thread,
            Some(&temp_dir),
        ));
        assert_eq!(thread.get("effort").and_then(Value::as_str), Some("high"));
        let cached = metadata_for_thread(&cache, "ws-1", "thread-fallback").expect("cache entry");
        assert_eq!(cached.effort.as_deref(), Some("high"));
    }
}
