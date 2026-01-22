import { useCallback, useMemo, useState } from "react";
import type { ModelOption, WorkspaceInfo } from "../../../types";

export type WorkspaceRunMode = "local" | "worktree";

export type WorkspaceHomeRunInstance = {
  id: string;
  workspaceId: string;
  threadId: string;
  modelId: string | null;
  modelLabel: string;
  sequence: number;
};

export type WorkspaceHomeRun = {
  id: string;
  workspaceId: string;
  title: string;
  prompt: string;
  createdAt: number;
  mode: WorkspaceRunMode;
  instances: WorkspaceHomeRunInstance[];
};

type UseWorkspaceHomeOptions = {
  activeWorkspace: WorkspaceInfo | null;
  models: ModelOption[];
  selectedModelId: string | null;
  addWorktreeAgent: (
    workspace: WorkspaceInfo,
    branch: string,
    options?: { activate?: boolean },
  ) => Promise<WorkspaceInfo | null>;
  connectWorkspace: (workspace: WorkspaceInfo) => Promise<void>;
  startThreadForWorkspace: (
    workspaceId: string,
    options?: { activate?: boolean },
  ) => Promise<string | null>;
  sendUserMessageToThread: (
    workspace: WorkspaceInfo,
    threadId: string,
    text: string,
    images?: string[],
    options?: { model?: string | null; effort?: string | null },
  ) => Promise<void>;
};

type WorkspaceHomeState = {
  runsByWorkspace: Record<string, WorkspaceHomeRun[]>;
  draftsByWorkspace: Record<string, string>;
  modeByWorkspace: Record<string, WorkspaceRunMode>;
  modelSelectionsByWorkspace: Record<string, Record<string, number>>;
  errorByWorkspace: Record<string, string | null>;
  submittingByWorkspace: Record<string, boolean>;
};

const DEFAULT_MODE: WorkspaceRunMode = "local";
const EMPTY_SELECTIONS: Record<string, number> = {};
const MAX_TITLE_LENGTH = 56;

const createRunId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const buildRunTitle = (prompt: string) => {
  const firstLine = prompt.trim().split("\n")[0] ?? "";
  const normalized = firstLine.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "New run";
  }
  if (normalized.length > MAX_TITLE_LENGTH) {
    return `${normalized.slice(0, MAX_TITLE_LENGTH)}...`;
  }
  return normalized;
};

const buildWorktreeBranch = () => {
  const date = new Date().toISOString().slice(0, 10);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `codex/${date}-${suffix}`;
};

const resolveModelLabel = (model: ModelOption | null, fallback: string) =>
  model?.displayName?.trim() || model?.model?.trim() || fallback;

