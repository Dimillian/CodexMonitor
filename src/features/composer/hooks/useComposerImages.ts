import { useCallback, useMemo, useState } from "react";
import { pickImageFiles } from "../../../services/tauri";

type UseComposerImagesArgs = {
  activeThreadId: string | null;
  activeWorkspaceId: string | null;
};

export function useComposerImages({
  activeThreadId,
  activeWorkspaceId,
}: UseComposerImagesArgs) {
  const [imagesByThread, setImagesByThread] = useState<Record<string, string[]>>({});

  const draftKey = useMemo(
    () => activeThreadId ?? `draft-${activeWorkspaceId ?? "none"}`,
    [activeThreadId, activeWorkspaceId],
  );

  const activeImages = imagesByThread[draftKey] ?? [];

  const attachImages = useCallback(
    (paths: string[]) => {
      if (paths.length === 0) {
        return;
      }
      setImagesByThread((prev) => {
        const existing = prev[draftKey] ?? [];
        const merged = Array.from(new Set([...existing, ...paths]));
        return { ...prev, [draftKey]: merged };
      });
    },
    [draftKey],
  );

  const pickImages = useCallback(async () => {
    const picked = await pickImageFiles();
    if (picked.length === 0) {
      return;
    }
    attachImages(picked);
  }, [attachImages]);

  const removeImage = useCallback(
    (path: string) => {
      setImagesByThread((prev) => {
        const existing = prev[draftKey] ?? [];
        const next = existing.filter((entry) => entry !== path);
        if (next.length === 0) {
          const { [draftKey]: _, ...rest } = prev;
          return rest;
        }
        return { ...prev, [draftKey]: next };
      });
    },
    [draftKey],
  );

  const clearActiveImages = useCallback(() => {
    setImagesByThread((prev) => {
      if (!(draftKey in prev)) {
        return prev;
      }
      const { [draftKey]: _, ...rest } = prev;
      return rest;
    });
  }, [draftKey]);

  const setImagesForThread = useCallback((threadId: string, images: string[]) => {
    setImagesByThread((prev) => ({ ...prev, [threadId]: images }));
  }, []);

  const removeImagesForThread = useCallback((threadId: string) => {
    setImagesByThread((prev) => {
      if (!(threadId in prev)) {
        return prev;
      }
      const { [threadId]: _, ...rest } = prev;
      return rest;
    });
  }, []);

  return {
    activeImages,
    attachImages,
    pickImages,
    removeImage,
    clearActiveImages,
    setImagesForThread,
    removeImagesForThread,
  };
}
