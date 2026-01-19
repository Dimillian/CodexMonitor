import { useEffect } from "react";
import type { AccessMode } from "../../../types";
import { matchesShortcut } from "../../../utils/shortcuts";

type ModelOption = { id: string; displayName: string; model: string };

type UseComposerShortcutsOptions = {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  modelShortcut: string | null;
  accessShortcut: string | null;
  reasoningShortcut: string | null;
  models: ModelOption[];
  selectedModelId: string | null;
  onSelectModel: (id: string) => void;
  accessMode: AccessMode;
  onSelectAccessMode: (mode: AccessMode) => void;
  reasoningOptions: string[];
  selectedEffort: string | null;
  onSelectEffort: (effort: string) => void;
};

const ACCESS_ORDER: AccessMode[] = ["read-only", "current", "full-access"];

export function useComposerShortcuts({
  textareaRef,
  modelShortcut,
  accessShortcut,
  reasoningShortcut,
  models,
  selectedModelId,
  onSelectModel,
  accessMode,
  onSelectAccessMode,
  reasoningOptions,
  selectedEffort,
  onSelectEffort,
}: UseComposerShortcutsOptions) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) {
        return;
      }
      if (document.activeElement !== textareaRef.current) {
        return;
      }
      if (matchesShortcut(event, modelShortcut)) {
        event.preventDefault();
        if (models.length === 0) {
          return;
        }
        const currentIndex = models.findIndex((model) => model.id === selectedModelId);
        const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % models.length : 0;
        const nextModel = models[nextIndex];
        if (nextModel) {
          onSelectModel(nextModel.id);
        }
        return;
      }
      if (matchesShortcut(event, accessShortcut)) {
        event.preventDefault();
        const currentIndex = ACCESS_ORDER.indexOf(accessMode);
        const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % ACCESS_ORDER.length : 0;
        const nextAccess = ACCESS_ORDER[nextIndex];
        if (nextAccess) {
          onSelectAccessMode(nextAccess);
        }
        return;
      }
      if (matchesShortcut(event, reasoningShortcut)) {
        event.preventDefault();
        if (reasoningOptions.length === 0) {
          return;
        }
        const currentIndex = reasoningOptions.indexOf(selectedEffort ?? "");
        const nextIndex =
          currentIndex >= 0 ? (currentIndex + 1) % reasoningOptions.length : 0;
        const nextEffort = reasoningOptions[nextIndex];
        if (nextEffort) {
          onSelectEffort(nextEffort);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    accessMode,
    accessShortcut,
    modelShortcut,
    models,
    onSelectAccessMode,
    onSelectEffort,
    onSelectModel,
    reasoningOptions,
    reasoningShortcut,
    selectedEffort,
    selectedModelId,
    textareaRef,
  ]);
}
