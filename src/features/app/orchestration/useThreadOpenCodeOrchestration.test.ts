// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useRef } from "react";
import {
  useThreadOpenCodeOrchestration,
} from "./useThreadOpenCodeOrchestration";

describe("useThreadOpenCodeOrchestration", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("mirrors active-thread fast mode changes into the workspace no-thread scope", () => {
    const { result } = renderHook(() => {
      const activeWorkspaceIdForParamsRef = useRef<string | null>("ws-1");
      return useThreadOpenCodeOrchestration({ activeWorkspaceIdForParamsRef });
    });

    act(() => {
      result.current.activeThreadIdRef.current = "thread-1";
      result.current.persistThreadOpenCodeParams({ serviceTier: "fast" });
    });

    expect(result.current.getThreadOpenCodeParams("ws-1", "thread-1")).toEqual(
      expect.objectContaining({ serviceTier: "fast" }),
    );
    expect(
      result.current.getThreadOpenCodeParams("ws-1", "__no_thread__"),
    ).toEqual(expect.objectContaining({ serviceTier: "fast" }));
  });

  it("keeps workspace-home fast mode changes scoped to the no-thread selection", () => {
    const { result } = renderHook(() => {
      const activeWorkspaceIdForParamsRef = useRef<string | null>("ws-1");
      return useThreadOpenCodeOrchestration({ activeWorkspaceIdForParamsRef });
    });

    act(() => {
      result.current.activeThreadIdRef.current = null;
      result.current.persistThreadOpenCodeParams({ serviceTier: "fast" });
    });

    expect(result.current.getThreadOpenCodeParams("ws-1", "__no_thread__")).toEqual(
      expect.objectContaining({ serviceTier: "fast" }),
    );
    expect(result.current.getThreadOpenCodeParams("ws-1", "thread-1")).toBeNull();
  });
});
