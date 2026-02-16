// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UpdateState } from "../hooks/useUpdater";
import { UpdateToast } from "./UpdateToast";

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(),
}));

const openUrlMock = vi.mocked(openUrl);

describe("UpdateToast", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders available state and handles actions", () => {
    const onUpdate = vi.fn();
    const onDismiss = vi.fn();
    const state: UpdateState = { stage: "available", version: "1.2.3" };

    render(
      <UpdateToast state={state} onUpdate={onUpdate} onDismiss={onDismiss} />,
    );

    const region = screen.getByRole("region");
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(screen.getByRole("status")).not.toBeNull();
    expect(screen.getAllByText("更新")).toHaveLength(2);
    expect(screen.getByText("v1.2.3")).not.toBeNull();
    expect(screen.getByText("检测到新版本可用。")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "稍后" }));
    fireEvent.click(screen.getByRole("button", { name: "更新" }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("renders downloading state with progress", () => {
    const state: UpdateState = {
      stage: "downloading",
      progress: { totalBytes: 1000, downloadedBytes: 500 },
    };

    const { container } = render(
      <UpdateToast state={state} onUpdate={vi.fn()} onDismiss={vi.fn()} />,
    );

    expect(screen.getByText(/正在下载更新/)).not.toBeNull();
    expect(screen.getByText("500 B / 1000 B")).not.toBeNull();
    const fill = container.querySelector(".update-toast-progress-fill");
    expect(fill).not.toBeNull();
    if (!fill) {
      throw new Error("Expected progress fill element");
    }
    expect(fill.getAttribute("style")).toContain("width: 50%");
  });

  it("renders error state and lets you dismiss or retry", () => {
    const onUpdate = vi.fn();
    const onDismiss = vi.fn();
    const state: UpdateState = {
      stage: "error",
      error: "Network error",
    };

    render(
      <UpdateToast state={state} onUpdate={onUpdate} onDismiss={onDismiss} />,
    );

    expect(screen.getByText("更新失败。")).not.toBeNull();
    expect(screen.getByText("Network error")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    fireEvent.click(screen.getByRole("button", { name: "重试" }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("renders latest state and allows dismiss", () => {
    const onDismiss = vi.fn();
    const state: UpdateState = { stage: "latest" };

    const { container } = render(
      <UpdateToast state={state} onUpdate={vi.fn()} onDismiss={onDismiss} />,
    );
    const scoped = within(container);

    expect(scoped.getByText("当前已是最新版本。")).not.toBeNull();
    fireEvent.click(scoped.getByRole("button", { name: "关闭" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("renders post-update loading notice and dismisses", () => {
    const onDismissPostUpdateNotice = vi.fn();
    const state: UpdateState = { stage: "idle" };

    const { container } = render(
      <UpdateToast
        state={state}
        onUpdate={vi.fn()}
        onDismiss={vi.fn()}
        postUpdateNotice={{
          stage: "loading",
          version: "1.2.3",
          htmlUrl: "https://github.com/Dimillian/CodexMonitor/releases/tag/v1.2.3",
        }}
        onDismissPostUpdateNotice={onDismissPostUpdateNotice}
      />,
    );
    const scoped = within(container);

    expect(scoped.getByText("What's New")).toBeTruthy();
    expect(scoped.getByText(/Loading release notes/i)).toBeTruthy();
    fireEvent.click(scoped.getByRole("button", { name: "Dismiss" }));
    expect(onDismissPostUpdateNotice).toHaveBeenCalledTimes(1);
  });

  it("renders post-update release notes and opens GitHub link", () => {
    const onDismissPostUpdateNotice = vi.fn();
    const htmlUrl =
      "https://github.com/Dimillian/CodexMonitor/releases/tag/v1.2.3";
    const state: UpdateState = { stage: "idle" };

    const { container } = render(
      <UpdateToast
        state={state}
        onUpdate={vi.fn()}
        onDismiss={vi.fn()}
        postUpdateNotice={{
          stage: "ready",
          version: "1.2.3",
          body: "## Highlights\n- Added release notes toast",
          htmlUrl,
        }}
        onDismissPostUpdateNotice={onDismissPostUpdateNotice}
      />,
    );
    const scoped = within(container);

    expect(scoped.getByText("Highlights")).toBeTruthy();
    expect(scoped.getByText("Added release notes toast")).toBeTruthy();

    fireEvent.click(scoped.getByRole("button", { name: "View on GitHub" }));
    expect(openUrlMock).toHaveBeenCalledWith(htmlUrl);

    fireEvent.click(scoped.getByRole("button", { name: "Dismiss" }));
    expect(onDismissPostUpdateNotice).toHaveBeenCalledTimes(1);
  });

  it("renders post-update fallback notice", () => {
    const htmlUrl =
      "https://github.com/Dimillian/CodexMonitor/releases/tag/v1.2.3";
    const state: UpdateState = { stage: "available", version: "9.9.9" };

    const { container } = render(
      <UpdateToast
        state={state}
        onUpdate={vi.fn()}
        onDismiss={vi.fn()}
        postUpdateNotice={{
          stage: "fallback",
          version: "1.2.3",
          htmlUrl,
        }}
      />,
    );
    const scoped = within(container);

    expect(
      scoped.getByText("Updated to v1.2.3. Release notes could not be loaded."),
    ).toBeTruthy();
    fireEvent.click(scoped.getByRole("button", { name: "View on GitHub" }));
    expect(openUrlMock).toHaveBeenCalledWith(htmlUrl);
    expect(scoped.queryByText("A new version is available.")).toBeNull();
  });
});
