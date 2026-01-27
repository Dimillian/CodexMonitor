import { useCallback, useEffect, useMemo, useState } from "react";
import type { ModelOption, WorkspaceInfo } from "../../../types";
import { generateRunMetadata } from "../../../services/tauri";

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
  status: "pending" | "ready" | "partial" | "failed";
  error: string | null;
  instanceErrors: Array<{ message: string }>;
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
  onWorktreeCreated?: (worktree: WorkspaceInfo, parent: WorkspaceInfo) => Promise<void> | void;
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

const ALLOWED_PREFIXES = [
  "feat",
  "fix",
  "chore",
  "test",
  "docs",
  "refactor",
  "perf",
  "build",
  "ci",
  "style",
];

const PREFIX_RULES: Array<{ prefix: string; keywords: string[] }> = [
  { prefix: "test", keywords: ["test", "tests", "testing"] },
  { prefix: "docs", keywords: ["doc", "docs", "documentation", "readme"] },
  { prefix: "chore", keywords: ["chore", "cleanup", "maintenance"] },
  { prefix: "refactor", keywords: ["refactor"] },
  { prefix: "perf", keywords: ["perf", "performance", "optimize", "optimization"] },
  { prefix: "build", keywords: ["build", "bundle", "compile"] },
  { prefix: "ci", keywords: ["ci", "pipeline", "workflow"] },
  { prefix: "style", keywords: ["style", "format", "lint"] },
  {
    prefix: "fix",
    keywords: [
      "fix",
      "bug",
      "error",
      "issue",
      "broken",
      "regression",
      "crash",
      "failure",
    ],
  },
];

const resolveWorktreePrefix = (prompt: string) => {
  const lower = prompt.toLowerCase();
  const matched = PREFIX_RULES.find((rule) =>
    rule.keywords.some((keyword) => lower.includes(keyword)),
  );
  return matched?.prefix ?? "feat";
};

const buildWorktreeBranch = (prompt: string) => {
  const prefix = resolveWorktreePrefix(prompt);
  const base = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 4)
    .join("-");
  const slug = base || `run-${Math.random().toString(36).slice(2, 6)}`;
  return `${prefix}/${slug}`;
};

const resolveModelLabel = (model: ModelOption | null, fallback: string) =>
  model?.displayName?.trim() || model?.model?.trim() || fallback;

const normalizeWorktreeName = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }
  const trimmed = value.trim().toLowerCase();
  for (const prefix of ALLOWED_PREFIXES) {
    const prefixWithSlash = `${prefix}/`;
    if (trimmed.startsWith(prefixWithSlash)) {
      const remainder = trimmed.slice(prefixWithSlash.length).replace(/^\/+/, "");
      return remainder ? `${prefixWithSlash}${remainder}` : null;
    }
  }
  for (const prefix of ALLOWED_PREFIXES) {
    const dashPrefix = `${prefix}-`;
    if (trimmed.startsWith(dashPrefix)) {
      const remainder = trimmed.slice(dashPrefix.length).replace(/^\/+/, "");
      return remainder ? `${prefix}/${remainder}` : null;
    }
  }
  const fallback = trimmed.replace(/^\/+/, "");
  return fallback ? `feat/${fallback}` : null;
};

