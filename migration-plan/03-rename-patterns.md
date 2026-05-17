# Mapping de Renommage Complet

## Règles Générales

1. `codex` (miniscule, réf. CLI ou concept) → `opencode`
2. `Codex` (majuscule, nom propre) → `OpenCode`
3. `CODEX` (constante/env var) → `OPENCODE`
4. `codex-monitor` (kebab) → `opencode-monitor`
5. `codex_monitor` (snake_case) → `opencode_monitor`
6. `codexMonitor` (camelCase) → `opencodeMonitor`
7. `CodexMonitor` (PascalCase) → `OpenCodeMonitor`

## Mapping Détaillé

### Projet et Binaires

| Ancien | Nouveau |
|--------|---------|
| `CodexMonitor` (projet) | `OpenCodeMonitor` |
| `codex-monitor` (crate/npm) | `opencode-monitor` |
| `codex_monitor_lib` (lib crate) | `opencode_monitor_lib` |
| `codex-monitor` (binary) | `opencode-monitor` |
| `codex_monitor_daemon` | `opencode_monitor_daemon` |
| `codex-monitor-daemon` | `opencode-monitor-daemon` |
| `codex_monitor_daemonctl` | `opencode_monitor_daemonctl` |
| `CODE_MONITOR_DAEMON_TOKEN` | `OPENCODE_MONITOR_DAEMON_TOKEN` |
| `CODEX_MONITOR_DAEMON_PATH` | `OPENCODE_MONITOR_DAEMON_PATH` |
| `TRAY_ID: "codex-monitor-tray"` | `"opencode-monitor-tray"` |
| `.tooltip("Codex Monitor")` | `.tooltip("OpenCode Monitor")` |

### Chemins de Configuration

| Ancien | Nouveau |
|--------|---------|
| `$CODEX_HOME` | `$OPENCODE_CONFIG_DIR` |
| `~/.codex` | `~/.config/opencode` |
| `~/.codex/config.toml` | `~/.config/opencode/opencode.json` |
| `~/.codex/auth.json` | (dans opencode.json ou keyring) |
| `~/.codex/agents/` | `~/.config/opencode/subagents/` |
| `~/.codex/prompts/` | `~/.config/opencode/prompts/` |
| `~/.codex/skills/` | (skills OpenCode) |
| `.codex-worktrees/` | `.opencode-worktrees/` |
| `.codexmonitor-*` | `.opencode-monitor-*` |

### Rust: Modules et Fonctions

| Ancien | Nouveau |
|--------|---------|
| `mod codex;` | `mod opencode;` |
| `mod codex_args` | `mod opencode_args` |
| `mod codex_config` | `mod opencode_config` |
| `mod codex_home` | `mod opencode_home` |
| `crate::codex::*` | `crate::opencode::*` |
| `shared::codex_core` | `shared::opencode_core` |
| `shared::codex_aux_core` | `shared::opencode_aux_core` |
| `shared::codex_update_core` | `shared::opencode_update_core` |
| `CodexLoginCancelState` | `OpenCodeLoginCancelState` |
| `WorkspaceSession` (dans codex/) | `OpenCodeSession` (dans opencode/) |
| `spawn_workspace_session` | `spawn_opencode_session` |
| `codex_doctor` | `opencode_check` |
| `codex_update` | `opencode_update` |
| `codex_login` / `codex_login_cancel` | `opencode_login` / `opencode_login_cancel` |
| `set_codex_feature_flag` | `set_opencode_feature_flag` |
| `get_codex_config_path` | `get_opencode_config_path` |
| `resolve_default_codex_home` | `resolve_default_opencode_home` |
| `resolve_workspace_codex_home` | `resolve_workspace_opencode_home` |
| `normalize_codex_home` | `normalize_opencode_home` |
| `parse_codex_args` | `parse_opencode_args` |
| `resolve_workspace_codex_args` | `resolve_workspace_opencode_args` |
| `build_codex_command_with_bin` | `build_opencode_command_with_bin` |
| `build_codex_path_env` | `build_opencode_path_env` |
| `check_codex_installation` | `check_opencode_installation` |
| `should_inline_image_path_for_codex` | `should_inline_image_path_for_opencode` |
| `SetWorkspaceRuntimeCodexArgsRequest` | `SetWorkspaceRuntimeOcodeArgsRequest` |
| `WorkspaceRuntimeCodexArgsResult` | `WorkspaceRuntimeOcodeArgsResult` |
| `set_workspace_runtime_codex_args_core` | `set_workspace_runtime_opencode_args_core` |

### TypeScript/Frontend: Types et Fonctions

