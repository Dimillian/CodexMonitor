import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY_SIDEBAR = "codexmonitor.sidebarWidth";
const STORAGE_KEY_RIGHT_PANEL = "codexmonitor.rightPanelWidth";
const STORAGE_KEY_PLAN_PANEL = "codexmonitor.planPanelHeight";
const STORAGE_KEY_TERMINAL_PANEL = "codexmonitor.terminalPanelHeight";
const STORAGE_KEY_DEBUG_PANEL = "codexmonitor.debugPanelHeight";
const MIN_SIDEBAR_WIDTH = 220;
const MAX_SIDEBAR_WIDTH = 420;
const MIN_RIGHT_PANEL_WIDTH = 200;
const MAX_RIGHT_PANEL_WIDTH = 420;
const MIN_PLAN_PANEL_HEIGHT = 140;
const MAX_PLAN_PANEL_HEIGHT = 420;
const MIN_TERMINAL_PANEL_HEIGHT = 140;
const MAX_TERMINAL_PANEL_HEIGHT = 480;
const MIN_DEBUG_PANEL_HEIGHT = 120;
const MAX_DEBUG_PANEL_HEIGHT = 420;
const DEFAULT_SIDEBAR_WIDTH = 280;
const DEFAULT_RIGHT_PANEL_WIDTH = 230;
const DEFAULT_PLAN_PANEL_HEIGHT = 220;
const DEFAULT_TERMINAL_PANEL_HEIGHT = 220;
const DEFAULT_DEBUG_PANEL_HEIGHT = 180;

