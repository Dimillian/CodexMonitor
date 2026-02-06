import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  LaunchScriptEntry,
  LaunchScriptIconId,
  WorkspaceInfo,
  WorkspaceSettings,
} from "../../../types";
import type { TerminalSessionState } from "../../terminal/hooks/useTerminalSession";
import { writeTerminalSession } from "../../../services/tauri";
import { pushErrorToast } from "../../../services/toasts";
import {
  DEFAULT_LAUNCH_SCRIPT_ICON,
  coerceLaunchScriptIconId,
  getLaunchScriptIconLabel,
} from "../utils/launchScriptIcons";

type PendingLaunch = {
  workspaceId: string;
  terminalId: string;
  script: string;
  entryId: string;
};

type UseWorkspaceLaunchScriptsOptions = {
  activeWorkspace: WorkspaceInfo | null;
  updateWorkspaceSettings: (id: string, settings: WorkspaceSettings) => Promise<WorkspaceInfo>;
  openTerminal: () => void;
  ensureLaunchTerminal: (workspaceId: string, entry: LaunchScriptEntry, title: string) => string;
  restartLaunchSession: (workspaceId: string, terminalId: string) => Promise<void>;
  terminalState: TerminalSessionState | null;
  activeTerminalId: string | null;
};

export type WorkspaceLaunchScriptsState = {
  launchScripts: LaunchScriptEntry[];
  editorOpenId: string | null;
  draftScript: string;
  draftIcon: LaunchScriptIconId;
  draftLabel: string;
  newEditorOpen: boolean;
  newDraftScript: string;
  newDraftIcon: LaunchScriptIconId;
  newDraftLabel: string;
  newError: string | null;
  isSaving: boolean;
  error: string | null;
  errorById: Record<string, string | null>;
  onRunScript: (id: string) => void;
  onOpenEditor: (id: string) => void;
  onCloseEditor: () => void;
  onDraftScriptChange: (value: string) => void;
  onDraftIconChange: (value: LaunchScriptIconId) => void;
  onDraftLabelChange: (value: string) => void;
  onSaveScript: () => Promise<void>;
  onDeleteScript: () => Promise<void>;
  onOpenNew: () => void;
  onCloseNew: () => void;
  onNewDraftScriptChange: (value: string) => void;
  onNewDraftIconChange: (value: LaunchScriptIconId) => void;
  onNewDraftLabelChange: (value: string) => void;
  onCreateNew: () => Promise<void>;
};

function buildLaunchTitle(entry: LaunchScriptEntry) {
  const label = entry.label?.trim();
  if (label) {
    return `Launch: ${label}`;
  }
  return `Launch: ${getLaunchScriptIconLabel(entry.icon)}`;
}