| Ancien | Nouveau |
|--------|---------|
| `codexBin` (AppSettings) | `opencodeBin` |
| `codexArgs` (AppSettings) | `opencodeArgs` |
| `CodexDoctorResult` | `OpenCodeCheckResult` |
| `CodexUpdateResult` | `OpenCodeUpdateResult` |
| `CodexUpdateMethod` | `OpenCodeUpdateMethod` |
| `CodexFeature` | `OpenCodeFeature` |
| `CodexFeatureStage` | `OpenCodeFeatureStage` |
| `ThreadCodexParams` | `ThreadOpenCodeParams` |
| `ThreadCodexParamsMap` | `ThreadOpenCodeParamsMap` |
| `codexArgsOverride` (field) | `opencodeArgsOverride` |
| `makeThreadCodexParamsKey` | `makeThreadOpenCodeParamsKey` |
| `loadThreadCodexParams` | `loadThreadOpenCodeParams` |
| `saveThreadCodexParams` | `saveThreadOpenCodeParams` |
| `CodexArgsOption` | `OpenCodeArgsOption` |
| `CodexArgsRecognizedSegment` | `OpenCodeArgsRecognizedSegment` |
| `ParsedCodexArgsProfile` | `ParsedOpenCodeArgsProfile` |
| `normalizeCodexArgs` | `normalizeOpenCodeArgs` |
| `normalizeCodexArgsInput` | `normalizeOpenCodeArgsInput` |
| `parseCodexArgsProfile` | `parseOpenCodeArgsProfile` |
| `getCodexConfigPath` | `getOpenCodeConfigPath` |
| `runCodexDoctor` | `runOpenCodeCheck` |
| `runCodexUpdate` | `runOpenCodeUpdate` |
| `runCodexLogin` | `runOpenCodeLogin` |
| `cancelCodexLogin` | `cancelOpenCodeLogin` |
| `setCodexFeatureFlag` | `setOpenCodeFeatureFlag` |
| `setWorkspaceRuntimeCodexArgs` | `setWorkspaceRuntimeOpenCodeArgs` |
| `getConfigModel` | `getOpenCodeConfigModel` |

### localStorage Keys

| Ancien | Nouveau |
|--------|---------|
| `codexmonitor.threadLastUserActivity` | `opencodemonitor.threadLastUserActivity` |
| `codexmonitor.pinnedThreads` | `opencodemonitor.pinnedThreads` |
| `codexmonitor.threadCustomNames` | `opencodemonitor.threadCustomNames` |
| `codexmonitor.threadCodexParams` | `opencodemonitor.threadOpenCodeParams` |
| `codexmonitor.detachedReviewLinks` | `opencodemonitor.detachedReviewLinks` |
| `codexmonitor.sidebarWidth` | `opencodemonitor.sidebarWidth` |
| `codexmonitor.rightPanelWidth` | `opencodemonitor.rightPanelWidth` |
| `codexmonitor.chatDiffSplitPositionPercent` | `opencodemonitor.chatDiffSplitPositionPercent` |
| `codexmonitor.planPanelHeight` | `opencodemonitor.planPanelHeight` |
| `codexmonitor.terminalPanelHeight` | `opencodemonitor.terminalPanelHeight` |
| `codexmonitor.debugPanelHeight` | `opencodemonitor.debugPanelHeight` |
| `codexmonitor.sidebarCollapsed` | `opencodemonitor.sidebarCollapsed` |
| `codexmonitor.rightPanelCollapsed` | `opencodemonitor.rightPanelCollapsed` |
| `codexmonitor.promptHistory.*` | `opencodemonitor.promptHistory.*` |
| `codexmonitor.pendingPostUpdateVersion` | `opencodemonitor.pendingPostUpdateVersion` |

### Événements

| Ancien | Nouveau |
|--------|---------|
| `codex/backgroundThread` | `opencode/backgroundThread` |
| `codex/connected` | `opencode/connected` |
| `codex/event/skills_update_available` | `opencode/event/skills_update_available` |
| `codex/stderr` | `opencode/stderr` |

### Autres

| Ancien | Nouveau |
|--------|---------|
| `"codex"` (tab id) | `"opencode"` (tab id) |
| `Ask Codex to do something...` | `Ask OpenCode to do something...` |
| `Monitor the situation of your Codex agents` | `Monitor your OpenCode agents` |
| `Made with ♥ by Codex & Dimillian` | `Made with ♥ by Dimillian` |
| `www.codexmonitor.app` | `www.opencodemonitor.app` |
| `Dimillian/CodexMonitor` (GitHub) | `Dimillian/OpenCodeMonitor` |
| `codexmonitor.key` (signing) | `opencodemonitor.key` |
| `Codex Monitor.app` | `OpenCode Monitor.app` |
| `CodexMonitor.zip` | `OpenCodeMonitor.zip` |
| `gpt-5-codex` (default model) | Modèle par défaut OpenCode |
| `DEFAULT_AGENT_MODEL: "gpt-5-codex"` | Modèle par défaut OpenCode |
| `codex/` (branch prefix) | `opencode/` (branch prefix) |
| `__codex_monitor_page_start__` | `__opencode_monitor_page_start__` |
