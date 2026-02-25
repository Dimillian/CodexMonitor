import { useEffect } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

const NEVER_DRAG_TARGET_SELECTOR = [
  "button",
  "a",
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="tab"]',
  '[data-tauri-drag-region="false"]',
  "input",
  "textarea",
  "select",
  "option",
  '[contenteditable="true"]',
  ".thread-row",
  ".workspace-row",
  ".worktree-row",
  ".sidebar-resizer",
  ".right-panel-resizer",
  ".content-split-resizer",
  ".right-panel-divider",
].join(",");

function startDraggingSafe() {
  try {
    void getCurrentWindow().startDragging();
  } catch {
    // Ignore non-Tauri runtimes (tests/browser).
  }
}

function isNeverDragTarget(event: MouseEvent) {
  if (event.button !== 0) {
    return true;
  }
  const targetNode = event.target;
  const target =
    targetNode instanceof Element
      ? targetNode
      : targetNode instanceof Node
        ? targetNode.parentElement
        : null;
  if (!target) {
    return true;
  }
  return Boolean(target.closest(NEVER_DRAG_TARGET_SELECTOR));
}

function isInsideRect(clientX: number, clientY: number, rect: DOMRect) {
  return (
    clientX >= rect.left &&
    clientX <= rect.right &&
    clientY >= rect.top &&
    clientY <= rect.bottom
  );
}

function isInsideAnyDragZone(
  clientX: number,
  clientY: number,
  dragZoneSelectors: readonly string[],
) {
  for (const selector of dragZoneSelectors) {
    const zoneElements = document.querySelectorAll<HTMLElement>(selector);
    for (const zone of zoneElements) {
      const rect = zone.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        continue;
      }
      if (isInsideRect(clientX, clientY, rect)) {
        return true;
      }
    }
  }
  return false;
}

export function useWindowDrag(targetId: string) {
  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    const dragZoneSelectors = [
      `#${targetId}`,
      ".main-topbar",
      ".sidebar-drag-strip",
      ".right-panel-drag-strip",
    ] as const;

    const handleMouseDown = (event: MouseEvent) => {
      if (isNeverDragTarget(event)) {
        return;
      }
      if (!isInsideAnyDragZone(event.clientX, event.clientY, dragZoneSelectors)) {
        return;
      }
      event.preventDefault();
      startDraggingSafe();
    };

    document.addEventListener("mousedown", handleMouseDown, true);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown, true);
    };
  }, [targetId]);
}
