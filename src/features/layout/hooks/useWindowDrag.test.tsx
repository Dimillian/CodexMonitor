/** @vitest-environment jsdom */
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const isTauriMock = vi.hoisted(() => vi.fn());
const getCurrentWindowMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: isTauriMock,
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: getCurrentWindowMock,
}));

import { useWindowDrag } from "./useWindowDrag";

function setRect(el: Element, rect: Pick<DOMRect, "left" | "right" | "top" | "bottom">) {
  Object.defineProperty(el, "getBoundingClientRect", {
    configurable: true,
    value: () =>
      ({
        ...rect,
        width: rect.right - rect.left,
        height: rect.bottom - rect.top,
      }) as DOMRect,
  });
}

describe("useWindowDrag", () => {
  const startDragging = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = "";
    isTauriMock.mockReturnValue(true);
    getCurrentWindowMock.mockReturnValue({ startDragging });
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
  });

  it("starts dragging on Windows when click is inside a drag zone", () => {
    const titlebar = document.createElement("div");
    titlebar.id = "titlebar";
    document.body.appendChild(titlebar);
    setRect(titlebar, { left: 0, top: 0, right: 300, bottom: 44 });

    renderHook(() => useWindowDrag("titlebar"));

    const target = document.createElement("div");
    titlebar.appendChild(target);
    target.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        clientX: 12,
        clientY: 12,
      }),
    );

    expect(startDragging).toHaveBeenCalledTimes(1);
  });

  it("starts dragging on Windows when click is inside the main topbar", () => {
    const topbar = document.createElement("div");
    topbar.className = "main-topbar";
    document.body.appendChild(topbar);
    setRect(topbar, { left: 0, top: 0, right: 800, bottom: 44 });

    renderHook(() => useWindowDrag("titlebar"));

    const target = document.createElement("span");
    topbar.appendChild(target);
    target.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        clientX: 120,
        clientY: 20,
      }),
    );

    expect(startDragging).toHaveBeenCalledTimes(1);
  });

  it("starts dragging on Windows when mousedown target is a text node in topbar", () => {
    const topbar = document.createElement("div");
    topbar.className = "main-topbar";
    document.body.appendChild(topbar);
    setRect(topbar, { left: 0, top: 0, right: 800, bottom: 44 });

    const label = document.createElement("span");
    label.textContent = "Project Name";
    topbar.appendChild(label);

    renderHook(() => useWindowDrag("titlebar"));

    const textNode = label.firstChild;
    expect(textNode).toBeTruthy();
    textNode?.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        clientX: 140,
        clientY: 20,
      }),
    );

    expect(startDragging).toHaveBeenCalledTimes(1);
  });

  it("does not start dragging when text node is inside an interactive target", () => {
    const topbar = document.createElement("div");
    topbar.className = "main-topbar";
    document.body.appendChild(topbar);
    setRect(topbar, { left: 0, top: 0, right: 800, bottom: 44 });

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Terminal";
    topbar.appendChild(button);

    renderHook(() => useWindowDrag("titlebar"));

    const textNode = button.firstChild;
    expect(textNode).toBeTruthy();
    textNode?.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        clientX: 200,
        clientY: 20,
      }),
    );

    expect(startDragging).not.toHaveBeenCalled();
  });

  it("does not start dragging when clicking an interactive role target", () => {
    const sidebarDragStrip = document.createElement("div");
    sidebarDragStrip.className = "sidebar-drag-strip";
    document.body.appendChild(sidebarDragStrip);
    setRect(sidebarDragStrip, { left: 0, top: 0, right: 320, bottom: 56 });

    renderHook(() => useWindowDrag("titlebar"));

    const interactiveRow = document.createElement("div");
    interactiveRow.setAttribute("role", "button");
    sidebarDragStrip.appendChild(interactiveRow);
    interactiveRow.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        clientX: 20,
        clientY: 20,
      }),
    );

    expect(startDragging).not.toHaveBeenCalled();
  });

  it("does not start dragging when click is outside all drag zones", () => {
    const titlebar = document.createElement("div");
    titlebar.id = "titlebar";
    document.body.appendChild(titlebar);
    setRect(titlebar, { left: 0, top: 0, right: 300, bottom: 44 });

    renderHook(() => useWindowDrag("titlebar"));

    const target = document.createElement("div");
    document.body.appendChild(target);
    target.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        clientX: 500,
        clientY: 500,
      }),
    );

    expect(startDragging).not.toHaveBeenCalled();
  });

  it("starts dragging via titlebar drag zone", () => {
    const titlebar = document.createElement("div");
    titlebar.id = "titlebar";
    document.body.appendChild(titlebar);
    setRect(titlebar, { left: 0, top: 0, right: 300, bottom: 44 });

    renderHook(() => useWindowDrag("titlebar"));

    titlebar.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        clientX: 12,
        clientY: 12,
      }),
    );

    expect(startDragging).toHaveBeenCalledTimes(1);
  });
});
