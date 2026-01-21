import { useMemo } from "react";
import type { AccessMode } from "../../../types";
import { useTauriEvent } from "../../app/hooks/useTauriEvent";
import {
  subscribeMenuCycleAccessMode,
  subscribeMenuCycleModel,
  subscribeMenuCycleReasoning,
} from "../../../services/events";

type ModelOption = { id: string; displayName: string; model: string };

type UseComposerMenuActionsOptions = {
  models: ModelOption[];
  selectedModelId: string | null;
  onSelectModel: (id: string) => void;
  accessMode: AccessMode;
  onSelectAccessMode: (mode: AccessMode) => void;
  reasoningOptions: string[];
  selectedEffort: string | null;
  onSelectEffort: (effort: string) => void;
  onFocusComposer?: () => void;
};

const ACCESS_ORDER: AccessMode[] = ["read-only", "current", "full-access"];

export function useComposerMenuActions({
  models,
  selectedModelId,
  onSelectModel,
  accessMode,
  onSelectAccessMode,
  reasoningOptions,
  selectedEffort,
  onSelectEffort,
  onFocusComposer,
}: UseComposerMenuActionsOptions) {
  const handlers = useMemo(
    () => ({
      cycleModel() {
        if (models.length === 0) {
          return;
        }
        const currentIndex = models.findIndex((model) => model.id === selectedModelId);
        const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % models.length : 0;
        const nextModel = models[nextIndex];
        if (nextModel) {
          onFocusComposer?.();
          onSelectModel(nextModel.id);
        }
      },
      cycleAccessMode() {
        const currentIndex = ACCESS_ORDER.indexOf(accessMode);
        const nextIndex =
          currentIndex >= 0 ? (currentIndex + 1) % ACCESS_ORDER.length : 0;
        const nextAccess = ACCESS_ORDER[nextIndex];
        if (nextAccess) {
          onFocusComposer?.();
          onSelectAccessMode(nextAccess);
        }
      },
      cycleReasoning() {
        if (reasoningOptions.length === 0) {
          return;
        }
        const currentIndex = reasoningOptions.indexOf(selectedEffort ?? "");
        const nextIndex =
          currentIndex >= 0 ? (currentIndex + 1) % reasoningOptions.length : 0;
        const nextEffort = reasoningOptions[nextIndex];
        if (nextEffort) {
          onFocusComposer?.();
          onSelectEffort(nextEffort);
        }
      },
    }),
    [
      accessMode,
      models,
      onFocusComposer,
      onSelectAccessMode,
      onSelectEffort,
      onSelectModel,
      reasoningOptions,
      selectedEffort,
      selectedModelId,
    ],
  );

  useTauriEvent(subscribeMenuCycleModel, () => {
    handlers.cycleModel();
  });

  useTauriEvent(subscribeMenuCycleAccessMode, () => {
    handlers.cycleAccessMode();
  });

  useTauriEvent(subscribeMenuCycleReasoning, () => {
    handlers.cycleReasoning();
  });

  return handlers;
}
