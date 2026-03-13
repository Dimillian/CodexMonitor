import { useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { WorkspaceInfo } from "@/types";
import { normalizeWorktreeSetupScript } from "@settings/components/settingsViewHelpers";

type UseSettingsEnvironmentsSectionArgs = {
  mainWorkspaces: WorkspaceInfo[];
  onUpdateWorkspaceSettings: (
    id: string,
    settings: Partial<WorkspaceInfo["settings"]>,
  ) => Promise<void>;
};

export type SettingsEnvironmentsSectionProps = {
  mainWorkspaces: WorkspaceInfo[];
  environmentWorkspace: WorkspaceInfo | null;
  environmentSaving: boolean;
  environmentError: string | null;
  environmentDraftScript: string;
  environmentSavedScript: string | null;
  environmentDirty: boolean;
  worktreesFolderDraft: string;
  worktreesFolderSaved: string | null;
  worktreesFolderDirty: boolean;
  onSetEnvironmentWorkspaceId: Dispatch<SetStateAction<string | null>>;
  onSetEnvironmentDraftScript: Dispatch<SetStateAction<string>>;
  onSetWorktreesFolderDraft: Dispatch<SetStateAction<string>>;
  onSaveEnvironmentSetup: () => Promise<void>;
};

export const useSettingsEnvironmentsSection = ({
  mainWorkspaces,
  onUpdateWorkspaceSettings,
}: UseSettingsEnvironmentsSectionArgs): SettingsEnvironmentsSectionProps => {
  const [environmentWorkspaceId, setEnvironmentWorkspaceId] = useState<string | null>(null);
  const [environmentDraftScript, setEnvironmentDraftScript] = useState("");
  const [environmentSavedScript, setEnvironmentSavedScript] = useState<string | null>(null);
  const [environmentLoadedWorkspaceId, setEnvironmentLoadedWorkspaceId] = useState<string | null>(null);
  const [environmentError, setEnvironmentError] = useState<string | null>(null);
  const [environmentSaving, setEnvironmentSaving] = useState(false);
  const [worktreesFolderDraft, setWorktreesFolderDraft] = useState("");
  const [worktreesFolderSaved, setWorktreesFolderSaved] = useState<string | null>(null);

  const environmentWorkspace = useMemo(() => {
    if (mainWorkspaces.length === 0) return null;
    if (environmentWorkspaceId) {
      const found = mainWorkspaces.find((workspace) => workspace.id === environmentWorkspaceId);
      if (found) return found;
    }
    return mainWorkspaces[0] ?? null;
  }, [environmentWorkspaceId, mainWorkspaces]);

  const environmentSavedScriptFromWorkspace = useMemo(() => {
    return normalizeWorktreeSetupScript(environmentWorkspace?.settings.worktreeSetupScript);
  }, [environmentWorkspace?.settings.worktreeSetupScript]);

  const worktreesFolderFromWorkspace = useMemo(() => {
    return environmentWorkspace?.settings.worktreesFolder ?? null;
  }, [environmentWorkspace?.settings.worktreesFolder]);

  const environmentDraftNormalized = useMemo(() => {
    return normalizeWorktreeSetupScript(environmentDraftScript);
  }, [environmentDraftScript]);

  const environmentDirty = environmentDraftNormalized !== environmentSavedScript;
  const worktreesFolderDirty = (worktreesFolderDraft.trim() || null) !== worktreesFolderSaved;

  useEffect(() => {
    if (!environmentWorkspace) {
      setEnvironmentWorkspaceId(null);
      setEnvironmentLoadedWorkspaceId(null);
      setEnvironmentSavedScript(null);
      setEnvironmentDraftScript("");
      setEnvironmentError(null);
      setEnvironmentSaving(false);
      setWorktreesFolderDraft("");
      setWorktreesFolderSaved(null);
      return;
    }
    if (environmentWorkspaceId !== environmentWorkspace.id) {
      setEnvironmentWorkspaceId(environmentWorkspace.id);
    }
  }, [environmentWorkspace, environmentWorkspaceId]);

  useEffect(() => {
    if (!environmentWorkspace) return;
    if (environmentLoadedWorkspaceId !== environmentWorkspace.id) {
      setEnvironmentLoadedWorkspaceId(environmentWorkspace.id);
      setEnvironmentSavedScript(environmentSavedScriptFromWorkspace);
      setEnvironmentDraftScript(environmentSavedScriptFromWorkspace ?? "");
      setWorktreesFolderSaved(worktreesFolderFromWorkspace);
      setWorktreesFolderDraft(worktreesFolderFromWorkspace ?? "");
      setEnvironmentError(null);
      return;
    }
    if (!environmentDirty && environmentSavedScript !== environmentSavedScriptFromWorkspace) {
      setEnvironmentSavedScript(environmentSavedScriptFromWorkspace);
      setEnvironmentDraftScript(environmentSavedScriptFromWorkspace ?? "");
      setEnvironmentError(null);
    }
    if (!worktreesFolderDirty && worktreesFolderSaved !== worktreesFolderFromWorkspace) {
      setWorktreesFolderSaved(worktreesFolderFromWorkspace);
      setWorktreesFolderDraft(worktreesFolderFromWorkspace ?? "");
    }
  }, [
    environmentDirty,
    environmentLoadedWorkspaceId,
    environmentSavedScript,
    environmentSavedScriptFromWorkspace,
    environmentWorkspace,
    worktreesFolderDirty,
    worktreesFolderFromWorkspace,
    worktreesFolderSaved,
  ]);

  const handleSaveEnvironmentSetup = async () => {
    if (!environmentWorkspace || environmentSaving) return;
    const nextScript = environmentDraftNormalized;
    const nextFolder = worktreesFolderDraft.trim() || null;
    setEnvironmentSaving(true);
    setEnvironmentError(null);
    try {
      await onUpdateWorkspaceSettings(environmentWorkspace.id, {
        worktreeSetupScript: nextScript,
        worktreesFolder: nextFolder,
      });
      setEnvironmentSavedScript(nextScript);
      setEnvironmentDraftScript(nextScript ?? "");
      setWorktreesFolderSaved(nextFolder);
      setWorktreesFolderDraft(nextFolder ?? "");
    } catch (error) {
      setEnvironmentError(error instanceof Error ? error.message : String(error));
    } finally {
      setEnvironmentSaving(false);
    }
  };

  return {
    mainWorkspaces,
    environmentWorkspace,
    environmentSaving,
    environmentError,
    environmentDraftScript,
    environmentSavedScript,
    environmentDirty,
    worktreesFolderDraft,
    worktreesFolderSaved,
    worktreesFolderDirty,
    onSetEnvironmentWorkspaceId: setEnvironmentWorkspaceId,
    onSetEnvironmentDraftScript: setEnvironmentDraftScript,
    onSetWorktreesFolderDraft: setWorktreesFolderDraft,
    onSaveEnvironmentSetup: handleSaveEnvironmentSetup,
  };
};
