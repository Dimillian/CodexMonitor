import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DebugEntry, SkillOption, WorkspaceInfo } from "../../../types";
import { getSkillsList } from "../../../services/tauri";
import { subscribeAppServerEvents } from "../../../services/events";
import { isSkillsUpdateAvailableEvent } from "../../../utils/appServerEvents";

type UseSkillsOptions = {
  activeWorkspace: WorkspaceInfo | null;
  onDebug?: (entry: DebugEntry) => void;
};

export function useSkills({ activeWorkspace, onDebug }: UseSkillsOptions) {
  const [skills, setSkills] = useState<SkillOption[]>([]);
  const lastFetchedWorkspaceId = useRef<string | null>(null);
  const inFlight = useRef(false);

  const workspaceId = activeWorkspace?.id ?? null;
  const isConnected = Boolean(activeWorkspace?.connected);

  const refreshSkills = useCallback(async () => {
    if (!workspaceId || !isConnected) {
      return;
    }
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    onDebug?.({
      id: `${Date.now()}-client-skills-list`,
      timestamp: Date.now(),
      source: "client",
      label: "skills/list",
      payload: { workspaceId },
    });
    try {
      const response = await getSkillsList(workspaceId);
      onDebug?.({
        id: `${Date.now()}-server-skills-list`,
        timestamp: Date.now(),
        source: "server",
        label: "skills/list response",
        payload: response,
      });
      const dataBuckets = response.result?.data ?? response.data ?? [];
      const rawSkills =
        response.result?.skills ??
        response.skills ??
        (Array.isArray(dataBuckets)
          ? dataBuckets.flatMap((bucket: any) => bucket?.skills ?? [])
          : []);
      const data: SkillOption[] = rawSkills.map((item: any) => ({
        name: String(item.name ?? ""),
        path: String(item.path ?? ""),
        description: item.description ? String(item.description) : undefined,
      }));
      setSkills(data);
      lastFetchedWorkspaceId.current = workspaceId;
    } catch (error) {
      onDebug?.({
        id: `${Date.now()}-client-skills-list-error`,
        timestamp: Date.now(),
        source: "error",
        label: "skills/list error",
        payload: error instanceof Error ? error.message : String(error),
      });
    } finally {
      inFlight.current = false;
    }
  }, [isConnected, onDebug, workspaceId]);

  useEffect(() => {
    if (!workspaceId || !isConnected) {
      return;
    }
    if (lastFetchedWorkspaceId.current === workspaceId && skills.length > 0) {
      return;
    }
    refreshSkills();
  }, [isConnected, refreshSkills, skills.length, workspaceId]);

  useEffect(() => {
    if (!workspaceId || !isConnected) {
      return;
    }

    return subscribeAppServerEvents((event) => {
      if (event.workspace_id !== workspaceId) {
        return;
      }
      if (!isSkillsUpdateAvailableEvent(event)) {
        return;
      }

      onDebug?.({
        id: `${Date.now()}-server-skills-update-available`,
        timestamp: Date.now(),
        source: "server",
        label: "skills/update available",
        payload: event,
      });
      void refreshSkills();
    });
  }, [isConnected, onDebug, refreshSkills, workspaceId]);

  const skillOptions = useMemo(
    () => skills.filter((skill) => skill.name),
    [skills],
  );

  return {
    skills: skillOptions,
    refreshSkills,
  };
}
