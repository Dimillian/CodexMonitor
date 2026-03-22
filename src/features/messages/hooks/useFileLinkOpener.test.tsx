// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openWorkspaceIn } from "../../../services/tauri";
import { fileTarget } from "../test/fileLinkAssertions";
import { useFileLinkOpener } from "./useFileLinkOpener";

const {
  menuNewMock,
  menuItemNewMock,
  predefinedMenuItemNewMock,
  logicalPositionMock,
  getCurrentWindowMock,
} = vi.hoisted(() => ({
  menuNewMock: vi.fn(),
  menuItemNewMock: vi.fn(),
  predefinedMenuItemNewMock: vi.fn(),
  logicalPositionMock: vi.fn(),
  getCurrentWindowMock: vi.fn(),
}));

vi.mock("../../../services/tauri", () => ({
  openWorkspaceIn: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  revealItemInDir: vi.fn(),
}));

vi.mock("@tauri-apps/api/menu", () => ({
  Menu: { new: menuNewMock },
  MenuItem: { new: menuItemNewMock },
  PredefinedMenuItem: { new: predefinedMenuItemNewMock },
}));

vi.mock("@tauri-apps/api/dpi", () => ({
  LogicalPosition: logicalPositionMock,
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: getCurrentWindowMock,
}));

vi.mock("@sentry/react", () => ({
  captureException: vi.fn(),
}));

vi.mock("../../../services/toasts", () => ({
  pushErrorToast: vi.fn(),
}));

