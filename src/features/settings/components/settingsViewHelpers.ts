import type {
  AppSettings,
  OpenAppTarget,
  WorkspaceInfo,
} from "@/types";
import type { OpenAppDraft, ShortcutDrafts } from "./settingsTypes";
import { SETTINGS_MOBILE_BREAKPOINT_PX } from "./settingsViewConstants";

export const normalizeOverrideValue = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

export const normalizeWorktreeSetupScript = (
  value: string | null | undefined,
): string | null => {
  const next = value ?? "";
  return next.trim().length > 0 ? next : null;
};

export const buildWorkspaceOverrideDrafts = (
  projects: WorkspaceInfo[],
  prev: Record<string, string>,
  getValue: (workspace: WorkspaceInfo) => string | null | undefined,
): Record<string, string> => {
  const next: Record<string, string> = {};
  projects.forEach((workspace) => {
    const existing = prev[workspace.id];
    next[workspace.id] = existing ?? getValue(workspace) ?? "";
  });
  return next;
};

export const isNarrowSettingsViewport = (): boolean => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(`(max-width: ${SETTINGS_MOBILE_BREAKPOINT_PX}px)`).matches;
};

export const buildOpenAppDrafts = (targets: OpenAppTarget[]): OpenAppDraft[] =>
  targets.map((target) => ({
    ...target,
    argsText: target.args.join(" "),
  }));

const isOpenAppLabelValid = (label: string) => label.trim().length > 0;

export const isOpenAppDraftComplete = (draft: OpenAppDraft) => {
  if (!isOpenAppLabelValid(draft.label)) {
    return false;
  }
  if (draft.kind === "app") {
    return Boolean(draft.appName?.trim());
  }
  if (draft.kind === "command") {
    return Boolean(draft.command?.trim());
  }
  return true;
};

export const isOpenAppTargetComplete = (target: OpenAppTarget) => {
  if (!isOpenAppLabelValid(target.label)) {
    return false;
  }
  if (target.kind === "app") {
    return Boolean(target.appName?.trim());
  }
  if (target.kind === "command") {
    return Boolean(target.command?.trim());
  }
  return true;
};

export const normalizeOpenAppTargets = (
  drafts: OpenAppDraft[],
): OpenAppTarget[] =>
  drafts.map(({ argsText, ...target }) => ({
    ...target,
    label: target.label.trim(),
    appName: (target.appName?.trim() ?? "") || null,
    command: (target.command?.trim() ?? "") || null,
    args: argsText.trim() ? argsText.trim().split(/\s+/) : [],
  }));

export const createOpenAppId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `open-app-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const buildShortcutDrafts = (appSettings: AppSettings): ShortcutDrafts => ({
  model: appSettings.composerModelShortcut ?? "",
  access: appSettings.composerAccessShortcut ?? "",
  reasoning: appSettings.composerReasoningShortcut ?? "",
  collaboration: appSettings.composerCollaborationShortcut ?? "",
  interrupt: appSettings.interruptShortcut ?? "",
  newAgent: appSettings.newAgentShortcut ?? "",
  newWorktreeAgent: appSettings.newWorktreeAgentShortcut ?? "",
  newCloneAgent: appSettings.newCloneAgentShortcut ?? "",
  archiveThread: appSettings.archiveThreadShortcut ?? "",
  projectsSidebar: appSettings.toggleProjectsSidebarShortcut ?? "",
  gitSidebar: appSettings.toggleGitSidebarShortcut ?? "",
  branchSwitcher: appSettings.branchSwitcherShortcut ?? "",
  debugPanel: appSettings.toggleDebugPanelShortcut ?? "",
  terminal: appSettings.toggleTerminalShortcut ?? "",
  cycleAgentNext: appSettings.cycleAgentNextShortcut ?? "",
  cycleAgentPrev: appSettings.cycleAgentPrevShortcut ?? "",
  cycleWorkspaceNext: appSettings.cycleWorkspaceNextShortcut ?? "",
  cycleWorkspacePrev: appSettings.cycleWorkspacePrevShortcut ?? "",
});

type EditorContentMetaInput = {
  isLoading: boolean;
  isSaving: boolean;
  exists: boolean;
  truncated: boolean;
  isDirty: boolean;
};

export const buildEditorContentMeta = ({
  isLoading,
  isSaving,
  exists,
  truncated,
  isDirty,
}: EditorContentMetaInput) => {
  const status = isLoading ? "Loading…" : isSaving ? "Saving…" : exists ? "" : "Not found";
  const metaParts: string[] = [];
  if (status) {
    metaParts.push(status);
  }
  if (truncated) {
    metaParts.push("Truncated");
  }

  return {
    meta: metaParts.join(" · "),
    saveLabel: exists ? "Save" : "Create",
    saveDisabled: isLoading || isSaving || !isDirty,
    refreshDisabled: isLoading || isSaving,
  };
};
