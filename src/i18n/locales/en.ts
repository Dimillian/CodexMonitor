import type { TranslationDictionary } from "../types";

export const en: TranslationDictionary = {
  "common.reset": "Reset",
  "common.punctuation.period": ".",
  "settings.shell.title": "Settings",
  "settings.shell.close": "Close settings",
  "settings.shell.mobile.back": "Back to settings sections",
  "settings.shell.mobile.sections": "Sections",
  "settings.nav.projects": "Projects",
  "settings.nav.environments": "Environments",
  "settings.nav.display": "Display & Sound",
  "settings.nav.composer": "Composer",
  "settings.nav.dictation": "Dictation",
  "settings.nav.shortcuts": "Shortcuts",
  "settings.nav.openApps": "Open in",
  "settings.nav.git": "Git",
  "settings.nav.server": "Server",
  "settings.nav.agents": "Agents",
  "settings.nav.codex": "Codex",
  "settings.nav.features": "Features",
  "settings.nav.about": "About",
  "settings.codex.sectionTitle": "Codex",
  "settings.codex.sectionSubtitle":
    "Configure the Codex CLI used by CodexMonitor and validate the install.",
  "settings.codex.path.label": "Default Codex path",
  "settings.codex.path.browse": "Browse",
  "settings.codex.path.usePath": "Use PATH",
  "settings.codex.path.help": "Leave empty to use the system PATH resolution.",
  "settings.codex.args.label": "Default Codex args",
  "settings.codex.args.clear": "Clear",
  "settings.codex.args.help.before": "Extra flags passed before ",
  "settings.codex.args.help.after": ". Use quotes for values with spaces.",
  "settings.codex.args.sharedHelp":
    "These settings apply to the shared Codex app-server used across all connected workspaces.",
  "settings.codex.unsupportedFlags.prefix":
    "Per-thread override processing ignores unsupported flags:",
  "settings.codex.unsupportedFlags.and": "and",
  "settings.codex.actions.save": "Save",
  "settings.codex.actions.saving": "Saving...",
  "settings.codex.actions.runDoctor": "Run doctor",
  "settings.codex.actions.running": "Running...",
  "settings.codex.actions.updateCodex": "Update Codex",
  "settings.codex.actions.update": "Update",
  "settings.codex.actions.updating": "Updating...",
  "settings.codex.doctor.okTitle": "Codex looks good",
  "settings.codex.doctor.errorTitle": "Codex issue detected",
  "settings.codex.doctor.version": "Version",
  "settings.codex.doctor.unknown": "unknown",
  "settings.codex.doctor.appServer": "App-server",
  "settings.codex.doctor.ok": "ok",
  "settings.codex.doctor.failed": "failed",
  "settings.codex.doctor.node": "Node",
  "settings.codex.doctor.missing": "missing",
  "settings.codex.update.updated": "Codex updated",
  "settings.codex.update.upToDate": "Codex already up-to-date",
  "settings.codex.update.failed": "Codex update failed",
  "settings.codex.update.method": "Method",
  "settings.codex.update.package": "Package",
  "settings.codex.update.output": "output",
  "settings.codex.defaults.sectionTitle": "Default parameters",
  "settings.codex.defaults.model.label": "Model",
  "settings.codex.defaults.model.addWorkspace":
    "Add a workspace to load available models.",
  "settings.codex.defaults.model.loading":
    "Loading models from the first workspace…",
  "settings.codex.defaults.model.loadError": "Couldn’t load models: {error}",
  "settings.codex.defaults.model.help":
    "Sourced from the first workspace and used when there is no thread-specific override.",
  "settings.codex.defaults.model.refresh": "Refresh",
  "settings.codex.defaults.reasoning.label": "Reasoning effort",
  "settings.codex.defaults.reasoning.supported":
    "Available options depend on the selected model.",
  "settings.codex.defaults.reasoning.unsupported":
    "The selected model does not expose reasoning effort options.",
  "settings.codex.defaults.reasoning.notSupported": "not supported",
  "settings.codex.defaults.access.label": "Access mode",
  "settings.codex.defaults.access.help":
    "Used when there is no thread-specific override.",
  "settings.codex.defaults.access.option.readOnly": "Read only",
  "settings.codex.defaults.access.option.current": "On-request",
  "settings.codex.defaults.access.option.fullAccess": "Full access",
  "settings.codex.review.label": "Review mode",
  "settings.codex.review.option.inline": "Inline (same thread)",
  "settings.codex.review.option.detached": "Detached (new review thread)",
  "settings.codex.review.help.before": "Choose whether ",
  "settings.codex.review.help.after":
    " runs in the current thread or a detached review thread.",
  "settings.codex.globalAgents.title": "Global AGENTS.md",
  "settings.codex.globalAgents.placeholder":
    "Add global instructions for Codex agents…",
  "settings.codex.globalConfig.title": "Global config.toml",
  "settings.codex.globalConfig.placeholder":
    "Edit the global Codex config.toml…",
  "settings.codex.file.storedAt": "Stored at ",
  "settings.server.sectionTitle": "Server",
  "settings.server.sectionSubtitle.mobile":
    "Configure TCP host/token from your desktop setup, then run a connection test.",
  "settings.server.sectionSubtitle.desktop":
    "Configure how CodexMonitor exposes TCP backend access for mobile and remote clients. Desktop usage remains local unless you explicitly connect through remote mode.",
  "settings.server.addRemote.error": "Unable to add remote.",
  "settings.server.backendMode.label": "Backend mode",
  "settings.server.backendMode.option.local": "Local (default)",
  "settings.server.backendMode.option.remote": "Remote (daemon)",
  "settings.server.backendMode.help":
    "Local keeps desktop requests in-process. Remote routes desktop requests through the same TCP transport path used by mobile clients.",
  "settings.server.savedRemotes.label": "Saved remotes",
  "settings.server.savedRemotes.active": "Active",
  "settings.server.savedRemotes.lastConnected": "Last connected",
  "settings.server.savedRemotes.never": "Never",
  "settings.server.savedRemotes.useAria": "Use {name} remote",
  "settings.server.savedRemotes.use": "Use",
  "settings.server.savedRemotes.using": "Using",
  "settings.server.savedRemotes.moveUpAria": "Move {name} up",
  "settings.server.savedRemotes.moveDownAria": "Move {name} down",
  "settings.server.savedRemotes.deleteAria": "Delete {name}",
  "settings.server.savedRemotes.delete": "Delete",
  "settings.server.savedRemotes.add": "Add remote",
  "settings.server.savedRemotes.help":
    "Switch the active remote here. The fields below edit the active entry.",
  "settings.server.remoteName.label": "Remote name",
  "settings.server.remoteName.placeholder": "My desktop",
  "settings.server.keepDaemon.title": "Keep daemon running after app closes",
  "settings.server.keepDaemon.subtitle":
    "If disabled, CodexMonitor stops managed TCP daemon processes before exit.",
  "settings.server.remoteBackend.label": "Remote backend",
  "settings.server.remoteBackend.hostAria": "Remote backend host",
  "settings.server.remoteBackend.tokenPlaceholder": "Token (required)",
  "settings.server.remoteBackend.tokenAria": "Remote backend token",
  "settings.server.remoteBackend.help.mobile":
    "Use the Tailscale host from your desktop CodexMonitor app (Server section), for example `macbook.your-tailnet.ts.net:4732`.",
  "settings.server.remoteBackend.help.desktop":
    "This host/token is used by mobile clients and desktop remote-mode testing.",
  "settings.server.connectionTest.label": "Connection test",
  "settings.server.connectionTest.connecting": "Connecting...",
  "settings.server.connectionTest.button": "Connect & test",
  "settings.server.connectionTest.help":
    "Make sure your desktop app daemon is running and reachable on Tailscale, then retry this test.",
  "settings.server.mobileDaemon.label": "Mobile access daemon",
  "settings.server.mobileDaemon.starting": "Starting...",
  "settings.server.mobileDaemon.start": "Start daemon",
  "settings.server.mobileDaemon.stopping": "Stopping...",
  "settings.server.mobileDaemon.stop": "Stop daemon",
  "settings.server.mobileDaemon.refreshing": "Refreshing...",
  "settings.server.mobileDaemon.refresh": "Refresh status",
  "settings.server.mobileDaemon.startedAt": "Started at",
  "settings.server.mobileDaemon.help.before":
    "Start this daemon before connecting from iOS. It uses your current token and listens on ",
  "settings.server.mobileDaemon.help.after":
    ", matching your configured host port.",
  "settings.server.mobileDaemon.errorFallback": "Mobile daemon is in an error state.",
  "settings.server.mobileDaemon.status.listenAddrFallback": "configured listen address",
  "settings.server.mobileDaemon.status.running.withPid":
    "Mobile daemon is running (pid {pid}) on {addr}.",
  "settings.server.mobileDaemon.status.running.noPid":
    "Mobile daemon is running on {addr}.",
  "settings.server.mobileDaemon.status.stopped.withAddr":
    "Mobile daemon is stopped ({addr}).",
  "settings.server.mobileDaemon.status.stopped.noAddr": "Mobile daemon is stopped.",
  "settings.server.tailscale.label": "Tailscale helper",
  "settings.server.tailscale.checking": "Checking...",
  "settings.server.tailscale.detect": "Detect Tailscale",
  "settings.server.tailscale.refreshing": "Refreshing...",
  "settings.server.tailscale.refreshCommand": "Refresh daemon command",
  "settings.server.tailscale.useSuggestedHost": "Use suggested host",
  "settings.server.tailscale.version": "Version",
  "settings.server.tailscale.unknown": "unknown",
  "settings.server.tailscale.installHelp":
    "Install Tailscale on both desktop and iOS to continue.",
  "settings.server.tailscale.suggestedHost": "Suggested remote host",
  "settings.server.tailscale.commandTemplate":
    "Command template (manual fallback) for starting the daemon:",
  "settings.server.tailscale.tokenMissing":
    "Remote backend token is empty. Set one before exposing daemon access.",
  "settings.server.footerHelp.mobile":
    "Use your own infrastructure only. On iOS, get the Tailscale hostname and token from your desktop CodexMonitor setup.",
  "settings.server.footerHelp.desktop":
    "Mobile access should stay scoped to your own infrastructure (tailnet). CodexMonitor does not provide hosted backend services.",
  "settings.server.addModal.ariaLabel": "Add remote",
  "settings.server.addModal.title": "Add remote",
  "settings.server.addModal.closeAria": "Close add remote modal",
  "settings.server.addModal.nameLabel": "New remote name",
  "settings.server.addModal.hostLabel": "New remote host",
  "settings.server.addModal.tokenLabel": "New remote token",
  "settings.server.addModal.tokenPlaceholder": "Token",
  "settings.server.addModal.cancel": "Cancel",
  "settings.server.addModal.confirm": "Connect & add",
  "settings.server.deleteModal.ariaLabel": "Delete remote confirmation",
  "settings.server.deleteModal.title": "Delete remote?",
  "settings.server.deleteModal.message.before": "Remove ",
  "settings.server.deleteModal.message.after":
    " from saved remotes? This only removes the profile from this device.",
  "settings.server.deleteModal.cancel": "Cancel",
  "settings.server.deleteModal.confirm": "Delete remote",
  "settings.agents.openPathError": "Unable to open path.",
  "settings.agents.nameRequired": "Agent name is required.",
  "settings.agents.sectionTitle": "Agents",
  "settings.agents.sectionSubtitle":
    "Configure multi-agent mode, limits, and custom agent roles.",
  "settings.agents.builtins.before": "Built-in roles from Codex are still available: ",
  "settings.agents.builtins.middle1": ", ",
  "settings.agents.builtins.middle2": ", and ",
  "settings.agents.builtins.after": ".",
  "settings.agents.configFile.title": "Config file",
  "settings.agents.configFile.subtitle": "Open global Codex config in {fileManager}.",
  "settings.agents.refresh": "Refresh",
  "settings.agents.multiAgent.title": "Enable Multi-Agent",
  "settings.agents.maxThreads.title": "Max Threads",
  "settings.agents.maxThreads.subtitle.before": "Maximum open agent threads. Valid range: ",
  "settings.agents.maxThreads.subtitle.after": ". Changes save immediately.",
  "settings.agents.maxThreads.groupAria": "Maximum agent threads",
  "settings.agents.maxThreads.decreaseAria": "Decrease max threads",
  "settings.agents.maxThreads.increaseAria": "Increase max threads",
  "settings.agents.maxThreads.invalidRange":
    "Max threads must be an integer between {min} and {max}.",
  "settings.agents.maxDepth.title": "Max Depth",
  "settings.agents.maxDepth.subtitle.before": "Maximum nested spawn depth. Valid range: ",
  "settings.agents.maxDepth.subtitle.after": ". Changes save immediately.",
  "settings.agents.maxDepth.groupAria": "Maximum agent depth",
  "settings.agents.maxDepth.decreaseAria": "Decrease max depth",
  "settings.agents.maxDepth.increaseAria": "Increase max depth",
  "settings.agents.maxDepth.invalidRange":
    "Max depth must be an integer between {min} and {max}.",
  "settings.agents.create.title": "Create Agent",
  "settings.agents.create.subtitle.before": "Add a custom role under ",
  "settings.agents.create.subtitle.after": " and create its config file.",
  "settings.agents.field.name": "Name",
  "settings.agents.field.description": "Description",
  "settings.agents.field.developerInstructions": "Developer instructions",
  "settings.agents.generate.title":
    "Generate description and developer instructions with AI",
  "settings.agents.generate.createAria": "Generate fields for new agent",
  "settings.agents.generate.editAria": "Generate fields for {name}",
  "settings.agents.create.namePlaceholder": "researcher",
  "settings.agents.create.descriptionPlaceholder": "Short role summary.",
  "settings.agents.create.developerInstructionsPlaceholder":
    "Multiline per-agent developer instructions.",
  "settings.agents.create.modelAria": "Agent model",
  "settings.agents.create.reasoningLabel": "reasoning:",
  "settings.agents.create.reasoningAria": "Agent reasoning effort",
  "settings.agents.create.notSupported": "not supported",
  "settings.agents.create.creating": "Creating...",
  "settings.agents.create.create": "Create Agent",
  "settings.agents.modelFallback.loading":
    "Loading workspace model metadata. Using fallback model defaults for now.",
  "settings.agents.modelFallback.ready":
    "Using fallback model defaults until workspace model metadata is available.",
  "settings.agents.configured.title": "Configured Agents",
  "settings.agents.configured.subtitle":
    "Manage custom roles and their per-agent config files.",
  "settings.agents.configured.empty": "No custom agents configured yet.",
  "settings.agents.card.noDescription": "No description.",
  "settings.agents.card.missingConfigFile": "(missing config_file)",
  "settings.agents.card.edit": "Edit",
  "settings.agents.card.delete": "Delete",
  "settings.agents.card.opening": "Opening...",
  "settings.agents.card.editFile": "Edit File",
  "settings.agents.card.externalPath": "External path",
  "settings.agents.card.deleteConfirmPrompt":
    "Delete agent and managed config file?",
  "settings.agents.card.cancel": "Cancel",
  "settings.agents.card.deleting": "Deleting...",
  "settings.agents.card.confirmDelete": "Confirm Delete",
  "settings.agents.edit.renameManagedFile":
    "Rename managed config file when agent name changes",
  "settings.agents.edit.saving": "Saving...",
  "settings.agents.edit.save": "Save",
  "settings.agents.editor.configFileSuffix": "config file",
  "settings.agents.editor.close": "Close",
  "settings.agents.loading": "Loading agents settings...",
  "settings.shortcuts.field.inputPlaceholder": "Type shortcut",
  "settings.shortcuts.field.clear": "Clear",
  "settings.shortcuts.group.file.title": "File",
  "settings.shortcuts.group.file.subtitle": "Create agents and worktrees from the keyboard.",
  "settings.shortcuts.item.newAgent": "New Agent",
  "settings.shortcuts.item.newWorktreeAgent": "New Worktree Agent",
  "settings.shortcuts.item.newCloneAgent": "New Clone Agent",
  "settings.shortcuts.item.archiveThread": "Archive active thread",
  "settings.shortcuts.group.composer.title": "Composer",
  "settings.shortcuts.group.composer.subtitle":
    "Cycle between model, access, reasoning, and collaboration modes.",
  "settings.shortcuts.item.cycleModel": "Cycle model",
  "settings.shortcuts.item.cycleAccess": "Cycle access mode",
  "settings.shortcuts.item.cycleReasoning": "Cycle reasoning mode",
  "settings.shortcuts.item.cycleCollaboration": "Cycle collaboration mode",
  "settings.shortcuts.item.stopRun": "Stop active run",
  "settings.shortcuts.group.panels.title": "Panels",
  "settings.shortcuts.group.panels.subtitle": "Toggle sidebars and panels.",
  "settings.shortcuts.item.toggleProjectsSidebar": "Toggle projects sidebar",
  "settings.shortcuts.item.toggleGitSidebar": "Toggle git sidebar",
  "settings.shortcuts.item.branchSwitcher": "Branch switcher",
  "settings.shortcuts.item.toggleDebugPanel": "Toggle debug panel",
  "settings.shortcuts.item.toggleTerminalPanel": "Toggle terminal panel",
  "settings.shortcuts.group.navigation.title": "Navigation",
  "settings.shortcuts.group.navigation.subtitle":
    "Cycle between agents and workspaces.",
  "settings.shortcuts.item.nextAgent": "Next agent",
  "settings.shortcuts.item.prevAgent": "Previous agent",
  "settings.shortcuts.item.nextWorkspace": "Next workspace",
  "settings.shortcuts.item.prevWorkspace": "Previous workspace",
  "settings.shortcuts.sectionTitle": "Shortcuts",
  "settings.shortcuts.sectionSubtitle":
    "Customize keyboard shortcuts for file actions, composer, panels, and navigation.",
  "settings.shortcuts.search.label": "Search shortcuts",
  "settings.shortcuts.search.placeholder": "Search shortcuts",
  "settings.shortcuts.search.help":
    "Filter by section name, action, or default shortcut.",
  "settings.shortcuts.empty.prefix": "No shortcuts match ",
  "settings.shortcuts.empty.fallback": "your search",
  "settings.shortcuts.empty.suffix": ".",
  "settings.openApps.sectionTitle": "Open in",
  "settings.openApps.sectionSubtitle":
    "Customize the Open in menu shown in the title bar and file previews.",
  "settings.openApps.validation.labelRequired": "Label required",
  "settings.openApps.validation.appNameRequired": "App name required",
  "settings.openApps.validation.commandRequired": "Command required",
  "settings.openApps.validation.completeRequired": "Complete required fields",
  "settings.openApps.field.label": "Label",
  "settings.openApps.field.type": "Type",
  "settings.openApps.field.typeAria": "Open app type {index}",
  "settings.openApps.option.app": "App",
  "settings.openApps.option.command": "Command",
  "settings.openApps.field.appName": "App name",
  "settings.openApps.field.command": "Command",
  "settings.openApps.field.args": "Args",
  "settings.openApps.status.incomplete": "Incomplete",
  "settings.openApps.default": "Default",
  "settings.openApps.moveUp": "Move up",
  "settings.openApps.moveDown": "Move down",
  "settings.openApps.remove": "Remove app",
  "settings.openApps.add": "Add app",
  "settings.openApps.help.commandsPrefix":
    "Commands receive the selected path as the final argument. ",
  "settings.openApps.help.apps.mac": "Apps open via `open -a` with optional args.",
  "settings.openApps.help.apps.other":
    "Apps run as an executable with optional args.",
  "settings.projects.sectionTitle": "Projects",
  "settings.projects.sectionSubtitle":
    "Group related workspaces and reorder projects within each group.",
  "settings.projects.groups.title": "Groups",
  "settings.projects.groups.subtitle":
    "Create group labels for related repositories.",
  "settings.projects.groups.newPlaceholder": "New group name",
  "settings.projects.groups.add": "Add group",
  "settings.projects.groups.copiesFolder": "Copies folder",
  "settings.projects.groups.copiesFolder.notSet": "Not set",
  "settings.projects.groups.choose": "Choose…",
  "settings.projects.groups.clear": "Clear",
  "settings.projects.groups.moveUp": "Move group up",
  "settings.projects.groups.moveDown": "Move group down",
  "settings.projects.groups.delete": "Delete group",
  "settings.projects.groups.empty": "No groups yet.",
  "settings.projects.list.title": "Projects",
  "settings.projects.list.subtitle":
    "Assign projects to groups and adjust their order.",
  "settings.projects.list.moveUp": "Move project up",
  "settings.projects.list.moveDown": "Move project down",
  "settings.projects.list.delete": "Delete project",
  "settings.projects.list.empty": "No projects yet.",
  "settings.about.unknown": "unknown",
  "settings.about.version": "Version",
  "settings.about.buildType": "Build type",
  "settings.about.branch": "Branch",
  "settings.about.commit": "Commit",
  "settings.about.buildDate": "Build date",
  "settings.about.updates.title": "App Updates",
  "settings.about.updates.currentVersion": "Currently running version",
  "settings.about.updates.unavailable":
    "Updates are unavailable in this runtime.",
  "settings.about.updates.error": "Update failed",
  "settings.about.updates.downloading": "Downloading update...",
  "settings.about.updates.installing": "Installing update...",
  "settings.about.updates.restarting": "Restarting...",
  "settings.about.updates.available.prefix": "Version",
  "settings.about.updates.available.suffix": "is available.",
  "settings.about.updates.latest": "You are on the latest version.",
  "settings.about.updates.downloadInstall": "Download & Install",
  "settings.about.updates.checking": "Checking...",
  "settings.about.updates.check": "Check for updates",
  "settings.composer.sectionTitle": "Composer",
  "settings.composer.sectionSubtitle":
    "Control helpers and formatting behavior inside the message editor.",
  "settings.composer.followUp.label": "Follow-up behavior",
  "settings.composer.followUp.option.queue": "Queue",
  "settings.composer.followUp.option.steer": "Steer",
  "settings.composer.followUp.steerUnavailableTitle":
    "Steer is unavailable in the current Codex config.",
  "settings.composer.followUp.help.before":
    "Choose the default while a run is active. Press ",
  "settings.composer.followUp.help.after":
    " to send the opposite behavior for one message.",
  "settings.composer.followUp.hint.title":
    "Show follow-up hint while processing",
  "settings.composer.followUp.hint.subtitle":
    "Displays queue/steer shortcut guidance above the composer.",
  "settings.composer.followUp.steerUnavailableHelp":
    "Steer is unavailable in the current Codex config. Follow-ups will queue.",
  "settings.composer.presets.title": "Presets",
  "settings.composer.presets.subtitle":
    "Choose a starting point and fine-tune the toggles below.",
  "settings.composer.presets.label": "Preset",
  "settings.composer.presets.help":
    "Presets update the toggles below. Customize any setting after selecting.",
  "settings.composer.codeFences.title": "Code fences",
  "settings.composer.codeFences.space.title": "Expand fences on Space",
  "settings.composer.codeFences.space.subtitle":
    "Typing ``` then Space inserts a fenced block.",
  "settings.composer.codeFences.enter.title": "Expand fences on Enter",
  "settings.composer.codeFences.enter.subtitle":
    "Use Enter to expand ``` lines when enabled.",
  "settings.composer.codeFences.langTags.title": "Support language tags",
  "settings.composer.codeFences.langTags.subtitle":
    "Allows ```lang + Space to include a language.",
  "settings.composer.codeFences.wrapSelection.title":
    "Wrap selection in fences",
  "settings.composer.codeFences.wrapSelection.subtitle":
    "Wraps selected text when creating a fence.",
  "settings.composer.codeFences.copyNoFence.title":
    "Copy blocks without fences",
  "settings.composer.codeFences.copyNoFence.subtitle.before":
    "When enabled, Copy is plain text. Hold ",
  "settings.composer.codeFences.copyNoFence.subtitle.after":
    " to include ``` fences.",
  "settings.composer.pasting.title": "Pasting",
  "settings.composer.pasting.multiline.title": "Auto-wrap multi-line paste",
  "settings.composer.pasting.multiline.subtitle":
    "Wraps multi-line paste inside a fenced block.",
  "settings.composer.pasting.codeLike.title":
    "Auto-wrap code-like single lines",
  "settings.composer.pasting.codeLike.subtitle":
    "Wraps long single-line code snippets on paste.",
  "settings.composer.lists.title": "Lists",
  "settings.composer.lists.continue.title":
    "Continue lists on Shift+Enter",
  "settings.composer.lists.continue.subtitle":
    "Continues numbered and bulleted lists when the line has content.",
  "settings.dictation.sectionTitle": "Dictation",
  "settings.dictation.sectionSubtitle":
    "Enable microphone dictation with on-device transcription.",
  "settings.dictation.enable.title": "Enable dictation",
  "settings.dictation.enable.subtitle":
    "Downloads the selected Whisper model on first use.",
  "settings.dictation.model.label": "Dictation model",
  "settings.dictation.model.downloadSize": "Download size",
  "settings.dictation.language.label": "Preferred dictation language",
  "settings.dictation.language.autoDetect": "Auto-detect only",
  "settings.dictation.language.en": "English",
  "settings.dictation.language.es": "Spanish",
  "settings.dictation.language.fr": "French",
  "settings.dictation.language.de": "German",
  "settings.dictation.language.it": "Italian",
  "settings.dictation.language.pt": "Portuguese",
  "settings.dictation.language.nl": "Dutch",
  "settings.dictation.language.sv": "Swedish",
  "settings.dictation.language.no": "Norwegian",
  "settings.dictation.language.da": "Danish",
  "settings.dictation.language.fi": "Finnish",
  "settings.dictation.language.pl": "Polish",
  "settings.dictation.language.tr": "Turkish",
  "settings.dictation.language.ru": "Russian",
  "settings.dictation.language.uk": "Ukrainian",
  "settings.dictation.language.ja": "Japanese",
  "settings.dictation.language.ko": "Korean",
  "settings.dictation.language.zh": "Chinese",
  "settings.dictation.language.help":
    "Auto-detect stays on; this nudges the decoder toward your preference.",
  "settings.dictation.holdKey.label": "Hold-to-dictate key",
  "settings.dictation.holdKey.off": "Off",
  "settings.dictation.holdKey.help":
    "Hold the key to start dictation, release to stop and process.",
  "settings.dictation.status.label": "Model status",
  "settings.dictation.status.ready": "Ready for dictation.",
  "settings.dictation.status.missing": "Model not downloaded yet.",
  "settings.dictation.status.downloading": "Downloading model...",
  "settings.dictation.status.errorFallback": "Download error.",
  "settings.dictation.actions.download": "Download model",
  "settings.dictation.actions.cancelDownload": "Cancel download",
  "settings.dictation.actions.removeModel": "Remove model",
  "settings.git.sectionSubtitle":
    "Manage how diffs are loaded in the Git sidebar.",
  "settings.git.preloadDiffs.title": "Preload git diffs",
  "settings.git.preloadDiffs.subtitle": "Make viewing git diff faster.",
  "settings.git.ignoreWhitespace.title": "Ignore whitespace changes",
  "settings.git.ignoreWhitespace.subtitle":
    "Hides whitespace-only changes in local and commit diffs.",
  "settings.git.commitPrompt.label": "Commit message prompt",
  "settings.git.commitPrompt.help.before":
    "Used when generating commit messages. Include ",
  "settings.git.commitPrompt.help.after": " to insert the git diff.",
  "settings.git.commitPrompt.reset": "Reset",
  "settings.git.commitPrompt.saving": "Saving...",
  "settings.git.commitPrompt.save": "Save",
  "settings.git.commitModel.label": "Commit message model",
  "settings.git.commitModel.help":
    "The model used when generating commit messages. Leave on default to use the workspace model.",
  "settings.git.commitModel.default": "Default",
  "settings.environments.sectionTitle": "Environments",
  "settings.environments.sectionSubtitle":
    "Configure per-project setup scripts that run after worktree creation.",
  "settings.environments.emptyNoProjects": "No projects yet.",
  "settings.environments.project.label": "Project",
  "settings.environments.setupScript.label": "Setup script",
  "settings.environments.setupScript.help":
    "Runs once in a dedicated terminal after each new worktree is created.",
  "settings.environments.clipboard.copyFailedTitle": "Copy failed",
  "settings.environments.clipboard.unavailable":
    "Clipboard access is unavailable in this environment. Copy the script manually instead.",
  "settings.environments.clipboard.writeFailed":
    "Could not write to the clipboard. Copy the script manually instead.",
  "settings.environments.actions.copy": "Copy",
  "settings.environments.actions.reset": "Reset",
  "settings.environments.actions.saving": "Saving...",
  "settings.environments.actions.save": "Save",
  "settings.features.sectionTitle": "Features",
  "settings.features.sectionSubtitle": "Manage stable and experimental Codex features.",
  "settings.features.configFile.title": "Config file",
  "settings.features.configFile.subtitle": "Open the Codex config in {fileManager}.",
  "settings.features.stable.title": "Stable Features",
  "settings.features.stable.subtitle": "Production-ready features enabled by default.",
  "settings.features.personality.title": "Personality",
  "settings.features.personality.subtitle.before":
    "Choose Codex communication style (writes top-level ",
  "settings.features.personality.subtitle.after": " in config.toml).",
  "settings.features.personality.option.friendly": "Friendly",
  "settings.features.personality.option.pragmatic": "Pragmatic",
  "settings.features.pauseQueue.title":
    "Pause queued messages when a response is required",
  "settings.features.pauseQueue.subtitle":
    "Keep queued messages paused while Codex is waiting for plan accept/changes or your answers.",
  "settings.features.noStable": "No stable feature flags returned by Codex.",
  "settings.features.experimental.title": "Experimental Features",
  "settings.features.experimental.subtitle": "Preview and under-development features.",
  "settings.features.noExperimental":
    "No preview or under-development feature flags returned by Codex.",
  "settings.features.loading": "Loading Codex feature flags...",
  "settings.features.connectWorkspace":
    "Connect a workspace to load Codex feature flags.",
  "settings.features.feature.deprecated": "Deprecated feature flag.",
  "settings.features.feature.removed":
    "Legacy feature flag kept for backward compatibility.",
  "settings.features.feature.key": "Feature key: features.{name}",
  "settings.features.fallback.label.undo": "Undo",
  "settings.features.fallback.description.undo": "Create a ghost commit at each turn.",
  "settings.features.fallback.label.shell_tool": "Shell Tool",
  "settings.features.fallback.description.shell_tool": "Enable the default shell tool.",
  "settings.features.fallback.label.unified_exec": "Unified Exec",
  "settings.features.fallback.description.unified_exec":
    "Use the single unified PTY-backed exec tool.",
  "settings.features.fallback.label.shell_snapshot": "Shell Snapshot",
  "settings.features.fallback.description.shell_snapshot": "Enable shell snapshotting.",
  "settings.features.fallback.label.js_repl": "JS Repl",
  "settings.features.fallback.description.js_repl":
    "Enable JavaScript REPL tools backed by a persistent Node kernel.",
  "settings.features.fallback.label.js_repl_tools_only": "JS Repl Tools Only",
  "settings.features.fallback.description.js_repl_tools_only":
    "Only expose js_repl tools directly to the model.",
  "settings.features.fallback.label.web_search_request": "Web Search Request",
  "settings.features.fallback.description.web_search_request":
    "Deprecated. Use top-level web_search instead.",
  "settings.features.fallback.label.web_search_cached": "Web Search Cached",
  "settings.features.fallback.description.web_search_cached":
    "Deprecated. Use top-level web_search instead.",
  "settings.features.fallback.label.search_tool": "Search Tool",
  "settings.features.fallback.description.search_tool":
    "Removed legacy search flag kept for backward compatibility.",
  "settings.features.fallback.label.runtime_metrics": "Runtime Metrics",
  "settings.features.fallback.description.runtime_metrics":
    "Enable runtime metrics snapshots via a manual reader.",
  "settings.features.fallback.label.sqlite": "Sqlite",
  "settings.features.fallback.description.sqlite":
    "Persist rollout metadata to a local SQLite database.",
  "settings.features.fallback.label.memory_tool": "Memory Tool",
  "settings.features.fallback.description.memory_tool":
    "Enable startup memory extraction and memory consolidation.",
  "settings.features.fallback.label.child_agents_md": "Child Agents Md",
  "settings.features.fallback.description.child_agents_md":
    "Append additional AGENTS.md guidance to user instructions.",
  "settings.features.fallback.label.apply_patch_freeform": "Apply Patch Freeform",
  "settings.features.fallback.description.apply_patch_freeform":
    "Include the freeform apply_patch tool.",
  "settings.features.fallback.label.use_linux_sandbox_bwrap": "Use Linux Sandbox Bwrap",
  "settings.features.fallback.description.use_linux_sandbox_bwrap":
    "Use the bubblewrap-based Linux sandbox pipeline.",
  "settings.features.fallback.label.request_rule": "Request Rule",
  "settings.features.fallback.description.request_rule":
    "Allow approval requests and exec rule proposals.",
  "settings.features.fallback.label.experimental_windows_sandbox":
    "Experimental Windows Sandbox",
  "settings.features.fallback.description.experimental_windows_sandbox":
    "Removed Windows sandbox flag kept for backward compatibility.",
  "settings.features.fallback.label.elevated_windows_sandbox":
    "Elevated Windows Sandbox",
  "settings.features.fallback.description.elevated_windows_sandbox":
    "Removed elevated Windows sandbox flag kept for backward compatibility.",
  "settings.features.fallback.label.remote_models": "Remote Models",
  "settings.features.fallback.description.remote_models":
    "Refresh remote models before AppReady.",
  "settings.features.fallback.label.powershell_utf8": "Powershell Utf8",
  "settings.features.fallback.description.powershell_utf8":
    "Enforce UTF-8 output in PowerShell.",
  "settings.features.fallback.label.enable_request_compression":
    "Enable Request Compression",
  "settings.features.fallback.description.enable_request_compression":
    "Compress streaming request bodies sent to codex-backend.",
  "settings.features.fallback.label.apps": "Apps",
  "settings.features.fallback.description.apps": "Enable ChatGPT Apps integration.",
  "settings.features.fallback.label.apps_mcp_gateway": "Apps Mcp Gateway",
  "settings.features.fallback.description.apps_mcp_gateway":
    "Route Apps MCP calls through the configured gateway.",
  "settings.features.fallback.label.skill_mcp_dependency_install":
    "Skill Mcp Dependency Install",
  "settings.features.fallback.description.skill_mcp_dependency_install":
    "Allow prompting and installing missing MCP dependencies.",
  "settings.features.fallback.label.skill_env_var_dependency_prompt":
    "Skill Env Var Dependency Prompt",
  "settings.features.fallback.description.skill_env_var_dependency_prompt":
    "Prompt for missing skill environment variable dependencies.",
  "settings.features.fallback.label.steer": "Steer",
  "settings.features.fallback.description.steer":
    "Enable turn steering capability when supported by Codex.",
  "settings.features.fallback.label.collaboration_modes": "Collaboration Modes",
  "settings.features.fallback.description.collaboration_modes":
    "Enable collaboration mode presets.",
  "settings.features.fallback.label.personality": "Personality",
  "settings.features.fallback.description.personality":
    "Enable personality selection.",
  "settings.features.fallback.label.responses_websockets": "Responses Websockets",
  "settings.features.fallback.description.responses_websockets":
    "Use Responses API WebSocket transport for OpenAI by default.",
  "settings.features.fallback.label.responses_websockets_v2":
    "Responses Websockets V2",
  "settings.features.fallback.description.responses_websockets_v2":
    "Enable Responses API WebSocket v2 mode.",
  "settings.display.sectionTitle": "Display & Sound",
  "settings.display.sectionSubtitle": "Tune visuals and audio alerts to your preferences.",
  "settings.display.subsectionDisplayTitle": "Display",
  "settings.display.subsectionDisplaySubtitle":
    "Adjust how the window renders backgrounds and effects.",
  "settings.display.theme.label": "Theme",
  "settings.display.theme.option.system": "System",
  "settings.display.theme.option.light": "Light",
  "settings.display.theme.option.dark": "Dark",
  "settings.display.theme.option.dim": "Dim",
  "settings.display.uiLanguage.label": "Interface language",
  "settings.display.uiLanguage.help":
    "Use System to follow your device language. Changes apply immediately.",
  "settings.display.uiLanguage.option.system": "System",
  "settings.display.uiLanguage.option.en": "English",
  "settings.display.uiLanguage.option.zh-CN": "简体中文",
  "settings.display.usageRemaining.title": "Show remaining Codex limits",
  "settings.display.usageRemaining.subtitle": "Display what is left instead of what is used.",
  "settings.display.filePathInMessages.title": "Show file path in messages",
  "settings.display.filePathInMessages.subtitle":
    "Display the parent path next to file links in messages.",
  "settings.display.splitChatDiff.title": "Split chat and diff center panes",
  "settings.display.splitChatDiff.subtitle":
    "Show chat and diff side by side instead of swapping between them.",
  "settings.display.autoThreadTitle.title": "Auto-generate new thread titles",
  "settings.display.autoThreadTitle.subtitle":
    "Generate a short title from your first message (uses extra tokens).",
  "settings.display.subsectionChatTitle": "Chat",
  "settings.display.subsectionChatSubtitle":
    "Control how much conversation history is retained per thread.",
  "settings.display.unlimitedChatHistory.title": "Unlimited chat history",
  "settings.display.unlimitedChatHistory.subtitle":
    "Keep full thread history in memory (may impact performance).",
  "settings.display.scrollbackPreset.label": "Scrollback preset",
  "settings.display.scrollbackPreset.option.custom": "Custom",
  "settings.display.scrollbackPreset.option.default": "{value} (Default)",
  "settings.display.scrollbackPreset.help":
    "Higher values keep more history but may increase memory usage. Use “Sync from server” on a thread to re-fetch older messages.",
  "settings.display.maxItemsPerThread.label": "Max items per thread",
  "settings.display.maxItemsPerThread.help":
    "Range: {min}–{max}. Counts messages, tool calls, and other conversation items.",
  "settings.display.reduceTransparency.title": "Reduce transparency",
  "settings.display.reduceTransparency.subtitle": "Use solid surfaces instead of glass.",
  "settings.display.interfaceScale.title": "Interface scale",
  "settings.display.interfaceScale.aria": "Interface scale",
  "settings.display.uiFontFamily.label": "UI font family",
  "settings.display.uiFontFamily.help":
    "Applies to all UI text. Leave empty to use the default system font stack.",
  "settings.display.codeFontFamily.label": "Code font family",
  "settings.display.codeFontFamily.help":
    "Applies to git diffs and other mono-spaced readouts.",
  "settings.display.codeFontSize.label": "Code font size",
  "settings.display.codeFontSize.value": "{size}px",
  "settings.display.codeFontSize.help": "Adjusts code and diff text size.",
  "settings.display.subsectionSoundsTitle": "Sounds",
  "settings.display.subsectionSoundsSubtitle": "Control notification audio alerts.",
  "settings.display.notificationSounds.title": "Notification sounds",
  "settings.display.notificationSounds.subtitle":
    "Play a sound when a long-running agent finishes while the window is unfocused.",
  "settings.display.systemNotifications.title": "System notifications",
  "settings.display.systemNotifications.subtitle":
    "Show a system notification when a long-running agent finishes while the window is unfocused.",
  "settings.display.subagentNotifications.title": "Sub-agent notifications",
  "settings.display.subagentNotifications.subtitle":
    "Include spawned sub-agent threads in system notifications.",
  "settings.display.testSound": "Test sound",
  "settings.display.testNotification": "Test notification",
};
