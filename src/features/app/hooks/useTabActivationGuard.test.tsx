// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useTabActivationGuard } from "./useTabActivationGuard";

describe("useTabActivationGuard", () => {
  it("does not force home tab on phone when no workspace is selected", () => {
    const setActiveTab = vi.fn();

    renderHook(() =>
      useTabActivationGuard({
        activeTab: "git",
        isTablet: false,
        setActiveTab,
      }),
    );

    expect(setActiveTab).not.toHaveBeenCalled();
  });

  it("redirects tablet home tab selection to codex", () => {
    const setActiveTab = vi.fn();

    renderHook(() =>
      useTabActivationGuard({
        activeTab: "home",
        isTablet: true,
        setActiveTab,
      }),
    );

    expect(setActiveTab).toHaveBeenCalledWith("codex");
  });
});
