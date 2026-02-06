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

    act(() => {
      hook.result.onSidebarResizeStart({
        clientX: 0,
        clientY: 0,
      } as React.MouseEvent);
    });

    act(() => {
      window.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 4000, clientY: 0 }),
      );
    });

    expect(hook.result.sidebarWidth).toBe(420);
    expect(window.localStorage.getItem("codexmonitor.sidebarWidth")).toBe(
      "420",
    );

    act(() => {
      window.dispatchEvent(new MouseEvent("mouseup"));
    });

    hook.unmount();
  });
});