export function useWorkspaceLaunchScripts({
  activeWorkspace,
  updateWorkspaceSettings,
  openTerminal,
  ensureLaunchTerminal,
  restartLaunchSession,
  terminalState,
  activeTerminalId,
}: UseWorkspaceLaunchScriptsOptions): WorkspaceLaunchScriptsState {
  const [editorOpenId, setEditorOpenId] = useState<string | null>(null);
  const [draftScript, setDraftScript] = useState("");
  const [draftIcon, setDraftIcon] = useState<LaunchScriptIconId>(DEFAULT_LAUNCH_SCRIPT_ICON);
  const [draftLabel, setDraftLabel] = useState("");
  const [newEditorOpen, setNewEditorOpen] = useState(false);
  const [newDraftScript, setNewDraftScript] = useState("");
  const [newDraftIcon, setNewDraftIcon] = useState<LaunchScriptIconId>(DEFAULT_LAUNCH_SCRIPT_ICON);
  const [newDraftLabel, setNewDraftLabel] = useState("");
  const [newError, setNewError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorById, setErrorById] = useState<Record<string, string | null>>({});
  const pendingRunRef = useRef<PendingLaunch | null>(null);

  const launchScripts = useMemo(
    () =>
      (activeWorkspace?.settings.launchScripts ?? []).map((entry) => ({
        ...entry,
        icon: coerceLaunchScriptIconId(entry.icon),
      })),
    [activeWorkspace?.settings.launchScripts],
  );

  useEffect(() => {
    setEditorOpenId(null);
    setDraftScript("");
    setDraftIcon(DEFAULT_LAUNCH_SCRIPT_ICON);
    setDraftLabel("");
    setNewEditorOpen(false);
    setNewDraftScript("");
    setNewDraftIcon(DEFAULT_LAUNCH_SCRIPT_ICON);
    setNewDraftLabel("");
    setNewError(null);
    setError(null);
    setErrorById({});
    pendingRunRef.current = null;
  }, [activeWorkspace?.id]);

  const onOpenEditor = useCallback(
    (id: string) => {
      const entry = launchScripts.find((script) => script.id === id);
      if (!entry) {
        return;
      }
      setDraftScript(entry.script);
      setDraftIcon(coerceLaunchScriptIconId(entry.icon));
      setDraftLabel(entry.label ?? "");
      setEditorOpenId(id);
      setError(null);
      setErrorById((prev) => ({ ...prev, [id]: null }));
    },
    [launchScripts],
  );

  const onCloseEditor = useCallback(() => {
    setEditorOpenId(null);
    setError(null);
  }, []);

  const onDraftScriptChange = useCallback((value: string) => {
    setDraftScript(value);
  }, []);

  const onDraftIconChange = useCallback((value: LaunchScriptIconId) => {
    setDraftIcon(value);
  }, []);

  const onDraftLabelChange = useCallback((value: string) => {
    setDraftLabel(value);
  }, []);

  const onOpenNew = useCallback(() => {
    setNewDraftScript("");
    setNewDraftIcon(DEFAULT_LAUNCH_SCRIPT_ICON);
    setNewDraftLabel("");
    setNewEditorOpen(true);
    setNewError(null);
  }, []);

  const onCloseNew = useCallback(() => {
    setNewEditorOpen(false);
    setNewError(null);
  }, []);

  const onNewDraftScriptChange = useCallback((value: string) => {
    setNewDraftScript(value);
  }, []);

  const onNewDraftIconChange = useCallback((value: LaunchScriptIconId) => {
    setNewDraftIcon(value);
  }, []);

  const onNewDraftLabelChange = useCallback((value: string) => {
    setNewDraftLabel(value);
  }, []);

  const onCreateNew = useCallback(async () => {
    if (!activeWorkspace) {
      return;
    }
    const trimmed = newDraftScript.trim();
    if (!trimmed) {
      setNewError("Script cannot be empty.");
      return;
    }
    setIsSaving(true);
    setNewError(null);
    try {
      const nextScripts = [
        ...launchScripts,
        {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          script: newDraftScript,
          icon: newDraftIcon || DEFAULT_LAUNCH_SCRIPT_ICON,
          label: newDraftLabel.trim() ? newDraftLabel.trim() : null,
        },
      ];
      await updateWorkspaceSettings(activeWorkspace.id, {
        ...activeWorkspace.settings,
        launchScripts: nextScripts,
      });
      setNewEditorOpen(false);
    } catch (err) {
      setNewError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  }, [
    activeWorkspace,
    launchScripts,
    newDraftIcon,
    newDraftLabel,
    newDraftScript,
    updateWorkspaceSettings,
  ]);

  const onSaveScript = useCallback(async () => {
    if (!activeWorkspace || !editorOpenId) {
      return;
    }
    const trimmed = draftScript.trim();
    if (!trimmed) {
      setError("Script cannot be empty.");
      setErrorById((prev) => ({ ...prev, [editorOpenId]: "Script cannot be empty." }));
      return;
    }
    setIsSaving(true);
    setError(null);
    setErrorById((prev) => ({ ...prev, [editorOpenId]: null }));
    try {
      const nextScripts = launchScripts.map((entry) => {
        if (entry.id !== editorOpenId) {
          return entry;
        }
        return {
          ...entry,
          script: draftScript,
          icon: draftIcon || DEFAULT_LAUNCH_SCRIPT_ICON,
          label: draftLabel.trim() ? draftLabel.trim() : null,
        };
      });
      await updateWorkspaceSettings(activeWorkspace.id, {
        ...activeWorkspace.settings,
        launchScripts: nextScripts,
      });
      setEditorOpenId(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setErrorById((prev) => ({ ...prev, [editorOpenId]: message }));
    } finally {
      setIsSaving(false);
    }
  }, [
    activeWorkspace,
    draftIcon,
    draftLabel,
    draftScript,
    editorOpenId,
    launchScripts,
    updateWorkspaceSettings,
  ]);

  const onDeleteScript = useCallback(async () => {
    if (!activeWorkspace || !editorOpenId) {
      return;
    }
    setIsSaving(true);
    setError(null);
    setErrorById((prev) => ({ ...prev, [editorOpenId]: null }));
    try {
      const nextScripts = launchScripts.filter((entry) => entry.id !== editorOpenId);
      await updateWorkspaceSettings(activeWorkspace.id, {
        ...activeWorkspace.settings,
        launchScripts: nextScripts,
      });
      setEditorOpenId(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setErrorById((prev) => ({ ...prev, [editorOpenId]: message }));
    } finally {
      setIsSaving(false);
    }
  }, [activeWorkspace, editorOpenId, launchScripts, updateWorkspaceSettings]);

  const onRunScript = useCallback(
    (id: string) => {
      if (!activeWorkspace) {
        return;
      }
      const entry = launchScripts.find((script) => script.id === id);
      if (!entry || !entry.script.trim()) {
        if (entry) {
          onOpenEditor(id);
        }
        return;
      }
      setError(null);
      setErrorById((prev) => ({ ...prev, [id]: null }));
      const title = buildLaunchTitle(entry);
      const terminalId = ensureLaunchTerminal(activeWorkspace.id, entry, title);
      pendingRunRef.current = {
        workspaceId: activeWorkspace.id,
        terminalId,
        script: entry.script,
        entryId: entry.id,
      };
      openTerminal();
      restartLaunchSession(activeWorkspace.id, terminalId).catch((err) => {
        pendingRunRef.current = null;
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        setErrorById((prev) => ({ ...prev, [id]: message }));
      });
    },
    [
      activeWorkspace,
      ensureLaunchTerminal,
      launchScripts,
      onOpenEditor,
      openTerminal,
      restartLaunchSession,
    ],
  );

  useEffect(() => {
    const pending = pendingRunRef.current;
    const pendingKey = pending
      ? `${pending.workspaceId}:${pending.terminalId}`
      : null;
    if (
      !pending ||
      terminalState?.readyKey !== pendingKey ||
      activeTerminalId !== pending.terminalId ||
      activeWorkspace?.id !== pending.workspaceId
    ) {
      return;
    }
    pendingRunRef.current = null;
    writeTerminalSession(pending.workspaceId, pending.terminalId, `${pending.script}\n`).catch(
      (err) => {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        setErrorById((prev) => ({ ...prev, [pending.entryId]: message }));
        pushErrorToast({
          title: "Launch script error",
          message,
        });
      },
    );
  }, [activeTerminalId, activeWorkspace?.id, terminalState?.readyKey]);

  return {
    launchScripts,
    editorOpenId,
    draftScript,
    draftIcon,
    draftLabel,
    newEditorOpen,
    newDraftScript,
    newDraftIcon,
    newDraftLabel,
    newError,
    isSaving,
    error,
    errorById,
    onRunScript,
    onOpenEditor,
    onCloseEditor,
    onDraftScriptChange,
    onDraftIconChange,
    onDraftLabelChange,
    onSaveScript,
    onDeleteScript,
    onOpenNew,
    onCloseNew,
    onNewDraftScriptChange,
    onNewDraftIconChange,
    onNewDraftLabelChange,
    onCreateNew,
  };
}
