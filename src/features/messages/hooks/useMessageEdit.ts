import { useCallback, useState } from "react";

type EditState = {
  itemId: string;
  originalText: string;
  editText: string;
  images: string[];
};

export type UseMessageEditResult = {
  /** The item ID currently being edited, or null if no edit is active */
  editingItemId: string | null;
  /** The current edited text */
  editText: string;
  /** The original images from the message being edited */
  editImages: string[];
  /** Whether the confirmation dialog is shown */
  isConfirming: boolean;
  /** Whether the regenerate request is in flight */
  isRegenerating: boolean;
  /** Start editing a user message */
  startEdit: (itemId: string, text: string, images?: string[]) => void;
  /** Cancel editing and return to normal view */
  cancelEdit: () => void;
  /** Update the edit text */
  updateEditText: (text: string) => void;
  /** Open the confirmation dialog before regenerating */
  requestRegenerate: () => void;
  /** Dismiss the confirmation dialog */
  cancelConfirm: () => void;
  /** Execute the regenerate after confirmation */
  executeRegenerate: () => Promise<void>;
};

type UseMessageEditOptions = {
  onRegenerate: (itemId: string, newText: string, images: string[]) => Promise<void>;
};

export function useMessageEdit({ onRegenerate }: UseMessageEditOptions): UseMessageEditResult {
  const [editState, setEditState] = useState<EditState | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  const startEdit = useCallback(
    (itemId: string, text: string, images: string[] = []) => {
      if (isRegenerating) {
        return;
      }
      setEditState({ itemId, originalText: text, editText: text, images });
      setIsConfirming(false);
      setIsRegenerating(false);
    },
    [isRegenerating],
  );

  const cancelEdit = useCallback(() => {
    setEditState(null);
    setIsConfirming(false);
    setIsRegenerating(false);
  }, []);

  const updateEditText = useCallback((text: string) => {
    setEditState((previous) => {
      if (!previous) {
        return previous;
      }
      return { ...previous, editText: text };
    });
  }, []);

  const requestRegenerate = useCallback(() => {
    if (!editState) {
      return;
    }
    setIsConfirming(true);
  }, [editState]);

  const cancelConfirm = useCallback(() => {
    setIsConfirming(false);
  }, []);

  const executeRegenerate = useCallback(async () => {
    if (!editState) {
      return;
    }
    const trimmed = editState.editText.trim();
    if (!trimmed) {
      return;
    }
    setIsRegenerating(true);
    setIsConfirming(false);
    try {
      await onRegenerate(editState.itemId, trimmed, editState.images);
    } finally {
      setEditState(null);
      setIsRegenerating(false);
    }
  }, [editState, onRegenerate]);

  return {
    editingItemId: editState?.itemId ?? null,
    editText: editState?.editText ?? "",
    editImages: editState?.images ?? [],
    isConfirming,
    isRegenerating,
    startEdit,
    cancelEdit,
    updateEditText,
    requestRegenerate,
    cancelConfirm,
    executeRegenerate,
  };
}
