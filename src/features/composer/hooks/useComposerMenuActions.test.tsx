// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  subscribeMenuCycleCollaborationMode,
  subscribeMenuCycleModel,
  subscribeMenuCycleReasoning,
} from "../../../services/events";
import { useComposerMenuActions } from "./useComposerMenuActions";

const tauriEventHandlers = new Map<unknown, () => void>();

vi.mock("../../app/hooks/useTauriEvent", () => ({
  useTauriEvent: (subscribe: unknown, handler: () => void) => {
    tauriEventHandlers.set(subscribe, handler);
  },
}));

describe("useComposerMenuActions", () => {
  afterEach(() => {
    tauriEventHandlers.clear();
  });

  it("cycles model on menu event", () => {
    const onSelectModel = vi.fn();
    const onFocusComposer = vi.fn();
    const onSelectCollaborationMode = vi.fn();
    const onSelectEffort = vi.fn();

    renderHook(() =>
      useComposerMenuActions({
        models: [
          { id: "gpt-5-codex", displayName: "GPT-5 Codex", model: "gpt-5-codex" },
          { id: "gpt-5.3-codex", displayName: "GPT-5.3 Codex", model: "gpt-5.3-codex" },
        ],
        selectedModelId: "gpt-5-codex",
        onSelectModel,
        collaborationModes: [{ id: "default", label: "Default" }],
        selectedCollaborationModeId: "default",
        onSelectCollaborationMode,
        reasoningOptions: ["low", "medium"],
        selectedEffort: "low",
        onSelectEffort,
        reasoningSupported: true,
        onFocusComposer,
      }),
    );

    const handler = tauriEventHandlers.get(subscribeMenuCycleModel);
    expect(typeof handler).toBe("function");
    handler?.();

    expect(onFocusComposer).toHaveBeenCalledTimes(1);
    expect(onSelectModel).toHaveBeenCalledWith("gpt-5.3-codex");
  });

  it("cycles collaboration and reasoning on menu events", () => {
    const onSelectModel = vi.fn();
    const onFocusComposer = vi.fn();
    const onSelectCollaborationMode = vi.fn();
    const onSelectEffort = vi.fn();

    renderHook(() =>
      useComposerMenuActions({
        models: [{ id: "gpt-5-codex", displayName: "GPT-5 Codex", model: "gpt-5-codex" }],
        selectedModelId: "gpt-5-codex",
        onSelectModel,
        collaborationModes: [
          { id: "default", label: "Default" },
          { id: "plan", label: "Plan" },
        ],
        selectedCollaborationModeId: "default",
        onSelectCollaborationMode,
        reasoningOptions: ["low", "medium", "high"],
        selectedEffort: "low",
        onSelectEffort,
        reasoningSupported: true,
        onFocusComposer,
      }),
    );

    const collabHandler = tauriEventHandlers.get(subscribeMenuCycleCollaborationMode);
    const reasoningHandler = tauriEventHandlers.get(subscribeMenuCycleReasoning);
    expect(typeof collabHandler).toBe("function");
    expect(typeof reasoningHandler).toBe("function");

    collabHandler?.();
    reasoningHandler?.();

    expect(onSelectCollaborationMode).toHaveBeenCalledWith("plan");
    expect(onSelectEffort).toHaveBeenCalledWith("medium");
    expect(onFocusComposer).toHaveBeenCalledTimes(2);
  });

  it("does not cycle reasoning when reasoning is not supported", () => {
    const onSelectEffort = vi.fn();

    renderHook(() =>
      useComposerMenuActions({
        models: [{ id: "gpt-5-codex", displayName: "GPT-5 Codex", model: "gpt-5-codex" }],
        selectedModelId: "gpt-5-codex",
        onSelectModel: vi.fn(),
        collaborationModes: [{ id: "default", label: "Default" }],
        selectedCollaborationModeId: "default",
        onSelectCollaborationMode: vi.fn(),
        reasoningOptions: ["low", "medium"],
        selectedEffort: "low",
        onSelectEffort,
        reasoningSupported: false,
      }),
    );

    const handler = tauriEventHandlers.get(subscribeMenuCycleReasoning);
    expect(typeof handler).toBe("function");
    handler?.();

    expect(onSelectEffort).toHaveBeenCalledTimes(0);
  });
});