export function useWorkspaceHome({
  activeWorkspace,
  models,
  selectedModelId,
  addWorktreeAgent,
  connectWorkspace,
  startThreadForWorkspace,
  sendUserMessageToThread,
}: UseWorkspaceHomeOptions) {
  const [state, setState] = useState<WorkspaceHomeState>({
    runsByWorkspace: {},
    draftsByWorkspace: {},
    modeByWorkspace: {},
    modelSelectionsByWorkspace: {},
    errorByWorkspace: {},
    submittingByWorkspace: {},
  });

  const activeWorkspaceId = activeWorkspace?.id ?? null;
  const runs = activeWorkspaceId ? state.runsByWorkspace[activeWorkspaceId] ?? [] : [];
  const draft = activeWorkspaceId ? state.draftsByWorkspace[activeWorkspaceId] ?? "" : "";
  const runMode = activeWorkspaceId
    ? state.modeByWorkspace[activeWorkspaceId] ?? DEFAULT_MODE
    : DEFAULT_MODE;
  const modelSelections = useMemo(() => {
    if (!activeWorkspaceId) {
      return EMPTY_SELECTIONS;
    }
    return state.modelSelectionsByWorkspace[activeWorkspaceId] ?? EMPTY_SELECTIONS;
  }, [activeWorkspaceId, state.modelSelectionsByWorkspace]);
  const error = activeWorkspaceId ? state.errorByWorkspace[activeWorkspaceId] ?? null : null;
  const isSubmitting = activeWorkspaceId
    ? state.submittingByWorkspace[activeWorkspaceId] ?? false
    : false;

  const modelLookup = useMemo(() => {
    const map = new Map<string, ModelOption>();
    models.forEach((model) => {
      map.set(model.id, model);
    });
    return map;
  }, [models]);

  const setDraft = useCallback(
    (value: string) => {
      if (!activeWorkspaceId) {
        return;
      }
      setState((prev) => ({
        ...prev,
        draftsByWorkspace: { ...prev.draftsByWorkspace, [activeWorkspaceId]: value },
        errorByWorkspace: { ...prev.errorByWorkspace, [activeWorkspaceId]: null },
      }));
    },
    [activeWorkspaceId],
  );

  const setRunMode = useCallback(
    (mode: WorkspaceRunMode) => {
      if (!activeWorkspaceId) {
        return;
      }
      setState((prev) => ({
        ...prev,
        modeByWorkspace: { ...prev.modeByWorkspace, [activeWorkspaceId]: mode },
        errorByWorkspace: { ...prev.errorByWorkspace, [activeWorkspaceId]: null },
      }));
    },
    [activeWorkspaceId],
  );

  const toggleModelSelection = useCallback(
    (modelId: string) => {
      if (!activeWorkspaceId) {
        return;
      }
      setState((prev) => {
        const current = prev.modelSelectionsByWorkspace[activeWorkspaceId] ?? {};
        const next = { ...current };
        if (next[modelId]) {
          delete next[modelId];
        } else {
          next[modelId] = 1;
        }
        return {
          ...prev,
          modelSelectionsByWorkspace: {
            ...prev.modelSelectionsByWorkspace,
            [activeWorkspaceId]: next,
          },
          errorByWorkspace: { ...prev.errorByWorkspace, [activeWorkspaceId]: null },
        };
      });
    },
    [activeWorkspaceId],
  );

  const setModelCount = useCallback(
    (modelId: string, count: number) => {
      if (!activeWorkspaceId) {
        return;
      }
      setState((prev) => {
        const current = prev.modelSelectionsByWorkspace[activeWorkspaceId] ?? {};
        const next = { ...current, [modelId]: Math.max(1, count) };
        return {
          ...prev,
          modelSelectionsByWorkspace: {
            ...prev.modelSelectionsByWorkspace,
            [activeWorkspaceId]: next,
          },
          errorByWorkspace: { ...prev.errorByWorkspace, [activeWorkspaceId]: null },
        };
      });
    },
    [activeWorkspaceId],
  );

  const setWorkspaceError = useCallback(
    (message: string | null) => {
      if (!activeWorkspaceId) {
        return;
      }
      setState((prev) => ({
        ...prev,
        errorByWorkspace: { ...prev.errorByWorkspace, [activeWorkspaceId]: message },
      }));
    },
    [activeWorkspaceId],
  );

  const setSubmitting = useCallback(
    (value: boolean) => {
      if (!activeWorkspaceId) {
        return;
      }
      setState((prev) => ({
        ...prev,
        submittingByWorkspace: {
          ...prev.submittingByWorkspace,
          [activeWorkspaceId]: value,
        },
      }));
    },
    [activeWorkspaceId],
  );

  const replaceRunInstances = useCallback(
    (workspaceId: string, runId: string, instances: WorkspaceHomeRunInstance[]) => {
      setState((prev) => {
        const runsForWorkspace = prev.runsByWorkspace[workspaceId] ?? [];
        return {
          ...prev,
          runsByWorkspace: {
            ...prev.runsByWorkspace,
            [workspaceId]: runsForWorkspace.map((run) =>
              run.id === runId ? { ...run, instances } : run,
            ),
          },
        };
      });
    },
    [],
  );

  const startRun = useCallback(async (images: string[] = []) => {
    if (!activeWorkspaceId || !activeWorkspace) {
      return;
    }
    const prompt = draft.trim();
    if (!prompt || isSubmitting) {
      return;
    }

    const selectedModels = Object.entries(modelSelections)
      .filter(([modelId, count]) => count > 0 && modelLookup.has(modelId))
      .map(([modelId, count]) => ({
        modelId,
        count,
        model: modelLookup.get(modelId) ?? null,
      }));

    if (runMode === "worktree" && selectedModels.length === 0) {
      setWorkspaceError("Select at least one model to run in a worktree.");
      return;
    }

    setSubmitting(true);
    setWorkspaceError(null);

    const runId = createRunId();
    const run: WorkspaceHomeRun = {
      id: runId,
      workspaceId: activeWorkspaceId,
      title: buildRunTitle(prompt),
      prompt,
      createdAt: Date.now(),
      mode: runMode,
      instances: [],
    };

    setState((prev) => ({
      ...prev,
      runsByWorkspace: {
        ...prev.runsByWorkspace,
        [activeWorkspaceId]: [run, ...(prev.runsByWorkspace[activeWorkspaceId] ?? [])],
      },
      draftsByWorkspace: { ...prev.draftsByWorkspace, [activeWorkspaceId]: "" },
    }));

    const instances: WorkspaceHomeRunInstance[] = [];
    try {
      if (runMode === "local") {
        if (!activeWorkspace.connected) {
          await connectWorkspace(activeWorkspace);
        }
        const threadId = await startThreadForWorkspace(activeWorkspace.id, {
          activate: false,
        });
        if (!threadId) {
          throw new Error("Failed to start a local thread.");
        }
        await sendUserMessageToThread(activeWorkspace, threadId, prompt, images);
        const model = selectedModelId ? modelLookup.get(selectedModelId) ?? null : null;
        instances.push({
          id: `${runId}-local-1`,
          workspaceId: activeWorkspace.id,
          threadId,
          modelId: selectedModelId ?? null,
          modelLabel: resolveModelLabel(model, "Default model"),
          sequence: 1,
        });
      } else {
        for (const selection of selectedModels) {
          const label = resolveModelLabel(selection.model, selection.modelId);
          for (let index = 0; index < selection.count; index += 1) {
            const branch = buildWorktreeBranch();
            const worktreeWorkspace = await addWorktreeAgent(activeWorkspace, branch, {
              activate: false,
            });
            if (!worktreeWorkspace) {
              continue;
            }
            if (!worktreeWorkspace.connected) {
              await connectWorkspace(worktreeWorkspace);
            }
            const threadId = await startThreadForWorkspace(worktreeWorkspace.id, {
              activate: false,
            });
            if (!threadId) {
              continue;
            }
            await sendUserMessageToThread(worktreeWorkspace, threadId, prompt, images, {
              model: selection.modelId,
              effort: null,
            });
            instances.push({
              id: `${runId}-${selection.modelId}-${index + 1}`,
              workspaceId: worktreeWorkspace.id,
              threadId,
              modelId: selection.modelId,
              modelLabel: label,
              sequence: index + 1,
            });
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setWorkspaceError(message);
    } finally {
      replaceRunInstances(activeWorkspaceId, runId, instances);
      setSubmitting(false);
    }
  }, [
    activeWorkspace,
    activeWorkspaceId,
    addWorktreeAgent,
    connectWorkspace,
    draft,
    isSubmitting,
    modelLookup,
    modelSelections,
    replaceRunInstances,
    runMode,
    selectedModelId,
    sendUserMessageToThread,
    setSubmitting,
    setWorkspaceError,
    startThreadForWorkspace,
  ]);

  return {
    runs,
    draft,
    runMode,
    modelSelections,
    error,
    isSubmitting,
    setDraft,
    setRunMode,
    toggleModelSelection,
    setModelCount,
    startRun,
  };
}
