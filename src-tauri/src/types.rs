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
    #[serde(default, rename = "oldLines")]
    pub(crate) old_lines: Option<Vec<String>>,
    #[serde(default, rename = "newLines")]
    pub(crate) new_lines: Option<Vec<String>>,
    #[serde(default, rename = "isBinary")]
    pub(crate) is_binary: bool,
    #[serde(default, rename = "isImage")]
    pub(crate) is_image: bool,
    #[serde(rename = "oldImageData")]
    pub(crate) old_image_data: Option<String>,
    #[serde(rename = "newImageData")]
    pub(crate) new_image_data: Option<String>,
    #[serde(rename = "oldImageMime")]
    pub(crate) old_image_mime: Option<String>,
    #[serde(rename = "newImageMime")]
    pub(crate) new_image_mime: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct GitCommitDiff {
    pub(crate) path: String,
    pub(crate) status: String,
    pub(crate) diff: String,
    #[serde(default, rename = "oldLines")]
    pub(crate) old_lines: Option<Vec<String>>,
    #[serde(default, rename = "newLines")]
    pub(crate) new_lines: Option<Vec<String>>,
    #[serde(default, rename = "isBinary")]
    pub(crate) is_binary: bool,
    #[serde(default, rename = "isImage")]
    pub(crate) is_image: bool,
    #[serde(rename = "oldImageData")]
    pub(crate) old_image_data: Option<String>,
    #[serde(rename = "newImageData")]
    pub(crate) new_image_data: Option<String>,
    #[serde(rename = "oldImageMime")]
    pub(crate) old_image_mime: Option<String>,
    #[serde(rename = "newImageMime")]
    pub(crate) new_image_mime: Option<String>,
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
pub(crate) struct GitHubPullRequestAuthor {
    pub(crate) login: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct GitHubPullRequest {
    pub(crate) number: u64,
    pub(crate) title: String,
    pub(crate) url: String,
    #[serde(rename = "updatedAt")]
    pub(crate) updated_at: String,
    #[serde(rename = "createdAt")]
    pub(crate) created_at: String,
    pub(crate) body: String,
    #[serde(rename = "headRefName")]
    pub(crate) head_ref_name: String,
    #[serde(rename = "baseRefName")]
    pub(crate) base_ref_name: String,
    #[serde(rename = "isDraft")]
    pub(crate) is_draft: bool,
    #[serde(default)]
    pub(crate) author: Option<GitHubPullRequestAuthor>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct GitHubPullRequestsResponse {
    pub(crate) total: usize,
    #[serde(rename = "pullRequests")]
    pub(crate) pull_requests: Vec<GitHubPullRequest>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct GitHubPullRequestDiff {
    pub(crate) path: String,
    pub(crate) status: String,
    pub(crate) diff: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct GitHubPullRequestComment {
    pub(crate) id: u64,
    #[serde(default)]
    pub(crate) body: String,
    #[serde(rename = "createdAt")]
    pub(crate) created_at: String,
    #[serde(default)]
    pub(crate) url: String,
    #[serde(default)]
    pub(crate) author: Option<GitHubPullRequestAuthor>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LocalUsageDay {
    pub(crate) day: String,
    pub(crate) input_tokens: i64,
    pub(crate) cached_input_tokens: i64,
    pub(crate) output_tokens: i64,
    pub(crate) total_tokens: i64,
    #[serde(default)]
    pub(crate) agent_time_ms: i64,
    #[serde(default)]
    pub(crate) agent_runs: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LocalUsageTotals {
    pub(crate) last7_days_tokens: i64,
    pub(crate) last30_days_tokens: i64,
    pub(crate) average_daily_tokens: i64,
    pub(crate) cache_hit_rate_percent: f64,
    pub(crate) peak_day: Option<String>,
    pub(crate) peak_day_tokens: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LocalUsageModel {
    pub(crate) model: String,
    pub(crate) tokens: i64,
    pub(crate) share_percent: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LocalUsageSnapshot {
    pub(crate) updated_at: i64,
    pub(crate) days: Vec<LocalUsageDay>,
    pub(crate) totals: LocalUsageTotals,
    #[serde(default)]
    pub(crate) top_models: Vec<LocalUsageModel>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OrbitConnectTestResult {
    pub(crate) ok: bool,
    pub(crate) latency_ms: Option<u64>,
    pub(crate) message: String,
    #[serde(default)]
    pub(crate) details: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OrbitDeviceCodeStart {
    pub(crate) device_code: String,
    #[serde(default)]
    pub(crate) user_code: Option<String>,
    pub(crate) verification_uri: String,
    #[serde(default)]
    pub(crate) verification_uri_complete: Option<String>,
    pub(crate) interval_seconds: u32,
    pub(crate) expires_in_seconds: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum OrbitSignInStatus {
    Pending,
    Authorized,
    Denied,
    Expired,
    Error,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OrbitSignInPollResult {
    pub(crate) status: OrbitSignInStatus,
    #[serde(default)]
    pub(crate) token: Option<String>,
    #[serde(default)]
    pub(crate) message: Option<String>,
    #[serde(default)]
    pub(crate) interval_seconds: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OrbitSignOutResult {
    pub(crate) success: bool,
    #[serde(default)]
    pub(crate) message: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum OrbitRunnerState {
    Stopped,
    Running,
    Error,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OrbitRunnerStatus {
    pub(crate) state: OrbitRunnerState,
    #[serde(default)]
    pub(crate) pid: Option<u32>,
    #[serde(default)]
    pub(crate) started_at_ms: Option<i64>,
    #[serde(default)]
    pub(crate) last_error: Option<String>,
    #[serde(default)]
    pub(crate) orbit_url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum TcpDaemonState {
    Stopped,
    Running,
    Error,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TcpDaemonStatus {
    pub(crate) state: TcpDaemonState,
    #[serde(default)]
    pub(crate) pid: Option<u32>,
    #[serde(default)]
    pub(crate) started_at_ms: Option<i64>,
    #[serde(default)]
    pub(crate) last_error: Option<String>,
    #[serde(default)]
    pub(crate) listen_addr: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TailscaleStatus {
    pub(crate) installed: bool,
    pub(crate) running: bool,
    #[serde(default)]
    pub(crate) version: Option<String>,
    #[serde(default)]
    pub(crate) dns_name: Option<String>,
    #[serde(default)]
    pub(crate) host_name: Option<String>,
    #[serde(default)]
    pub(crate) tailnet_name: Option<String>,
    #[serde(default)]
    pub(crate) ipv4: Vec<String>,
    #[serde(default)]
    pub(crate) ipv6: Vec<String>,
    #[serde(default)]
    pub(crate) suggested_remote_host: Option<String>,
    pub(crate) message: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TailscaleDaemonCommandPreview {
    pub(crate) command: String,
    pub(crate) daemon_path: String,
    pub(crate) args: Vec<String>,
    pub(crate) token_configured: bool,
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

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct WorkspaceGroup {
    pub(crate) id: String,
    pub(crate) name: String,
    #[serde(default, rename = "sortOrder")]
    pub(crate) sort_order: Option<u32>,
    #[serde(default, rename = "copiesFolder")]
    pub(crate) copies_folder: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub(crate) struct WorkspaceSettings {
    #[serde(default, rename = "sidebarCollapsed")]
    pub(crate) sidebar_collapsed: bool,
    #[serde(default, rename = "sortOrder")]
    pub(crate) sort_order: Option<u32>,
    #[serde(default, rename = "groupId")]
    pub(crate) group_id: Option<String>,
    #[serde(default, rename = "gitRoot")]
    pub(crate) git_root: Option<String>,
    #[serde(default, rename = "codexHome")]
    pub(crate) codex_home: Option<String>,
    #[serde(default, rename = "codexArgs")]
    pub(crate) codex_args: Option<String>,
    #[serde(default, rename = "launchScript")]
    pub(crate) launch_script: Option<String>,
    #[serde(default, rename = "launchScripts")]
    pub(crate) launch_scripts: Option<Vec<LaunchScriptEntry>>,
    #[serde(default, rename = "worktreeSetupScript")]
    pub(crate) worktree_setup_script: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct LaunchScriptEntry {
    pub(crate) id: String,
    pub(crate) script: String,
    pub(crate) icon: String,
    #[serde(default)]
    pub(crate) label: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct WorktreeSetupStatus {
    #[serde(rename = "shouldRun")]
    pub(crate) should_run: bool,
    pub(crate) script: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct OpenAppTarget {
    pub(crate) id: String,
    pub(crate) label: String,
    pub(crate) kind: String,
    #[serde(default, rename = "appName")]
    pub(crate) app_name: Option<String>,
    #[serde(default)]
    pub(crate) command: Option<String>,
    #[serde(default)]
    pub(crate) args: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct AppSettings {
    #[serde(default, rename = "codexBin")]
    pub(crate) codex_bin: Option<String>,
    #[serde(default, rename = "codexArgs")]
    pub(crate) codex_args: Option<String>,
    #[serde(default, rename = "backendMode")]
    pub(crate) backend_mode: BackendMode,
    #[serde(default, rename = "remoteBackendProvider")]
    pub(crate) remote_backend_provider: RemoteBackendProvider,
    #[serde(default = "default_remote_backend_host", rename = "remoteBackendHost")]
    pub(crate) remote_backend_host: String,
    #[serde(default, rename = "remoteBackendToken")]
    pub(crate) remote_backend_token: Option<String>,
    #[serde(default, rename = "orbitWsUrl")]
    pub(crate) orbit_ws_url: Option<String>,
    #[serde(default, rename = "orbitAuthUrl")]
    pub(crate) orbit_auth_url: Option<String>,
    #[serde(default, rename = "orbitRunnerName")]
    pub(crate) orbit_runner_name: Option<String>,
    #[serde(default, rename = "orbitAutoStartRunner")]
    pub(crate) orbit_auto_start_runner: bool,
    #[serde(default, rename = "keepDaemonRunningAfterAppClose")]
    pub(crate) keep_daemon_running_after_app_close: bool,
    #[serde(default, rename = "orbitUseAccess")]
    pub(crate) orbit_use_access: bool,
    #[serde(default, rename = "orbitAccessClientId")]
    pub(crate) orbit_access_client_id: Option<String>,
    #[serde(default, rename = "orbitAccessClientSecretRef")]
    pub(crate) orbit_access_client_secret_ref: Option<String>,
    #[serde(default = "default_access_mode", rename = "defaultAccessMode")]
    pub(crate) default_access_mode: String,
    #[serde(
        default = "default_review_delivery_mode",
        rename = "reviewDeliveryMode"
    )]
    pub(crate) review_delivery_mode: String,
    #[serde(
        default = "default_composer_model_shortcut",
        rename = "composerModelShortcut"
    )]
    pub(crate) composer_model_shortcut: Option<String>,
    #[serde(
        default = "default_composer_access_shortcut",
        rename = "composerAccessShortcut"
    )]
    pub(crate) composer_access_shortcut: Option<String>,
    #[serde(
        default = "default_composer_reasoning_shortcut",
        rename = "composerReasoningShortcut"
    )]
    pub(crate) composer_reasoning_shortcut: Option<String>,
    #[serde(default = "default_interrupt_shortcut", rename = "interruptShortcut")]
    pub(crate) interrupt_shortcut: Option<String>,
    #[serde(
        default = "default_composer_collaboration_shortcut",
        rename = "composerCollaborationShortcut"
    )]
    pub(crate) composer_collaboration_shortcut: Option<String>,
    #[serde(default = "default_new_agent_shortcut", rename = "newAgentShortcut")]
    pub(crate) new_agent_shortcut: Option<String>,
    #[serde(
        default = "default_new_worktree_agent_shortcut",
        rename = "newWorktreeAgentShortcut"
    )]
    pub(crate) new_worktree_agent_shortcut: Option<String>,
    #[serde(
        default = "default_new_clone_agent_shortcut",
        rename = "newCloneAgentShortcut"
    )]
    pub(crate) new_clone_agent_shortcut: Option<String>,
    #[serde(
        default = "default_archive_thread_shortcut",
        rename = "archiveThreadShortcut"
    )]
    pub(crate) archive_thread_shortcut: Option<String>,
    #[serde(
        default = "default_toggle_projects_sidebar_shortcut",
        rename = "toggleProjectsSidebarShortcut"
    )]
    pub(crate) toggle_projects_sidebar_shortcut: Option<String>,
    #[serde(
        default = "default_toggle_git_sidebar_shortcut",
        rename = "toggleGitSidebarShortcut"
    )]
    pub(crate) toggle_git_sidebar_shortcut: Option<String>,
    #[serde(
        default = "default_toggle_debug_panel_shortcut",
        rename = "toggleDebugPanelShortcut"
    )]
    pub(crate) toggle_debug_panel_shortcut: Option<String>,
    #[serde(
        default = "default_toggle_terminal_shortcut",
        rename = "toggleTerminalShortcut"
    )]
    pub(crate) toggle_terminal_shortcut: Option<String>,
    #[serde(
        default = "default_cycle_agent_next_shortcut",
        rename = "cycleAgentNextShortcut"
    )]
    pub(crate) cycle_agent_next_shortcut: Option<String>,
    #[serde(
        default = "default_cycle_agent_prev_shortcut",
        rename = "cycleAgentPrevShortcut"
    )]
    pub(crate) cycle_agent_prev_shortcut: Option<String>,
    #[serde(
        default = "default_cycle_workspace_next_shortcut",
        rename = "cycleWorkspaceNextShortcut"
    )]
    pub(crate) cycle_workspace_next_shortcut: Option<String>,
    #[serde(
        default = "default_cycle_workspace_prev_shortcut",
        rename = "cycleWorkspacePrevShortcut"
    )]
    pub(crate) cycle_workspace_prev_shortcut: Option<String>,
    #[serde(default, rename = "lastComposerModelId")]
    pub(crate) last_composer_model_id: Option<String>,
    #[serde(default, rename = "lastComposerReasoningEffort")]
    pub(crate) last_composer_reasoning_effort: Option<String>,
    #[serde(default = "default_ui_scale", rename = "uiScale")]
    pub(crate) ui_scale: f64,
    #[serde(default = "default_theme", rename = "theme")]
    pub(crate) theme: String,
    #[serde(
        default = "default_usage_show_remaining",
        rename = "usageShowRemaining"
    )]
    pub(crate) usage_show_remaining: bool,
    #[serde(
        default = "default_show_message_file_path",
        rename = "showMessageFilePath"
    )]
    pub(crate) show_message_file_path: bool,
    #[serde(default, rename = "threadTitleAutogenerationEnabled")]
    pub(crate) thread_title_autogeneration_enabled: bool,
    #[serde(default = "default_ui_font_family", rename = "uiFontFamily")]
    pub(crate) ui_font_family: String,
    #[serde(default = "default_code_font_family", rename = "codeFontFamily")]
    pub(crate) code_font_family: String,
    #[serde(default = "default_code_font_size", rename = "codeFontSize")]
    pub(crate) code_font_size: u8,
    #[serde(
        default = "default_notification_sounds_enabled",
        rename = "notificationSoundsEnabled"
    )]
    pub(crate) notification_sounds_enabled: bool,
    #[serde(default = "default_preload_git_diffs", rename = "preloadGitDiffs")]
    pub(crate) preload_git_diffs: bool,
    #[serde(
        default = "default_git_diff_ignore_whitespace_changes",
        rename = "gitDiffIgnoreWhitespaceChanges"
    )]
    pub(crate) git_diff_ignore_whitespace_changes: bool,
    #[serde(
        default = "default_commit_message_prompt",
        rename = "commitMessagePrompt"
    )]
    pub(crate) commit_message_prompt: String,
    #[serde(
        default = "default_system_notifications_enabled",
        rename = "systemNotificationsEnabled"
    )]
    pub(crate) system_notifications_enabled: bool,
    #[serde(
        default = "default_experimental_collab_enabled",
        rename = "experimentalCollabEnabled"
    )]
    pub(crate) experimental_collab_enabled: bool,
    #[serde(
        default = "default_collaboration_modes_enabled",
        rename = "collaborationModesEnabled"
    )]
    pub(crate) collaboration_modes_enabled: bool,
    #[serde(
        default = "default_steer_enabled",
        rename = "steerEnabled",
        alias = "experimentalSteerEnabled"
    )]
    pub(crate) steer_enabled: bool,
    #[serde(
        default = "default_unified_exec_enabled",
        rename = "unifiedExecEnabled",
        alias = "experimentalUnifiedExecEnabled"
    )]
    pub(crate) unified_exec_enabled: bool,
    #[serde(
        default = "default_experimental_apps_enabled",
        rename = "experimentalAppsEnabled"
    )]
    pub(crate) experimental_apps_enabled: bool,
    #[serde(default = "default_personality", rename = "personality")]
    pub(crate) personality: String,
    #[serde(default = "default_dictation_enabled", rename = "dictationEnabled")]
    pub(crate) dictation_enabled: bool,
    #[serde(default = "default_dictation_model_id", rename = "dictationModelId")]
    pub(crate) dictation_model_id: String,
    #[serde(default, rename = "dictationPreferredLanguage")]
    pub(crate) dictation_preferred_language: Option<String>,
    #[serde(default = "default_dictation_hold_key", rename = "dictationHoldKey")]
    pub(crate) dictation_hold_key: String,
    #[serde(
        default = "default_composer_editor_preset",
        rename = "composerEditorPreset"
    )]
    pub(crate) composer_editor_preset: String,
    #[serde(
        default = "default_composer_fence_expand_on_space",
        rename = "composerFenceExpandOnSpace"
    )]
    pub(crate) composer_fence_expand_on_space: bool,
    #[serde(
        default = "default_composer_fence_expand_on_enter",
        rename = "composerFenceExpandOnEnter"
    )]
    pub(crate) composer_fence_expand_on_enter: bool,
    #[serde(
        default = "default_composer_fence_language_tags",
        rename = "composerFenceLanguageTags"
    )]
    pub(crate) composer_fence_language_tags: bool,
    #[serde(
        default = "default_composer_fence_wrap_selection",
        rename = "composerFenceWrapSelection"
    )]
    pub(crate) composer_fence_wrap_selection: bool,
    #[serde(
        default = "default_composer_fence_auto_wrap_paste_multiline",
        rename = "composerFenceAutoWrapPasteMultiline"
    )]
    pub(crate) composer_fence_auto_wrap_paste_multiline: bool,
    #[serde(
        default = "default_composer_fence_auto_wrap_paste_code_like",
        rename = "composerFenceAutoWrapPasteCodeLike"
    )]
    pub(crate) composer_fence_auto_wrap_paste_code_like: bool,
    #[serde(
        default = "default_composer_list_continuation",
        rename = "composerListContinuation"
    )]
    pub(crate) composer_list_continuation: bool,
    #[serde(
        default = "default_composer_code_block_copy_use_modifier",
        rename = "composerCodeBlockCopyUseModifier"
    )]
    pub(crate) composer_code_block_copy_use_modifier: bool,
    #[serde(default = "default_workspace_groups", rename = "workspaceGroups")]
    pub(crate) workspace_groups: Vec<WorkspaceGroup>,
    #[serde(default = "default_open_app_targets", rename = "openAppTargets")]
    pub(crate) open_app_targets: Vec<OpenAppTarget>,
    #[serde(default = "default_selected_open_app_id", rename = "selectedOpenAppId")]
    pub(crate) selected_open_app_id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "lowercase")]
