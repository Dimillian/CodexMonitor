import { useCallback } from "react";
import type { ModelOption, WorkspaceInfo } from "../../../types";
import type { WorkspaceRunMode } from "../hooks/useWorkspaceHome";
import Laptop from "lucide-react/dist/esm/icons/laptop";
import GitBranch from "lucide-react/dist/esm/icons/git-branch";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right";
import Cpu from "lucide-react/dist/esm/icons/cpu";
import {
  PopoverMenuItem,
  SplitActionMenu,
} from "../../design-system/components/popover/PopoverPrimitives";
import { useMenuController } from "../../app/hooks/useMenuController";
import {
  buildModelSummary,
  INSTANCE_OPTIONS,
  resolveModelLabel,
} from "./workspaceHomeHelpers";

type WorkspaceHomeRunControlsProps = {
  workspaceKind: WorkspaceInfo["kind"];
  runMode: WorkspaceRunMode;
  onRunModeChange: (mode: WorkspaceRunMode) => void;
  models: ModelOption[];
  selectedModelId: string | null;
  onSelectModel: (modelId: string) => void;
  modelSelections: Record<string, number>;
  onToggleModel: (modelId: string) => void;
  onModelCountChange: (modelId: string, count: number) => void;
  collaborationModes: { id: string; label: string }[];
  selectedCollaborationModeId: string | null;
  onSelectCollaborationMode: (id: string | null) => void;
  reasoningOptions: string[];
  selectedEffort: string | null;
  onSelectEffort: (effort: string) => void;
  reasoningSupported: boolean;
  isSubmitting: boolean;
};

