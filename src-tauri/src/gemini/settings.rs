use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub(crate) struct GeminiSettings {
    #[serde(default)]
    pub(crate) model: Option<String>,
    #[serde(default)]
    pub(crate) mcp: Option<Value>,
    #[serde(flatten)]
    pub(crate) extra: HashMap<String, Value>,
}

pub(crate) fn settings_json_path() -> Option<PathBuf> {
    crate::gemini::home::resolve_default_gemini_home().map(|home| home.join("settings.json"))
}

pub(crate) fn read_user_settings() -> Result<Option<GeminiSettings>, String> {
    let Some(path) = settings_json_path() else {
        return Ok(None);
    };
    if !path.exists() {
        return Ok(None);
    }
    let contents = std::fs::read_to_string(&path)
        .map_err(|err| format!("Failed to read {}: {err}", path.display()))?;
    if contents.trim().is_empty() {
        return Ok(None);
    }
    serde_json::from_str::<GeminiSettings>(&contents)
        .map(Some)
        .map_err(|err| format!("Failed to parse {}: {err}", path.display()))
}

pub(crate) fn write_user_settings(settings: &GeminiSettings) -> Result<(), String> {
    let Some(path) = settings_json_path() else {
        return Err("Unable to resolve GEMINI_HOME".to_string());
    };
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|err| format!("Failed to create {}: {err}", parent.display()))?;
    }
    let json = serde_json::to_string_pretty(settings)
        .map_err(|err| format!("Failed to serialize settings: {err}"))?;
    std::fs::write(&path, format!("{json}\n"))
        .map_err(|err| format!("Failed to write {}: {err}", path.display()))
}

pub(crate) fn read_settings_model(gemini_home: Option<PathBuf>) -> Result<Option<String>, String> {
    let root = gemini_home.or_else(crate::gemini::home::resolve_default_gemini_home);
    let Some(root) = root else {
        return Err("Unable to resolve GEMINI_HOME".to_string());
    };
    let path = root.join("settings.json");
    if !path.exists() {
        return Ok(None);
    }
    let contents = std::fs::read_to_string(&path)
        .map_err(|err| format!("Failed to read {}: {err}", path.display()))?;
    if contents.trim().is_empty() {
        return Ok(None);
    }
    let parsed: Value =
        serde_json::from_str(&contents).map_err(|err| format!("Failed to parse {}: {err}", path.display()))?;
    let model = parsed.get("model").and_then(Value::as_str).map(str::trim);
    Ok(model.filter(|value| !value.is_empty()).map(ToOwned::to_owned))
}
