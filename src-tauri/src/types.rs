use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct GitFileStatus {
    pub(crate) path: String,
    pub(crate) status: String,
    pub(crate) additions: i64,
    pub(crate) deletions: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct GitFileDiff {
    pub(crate) path: String,
    pub(crate) diff: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct GitLogEntry {
    pub(crate) sha: String,
    pub(crate) summary: String,
    pub(crate) author: String,
    pub(crate) timestamp: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct GitLogResponse {
    pub(crate) total: usize,
    pub(crate) entries: Vec<GitLogEntry>,
    #[serde(default)]
    pub(crate) ahead: usize,
    #[serde(default)]
    pub(crate) behind: usize,
    #[serde(default, rename = "aheadEntries")]
    pub(crate) ahead_entries: Vec<GitLogEntry>,
    #[serde(default, rename = "behindEntries")]
    pub(crate) behind_entries: Vec<GitLogEntry>,
    #[serde(default)]
    pub(crate) upstream: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct GitHubIssue {
    pub(crate) number: u64,
    pub(crate) title: String,
    pub(crate) url: String,
    #[serde(rename = "updatedAt")]
    pub(crate) updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct GitHubIssuesResponse {
    pub(crate) total: usize,
    pub(crate) issues: Vec<GitHubIssue>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct BranchInfo {
    pub(crate) name: String,
    pub(crate) last_commit: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct WorkspaceEntry {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) path: String,
    pub(crate) codex_bin: Option<String>,
    #[serde(default)]
    pub(crate) kind: WorkspaceKind,
    #[serde(default, rename = "parentId")]
    pub(crate) parent_id: Option<String>,
    #[serde(default)]
    pub(crate) worktree: Option<WorktreeInfo>,
    #[serde(default)]
    pub(crate) settings: WorkspaceSettings,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct WorkspaceInfo {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) path: String,
    pub(crate) connected: bool,
    pub(crate) codex_bin: Option<String>,
    #[serde(default)]
    pub(crate) kind: WorkspaceKind,
    #[serde(default, rename = "parentId")]
    pub(crate) parent_id: Option<String>,
    #[serde(default)]
    pub(crate) worktree: Option<WorktreeInfo>,
    #[serde(default)]
    pub(crate) settings: WorkspaceSettings,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "lowercase")]
pub(crate) enum WorkspaceKind {
    Main,
    Worktree,
}

impl Default for WorkspaceKind {
    fn default() -> Self {
        WorkspaceKind::Main
    }
}

impl WorkspaceKind {
    pub(crate) fn is_worktree(&self) -> bool {
        matches!(self, WorkspaceKind::Worktree)
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct WorktreeInfo {
    pub(crate) branch: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub(crate) struct WorkspaceSettings {
    #[serde(default, rename = "sidebarCollapsed")]
    pub(crate) sidebar_collapsed: bool,
    #[serde(default, rename = "sortOrder")]
    pub(crate) sort_order: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct AppSettings {
    #[serde(default, rename = "codexBin")]
    pub(crate) codex_bin: Option<String>,
    #[serde(default, rename = "runnerId")]
    pub(crate) runner_id: String,
    #[serde(default, rename = "cloudKitEnabled")]
    pub(crate) cloudkit_enabled: bool,
    #[serde(default, rename = "cloudKitContainerId")]
    pub(crate) cloudkit_container_id: Option<String>,
    #[serde(default, rename = "cloudKitPollIntervalMs")]
    pub(crate) cloudkit_poll_interval_ms: Option<u32>,
    #[serde(default, rename = "natsEnabled")]
    pub(crate) nats_enabled: bool,
    #[serde(default, rename = "natsUrl")]
    pub(crate) nats_url: Option<String>,
    #[serde(default, rename = "natsNamespace")]
    pub(crate) nats_namespace: Option<String>,
    #[serde(default, rename = "natsCredsFilePath")]
    pub(crate) nats_creds_file_path: Option<String>,
    #[serde(default, rename = "telegramEnabled")]
    pub(crate) telegram_enabled: bool,
    #[serde(default, rename = "telegramBotToken")]
    pub(crate) telegram_bot_token: Option<String>,
    #[serde(default, rename = "telegramAllowedUserIds")]
    pub(crate) telegram_allowed_user_ids: Vec<i64>,
    #[serde(default, rename = "telegramDefaultChatId")]
    pub(crate) telegram_default_chat_id: Option<i64>,
    #[serde(default = "default_access_mode", rename = "defaultAccessMode")]
    pub(crate) default_access_mode: String,
    #[serde(default = "default_ui_scale", rename = "uiScale")]
    pub(crate) ui_scale: f64,
    #[serde(
        default = "default_notification_sounds_enabled",
        rename = "notificationSoundsEnabled"
    )]
    pub(crate) notification_sounds_enabled: bool,
}

fn default_access_mode() -> String {
    "current".to_string()
}

fn default_ui_scale() -> f64 {
    1.0
}

fn default_notification_sounds_enabled() -> bool {
    true
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            codex_bin: None,
            runner_id: String::new(),
            cloudkit_enabled: cfg!(target_os = "ios"),
            cloudkit_container_id: None,
            cloudkit_poll_interval_ms: None,
            nats_enabled: false,
            nats_url: None,
            nats_namespace: None,
            nats_creds_file_path: None,
            telegram_enabled: false,
            telegram_bot_token: None,
            telegram_allowed_user_ids: Vec::new(),
            telegram_default_chat_id: None,
            default_access_mode: "current".to_string(),
            ui_scale: 1.0,
            notification_sounds_enabled: true,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{AppSettings, WorkspaceEntry, WorkspaceKind};

    #[test]
    fn app_settings_defaults_from_empty_json() {
        let settings: AppSettings = serde_json::from_str("{}").expect("settings deserialize");
        assert!(settings.codex_bin.is_none());
        assert!(settings.runner_id.is_empty());
        assert!(!settings.cloudkit_enabled);
        assert!(settings.cloudkit_container_id.is_none());
        assert!(settings.cloudkit_poll_interval_ms.is_none());
        assert!(!settings.nats_enabled);
        assert!(settings.nats_url.is_none());
        assert!(settings.nats_namespace.is_none());
        assert!(settings.nats_creds_file_path.is_none());
        assert!(!settings.telegram_enabled);
        assert!(settings.telegram_bot_token.is_none());
        assert!(settings.telegram_allowed_user_ids.is_empty());
        assert!(settings.telegram_default_chat_id.is_none());
        assert_eq!(settings.default_access_mode, "current");
        assert!((settings.ui_scale - 1.0).abs() < f64::EPSILON);
        assert!(settings.notification_sounds_enabled);
    }

    #[test]
    fn workspace_entry_defaults_from_minimal_json() {
        let entry: WorkspaceEntry = serde_json::from_str(
            r#"{"id":"1","name":"Test","path":"/tmp","codexBin":null}"#,
        )
        .expect("workspace deserialize");
        assert!(matches!(entry.kind, WorkspaceKind::Main));
        assert!(entry.parent_id.is_none());
        assert!(entry.worktree.is_none());
        assert!(entry.settings.sort_order.is_none());
    }
}
