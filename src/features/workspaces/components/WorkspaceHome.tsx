import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { ModelOption, WorkspaceInfo } from "../../../types";
import { ComposerInput } from "../../composer/components/ComposerInput";
import { useComposerImages } from "../../composer/hooks/useComposerImages";
import type { DictationSessionState } from "../../../types";
import type { WorkspaceHomeRun, WorkspaceRunMode } from "../hooks/useWorkspaceHome";
import { formatRelativeTime } from "../../../utils/time";
import Laptop from "lucide-react/dist/esm/icons/laptop";
import GitBranch from "lucide-react/dist/esm/icons/git-branch";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right";

type ThreadStatus = {
  isProcessing: boolean;
  isReviewing: boolean;
};

type WorkspaceHomeProps = {
  workspace: WorkspaceInfo;
  runs: WorkspaceHomeRun[];
  prompt: string;
  onPromptChange: (value: string) => void;
  onStartRun: (images?: string[]) => Promise<void>;
  runMode: WorkspaceRunMode;
  onRunModeChange: (mode: WorkspaceRunMode) => void;
  models: ModelOption[];
  selectedModelId: string | null;
  onSelectModel: (modelId: string) => void;
  modelSelections: Record<string, number>;
  onToggleModel: (modelId: string) => void;
  onModelCountChange: (modelId: string, count: number) => void;
  error: string | null;
  isSubmitting: boolean;
  activeWorkspaceId: string | null;
  activeThreadId: string | null;
  threadStatusById: Record<string, ThreadStatus>;
  onSelectInstance: (workspaceId: string, threadId: string) => void;
  dictationEnabled: boolean;
  dictationState: DictationSessionState;
  dictationLevel: number;
  onToggleDictation: () => void;
  onOpenDictationSettings: () => void;
  dictationError: string | null;
  onDismissDictationError: () => void;
  dictationHint: string | null;
  onDismissDictationHint: () => void;
};

const INSTANCE_OPTIONS = [1, 2, 3, 4];

const buildIconPath = (workspacePath: string) => {
  const separator = workspacePath.includes("\\") ? "\\" : "/";
  return `${workspacePath.replace(/[\\/]+$/, "")}${separator}icon.png`;
};

const resolveModelLabel = (model: ModelOption | null) =>
  model?.displayName?.trim() || model?.model?.trim() || "Default model";

