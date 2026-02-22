use serde_json::Value;

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub(crate) struct ThreadCodexMetadata {
    pub(crate) model_id: Option<String>,
    pub(crate) effort: Option<String>,
}

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
    for key in ["modelId", "model_id", "model", "modelName", "model_name"] {
        let value = as_non_empty_string(record.get(key));
        if value.is_some() {
            return value;
        }
    }
    None
}

fn pick_effort(record: &serde_json::Map<String, Value>) -> Option<String> {
    for key in [
        "effort",
        "reasoningEffort",
        "reasoning_effort",
        "modelReasoningEffort",
        "model_reasoning_effort",
    ] {
        let value = normalize_effort(as_non_empty_string(record.get(key)));
        if value.is_some() {
            return value;
        }
    }
    None
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
        if metadata.model_id.is_some() && metadata.effort.is_some() {
            break;
        }
    }
    metadata
}

fn extract_from_turn(turn: &serde_json::Map<String, Value>) -> ThreadCodexMetadata {
    let mut metadata = extract_from_record(turn);
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
        if item_meta.model_id.is_some() {
            metadata.model_id = item_meta.model_id;
        }
        if item_meta.effort.is_some() {
            metadata.effort = item_meta.effort;
        }
        if metadata.model_id.is_some() && metadata.effort.is_some() {
            break;
        }
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
        if metadata.model_id.is_some() || metadata.effort.is_some() {
            return metadata;
        }
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
    }
    if let Some(effort) = metadata.effort.as_ref() {
        thread_object.insert("effort".to_string(), Value::String(effort.clone()));
        thread_object.insert(
            "reasoning_effort".to_string(),
            Value::String(effort.clone()),
        );
    }
}

pub(crate) fn thread_id_from_value(thread: &Value) -> Option<String> {
    let object = thread.as_object()?;
    as_non_empty_string(object.get("id"))
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
        assert_eq!(thread["effort"], "high");
        assert_eq!(thread["reasoning_effort"], "high");
    }
}
