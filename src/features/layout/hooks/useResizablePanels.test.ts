/** @vitest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it } from "vitest";
import { useResizablePanels } from "./useResizablePanels";

type HookResult = ReturnType<typeof useResizablePanels>;

type RenderedHook = {
  result: HookResult;
  unmount: () => void;
};

type SplitDom = {
  split: HTMLDivElement;
  resizer: HTMLDivElement;
};

function renderResizablePanels(): RenderedHook {
  let result: HookResult | undefined;

  function Test() {
    result = useResizablePanels();
    return null;
  }

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(React.createElement(Test));
  });

  return {
    get result() {
      if (!result) {
        throw new Error("Hook not rendered");
      }
      return result;
    },
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

function buildSplitDom(): SplitDom {
  const split = document.createElement("div");
  split.className = "content-split";
  const resizer = document.createElement("div");
  split.appendChild(resizer);
  split.appendChild(document.createElement("div"));
  document.body.appendChild(split);
  Object.defineProperty(split, "clientWidth", {
    configurable: true,
    value: 1000,
  });
  Object.defineProperty(split, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ left: 0 }),
  });
  return { split, resizer };
}

describe("useResizablePanels", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.body.innerHTML = "";
  });

  it("reads stored sizes and clamps to bounds", () => {
    window.localStorage.setItem("codexmonitor.sidebarWidth", "999");
    window.localStorage.setItem("codexmonitor.rightPanelWidth", "100");
    window.localStorage.setItem("codexmonitor.planPanelHeight", "not-a-number");

    const hook = renderResizablePanels();

    expect(hook.result.sidebarWidth).toBe(420);
    expect(hook.result.rightPanelWidth).toBe(270);
    expect(hook.result.planPanelHeight).toBe(220);

    hook.unmount();
  });

  it("persists sidebar width changes and clamps max", () => {
    const hook = renderResizablePanels();
    const appEl = document.createElement("div");
    document.body.appendChild(appEl);
    hook.result.appRef.current = appEl;

    act(() => {
      hook.result.onSidebarResizeStart({
        clientX: 0,
        clientY: 0,
        preventDefault() {},
      } as React.MouseEvent);
    });

    act(() => {
      window.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 4000, clientY: 0 }),
      );
    });

    act(() => {
      window.dispatchEvent(new MouseEvent("mouseup"));
    });

    expect(hook.result.sidebarWidth).toBe(420);
    expect(window.localStorage.getItem("codexmonitor.sidebarWidth")).toBe(
      "420",
    );

    hook.unmount();
    appEl.remove();
  });

  it("moves split position right when dragging the splitter right", () => {
    const hook = renderResizablePanels();
    const { split, resizer } = buildSplitDom();
    const appEl = document.createElement("div");
    document.body.appendChild(appEl);
    hook.result.appRef.current = appEl;

    act(() => {
      hook.result.onChatDiffSplitPositionResizeStart({
        clientX: 500,
        clientY: 0,
        currentTarget: resizer,
        preventDefault() {},
      } as unknown as React.MouseEvent);
    });

    act(() => {
      window.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 750, clientY: 0 }),
      );
    });

    act(() => {
      window.dispatchEvent(new MouseEvent("mouseup"));
    });

    expect(hook.result.chatDiffSplitPositionPercent).toBe(75);

    hook.unmount();
    split.remove();
    appEl.remove();
  });

  it("moves split position left when dragging the splitter left", () => {
    const hook = renderResizablePanels();
    const { split, resizer } = buildSplitDom();
    const appEl = document.createElement("div");
    document.body.appendChild(appEl);
    hook.result.appRef.current = appEl;

    act(() => {
      hook.result.onChatDiffSplitPositionResizeStart({
        clientX: 500,
        clientY: 0,
        currentTarget: resizer,
        preventDefault() {},
      } as unknown as React.MouseEvent);
    });

    act(() => {
      window.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 250, clientY: 0 }),
      );
    });

    act(() => {
      window.dispatchEvent(new MouseEvent("mouseup"));
    });

    expect(hook.result.chatDiffSplitPositionPercent).toBe(25);

    hook.unmount();
    split.remove();
    appEl.remove();
  });
});
