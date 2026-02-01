use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::files::io::read_text_file_within;
use crate::files::ops::write_with_policy;
use crate::files::policy::{policy_for, FileKind, FileScope};

/// Gemini CLI settings structure based on settings.json format
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeminiSettings {
    /// Enable preview/experimental features
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preview_features: Option<bool>,

    /// Enable Vim mode keybindings
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vim_mode: Option<bool>,

    /// Enable automatic updates
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enable_auto_update: Option<bool>,

    /// Model configuration
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<GeminiModelSettings>,

    /// Output configuration
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output: Option<GeminiOutputSettings>,

    /// UI configuration
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ui: Option<GeminiUiSettings>,

    /// Checkpointing/session recovery
    #[serde(skip_serializing_if = "Option::is_none")]
    pub checkpointing: Option<GeminiCheckpointSettings>,

    /// Privacy settings
    #[serde(skip_serializing_if = "Option::is_none")]
    pub privacy: Option<GeminiPrivacySettings>,

    /// Tool settings
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<GeminiToolSettings>,

    /// MCP (Model Context Protocol) server configuration
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mcp: Option<GeminiMcpSettings>,

    /// Sandbox configuration
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sandbox: Option<Value>,

    /// IDE integration settings
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ide: Option<GeminiIdeSettings>,

    /// Custom hooks
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hooks: Option<Value>,

    /// Capture any additional fields
    #[serde(flatten)]
    pub extra: std::collections::HashMap<String, Value>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeminiModelSettings {
    /// Active model name (e.g., "gemini-2.0-flash", "gemini-pro")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,

    /// Maximum conversation turns to keep in history
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_session_turns: Option<u32>,

    /// Context compression threshold
    #[serde(skip_serializing_if = "Option::is_none")]
    pub compression_threshold: Option<u32>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeminiOutputSettings {
    /// Output format: "text" or "json"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub format: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeminiUiSettings {
    /// Color theme
    #[serde(skip_serializing_if = "Option::is_none")]
    pub theme: Option<String>,

    /// Custom theme definitions
    #[serde(skip_serializing_if = "Option::is_none")]
    pub custom_themes: Option<Value>,

    /// Hide window title
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hide_window_title: Option<bool>,

    /// Hide banner
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hide_banner: Option<bool>,

    /// Hide footer
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hide_footer: Option<bool>,

    /// Accessibility settings
    #[serde(skip_serializing_if = "Option::is_none")]
    pub accessibility: Option<GeminiAccessibilitySettings>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeminiAccessibilitySettings {
    /// Enable screen reader mode (plain-text rendering)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub screen_reader: Option<bool>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeminiCheckpointSettings {
    /// Enable session checkpointing/recovery
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeminiPrivacySettings {
    /// Enable usage statistics collection
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage_statistics_enabled: Option<bool>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeminiToolSettings {
    /// Auto-accept safe tool calls (read-only operations)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auto_accept_safe: Option<bool>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeminiMcpSettings {
    /// MCP server configurations
    #[serde(skip_serializing_if = "Option::is_none")]
    pub servers: Option<std::collections::HashMap<String, GeminiMcpServerConfig>>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeminiMcpServerConfig {
    /// Server command to run
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,

    /// Command arguments
    #[serde(skip_serializing_if = "Option::is_none")]
    pub args: Option<Vec<String>>,

    /// Environment variables
    #[serde(skip_serializing_if = "Option::is_none")]
    pub env: Option<std::collections::HashMap<String, String>>,

    /// Working directory
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cwd: Option<String>,

    /// Whether server is enabled
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeminiIdeSettings {
    /// Enable IDE integration mode
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
}

/// Read settings from the user's ~/.gemini/settings.json
pub fn read_user_settings() -> Result<Option<GeminiSettings>, String> {
    let Some(root) = resolve_default_gemini_home() else {
        return Ok(None);
    };
    read_settings_from_root(&root)
}

/// Read settings from a project's .gemini/settings.json
pub fn read_project_settings(project_path: &Path) -> Result<Option<GeminiSettings>, String> {
    let settings_dir = project_path.join(".gemini");
    if !settings_dir.exists() {
        return Ok(None);
    }
    read_settings_from_root(&settings_dir)
}

/// Write settings to the user's ~/.gemini/settings.json
pub fn write_user_settings(settings: &GeminiSettings) -> Result<(), String> {
    let Some(root) = resolve_default_gemini_home() else {
        return Err("Unable to resolve GEMINI_HOME".to_string());
    };
    write_settings_to_root(&root, settings)
}

/// Get the model name from settings
pub fn read_settings_model(gemini_home: Option<PathBuf>) -> Result<Option<String>, String> {
    let root = gemini_home.or_else(resolve_default_gemini_home);
    let Some(root) = root else {
        return Ok(None);
    };
    let settings = read_settings_from_root(&root)?;
    Ok(settings.and_then(|s| s.model).and_then(|m| m.name))
}

/// Get the path to settings.json
pub fn settings_json_path() -> Option<PathBuf> {
    resolve_default_gemini_home().map(|home| home.join("settings.json"))
}

fn resolve_default_gemini_home() -> Option<PathBuf> {
    crate::gemini::home::resolve_default_gemini_home()
}

fn settings_policy() -> Result<crate::files::policy::FilePolicy, String> {
    // Use a custom policy for settings.json
    Ok(crate::files::policy::FilePolicy {
        filename: "settings.json",
        root_may_be_missing: true,
        root_context: "GEMINI_HOME",
        create_root: true,
        allow_external_symlink_target: false,
    })
}

fn read_settings_from_root(root: &Path) -> Result<Option<GeminiSettings>, String> {
    let policy = settings_policy()?;
    let response = read_text_file_within(
        root,
        policy.filename,
        policy.root_may_be_missing,
        policy.root_context,
        policy.filename,
        policy.allow_external_symlink_target,
    )?;

    if !response.exists || response.content.trim().is_empty() {
        return Ok(None);
    }

    let settings: GeminiSettings = serde_json::from_str(&response.content)
        .map_err(|e| format!("Failed to parse settings.json: {}", e))?;

    Ok(Some(settings))
}

fn write_settings_to_root(root: &Path, settings: &GeminiSettings) -> Result<(), String> {
    let policy = settings_policy()?;
    let content = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    write_with_policy(&root.to_path_buf(), policy, &content)
}

/// Merge project settings on top of user settings
pub fn merge_settings(
    user: Option<GeminiSettings>,
    project: Option<GeminiSettings>,
) -> GeminiSettings {
    let mut merged = user.unwrap_or_default();

    if let Some(project) = project {
        // Merge individual fields, project takes precedence
        if project.preview_features.is_some() {
            merged.preview_features = project.preview_features;
        }
        if project.vim_mode.is_some() {
            merged.vim_mode = project.vim_mode;
        }
        if project.enable_auto_update.is_some() {
            merged.enable_auto_update = project.enable_auto_update;
        }
        if project.model.is_some() {
            merged.model = project.model;
        }
        if project.output.is_some() {
            merged.output = project.output;
        }
        if project.ui.is_some() {
            merged.ui = project.ui;
        }
        if project.checkpointing.is_some() {
            merged.checkpointing = project.checkpointing;
        }
        if project.privacy.is_some() {
            merged.privacy = project.privacy;
        }
        if project.tools.is_some() {
            merged.tools = project.tools;
        }
        if project.mcp.is_some() {
            merged.mcp = project.mcp;
        }
        if project.sandbox.is_some() {
            merged.sandbox = project.sandbox;
        }
        if project.ide.is_some() {
            merged.ide = project.ide;
        }
        if project.hooks.is_some() {
            merged.hooks = project.hooks;
        }
        // Merge extra fields
        for (key, value) in project.extra {
            merged.extra.insert(key, value);
        }
    }

    merged
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_empty_settings() {
        let json = "{}";
        let settings: GeminiSettings = serde_json::from_str(json).unwrap();
        assert!(settings.preview_features.is_none());
        assert!(settings.model.is_none());
    }

    #[test]
    fn test_parse_model_settings() {
        let json = r#"{"model": {"name": "gemini-2.0-flash", "maxSessionTurns": 50}}"#;
        let settings: GeminiSettings = serde_json::from_str(json).unwrap();
        let model = settings.model.unwrap();
        assert_eq!(model.name.as_deref(), Some("gemini-2.0-flash"));
        assert_eq!(model.max_session_turns, Some(50));
    }

    #[test]
    fn test_parse_mcp_settings() {
        let json = r#"{
            "mcp": {
                "servers": {
                    "filesystem": {
                        "command": "npx",
                        "args": ["-y", "@anthropic/mcp-filesystem-server"],
                        "enabled": true
                    }
                }
            }
        }"#;
        let settings: GeminiSettings = serde_json::from_str(json).unwrap();
        let mcp = settings.mcp.unwrap();
        let servers = mcp.servers.unwrap();
        let fs_server = servers.get("filesystem").unwrap();
        assert_eq!(fs_server.command.as_deref(), Some("npx"));
        assert_eq!(fs_server.enabled, Some(true));
    }

    #[test]
    fn test_merge_settings() {
        let user = GeminiSettings {
            preview_features: Some(false),
            model: Some(GeminiModelSettings {
                name: Some("gemini-pro".to_string()),
                ..Default::default()
            }),
            ..Default::default()
        };

        let project = GeminiSettings {
            preview_features: Some(true),
            ..Default::default()
        };

        let merged = merge_settings(Some(user), Some(project));
        assert_eq!(merged.preview_features, Some(true)); // Project overrides
        assert_eq!(
            merged.model.as_ref().and_then(|m| m.name.as_deref()),
            Some("gemini-pro")
        ); // User setting preserved
    }
}
