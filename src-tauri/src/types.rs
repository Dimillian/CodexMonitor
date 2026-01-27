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
    #[serde(default, rename = "worktreeSetupScript")]
    pub(crate) worktree_setup_script: Option<String>,
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
    #[serde(default = "default_remote_backend_host", rename = "remoteBackendHost")]
    pub(crate) remote_backend_host: String,
    #[serde(default, rename = "remoteBackendToken")]
    pub(crate) remote_backend_token: Option<String>,
    #[serde(default = "default_access_mode", rename = "defaultAccessMode")]
    pub(crate) default_access_mode: String,
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
    #[serde(
        default = "default_experimental_collab_enabled",
        rename = "experimentalCollabEnabled"
    )]
    pub(crate) experimental_collab_enabled: bool,
    #[serde(
        default = "default_experimental_collaboration_modes_enabled",
        rename = "experimentalCollaborationModesEnabled"
    )]
    pub(crate) experimental_collaboration_modes_enabled: bool,
    #[serde(
        default = "default_experimental_steer_enabled",
        rename = "experimentalSteerEnabled"
    )]
    pub(crate) experimental_steer_enabled: bool,
    #[serde(
        default = "default_experimental_unified_exec_enabled",
        rename = "experimentalUnifiedExecEnabled"
    )]
    pub(crate) experimental_unified_exec_enabled: bool,
    #[serde(default = "default_dictation_enabled", rename = "dictationEnabled")]
    pub(crate) dictation_enabled: bool,
    #[serde(
        default = "default_dictation_model_id",
        rename = "dictationModelId"
    )]
    pub(crate) dictation_model_id: String,
    #[serde(default, rename = "dictationPreferredLanguage")]
    pub(crate) dictation_preferred_language: Option<String>,
    #[serde(
        default = "default_dictation_hold_key",
        rename = "dictationHoldKey"
    )]
    pub(crate) dictation_hold_key: String,
    #[serde(default = "default_composer_editor_preset", rename = "composerEditorPreset")]
    pub(crate) composer_editor_preset: String,
    #[serde(default = "default_composer_fence_expand_on_space", rename = "composerFenceExpandOnSpace")]
    pub(crate) composer_fence_expand_on_space: bool,
    #[serde(default = "default_composer_fence_expand_on_enter", rename = "composerFenceExpandOnEnter")]
    pub(crate) composer_fence_expand_on_enter: bool,
    #[serde(default = "default_composer_fence_language_tags", rename = "composerFenceLanguageTags")]
    pub(crate) composer_fence_language_tags: bool,
    #[serde(default = "default_composer_fence_wrap_selection", rename = "composerFenceWrapSelection")]
    pub(crate) composer_fence_wrap_selection: bool,
    #[serde(default = "default_composer_fence_auto_wrap_paste_multiline", rename = "composerFenceAutoWrapPasteMultiline")]
    pub(crate) composer_fence_auto_wrap_paste_multiline: bool,
    #[serde(default = "default_composer_fence_auto_wrap_paste_code_like", rename = "composerFenceAutoWrapPasteCodeLike")]
    pub(crate) composer_fence_auto_wrap_paste_code_like: bool,
    #[serde(default = "default_composer_list_continuation", rename = "composerListContinuation")]
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
        BackendMode::Local
    }
}