export function useWorkspaceHome({
  activeWorkspace,
  models,
  selectedModelId,
  addWorktreeAgent,
  connectWorkspace,
  startThreadForWorkspace,
  sendUserMessageToThread,
  onWorktreeCreated,
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

  useEffect(() => {
    if (!activeWorkspaceId || !activeWorkspace) {
      return;
    }
    if ((activeWorkspace.kind ?? "main") === "worktree" && runMode !== "local") {
      setState((prev) => ({
        ...prev,
        modeByWorkspace: { ...prev.modeByWorkspace, [activeWorkspaceId]: "local" },
      }));
    }
  }, [activeWorkspace, activeWorkspaceId, runMode]);

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

  const updateRunState = useCallback(
    (
      workspaceId: string,
      runId: string,
      updates: Partial<WorkspaceHomeRun>,
    ) => {
      setState((prev) => {
        const runsForWorkspace = prev.runsByWorkspace[workspaceId] ?? [];
        return {
          ...prev,
          runsByWorkspace: {
            ...prev.runsByWorkspace,
            [workspaceId]: runsForWorkspace.map((run) =>
              run.id === runId ? { ...run, ...updates } : run,
            ),
          },
        };
      });
    },
    [],
  );

  const updateRunTitle = useCallback(
    (workspaceId: string, runId: string, title: string) => {
      setState((prev) => {
        const runsForWorkspace = prev.runsByWorkspace[workspaceId] ?? [];
        return {
          ...prev,
          runsByWorkspace: {
            ...prev.runsByWorkspace,
            [workspaceId]: runsForWorkspace.map((run) =>
              run.id === runId ? { ...run, title } : run,
            ),
          },
        };
      });
    },
    [],
  );

  const startRun = useCallback(async (images: string[] = []) => {
    if (!activeWorkspaceId || !activeWorkspace) {
      return false;
    }
    const prompt = draft.trim();
    const hasImages = images.length > 0;
    if ((!prompt && !hasImages) || isSubmitting) {
      return false;
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
      return false;
    }

    setSubmitting(true);
    setWorkspaceError(null);

    const runId = createRunId();
    const runIdParts = runId.split("-");
    const runSuffix = runIdParts.length
      ? runIdParts[runIdParts.length - 1]
      : runId.slice(-6);
    const fallbackTitle = buildRunTitle(prompt);
    const run: WorkspaceHomeRun = {
      id: runId,
      workspaceId: activeWorkspaceId,
      title: fallbackTitle,
      prompt,
      createdAt: Date.now(),
      mode: runMode,
      instances: [],
      status: "pending",
      error: null,
      instanceErrors: [],
    };

    setState((prev) => ({
      ...prev,
      runsByWorkspace: {
        ...prev.runsByWorkspace,
        [activeWorkspaceId]: [run, ...(prev.runsByWorkspace[activeWorkspaceId] ?? [])],
      },
      draftsByWorkspace: { ...prev.draftsByWorkspace, [activeWorkspaceId]: "" },
    }));

    let worktreeBaseName: string | null = null;
    if (runMode === "local") {
      void generateRunMetadata(activeWorkspace.id, prompt)
        .then((metadata) => {
          if (!metadata?.title) {
            return;
          }
          const nextTitle = metadata.title.trim();
          if (nextTitle && nextTitle !== fallbackTitle) {
            updateRunTitle(activeWorkspaceId, runId, nextTitle);
          }
        })
        .catch(() => {
          // Metadata is best-effort for local runs.
        });
    } else {
      try {
        const metadata = await generateRunMetadata(activeWorkspace.id, prompt);
        if (metadata?.title && metadata.title.trim() !== fallbackTitle) {
          updateRunTitle(activeWorkspaceId, runId, metadata.title.trim());
        }
        worktreeBaseName = normalizeWorktreeName(metadata?.worktreeName) ?? null;
      } catch {
        // Best-effort fallback to local naming.
      }
      if (!worktreeBaseName) {
        worktreeBaseName = buildWorktreeBranch(prompt);
      }
    }
    const worktreeSlugBase = worktreeBaseName
      ? `${worktreeBaseName}-${runSuffix}`
      : null;

    const instances: WorkspaceHomeRunInstance[] = [];
    let runError: string | null = null;
    const instanceErrors: Array<{ message: string }> = [];
    try {
      if (runMode === "local") {
        try {
          if (!activeWorkspace.connected) {
            await connectWorkspace(activeWorkspace);
          }
          const threadId = await startThreadForWorkspace(activeWorkspace.id, {
            activate: false,
          });
          if (!threadId) {
            throw new Error("Failed to start a local thread.");
          }
          const localModel = selectedModelId
            ? modelLookup.get(selectedModelId)?.model ?? null
            : null;
          await sendUserMessageToThread(activeWorkspace, threadId, prompt, images, {
            model: localModel,
          });
          const model =
            selectedModelId ? modelLookup.get(selectedModelId) ?? null : null;
          instances.push({
            id: `${runId}-local-1`,
            workspaceId: activeWorkspace.id,
            threadId,
            modelId: selectedModelId ?? null,
            modelLabel: resolveModelLabel(model, "Default model"),
            sequence: 1,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          runError = message;
          instanceErrors.push({ message });
        }
      } else {
        let instanceCounter = 0;
        let failureCount = 0;
        const totalInstanceCount = selectedModels.reduce(
          (sum, selection) => sum + selection.count,
          0,
        );
        const branchBaseFallback = worktreeSlugBase ?? buildWorktreeBranch(prompt);
        for (const selection of selectedModels) {
          const label = resolveModelLabel(selection.model, selection.modelId);
          for (let index = 0; index < selection.count; index += 1) {
            instanceCounter += 1;
            const instanceSuffix =
              totalInstanceCount > 1 ? `-${instanceCounter}` : "";
            const branch = `${branchBaseFallback}${instanceSuffix}`;
            try {
              const worktreeWorkspace = await addWorktreeAgent(
                activeWorkspace,
                branch,
                { activate: false },
              );
              if (!worktreeWorkspace) {
                throw new Error("Failed to create worktree.");
              }
              if (!worktreeWorkspace.connected) {
                await connectWorkspace(worktreeWorkspace);
              }
              try {
                await onWorktreeCreated?.(worktreeWorkspace, activeWorkspace);
              } catch {
                // Setup script errors are handled by the caller; runs should still proceed.
              }
              const threadId = await startThreadForWorkspace(worktreeWorkspace.id, {
                activate: false,
              });
              if (!threadId) {
                throw new Error("Failed to start a worktree thread.");
              }
              await sendUserMessageToThread(
                worktreeWorkspace,
                threadId,
                prompt,
                images,
                {
                  model: selection.model?.model ?? selection.modelId,
                  effort: null,
                },
              );
              instances.push({
                id: `${runId}-${selection.modelId}-${index + 1}`,
                workspaceId: worktreeWorkspace.id,
                threadId,
                modelId: selection.modelId,
                modelLabel: label,
                sequence: index + 1,
              });
            } catch (error) {
              failureCount += 1;
              const message = error instanceof Error ? error.message : String(error);
              runError ??= message;
              instanceErrors.push({ message });
            }
          }
        }
        if (failureCount > 0) {
          runError = `Started ${instances.length}/${totalInstanceCount} runs. ${failureCount} failed.`;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      runError ??= message;
    } finally {
      let status: WorkspaceHomeRun["status"] = "ready";
      if (instances.length === 0) {
        runError ??= "Failed to start any instances.";
        status = "failed";
      } else if (runError) {
        status = "partial";
      }
      updateRunState(activeWorkspaceId, runId, {
        instances,
        status,
        error: runError,
        instanceErrors,
      });
      if (runError && status === "failed") {
        setWorkspaceError(runError);
      }
      setSubmitting(false);
    }
    return true;
  }, [
    activeWorkspace,
    activeWorkspaceId,
    addWorktreeAgent,
    connectWorkspace,
    onWorktreeCreated,
    draft,
    isSubmitting,
    modelLookup,
    modelSelections,
    updateRunState,
    runMode,
    selectedModelId,
    sendUserMessageToThread,
    setSubmitting,
    setWorkspaceError,
    startThreadForWorkspace,
    updateRunTitle,
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