export function WorkspaceHome({
  workspace,
  runs,
  prompt,
  onPromptChange,
  onStartRun,
  runMode,
  onRunModeChange,
  models,
  selectedModelId,
  onSelectModel,
  modelSelections,
  onToggleModel,
  onModelCountChange,
  error,
  isSubmitting,
  activeWorkspaceId,
  activeThreadId,
  threadStatusById,
  onSelectInstance,
  dictationEnabled,
  dictationState,
  dictationLevel,
  onToggleDictation,
  onOpenDictationSettings,
  dictationError,
  onDismissDictationError,
  dictationHint,
  onDismissDictationHint,
}: WorkspaceHomeProps) {
  const [showIcon, setShowIcon] = useState(true);
  const [runModeOpen, setRunModeOpen] = useState(false);
  const [modelsOpen, setModelsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const iconPath = useMemo(() => buildIconPath(workspace.path), [workspace.path]);
  const iconSrc = useMemo(() => convertFileSrc(iconPath), [iconPath]);
  const runModeRef = useRef<HTMLDivElement | null>(null);
  const modelsRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const {
    activeImages,
    attachImages,
    pickImages,
    removeImage,
    clearActiveImages,
  } = useComposerImages({
    activeThreadId: null,
    activeWorkspaceId: workspace.id,
  });

  useEffect(() => {
    setShowIcon(true);
  }, [workspace.id]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && runModeRef.current?.contains(target)) {
        return;
      }
      if (target && modelsRef.current?.contains(target)) {
        return;
      }
      setRunModeOpen(false);
      setModelsOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("mousedown", handleClick);
    };
  }, []);

  const handleRunSubmit = async () => {
    if (!prompt.trim() && activeImages.length === 0) {
      return;
    }
    await onStartRun(activeImages);
    clearActiveImages();
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleRunSubmit();
    }
  };

  const selectedModel = selectedModelId
    ? models.find((model) => model.id === selectedModelId) ?? null
    : null;
  const selectedModelLabel = resolveModelLabel(selectedModel);
  const totalInstances = Object.values(modelSelections).reduce(
    (sum, count) => sum + count,
    0,
  );
  const selectedModels = models.filter((model) => modelSelections[model.id]);
  const modelSummary = (() => {
    if (selectedModels.length === 0) {
      return "Select models";
    }
    if (selectedModels.length === 1) {
      const model = selectedModels[0];
      const count = modelSelections[model.id] ?? 1;
      return `${resolveModelLabel(model)} · ${count}x`;
    }
    return `${selectedModels.length} models · ${totalInstances} runs`;
  })();
  const runModeLabel = runMode === "local" ? "Local" : "Worktree";
  const RunModeIcon = runMode === "local" ? Laptop : GitBranch;

  return (
    <div className="workspace-home">
      <div className="workspace-home-hero">
        {showIcon && (
          <img
            className="workspace-home-icon"
            src={iconSrc}
            alt=""
            onError={() => setShowIcon(false)}
          />
        )}
        <div>
          <div className="workspace-home-title">{workspace.name}</div>
          <div className="workspace-home-path">{workspace.path}</div>
        </div>
      </div>

      <div className="workspace-home-composer">
        <div className="composer">
          <ComposerInput
            text={prompt}
            disabled={isSubmitting}
            sendLabel="Send"
            canStop={false}
            canSend={prompt.trim().length > 0 || activeImages.length > 0}
            isProcessing={isSubmitting}
            onStop={() => {}}
            onSend={() => {
              void handleRunSubmit();
            }}
            dictationState={dictationState}
            dictationLevel={dictationLevel}
            dictationEnabled={dictationEnabled}
            onToggleDictation={onToggleDictation}
            onOpenDictationSettings={onOpenDictationSettings}
            dictationError={dictationError}
            onDismissDictationError={onDismissDictationError}
            dictationHint={dictationHint}
            onDismissDictationHint={onDismissDictationHint}
            attachments={activeImages}
            onAddAttachment={() => {
              void pickImages();
            }}
            onAttachImages={attachImages}
            onRemoveAttachment={removeImage}
            onTextChange={(next) => {
              onPromptChange(next);
            }}
            onSelectionChange={() => {}}
            onKeyDown={handleComposerKeyDown}
            isExpanded={isExpanded}
            onToggleExpand={() => setIsExpanded((prev) => !prev)}
            textareaRef={textareaRef}
            suggestionsOpen={false}
            suggestions={[]}
            highlightIndex={0}
            onHighlightIndex={() => {}}
            onSelectSuggestion={() => {}}
          />
        </div>
        {error && <div className="workspace-home-error">{error}</div>}
      </div>

      <div className="workspace-home-controls">
        <div className="open-app-menu workspace-home-control" ref={runModeRef}>
          <div className="open-app-button">
            <button
              type="button"
              className="ghost open-app-action"
              onClick={() => {
                setRunModeOpen((prev) => !prev);
                setModelsOpen(false);
              }}
              aria-label="Select run mode"
              data-tauri-drag-region="false"
            >
              <span className="open-app-label">
                <RunModeIcon className="workspace-home-mode-icon" aria-hidden />
                {runModeLabel}
              </span>
            </button>
            <button
              type="button"
              className="ghost open-app-toggle"
              onClick={() => {
                setRunModeOpen((prev) => !prev);
                setModelsOpen(false);
              }}
              aria-haspopup="menu"
              aria-expanded={runModeOpen}
              aria-label="Toggle run mode menu"
              data-tauri-drag-region="false"
            >
              <ChevronDown size={14} aria-hidden />
            </button>
          </div>
          {runModeOpen && (
            <div className="open-app-dropdown workspace-home-dropdown" role="menu">
              <button
                type="button"
                className={`open-app-option${runMode === "local" ? " is-active" : ""}`}
                onClick={() => {
                  onRunModeChange("local");
                  setRunModeOpen(false);
                  setModelsOpen(false);
                }}
              >
                <Laptop className="workspace-home-mode-icon" aria-hidden />
                Local
              </button>
              <button
                type="button"
                className={`open-app-option${
                  runMode === "worktree" ? " is-active" : ""
                }`}
                onClick={() => {
                  onRunModeChange("worktree");
                  setRunModeOpen(false);
                  setModelsOpen(false);
                }}
              >
                <GitBranch className="workspace-home-mode-icon" aria-hidden />
                Worktree
              </button>
            </div>
          )}
        </div>

        <div className="open-app-menu workspace-home-control" ref={modelsRef}>
          <div className="open-app-button">
            <button
              type="button"
              className="ghost open-app-action"
              onClick={() => {
                setModelsOpen((prev) => !prev);
                setRunModeOpen(false);
              }}
              aria-label="Select models"
              data-tauri-drag-region="false"
            >
              <span className="open-app-label">
                {runMode === "local" ? selectedModelLabel : modelSummary}
              </span>
            </button>
            <button
              type="button"
              className="ghost open-app-toggle"
              onClick={() => {
                setModelsOpen((prev) => !prev);
                setRunModeOpen(false);
              }}
              aria-haspopup="menu"
              aria-expanded={modelsOpen}
              aria-label="Toggle models menu"
              data-tauri-drag-region="false"
            >
              <ChevronDown size={14} aria-hidden />
            </button>
          </div>
          {modelsOpen && (
            <div
              className="open-app-dropdown workspace-home-dropdown workspace-home-model-dropdown"
              role="menu"
            >
              {models.length === 0 && (
                <div className="workspace-home-empty">
                  Connect this workspace to load available models.
                </div>
              )}
              {models.map((model) => {
                const isSelected =
                  runMode === "local"
                    ? model.id === selectedModelId
                    : Boolean(modelSelections[model.id]);
                const count = modelSelections[model.id] ?? 1;
                return (
                  <div
                    key={model.id}
                    className={`workspace-home-model-option${
                      isSelected ? " is-active" : ""
                    }`}
                  >
                    <button
                      type="button"
                      className={`open-app-option workspace-home-model-toggle${
                        isSelected ? " is-active" : ""
                      }`}
                      onClick={() => {
                        if (runMode === "local") {
                          onSelectModel(model.id);
                          setModelsOpen(false);
                          return;
                        }
                        onToggleModel(model.id);
                      }}
                    >
                      <span>{resolveModelLabel(model)}</span>
                    </button>
                    {runMode === "worktree" && (
                      <>
                        <div className="workspace-home-model-meta" aria-hidden>
                          <span>{count}x</span>
                          <ChevronRight size={14} />
                        </div>
                        <div className="workspace-home-model-submenu">
                          {INSTANCE_OPTIONS.map((option) => (
                            <button
                              key={option}
                              type="button"
                              className={`workspace-home-model-submenu-item${
                                option === count ? " is-active" : ""
                              }`}
                              onClick={(event) => {
                                event.stopPropagation();
                                onModelCountChange(model.id, option);
                              }}
                            >
                              {option}x
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {runMode === "local" && (
          <div className="workspace-home-mode-note">
            Uses {selectedModelLabel} in this workspace.
          </div>
        )}
      </div>

      <div className="workspace-home-runs">
        <div className="workspace-home-section-header">
          <div className="workspace-home-section-title">Recent runs</div>
        </div>
        {runs.length === 0 ? (
          <div className="workspace-home-empty">
            Start a run to see its instances tracked here.
          </div>
        ) : (
          <div className="workspace-home-run-grid">
            {runs.map((run) => {
              const hasInstances = run.instances.length > 0;
              const labelCounts = new Map<string, number>();
              run.instances.forEach((instance) => {
                labelCounts.set(
                  instance.modelLabel,
                  (labelCounts.get(instance.modelLabel) ?? 0) + 1,
                );
              });
              return (
                <div className="workspace-home-run-card" key={run.id}>
                  <div className="workspace-home-run-header">
                    <div>
                      <div className="workspace-home-run-title">{run.title}</div>
                      <div className="workspace-home-run-meta">
                        {run.mode === "local" ? "Local" : "Worktree"} ·{" "}
                        {run.instances.length} instance
                        {run.instances.length === 1 ? "" : "s"}
                      </div>
                    </div>
                    <div className="workspace-home-run-time">
                      {formatRelativeTime(run.createdAt)}
                    </div>
                  </div>
                  {hasInstances ? (
                    <div className="workspace-home-instance-list">
                      {run.instances.map((instance) => {
                        const status = threadStatusById[instance.threadId];
                        const statusLabel = status?.isProcessing
                          ? "Running"
                          : status?.isReviewing
                            ? "Reviewing"
                            : "Idle";
                        const isActive =
                          instance.threadId === activeThreadId &&
                          instance.workspaceId === activeWorkspaceId;
                        const totalForLabel = labelCounts.get(instance.modelLabel) ?? 1;
                        const label =
                          totalForLabel > 1
                            ? `${instance.modelLabel} ${instance.sequence}`
                            : instance.modelLabel;
                        return (
                          <button
                            className={`workspace-home-instance${
                              isActive ? " is-active" : ""
                            }`}
                            key={instance.id}
                            type="button"
                            onClick={() =>
                              onSelectInstance(instance.workspaceId, instance.threadId)
                            }
                          >
                            <span className="workspace-home-instance-title">{label}</span>
                            <span
                              className={`workspace-home-instance-status${
                                status?.isProcessing ? " is-running" : ""
                              }`}
                            >
                              {statusLabel}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="workspace-home-empty">
                      Instances are preparing...
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