type ResizeState = {
  type: "sidebar" | "right-panel" | "plan-panel" | "terminal-panel" | "debug-panel";
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
  pointerId?: number | null;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function readStoredWidth(key: string, fallback: number, min: number, max: number) {
  if (typeof window === "undefined") {
    return fallback;
  }
  const raw = window.localStorage.getItem(key);
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return clamp(parsed, min, max);
}

export function useResizablePanels(uiScale = 1) {
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    readStoredWidth(
      STORAGE_KEY_SIDEBAR,
      DEFAULT_SIDEBAR_WIDTH,
      MIN_SIDEBAR_WIDTH,
      MAX_SIDEBAR_WIDTH,
    ),
  );
  const [rightPanelWidth, setRightPanelWidth] = useState(() =>
    readStoredWidth(
      STORAGE_KEY_RIGHT_PANEL,
      DEFAULT_RIGHT_PANEL_WIDTH,
      MIN_RIGHT_PANEL_WIDTH,
      MAX_RIGHT_PANEL_WIDTH,
    ),
  );
  const [planPanelHeight, setPlanPanelHeight] = useState(() =>
    readStoredWidth(
      STORAGE_KEY_PLAN_PANEL,
      DEFAULT_PLAN_PANEL_HEIGHT,
      MIN_PLAN_PANEL_HEIGHT,
      MAX_PLAN_PANEL_HEIGHT,
    ),
  );
  const [terminalPanelHeight, setTerminalPanelHeight] = useState(() =>
    readStoredWidth(
      STORAGE_KEY_TERMINAL_PANEL,
      DEFAULT_TERMINAL_PANEL_HEIGHT,
      MIN_TERMINAL_PANEL_HEIGHT,
      MAX_TERMINAL_PANEL_HEIGHT,
    ),
  );
  const [debugPanelHeight, setDebugPanelHeight] = useState(() =>
    readStoredWidth(
      STORAGE_KEY_DEBUG_PANEL,
      DEFAULT_DEBUG_PANEL_HEIGHT,
      MIN_DEBUG_PANEL_HEIGHT,
      MAX_DEBUG_PANEL_HEIGHT,
    ),
  );
  const resizeRef = useRef<ResizeState | null>(null);
  const scaleRef = useRef(Math.max(0.1, uiScale || 1));

  useEffect(() => {
    scaleRef.current = Math.max(0.1, uiScale || 1);
  }, [uiScale]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY_SIDEBAR, String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    window.localStorage.setItem(
      STORAGE_KEY_RIGHT_PANEL,
      String(rightPanelWidth),
    );
  }, [rightPanelWidth]);

  useEffect(() => {
    window.localStorage.setItem(
      STORAGE_KEY_PLAN_PANEL,
      String(planPanelHeight),
    );
  }, [planPanelHeight]);

  useEffect(() => {
    window.localStorage.setItem(
      STORAGE_KEY_TERMINAL_PANEL,
      String(terminalPanelHeight),
    );
  }, [terminalPanelHeight]);

  useEffect(() => {
    window.localStorage.setItem(
      STORAGE_KEY_DEBUG_PANEL,
      String(debugPanelHeight),
    );
  }, [debugPanelHeight]);

  useEffect(() => {
    function handleMouseMove(event: MouseEvent) {
      if (!resizeRef.current) {
        return;
      }
      const scale = scaleRef.current;
      if (resizeRef.current.type === "sidebar") {
        const delta = (event.clientX - resizeRef.current.startX) / scale;
        const next = clamp(
          resizeRef.current.startWidth + delta,
          MIN_SIDEBAR_WIDTH,
          MAX_SIDEBAR_WIDTH,
        );
        setSidebarWidth(next);
      } else if (resizeRef.current.type === "right-panel") {
        const delta = (event.clientX - resizeRef.current.startX) / scale;
        const next = clamp(
          resizeRef.current.startWidth - delta,
          MIN_RIGHT_PANEL_WIDTH,
          MAX_RIGHT_PANEL_WIDTH,
        );
        setRightPanelWidth(next);
      } else if (resizeRef.current.type === "plan-panel") {
        const delta = (event.clientY - resizeRef.current.startY) / scale;
        const next = clamp(
          resizeRef.current.startHeight - delta,
          MIN_PLAN_PANEL_HEIGHT,
          MAX_PLAN_PANEL_HEIGHT,
        );
        setPlanPanelHeight(next);
      } else if (resizeRef.current.type === "terminal-panel") {
        const delta = (event.clientY - resizeRef.current.startY) / scale;
        const next = clamp(
          resizeRef.current.startHeight - delta,
          MIN_TERMINAL_PANEL_HEIGHT,
          MAX_TERMINAL_PANEL_HEIGHT,
        );
        setTerminalPanelHeight(next);
      } else {
        const delta = (event.clientY - resizeRef.current.startY) / scale;
        const next = clamp(
          resizeRef.current.startHeight - delta,
          MIN_DEBUG_PANEL_HEIGHT,
          MAX_DEBUG_PANEL_HEIGHT,
        );
        setDebugPanelHeight(next);
      }
    }

    function handleMouseUp() {
      if (!resizeRef.current) {
        return;
      }
      resizeRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    function handlePointerMove(event: PointerEvent) {
      if (!resizeRef.current) {
        return;
      }
      if (
        typeof resizeRef.current.pointerId === "number" &&
        event.pointerId !== resizeRef.current.pointerId
      ) {
        return;
      }
      // Mirror mouse move logic for touch/pen devices.
      if (resizeRef.current.type === "sidebar") {
        const delta = event.clientX - resizeRef.current.startX;
        const next = clamp(
          resizeRef.current.startWidth + delta,
          MIN_SIDEBAR_WIDTH,
          MAX_SIDEBAR_WIDTH,
        );
        setSidebarWidth(next);
      } else if (resizeRef.current.type === "right-panel") {
        const delta = event.clientX - resizeRef.current.startX;
        const next = clamp(
          resizeRef.current.startWidth - delta,
          MIN_RIGHT_PANEL_WIDTH,
          MAX_RIGHT_PANEL_WIDTH,
        );
        setRightPanelWidth(next);
      } else if (resizeRef.current.type === "plan-panel") {
        const delta = event.clientY - resizeRef.current.startY;
        const next = clamp(
          resizeRef.current.startHeight - delta,
          MIN_PLAN_PANEL_HEIGHT,
          MAX_PLAN_PANEL_HEIGHT,
        );
        setPlanPanelHeight(next);
      } else {
        const delta = event.clientY - resizeRef.current.startY;
        const next = clamp(
          resizeRef.current.startHeight - delta,
          MIN_DEBUG_PANEL_HEIGHT,
          MAX_DEBUG_PANEL_HEIGHT,
        );
        setDebugPanelHeight(next);
      }
    }

    function handlePointerUp(event: PointerEvent) {
      if (!resizeRef.current) {
        return;
      }
      if (
        typeof resizeRef.current.pointerId === "number" &&
        event.pointerId !== resizeRef.current.pointerId
      ) {
        return;
      }
      handleMouseUp();
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, []);

  const onSidebarResizeStart = useCallback(
    (event: ReactMouseEvent | ReactPointerEvent) => {
      resizeRef.current = {
        type: "sidebar",
        startX: event.clientX,
        startY: event.clientY,
        startWidth: sidebarWidth,
        startHeight: planPanelHeight,
        pointerId: "pointerId" in event ? event.pointerId : null,
      };
      if ("pointerId" in event) {
        try {
          (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
        } catch {
          // ignore
        }
      }
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [planPanelHeight, sidebarWidth],
  );

  const onRightPanelResizeStart = useCallback(
    (event: ReactMouseEvent | ReactPointerEvent) => {
      resizeRef.current = {
        type: "right-panel",
        startX: event.clientX,
        startY: event.clientY,
        startWidth: rightPanelWidth,
        startHeight: planPanelHeight,
        pointerId: "pointerId" in event ? event.pointerId : null,
      };
      if ("pointerId" in event) {
        try {
          (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
        } catch {
          // ignore
        }
      }
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [planPanelHeight, rightPanelWidth],
  );

  const onPlanPanelResizeStart = useCallback(
    (event: ReactMouseEvent | ReactPointerEvent) => {
      resizeRef.current = {
        type: "plan-panel",
        startX: event.clientX,
        startY: event.clientY,
        startWidth: rightPanelWidth,
        startHeight: planPanelHeight,
        pointerId: "pointerId" in event ? event.pointerId : null,
      };
      if ("pointerId" in event) {
        try {
          (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
        } catch {
          // ignore
        }
      }
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";
    },
    [planPanelHeight, rightPanelWidth],
  );

  const onTerminalPanelResizeStart = useCallback(
    (event: ReactMouseEvent) => {
      resizeRef.current = {
        type: "terminal-panel",
        startX: event.clientX,
        startY: event.clientY,
        startWidth: rightPanelWidth,
        startHeight: terminalPanelHeight,
      };
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";
    },
    [rightPanelWidth, terminalPanelHeight],
  );

  const onDebugPanelResizeStart = useCallback(
    (event: ReactMouseEvent | ReactPointerEvent) => {
      resizeRef.current = {
        type: "debug-panel",
        startX: event.clientX,
        startY: event.clientY,
        startWidth: rightPanelWidth,
        startHeight: debugPanelHeight,
        pointerId: "pointerId" in event ? event.pointerId : null,
      };
      if ("pointerId" in event) {
        try {
          (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
        } catch {
          // ignore
        }
      }
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";
    },
    [debugPanelHeight, rightPanelWidth],
  );

  return {
    sidebarWidth,
    rightPanelWidth,
    planPanelHeight,
    terminalPanelHeight,
    debugPanelHeight,
    onSidebarResizeStart,
    onRightPanelResizeStart,
    onPlanPanelResizeStart,
    onTerminalPanelResizeStart,
    onDebugPanelResizeStart,
  };
}