describe("useFileLinkOpener", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  async function copyLinkFor(rawPath: string) {
    const clipboardWriteTextMock = vi.fn();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: clipboardWriteTextMock },
      configurable: true,
    });
    menuItemNewMock.mockImplementation(async (options) => options);
    predefinedMenuItemNewMock.mockImplementation(async (options) => options);
    menuNewMock.mockImplementation(async ({ items }) => ({
      items,
      popup: vi.fn(),
    }));

    const { result } = renderHook(() => useFileLinkOpener(null, [], ""));

    await act(async () => {
      await result.current.showFileLinkMenu(
        {
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
          clientX: 12,
          clientY: 24,
        } as never,
        fileTarget(rawPath),
      );
    });

    const items = menuNewMock.mock.calls[0]?.[0]?.items ?? [];
    const copyLinkItem = items.find(
      (item: { text?: string; action?: () => Promise<void> }) => item.text === "Copy Link",
    );

    await copyLinkItem?.action?.();
    return clipboardWriteTextMock.mock.calls[0]?.[0];
  }

  it("copies namespace-prefixed Windows drive paths as round-trippable file URLs", async () => {
    expect(await copyLinkFor("\\\\?\\C:\\repo\\src\\App.tsx:42")).toBe(
      "file:///%5C%5C%3F%5CC%3A%5Crepo%5Csrc%5CApp.tsx#L42",
    );
  });

  it("copies namespace-prefixed Windows UNC paths as round-trippable file URLs", async () => {
    expect(await copyLinkFor("\\\\?\\UNC\\server\\share\\repo\\App.tsx:42")).toBe(
      "file:///%5C%5C%3F%5CUNC%5Cserver%5Cshare%5Crepo%5CApp.tsx#L42",
    );
  });

  it("percent-encodes copied file URLs for Windows paths with reserved characters", async () => {
    expect(await copyLinkFor("C:\\repo\\My File #100%.tsx:42")).toBe(
      "file:///C:/repo/My%20File%20%23100%25.tsx#L42",
    );
  });

  it("maps /workspace root-relative paths to the active workspace path", async () => {
    const workspacePath = "/Users/sotiriskaniras/Documents/Development/Forks/CodexMonitor";
    const openWorkspaceInMock = vi.mocked(openWorkspaceIn);
    const { result } = renderHook(() => useFileLinkOpener(workspacePath, [], ""));

    await act(async () => {
      await result.current.openFileLink(
        fileTarget("/workspace/src/features/messages/components/Markdown.tsx"),
      );
    });

    expect(openWorkspaceInMock).toHaveBeenCalledWith(
      "/Users/sotiriskaniras/Documents/Development/Forks/CodexMonitor/src/features/messages/components/Markdown.tsx",
      expect.objectContaining({ appName: "Visual Studio Code", args: [] }),
    );
  });

  it("maps /workspace/<workspace-name>/... paths to the active workspace path", async () => {
    const workspacePath = "/Users/sotiriskaniras/Documents/Development/Forks/CodexMonitor";
    const openWorkspaceInMock = vi.mocked(openWorkspaceIn);
    const { result } = renderHook(() => useFileLinkOpener(workspacePath, [], ""));

    await act(async () => {
      await result.current.openFileLink(fileTarget("/workspace/CodexMonitor/LICENSE"));
    });

    expect(openWorkspaceInMock).toHaveBeenCalledWith(
      "/Users/sotiriskaniras/Documents/Development/Forks/CodexMonitor/LICENSE",
      expect.objectContaining({ appName: "Visual Studio Code", args: [] }),
    );
  });

  it("maps extensionless files under /workspace/settings to the active workspace path", async () => {
    const workspacePath = "/Users/sotiriskaniras/Documents/Development/Forks/settings";
    const openWorkspaceInMock = vi.mocked(openWorkspaceIn);
    const { result } = renderHook(() => useFileLinkOpener(workspacePath, [], ""));

    await act(async () => {
      await result.current.openFileLink(fileTarget("/workspace/settings/LICENSE"));
    });

    expect(openWorkspaceInMock).toHaveBeenCalledWith(
      "/Users/sotiriskaniras/Documents/Development/Forks/settings/LICENSE",
      expect.objectContaining({ appName: "Visual Studio Code", args: [] }),
    );
  });

  it("maps nested /workspaces/.../<workspace-name>/... paths to the active workspace path", async () => {
    const workspacePath = "/Users/sotiriskaniras/Documents/Development/Forks/CodexMonitor";
    const openWorkspaceInMock = vi.mocked(openWorkspaceIn);
    const { result } = renderHook(() => useFileLinkOpener(workspacePath, [], ""));

    await act(async () => {
      await result.current.openFileLink(fileTarget("/workspaces/team/CodexMonitor/src"));
    });

    expect(openWorkspaceInMock).toHaveBeenCalledWith(
      "/Users/sotiriskaniras/Documents/Development/Forks/CodexMonitor/src",
      expect.objectContaining({ appName: "Visual Studio Code", args: [] }),
    );
  });

  it("preserves file link line and column metadata for editor opens", async () => {
    const workspacePath = "/Users/sotiriskaniras/Documents/Development/Forks/CodexMonitor";
    const openWorkspaceInMock = vi.mocked(openWorkspaceIn);
    const { result } = renderHook(() => useFileLinkOpener(workspacePath, [], ""));

    await act(async () => {
      await result.current.openFileLink(
        fileTarget("/workspace/src/features/messages/components/Markdown.tsx:33:7"),
      );
    });

    expect(openWorkspaceInMock).toHaveBeenCalledWith(
      "/Users/sotiriskaniras/Documents/Development/Forks/CodexMonitor/src/features/messages/components/Markdown.tsx",
      expect.objectContaining({
        appName: "Visual Studio Code",
        args: [],
        line: 33,
        column: 7,
      }),
    );
  });

  it("parses #L line anchors before opening the editor", async () => {
    const workspacePath = "/Users/sotiriskaniras/Documents/Development/Forks/CodexMonitor";
    const openWorkspaceInMock = vi.mocked(openWorkspaceIn);
    const { result } = renderHook(() => useFileLinkOpener(workspacePath, [], ""));

    await act(async () => {
      await result.current.openFileLink(fileTarget("/workspace/src/App.tsx#L33"));
    });

    expect(openWorkspaceInMock).toHaveBeenCalledWith(
      "/Users/sotiriskaniras/Documents/Development/Forks/CodexMonitor/src/App.tsx",
      expect.objectContaining({
        appName: "Visual Studio Code",
        args: [],
        line: 33,
      }),
    );
  });

  it("opens structured file targets without re-parsing #L-like filename endings", async () => {
    const openWorkspaceInMock = vi.mocked(openWorkspaceIn);
    const { result } = renderHook(() => useFileLinkOpener(null, [], ""));

    await act(async () => {
      await result.current.openFileLink({
        path: "/tmp/#L12",
        line: null,
        column: null,
      });
    });

    expect(openWorkspaceInMock).toHaveBeenCalledWith(
      "/tmp/#L12",
      expect.objectContaining({ appName: "Visual Studio Code", args: [] }),
    );
  });

  it("normalizes line ranges to the starting line before opening the editor", async () => {
    const workspacePath = "/Users/sotiriskaniras/Documents/Development/Forks/CodexMonitor";
    const openWorkspaceInMock = vi.mocked(openWorkspaceIn);
    const { result } = renderHook(() => useFileLinkOpener(workspacePath, [], ""));

    await act(async () => {
      await result.current.openFileLink(
        fileTarget("/workspace/src/features/messages/components/Markdown.tsx:366-369"),
      );
    });

    expect(openWorkspaceInMock).toHaveBeenCalledWith(
      "/Users/sotiriskaniras/Documents/Development/Forks/CodexMonitor/src/features/messages/components/Markdown.tsx",
      expect.objectContaining({
        appName: "Visual Studio Code",
        args: [],
        line: 366,
      }),
    );
  });
});
