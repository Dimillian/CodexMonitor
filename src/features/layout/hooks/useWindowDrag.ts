import { useEffect } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isWindowsPlatform } from "@utils/platformPaths";

const NEVER_DRAG_TARGET_SELECTOR = [
  "button",
  "a",
  '[data-tauri-drag-region="false"]',
  "input",
  "textarea",
  "select",
  "option",
  '[contenteditable="true"]',
  ".sidebar-resizer",
  ".right-panel-resizer",
  ".content-split-resizer",
  ".right-panel-divider",
].join(",");

const DRAG_ZONE_SELECTORS = ["#titlebar", ".sidebar-drag-strip", ".right-panel-drag-strip"];

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
  const target = event.target;
  if (!(target instanceof Element)) {
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

function isInsideAnyDragZone(clientX: number, clientY: number) {
  for (const selector of DRAG_ZONE_SELECTORS) {
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

    const el = document.getElementById(targetId);

    const handler = (event: MouseEvent) => {
      if (isNeverDragTarget(event)) {
        return;
      }
      startDraggingSafe();
    };

    if (!isWindowsPlatform()) {
      if (!el) {
        return;
      }
      el.addEventListener("mousedown", handler);
      return () => {
        el.removeEventListener("mousedown", handler);
      };
    }

    const handleMouseDown = (event: MouseEvent) => {
      if (isNeverDragTarget(event)) {
        return;
      }
      if (!isInsideAnyDragZone(event.clientX, event.clientY)) {
        return;
      }
      startDraggingSafe();
    };

    document.addEventListener("mousedown", handleMouseDown, true);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown, true);
    };
  }, [targetId]);
}