pub(crate) enum BackendMode {
    Local,
    Remote,
}

impl Default for BackendMode {
    fn default() -> Self {
        default_backend_mode()
    }
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub(crate) enum RemoteBackendProvider {
    Tcp,
    Orbit,
}

impl Default for RemoteBackendProvider {
    fn default() -> Self {
        RemoteBackendProvider::Tcp
    }
}

fn default_access_mode() -> String {
    "current".to_string()
}

fn default_review_delivery_mode() -> String {
    "inline".to_string()
}

fn default_backend_mode() -> BackendMode {
    if cfg!(target_os = "ios") {
        BackendMode::Remote
    } else {
        BackendMode::Local
    }
}

fn default_remote_backend_host() -> String {
    "127.0.0.1:4732".to_string()
}

fn default_ui_scale() -> f64 {
    1.0
}

fn default_theme() -> String {
    "system".to_string()
}

fn default_usage_show_remaining() -> bool {
    false
}

fn default_show_message_file_path() -> bool {
    true
}

fn default_ui_font_family() -> String {
    "system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif".to_string()
}

fn default_code_font_family() -> String {
    "ui-monospace, \"Cascadia Mono\", \"Segoe UI Mono\", Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace".to_string()
}

fn default_code_font_size() -> u8 {
    11
}

fn default_composer_model_shortcut() -> Option<String> {
    let value = if cfg!(target_os = "macos") {
        "cmd+shift+m"
    } else {
        "ctrl+shift+m"
    };
    Some(value.to_string())
}

fn default_composer_access_shortcut() -> Option<String> {
    let value = if cfg!(target_os = "macos") {
        "cmd+shift+a"
    } else {
        "ctrl+shift+a"
    };
    Some(value.to_string())
}

fn default_composer_reasoning_shortcut() -> Option<String> {
    let value = if cfg!(target_os = "macos") {
        "cmd+shift+r"
    } else {
        "ctrl+shift+r"
    };
    Some(value.to_string())
}

fn default_interrupt_shortcut() -> Option<String> {
    let value = if cfg!(target_os = "macos") {
        "ctrl+c"
    } else {
        "ctrl+shift+c"
    };
    Some(value.to_string())
}

fn default_composer_collaboration_shortcut() -> Option<String> {
    Some("shift+tab".to_string())
}

fn default_new_agent_shortcut() -> Option<String> {
    let value = if cfg!(target_os = "macos") {
        "cmd+n"
    } else {
        "ctrl+n"
    };
    Some(value.to_string())
}

fn default_new_worktree_agent_shortcut() -> Option<String> {
    let value = if cfg!(target_os = "macos") {
        "cmd+shift+n"
    } else {
        "ctrl+shift+n"
    };
    Some(value.to_string())
}

fn default_new_clone_agent_shortcut() -> Option<String> {
    let value = if cfg!(target_os = "macos") {
        "cmd+alt+n"
    } else {
        "ctrl+alt+n"
    };
    Some(value.to_string())
}

fn default_archive_thread_shortcut() -> Option<String> {
    let value = if cfg!(target_os = "macos") {
        "cmd+ctrl+a"
    } else {
        "ctrl+alt+a"
    };
    Some(value.to_string())
}

fn default_toggle_projects_sidebar_shortcut() -> Option<String> {
    let value = if cfg!(target_os = "macos") {
        "cmd+shift+p"
    } else {
        "ctrl+shift+p"
    };
    Some(value.to_string())
}

fn default_toggle_git_sidebar_shortcut() -> Option<String> {
    let value = if cfg!(target_os = "macos") {
        "cmd+shift+g"
    } else {
        "ctrl+shift+g"
    };
    Some(value.to_string())
}

fn default_toggle_debug_panel_shortcut() -> Option<String> {
    let value = if cfg!(target_os = "macos") {
        "cmd+shift+d"
    } else {
        "ctrl+shift+d"
    };
    Some(value.to_string())
}

fn default_toggle_terminal_shortcut() -> Option<String> {
    let value = if cfg!(target_os = "macos") {
        "cmd+shift+t"
    } else {
        "ctrl+shift+t"
    };
    Some(value.to_string())
}

fn default_cycle_agent_next_shortcut() -> Option<String> {
    let value = if cfg!(target_os = "macos") {
        "cmd+ctrl+down"
    } else {
        "ctrl+alt+down"
    };
    Some(value.to_string())
}

fn default_cycle_agent_prev_shortcut() -> Option<String> {
    let value = if cfg!(target_os = "macos") {
        "cmd+ctrl+up"
    } else {
        "ctrl+alt+up"
    };
    Some(value.to_string())
}

fn default_cycle_workspace_next_shortcut() -> Option<String> {
    let value = if cfg!(target_os = "macos") {
        "cmd+shift+down"
    } else {
        "ctrl+alt+shift+down"
    };
    Some(value.to_string())
}

fn default_cycle_workspace_prev_shortcut() -> Option<String> {
    let value = if cfg!(target_os = "macos") {
        "cmd+shift+up"
    } else {
        "ctrl+alt+shift+up"
    };
    Some(value.to_string())
}

fn default_notification_sounds_enabled() -> bool {
    true
}

fn default_system_notifications_enabled() -> bool {
    true
}

fn default_preload_git_diffs() -> bool {
    true
}

fn default_git_diff_ignore_whitespace_changes() -> bool {
    false
}

fn default_commit_message_prompt() -> String {
    "Generate a concise git commit message for the following changes. \
Follow conventional commit format (e.g., feat:, fix:, refactor:, docs:, etc.). \
Keep the summary line under 72 characters. \
Only output the commit message, nothing else.\n\n\
Changes:\n{diff}"
        .to_string()
}

fn default_experimental_collab_enabled() -> bool {
    false
}

fn default_collaboration_modes_enabled() -> bool {
    true
}

fn default_steer_enabled() -> bool {
    true
}

fn default_unified_exec_enabled() -> bool {
    true
}

fn default_experimental_apps_enabled() -> bool {
    false
}

fn default_personality() -> String {
    "friendly".to_string()
}

fn default_dictation_enabled() -> bool {
    false
}

fn default_dictation_model_id() -> String {
    "base".to_string()
}

fn default_dictation_hold_key() -> String {
    "alt".to_string()
}

fn default_composer_editor_preset() -> String {
    "default".to_string()
}

fn default_composer_fence_expand_on_space() -> bool {
    false
}

fn default_composer_fence_expand_on_enter() -> bool {
    false
}

fn default_composer_fence_language_tags() -> bool {
    false
}

fn default_composer_fence_wrap_selection() -> bool {
    false
}

fn default_composer_fence_auto_wrap_paste_multiline() -> bool {
    false
}

fn default_composer_fence_auto_wrap_paste_code_like() -> bool {
    false
}

fn default_composer_list_continuation() -> bool {
    false
}

fn default_composer_code_block_copy_use_modifier() -> bool {
    false
}

fn default_workspace_groups() -> Vec<WorkspaceGroup> {
    Vec::new()
}

fn default_open_app_targets() -> Vec<OpenAppTarget> {
    if cfg!(target_os = "macos") {
        return vec![
            OpenAppTarget {
                id: "vscode".to_string(),
                label: "VS Code".to_string(),
                kind: "app".to_string(),
                app_name: Some("Visual Studio Code".to_string()),
                command: None,
                args: Vec::new(),
            },
            OpenAppTarget {
                id: "cursor".to_string(),
                label: "Cursor".to_string(),
                kind: "app".to_string(),
                app_name: Some("Cursor".to_string()),
                command: None,
                args: Vec::new(),
            },
            OpenAppTarget {
                id: "zed".to_string(),
                label: "Zed".to_string(),
                kind: "app".to_string(),
                app_name: Some("Zed".to_string()),
                command: None,
                args: Vec::new(),
            },
            OpenAppTarget {
                id: "ghostty".to_string(),
                label: "Ghostty".to_string(),
                kind: "app".to_string(),
                app_name: Some("Ghostty".to_string()),
                command: None,
                args: Vec::new(),
            },
            OpenAppTarget {
                id: "antigravity".to_string(),
                label: "Antigravity".to_string(),
                kind: "app".to_string(),
                app_name: Some("Antigravity".to_string()),
                command: None,
                args: Vec::new(),
            },
            OpenAppTarget {
                id: "finder".to_string(),
                label: "Finder".to_string(),
                kind: "finder".to_string(),
                app_name: None,
                command: None,
                args: Vec::new(),
            },
        ];
    }

    let file_manager_label = if cfg!(target_os = "windows") {
        "Explorer"
    } else {
        "File Manager"
    };

    vec![
        OpenAppTarget {
            id: "vscode".to_string(),
            label: "VS Code".to_string(),
            kind: "command".to_string(),
            app_name: None,
            command: Some("code".to_string()),
            args: Vec::new(),
        },
        OpenAppTarget {
            id: "cursor".to_string(),
            label: "Cursor".to_string(),
            kind: "command".to_string(),
            app_name: None,
            command: Some("cursor".to_string()),
            args: Vec::new(),
        },
        OpenAppTarget {
            id: "zed".to_string(),
            label: "Zed".to_string(),
            kind: "command".to_string(),
            app_name: None,
            command: Some("zed".to_string()),
            args: Vec::new(),
        },
        OpenAppTarget {
            id: "ghostty".to_string(),
            label: "Ghostty".to_string(),
            kind: "command".to_string(),
            app_name: None,
            command: Some("ghostty".to_string()),
            args: Vec::new(),
        },
        OpenAppTarget {
            id: "antigravity".to_string(),
            label: "Antigravity".to_string(),
            kind: "command".to_string(),
            app_name: None,
            command: Some("antigravity".to_string()),
            args: Vec::new(),
        },
        OpenAppTarget {
            id: "finder".to_string(),
            label: file_manager_label.to_string(),
            kind: "finder".to_string(),
            app_name: None,
            command: None,
            args: Vec::new(),
        },
    ]
}

fn default_selected_open_app_id() -> String {
    if cfg!(target_os = "windows") {
        "finder".to_string()
    } else {
        "vscode".to_string()
    }
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            codex_bin: None,
            codex_args: None,
            backend_mode: default_backend_mode(),
            remote_backend_provider: RemoteBackendProvider::Tcp,
            remote_backend_host: default_remote_backend_host(),
            remote_backend_token: None,
            orbit_ws_url: None,
            orbit_auth_url: None,
            orbit_runner_name: None,
            orbit_auto_start_runner: false,
            keep_daemon_running_after_app_close: false,
            orbit_use_access: false,
            orbit_access_client_id: None,
            orbit_access_client_secret_ref: None,
            default_access_mode: "current".to_string(),
            review_delivery_mode: default_review_delivery_mode(),
            composer_model_shortcut: default_composer_model_shortcut(),
            composer_access_shortcut: default_composer_access_shortcut(),
            composer_reasoning_shortcut: default_composer_reasoning_shortcut(),
            interrupt_shortcut: default_interrupt_shortcut(),
            composer_collaboration_shortcut: default_composer_collaboration_shortcut(),
            new_agent_shortcut: default_new_agent_shortcut(),
            new_worktree_agent_shortcut: default_new_worktree_agent_shortcut(),
            new_clone_agent_shortcut: default_new_clone_agent_shortcut(),
            archive_thread_shortcut: default_archive_thread_shortcut(),
            toggle_projects_sidebar_shortcut: default_toggle_projects_sidebar_shortcut(),
            toggle_git_sidebar_shortcut: default_toggle_git_sidebar_shortcut(),
            toggle_debug_panel_shortcut: default_toggle_debug_panel_shortcut(),
            toggle_terminal_shortcut: default_toggle_terminal_shortcut(),
            cycle_agent_next_shortcut: default_cycle_agent_next_shortcut(),
            cycle_agent_prev_shortcut: default_cycle_agent_prev_shortcut(),
            cycle_workspace_next_shortcut: default_cycle_workspace_next_shortcut(),
            cycle_workspace_prev_shortcut: default_cycle_workspace_prev_shortcut(),
            last_composer_model_id: None,
            last_composer_reasoning_effort: None,
            ui_scale: 1.0,
            theme: default_theme(),
            usage_show_remaining: default_usage_show_remaining(),
            show_message_file_path: default_show_message_file_path(),
            thread_title_autogeneration_enabled: false,
            ui_font_family: default_ui_font_family(),
            code_font_family: default_code_font_family(),
            code_font_size: default_code_font_size(),
            notification_sounds_enabled: true,
            system_notifications_enabled: true,
            preload_git_diffs: default_preload_git_diffs(),
            git_diff_ignore_whitespace_changes: default_git_diff_ignore_whitespace_changes(),
            commit_message_prompt: default_commit_message_prompt(),
            experimental_collab_enabled: false,
            collaboration_modes_enabled: true,
            steer_enabled: true,
            unified_exec_enabled: true,
            experimental_apps_enabled: false,
            personality: default_personality(),
            dictation_enabled: false,
            dictation_model_id: default_dictation_model_id(),
            dictation_preferred_language: None,
            dictation_hold_key: default_dictation_hold_key(),
            composer_editor_preset: default_composer_editor_preset(),
            composer_fence_expand_on_space: default_composer_fence_expand_on_space(),
            composer_fence_expand_on_enter: default_composer_fence_expand_on_enter(),
            composer_fence_language_tags: default_composer_fence_language_tags(),
            composer_fence_wrap_selection: default_composer_fence_wrap_selection(),
            composer_fence_auto_wrap_paste_multiline:
                default_composer_fence_auto_wrap_paste_multiline(),
            composer_fence_auto_wrap_paste_code_like:
                default_composer_fence_auto_wrap_paste_code_like(),
            composer_list_continuation: default_composer_list_continuation(),
            composer_code_block_copy_use_modifier: default_composer_code_block_copy_use_modifier(),
            workspace_groups: default_workspace_groups(),
            open_app_targets: default_open_app_targets(),
            selected_open_app_id: default_selected_open_app_id(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        AppSettings, BackendMode, RemoteBackendProvider, WorkspaceEntry, WorkspaceGroup,
        WorkspaceKind, WorkspaceSettings,
    };

    #[test]
    fn app_settings_defaults_from_empty_json() {
        let settings: AppSettings = serde_json::from_str("{}").expect("settings deserialize");
        assert!(settings.codex_bin.is_none());
        let expected_backend_mode = if cfg!(target_os = "ios") {
            BackendMode::Remote
        } else {
            BackendMode::Local
        };
        assert!(matches!(
            (&settings.backend_mode, &expected_backend_mode),
            (BackendMode::Local, BackendMode::Local) | (BackendMode::Remote, BackendMode::Remote)
        ));
        assert!(matches!(
            settings.remote_backend_provider,
            RemoteBackendProvider::Tcp
        ));
        assert_eq!(settings.remote_backend_host, "127.0.0.1:4732");
        assert!(settings.remote_backend_token.is_none());
        assert!(settings.orbit_ws_url.is_none());
        assert!(settings.orbit_auth_url.is_none());
        assert!(settings.orbit_runner_name.is_none());
        assert!(!settings.orbit_auto_start_runner);
        assert!(!settings.keep_daemon_running_after_app_close);
        assert!(!settings.orbit_use_access);
        assert!(settings.orbit_access_client_id.is_none());
        assert!(settings.orbit_access_client_secret_ref.is_none());
        assert_eq!(settings.default_access_mode, "current");
        assert_eq!(settings.review_delivery_mode, "inline");
        let expected_primary = if cfg!(target_os = "macos") {
            "cmd"
        } else {
            "ctrl"
        };
        let expected_model = format!("{expected_primary}+shift+m");
        let expected_access = format!("{expected_primary}+shift+a");
        let expected_reasoning = format!("{expected_primary}+shift+r");
        let expected_toggle_debug = format!("{expected_primary}+shift+d");
        let expected_toggle_terminal = format!("{expected_primary}+shift+t");
        assert_eq!(
            settings.composer_model_shortcut.as_deref(),
            Some(expected_model.as_str())
        );
        assert_eq!(
            settings.composer_access_shortcut.as_deref(),
            Some(expected_access.as_str())
        );
        assert_eq!(
            settings.composer_reasoning_shortcut.as_deref(),
            Some(expected_reasoning.as_str())
        );
        assert_eq!(
            settings.composer_collaboration_shortcut.as_deref(),
            Some("shift+tab")
        );
        let expected_interrupt = if cfg!(target_os = "macos") {
            "ctrl+c"
        } else {
            "ctrl+shift+c"
        };
        assert_eq!(
            settings.interrupt_shortcut.as_deref(),
            Some(expected_interrupt)
        );
        assert_eq!(
            settings.archive_thread_shortcut.as_deref(),
            Some(if cfg!(target_os = "macos") {
                "cmd+ctrl+a"
            } else {
                "ctrl+alt+a"
            })
        );
        assert_eq!(
            settings.toggle_debug_panel_shortcut.as_deref(),
            Some(expected_toggle_debug.as_str())
        );
        assert_eq!(
            settings.toggle_terminal_shortcut.as_deref(),
            Some(expected_toggle_terminal.as_str())
        );
        assert_eq!(
            settings.cycle_agent_next_shortcut.as_deref(),
            Some(if cfg!(target_os = "macos") {
                "cmd+ctrl+down"
            } else {
                "ctrl+alt+down"
            })
        );
        assert_eq!(
            settings.cycle_agent_prev_shortcut.as_deref(),
            Some(if cfg!(target_os = "macos") {
                "cmd+ctrl+up"
            } else {
                "ctrl+alt+up"
            })
        );
        assert_eq!(
            settings.cycle_workspace_next_shortcut.as_deref(),
            Some(if cfg!(target_os = "macos") {
                "cmd+shift+down"
            } else {
                "ctrl+alt+shift+down"
            })
        );
        assert_eq!(
            settings.cycle_workspace_prev_shortcut.as_deref(),
            Some(if cfg!(target_os = "macos") {
                "cmd+shift+up"
            } else {
                "ctrl+alt+shift+up"
            })
        );
        assert!(settings.last_composer_model_id.is_none());
        assert!(settings.last_composer_reasoning_effort.is_none());
        assert!((settings.ui_scale - 1.0).abs() < f64::EPSILON);
        assert_eq!(settings.theme, "system");
        assert!(!settings.usage_show_remaining);
        assert!(settings.show_message_file_path);
        assert!(!settings.thread_title_autogeneration_enabled);
        assert!(settings.ui_font_family.contains("system-ui"));
        assert!(settings.code_font_family.contains("ui-monospace"));
        assert_eq!(settings.code_font_size, 11);
        assert!(settings.notification_sounds_enabled);
        assert!(settings.system_notifications_enabled);
        assert!(settings.preload_git_diffs);
        assert!(!settings.git_diff_ignore_whitespace_changes);
        assert!(settings.commit_message_prompt.contains("{diff}"));
        assert!(settings.collaboration_modes_enabled);
        assert!(settings.steer_enabled);
        assert!(settings.unified_exec_enabled);
        assert!(!settings.experimental_apps_enabled);
        assert_eq!(settings.personality, "friendly");
        assert!(!settings.dictation_enabled);
        assert_eq!(settings.dictation_model_id, "base");
        assert!(settings.dictation_preferred_language.is_none());
        assert_eq!(settings.dictation_hold_key, "alt");
        assert_eq!(settings.composer_editor_preset, "default");
        assert!(!settings.composer_fence_expand_on_space);
        assert!(!settings.composer_fence_expand_on_enter);
        assert!(!settings.composer_fence_language_tags);
        assert!(!settings.composer_fence_wrap_selection);
        assert!(!settings.composer_fence_auto_wrap_paste_multiline);
        assert!(!settings.composer_fence_auto_wrap_paste_code_like);
        assert!(!settings.composer_list_continuation);
        assert!(!settings.composer_code_block_copy_use_modifier);
        assert!(settings.workspace_groups.is_empty());
        let expected_open_id = if cfg!(target_os = "windows") {
            "finder"
        } else {
            "vscode"
        };
        assert_eq!(settings.selected_open_app_id, expected_open_id);
        assert_eq!(settings.open_app_targets.len(), 6);
        assert_eq!(settings.open_app_targets[0].id, "vscode");
    }

    #[test]
    fn workspace_group_defaults_from_minimal_json() {
        let group: WorkspaceGroup =
            serde_json::from_str(r#"{"id":"g1","name":"Group"}"#).expect("group deserialize");
        assert!(group.sort_order.is_none());
        assert!(group.copies_folder.is_none());
    }

    #[test]
    fn app_settings_round_trip_preserves_workspace_group_copies_folder() {
        let mut settings = AppSettings::default();
        settings.workspace_groups = vec![WorkspaceGroup {
            id: "g1".to_string(),
            name: "Group".to_string(),
            sort_order: Some(2),
            copies_folder: Some("/tmp/group-copies".to_string()),
        }];

        let json = serde_json::to_string(&settings).expect("serialize settings");
        let decoded: AppSettings = serde_json::from_str(&json).expect("deserialize settings");
        assert_eq!(decoded.workspace_groups.len(), 1);
        assert_eq!(
            decoded.workspace_groups[0].copies_folder.as_deref(),
            Some("/tmp/group-copies")
        );
    }

    #[test]
    fn workspace_entry_defaults_from_minimal_json() {
        let entry: WorkspaceEntry =
            serde_json::from_str(r#"{"id":"1","name":"Test","path":"/tmp","codexBin":null}"#)
                .expect("workspace deserialize");
        assert!(matches!(entry.kind, WorkspaceKind::Main));
        assert!(entry.parent_id.is_none());
        assert!(entry.worktree.is_none());
        assert!(entry.settings.sort_order.is_none());
        assert!(entry.settings.group_id.is_none());
    }

    #[test]
    fn workspace_settings_defaults() {
        let settings = WorkspaceSettings::default();
        assert!(!settings.sidebar_collapsed);
        assert!(settings.sort_order.is_none());
        assert!(settings.group_id.is_none());
        assert!(settings.git_root.is_none());
    }
}
