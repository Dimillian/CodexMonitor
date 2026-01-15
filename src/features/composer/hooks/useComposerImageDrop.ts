import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

const imageExtensions = [
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".bmp",
  ".tiff",
  ".tif",
];

function isImagePath(path: string) {
  const lower = path.toLowerCase();
  return imageExtensions.some((ext) => lower.endsWith(ext));
}

function isDragFileTransfer(types: readonly string[] | undefined) {
  if (!types || types.length === 0) {
    return false;
  }
  return (
    types.includes("Files") ||
    types.includes("public.file-url") ||
    types.includes("application/x-moz-file")
  );
}

function readFilesAsDataUrls(files: File[]) {
  return Promise.all(
    files.map(
      (file) =>
        new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () =>
            resolve(typeof reader.result === "string" ? reader.result : "");
          reader.onerror = () => resolve("");
          reader.readAsDataURL(file);
        }),
    ),
  ).then((items) => items.filter(Boolean));
}

type UseComposerImageDropArgs = {
  disabled: boolean;
  onAttachImages?: (paths: string[]) => void;
};

export function useComposerImageDrop({
  disabled,
  onAttachImages,
}: UseComposerImageDropArgs) {
  const [isDragOver, setIsDragOver] = useState(false);
  const dropTargetRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    const register = async () => {
      try {
        const appWindow = getCurrentWindow();
        unlisten = await appWindow.onDragDropEvent((event) => {
          if (disabled || !dropTargetRef.current) {
            return;
          }
          if (event.payload.type === "leave") {
            setIsDragOver(false);
            return;
          }
          const position = event.payload.position;
          const scale = window.devicePixelRatio || 1;
          const x = position.x / scale;
          const y = position.y / scale;
          const rect = dropTargetRef.current.getBoundingClientRect();
          const isInside =
            x >= rect.left &&
            x <= rect.right &&
            y >= rect.top &&
            y <= rect.bottom;
          if (event.payload.type === "over" || event.payload.type === "enter") {
            setIsDragOver(isInside);
            return;
          }
          if (event.payload.type === "drop") {
            setIsDragOver(false);
            if (!isInside) {
              return;
            }
            const imagePaths = event.payload.paths
              .map((path) => path.trim())
              .filter(Boolean)
              .filter(isImagePath);
            if (imagePaths.length > 0) {
              onAttachImages?.(imagePaths);
            }
          }
        });
      } catch {
        unlisten = null;
      }
    };
    void register();
    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [disabled, onAttachImages]);

  const handleDragOver = (event: React.DragEvent<HTMLElement>) => {
    if (disabled) {
      return;
    }
    if (isDragFileTransfer(event.dataTransfer?.types)) {
      event.preventDefault();
      setIsDragOver(true);
    }
  };

  const handleDragEnter = (event: React.DragEvent<HTMLElement>) => {
    handleDragOver(event);
  };

  const handleDragLeave = () => {
    if (isDragOver) {
      setIsDragOver(false);
    }
  };

  const handleDrop = async (event: React.DragEvent<HTMLElement>) => {
    if (disabled) {
      return;
    }
    event.preventDefault();
    setIsDragOver(false);
    const files = Array.from(event.dataTransfer?.files ?? []);
    const items = Array.from(event.dataTransfer?.items ?? []);
    const itemFiles = items
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    const filePaths = [...files, ...itemFiles]
      .map((file) => (file as File & { path?: string }).path ?? "")
      .filter(Boolean);
    const imagePaths = filePaths.filter(isImagePath);
    if (imagePaths.length > 0) {
      onAttachImages?.(imagePaths);
      return;
    }
    const fileImages = [...files, ...itemFiles].filter((file) =>
      file.type.startsWith("image/"),
    );
    if (fileImages.length === 0) {
      return;
    }
    const dataUrls = await readFilesAsDataUrls(fileImages);
    if (dataUrls.length > 0) {
      onAttachImages?.(dataUrls);
    }
  };

  const handlePaste = async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (disabled) {
      return;
    }
    const items = Array.from(event.clipboardData?.items ?? []);
    const imageItems = items.filter((item) => item.type.startsWith("image/"));
    if (imageItems.length === 0) {
      return;
    }
    event.preventDefault();
    const files = imageItems
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    if (!files.length) {
      return;
    }
    const dataUrls = await Promise.all(
      files.map(
        (file) =>
          new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () =>
              resolve(typeof reader.result === "string" ? reader.result : "");
            reader.onerror = () => resolve("");
            reader.readAsDataURL(file);
          }),
      ),
    );
    const valid = dataUrls.filter(Boolean);
    if (valid.length > 0) {
      onAttachImages?.(valid);
    }
  };

  return {
    dropTargetRef,
    isDragOver,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
    handlePaste,
  };
}