export function WorkspaceHomeRunControls({
  workspaceKind,
  runMode,
  onRunModeChange,
  models,
  selectedModelId,
  onSelectModel,
  modelSelections,
  onToggleModel,
  onModelCountChange,
  collaborationModes,
  selectedCollaborationModeId,
  onSelectCollaborationMode,
  reasoningOptions,
  selectedEffort,
  onSelectEffort,
  reasoningSupported,
  isSubmitting,
}: WorkspaceHomeRunControlsProps) {
  const runModeMenu = useMenuController();
  const modelsMenu = useMenuController();
  const {
    isOpen: runModeOpen,
    containerRef: runModeRef,
    toggle: toggleRunModeOpen,
    close: closeRunMode,
  } = runModeMenu;
  const {
    isOpen: modelsOpen,
    containerRef: modelsRef,
    toggle: toggleModelsOpen,
    close: closeModels,
  } = modelsMenu;

  const selectedModel = selectedModelId
    ? models.find((model) => model.id === selectedModelId) ?? null
    : null;
  const selectedModelLabel = resolveModelLabel(selectedModel);
  const modelSummary = buildModelSummary(models, modelSelections);
  const showRunMode = (workspaceKind ?? "main") !== "worktree";
  const runModeLabel = runMode === "local" ? "Local" : "Worktree";
  const RunModeIcon = runMode === "local" ? Laptop : GitBranch;
  const toggleRunModeMenu = useCallback(() => {
    toggleRunModeOpen();
    closeModels();
  }, [closeModels, toggleRunModeOpen]);
  const toggleModelsMenu = useCallback(() => {
    toggleModelsOpen();
    closeRunMode();
  }, [closeRunMode, toggleModelsOpen]);

  return (
    <div className="workspace-home-controls">
      {showRunMode && (
        <SplitActionMenu
          containerRef={runModeRef}
          className="open-app-menu workspace-home-control"
          buttonGroupClassName="open-app-button"
          actionButton={
            <button
              type="button"
              className="ghost open-app-action"
              onClick={toggleRunModeMenu}
              aria-label="Select run mode"
              data-tauri-drag-region="false"
            >
              <span className="open-app-label">
                <RunModeIcon className="workspace-home-mode-icon" aria-hidden />
                {runModeLabel}
              </span>
            </button>
          }
          isOpen={runModeOpen}
          onToggle={toggleRunModeMenu}
          toggleClassName="ghost open-app-toggle"
          toggleAriaLabel="Toggle run mode menu"
          toggleIcon={<ChevronDown size={14} aria-hidden />}
          popoverClassName="open-app-dropdown workspace-home-dropdown"
          popoverRole="menu"
        >
          <PopoverMenuItem
            className="open-app-option"
            onClick={() => {
              onRunModeChange("local");
              closeRunMode();
              closeModels();
            }}
            icon={<Laptop className="workspace-home-mode-icon" aria-hidden />}
            active={runMode === "local"}
          >
            Local
          </PopoverMenuItem>
          <PopoverMenuItem
            className="open-app-option"
            onClick={() => {
              onRunModeChange("worktree");
              closeRunMode();
              closeModels();
            }}
            icon={<GitBranch className="workspace-home-mode-icon" aria-hidden />}
            active={runMode === "worktree"}
          >
            Worktree
          </PopoverMenuItem>
        </SplitActionMenu>
      )}

      <SplitActionMenu
        containerRef={modelsRef}
        className="open-app-menu workspace-home-control"
        buttonGroupClassName="open-app-button"
        actionButton={
          <button
            type="button"
            className="ghost open-app-action"
            onClick={toggleModelsMenu}
            aria-label="Select models"
            data-tauri-drag-region="false"
          >
            <span className="open-app-label">
              {runMode === "local" ? selectedModelLabel : modelSummary}
            </span>
          </button>
        }
        isOpen={modelsOpen}
        onToggle={toggleModelsMenu}
        toggleClassName="ghost open-app-toggle"
        toggleAriaLabel="Toggle models menu"
        toggleIcon={<ChevronDown size={14} aria-hidden />}
        popoverClassName="open-app-dropdown workspace-home-dropdown workspace-home-model-dropdown"
        popoverRole="menu"
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
              className={`workspace-home-model-option${isSelected ? " is-active" : ""}`}
            >
              <PopoverMenuItem
                className="open-app-option workspace-home-model-toggle"
                onClick={() => {
                  if (runMode === "local") {
                    onSelectModel(model.id);
                    closeModels();
                    return;
                  }
                  onToggleModel(model.id);
                }}
                icon={<Cpu className="workspace-home-mode-icon" aria-hidden />}
                active={isSelected}
              >
                {resolveModelLabel(model)}
              </PopoverMenuItem>
              {runMode === "worktree" && (
                <>
                  <div className="workspace-home-model-meta" aria-hidden>
                    <span>{count}x</span>
                    <ChevronRight size={14} />
                  </div>
                  <div className="workspace-home-model-submenu ds-popover">
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
      </SplitActionMenu>
      {collaborationModes.length > 0 && (
        <div className="composer-select-wrap workspace-home-control">
          <div className="open-app-button">
            <span className="composer-icon" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M7 7h10M7 12h6M7 17h8"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <select
              className="composer-select composer-select--model"
              aria-label="Collaboration mode"
              value={selectedCollaborationModeId ?? ""}
              onChange={(event) => onSelectCollaborationMode(event.target.value || null)}
              disabled={isSubmitting}
            >
              {collaborationModes.map((mode) => (
                <option key={mode.id} value={mode.id}>
                  {mode.label || mode.id}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
      <div className="composer-select-wrap workspace-home-control">
        <div className="open-app-button">
          <span className="composer-icon" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none">
              <path
                d="M8.5 4.5a3.5 3.5 0 0 0-3.46 4.03A4 4 0 0 0 6 16.5h2"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
              <path
                d="M15.5 4.5a3.5 3.5 0 0 1 3.46 4.03A4 4 0 0 1 18 16.5h-2"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
              <path
                d="M9 12h6"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
              <path
                d="M12 12v6"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <select
            className="composer-select composer-select--effort"
            aria-label="Thinking mode"
            value={selectedEffort ?? ""}
            onChange={(event) => onSelectEffort(event.target.value)}
            disabled={isSubmitting || !reasoningSupported}
          >
            {reasoningOptions.length === 0 && <option value="">Default</option>}
            {reasoningOptions.map((effortOption) => (
              <option key={effortOption} value={effortOption}>
                {effortOption}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