fn default_access_mode() -> String {
    "current".to_string()
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

fn default_ui_font_family() -> String {
    "\"SF Pro Text\", \"SF Pro Display\", -apple-system, \"Helvetica Neue\", sans-serif"
        .to_string()
}

fn default_code_font_family() -> String {
    "\"SF Mono\", \"SFMono-Regular\", Menlo, Monaco, monospace".to_string()
}

fn default_code_font_size() -> u8 {
    11
}

fn default_composer_model_shortcut() -> Option<String> {
    Some("cmd+shift+m".to_string())
}

fn default_composer_access_shortcut() -> Option<String> {
    Some("cmd+shift+a".to_string())
}

fn default_composer_reasoning_shortcut() -> Option<String> {
    Some("cmd+shift+r".to_string())
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
    Some("cmd+n".to_string())
}

fn default_new_worktree_agent_shortcut() -> Option<String> {
    Some("cmd+shift+n".to_string())
}

fn default_new_clone_agent_shortcut() -> Option<String> {
    Some("cmd+alt+n".to_string())
}

fn default_archive_thread_shortcut() -> Option<String> {
    Some("cmd+ctrl+a".to_string())
}

fn default_toggle_projects_sidebar_shortcut() -> Option<String> {
    Some("cmd+shift+p".to_string())
}

fn default_toggle_git_sidebar_shortcut() -> Option<String> {
    Some("cmd+shift+g".to_string())
}

fn default_toggle_debug_panel_shortcut() -> Option<String> {
    Some("cmd+shift+d".to_string())
}

fn default_toggle_terminal_shortcut() -> Option<String> {
    Some("cmd+shift+t".to_string())
}

fn default_cycle_agent_next_shortcut() -> Option<String> {
    Some("cmd+ctrl+down".to_string())
}

fn default_cycle_agent_prev_shortcut() -> Option<String> {
    Some("cmd+ctrl+up".to_string())
}

fn default_cycle_workspace_next_shortcut() -> Option<String> {
    Some("cmd+shift+down".to_string())
}

fn default_cycle_workspace_prev_shortcut() -> Option<String> {
    Some("cmd+shift+up".to_string())
}

fn default_notification_sounds_enabled() -> bool {
    true
}

fn default_experimental_collab_enabled() -> bool {
    false
}

fn default_experimental_collaboration_modes_enabled() -> bool {
    false
}

fn default_experimental_steer_enabled() -> bool {
    false
}

fn default_experimental_unified_exec_enabled() -> bool {
    false
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
    vec![
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
    ]
}

fn default_selected_open_app_id() -> String {
    "vscode".to_string()
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            codex_bin: None,
            codex_args: None,
            backend_mode: BackendMode::Local,
            remote_backend_host: default_remote_backend_host(),
            remote_backend_token: None,
            default_access_mode: "current".to_string(),
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
            ui_font_family: default_ui_font_family(),
            code_font_family: default_code_font_family(),
            code_font_size: default_code_font_size(),
            notification_sounds_enabled: true,
            experimental_collab_enabled: false,
            experimental_collaboration_modes_enabled: false,
            experimental_steer_enabled: false,
            experimental_unified_exec_enabled: false,
            dictation_enabled: false,
            dictation_model_id: default_dictation_model_id(),
            dictation_preferred_language: None,
            dictation_hold_key: default_dictation_hold_key(),
            composer_editor_preset: default_composer_editor_preset(),
            composer_fence_expand_on_space: default_composer_fence_expand_on_space(),
            composer_fence_expand_on_enter: default_composer_fence_expand_on_enter(),
            composer_fence_language_tags: default_composer_fence_language_tags(),
            composer_fence_wrap_selection: default_composer_fence_wrap_selection(),
            composer_fence_auto_wrap_paste_multiline: default_composer_fence_auto_wrap_paste_multiline(),
            composer_fence_auto_wrap_paste_code_like: default_composer_fence_auto_wrap_paste_code_like(),
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
        AppSettings, BackendMode, WorkspaceEntry, WorkspaceGroup, WorkspaceKind, WorkspaceSettings,
    };

    #[test]
    fn app_settings_defaults_from_empty_json() {
        let settings: AppSettings = serde_json::from_str("{}").expect("settings deserialize");
        assert!(settings.codex_bin.is_none());
        assert!(matches!(settings.backend_mode, BackendMode::Local));
        assert_eq!(settings.remote_backend_host, "127.0.0.1:4732");
        assert!(settings.remote_backend_token.is_none());
        assert_eq!(settings.default_access_mode, "current");
        assert_eq!(
            settings.composer_model_shortcut.as_deref(),
            Some("cmd+shift+m")
        );
        assert_eq!(
            settings.composer_access_shortcut.as_deref(),
            Some("cmd+shift+a")
        );
        assert_eq!(
            settings.composer_reasoning_shortcut.as_deref(),
            Some("cmd+shift+r")
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
        assert_eq!(settings.interrupt_shortcut.as_deref(), Some(expected_interrupt));
        assert_eq!(
            settings.archive_thread_shortcut.as_deref(),
            Some("cmd+ctrl+a")
        );
        assert_eq!(
            settings.toggle_debug_panel_shortcut.as_deref(),
            Some("cmd+shift+d")
        );
        assert_eq!(
            settings.toggle_terminal_shortcut.as_deref(),
            Some("cmd+shift+t")
        );
        assert_eq!(
            settings.cycle_agent_next_shortcut.as_deref(),
            Some("cmd+ctrl+down")
        );
        assert_eq!(
            settings.cycle_agent_prev_shortcut.as_deref(),
            Some("cmd+ctrl+up")
        );
        assert_eq!(
            settings.cycle_workspace_next_shortcut.as_deref(),
            Some("cmd+shift+down")
        );
        assert_eq!(
            settings.cycle_workspace_prev_shortcut.as_deref(),
            Some("cmd+shift+up")
        );
        assert!(settings.last_composer_model_id.is_none());
        assert!(settings.last_composer_reasoning_effort.is_none());
        assert!((settings.ui_scale - 1.0).abs() < f64::EPSILON);
        assert_eq!(settings.theme, "system");
        assert!(settings.ui_font_family.contains("SF Pro Text"));
        assert!(settings.code_font_family.contains("SF Mono"));
        assert_eq!(settings.code_font_size, 11);
        assert!(settings.notification_sounds_enabled);
        assert!(!settings.experimental_steer_enabled);
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
        assert_eq!(settings.selected_open_app_id, "vscode");
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
        let entry: WorkspaceEntry = serde_json::from_str(
            r#"{"id":"1","name":"Test","path":"/tmp","codexBin":null}"#,
        )
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
