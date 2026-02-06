// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppServerEvent, AccountSnapshot } from "../../../types";
import { cancelCodexLogin, runCodexLogin } from "../../../services/tauri";
import { subscribeAppServerEvents } from "../../../services/events";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useAccountSwitching } from "./useAccountSwitching";

vi.mock("../../../services/tauri", () => ({
  runCodexLogin: vi.fn(),
  cancelCodexLogin: vi.fn(),
}));

vi.mock("../../../services/events", () => ({
  subscribeAppServerEvents: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(),
}));

type Handlers = Parameters<typeof useAccountSwitching>[0];
type HookResult = ReturnType<typeof useAccountSwitching>;

function Harness(props: Handlers & { onChange: (value: HookResult) => void }) {
  const result = useAccountSwitching(props);
  props.onChange(result);
  return null;
}

let listener: ((event: AppServerEvent) => void) | null = null;
const unlisten = vi.fn();
let latest: HookResult | null = null;

beforeEach(() => {
  listener = null;
  latest = null;
  unlisten.mockReset();
  vi.mocked(subscribeAppServerEvents).mockImplementation((cb) => {
    listener = cb;
    return unlisten;
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

async function mount(props: Handlers) {
  const container = document.createElement("div");
  const root = createRoot(container);
  const render = async (nextProps: Handlers) => {
    await act(async () => {
      root.render(<Harness {...nextProps} onChange={(value) => (latest = value)} />);
    });
  };
  await render(props);
  return { root, render };
}

function makeAccount(): AccountSnapshot {
  return {
    type: "chatgpt",
    email: "user@example.com",
    planType: "pro",
    requiresOpenaiAuth: true,
  };
}

describe("useAccountSwitching", () => {
  it("opens the auth URL and refreshes after account/login/completed", async () => {
    vi.mocked(runCodexLogin).mockResolvedValue({
      loginId: "login-1",
      authUrl: "https://example.com/auth",
    });

    const refreshAccountInfo = vi.fn();
    const refreshAccountRateLimits = vi.fn();
    const alertError = vi.fn();

    const { root } = await mount({
      activeWorkspaceId: "ws-1",
      accountByWorkspace: { "ws-1": makeAccount() },
      refreshAccountInfo,
      refreshAccountRateLimits,
      alertError,
    });

    expect(listener).toBeTypeOf("function");

    await act(async () => {
      await latest?.handleSwitchAccount();
    });

    expect(runCodexLogin).toHaveBeenCalledWith("ws-1");
    expect(openUrl).toHaveBeenCalledWith("https://example.com/auth");
    expect(refreshAccountInfo).not.toHaveBeenCalled();
    expect(refreshAccountRateLimits).not.toHaveBeenCalled();
    expect(latest?.accountSwitching).toBe(true);

    act(() => {
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "account/login/completed",
          params: { loginId: "login-1", success: true, error: null },
        },
      });
    });

    expect(refreshAccountInfo).toHaveBeenCalledWith("ws-1");
    expect(refreshAccountRateLimits).toHaveBeenCalledWith("ws-1");
    expect(alertError).not.toHaveBeenCalled();
    expect(latest?.accountSwitching).toBe(false);

    await act(async () => {
      root.unmount();
    });
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("cancels and ignores a failed completion event", async () => {
    vi.mocked(runCodexLogin).mockResolvedValue({
      loginId: "login-2",
      authUrl: "https://example.com/auth-2",
    });
    vi.mocked(cancelCodexLogin).mockResolvedValue({ canceled: true, status: "canceled" });

    const refreshAccountInfo = vi.fn();
    const refreshAccountRateLimits = vi.fn();
    const alertError = vi.fn();

    const { root } = await mount({
      activeWorkspaceId: "ws-1",
      accountByWorkspace: { "ws-1": makeAccount() },
      refreshAccountInfo,
      refreshAccountRateLimits,
      alertError,
    });

    await act(async () => {
      await latest?.handleSwitchAccount();
    });
    expect(latest?.accountSwitching).toBe(true);

    await act(async () => {
      await latest?.handleCancelSwitchAccount();
    });
    expect(cancelCodexLogin).toHaveBeenCalledWith("ws-1");
    expect(latest?.accountSwitching).toBe(false);

    act(() => {
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "account/login/completed",
          params: { loginId: "login-2", success: false, error: "boom" },
        },
      });
    });

    expect(refreshAccountInfo).not.toHaveBeenCalled();
    expect(refreshAccountRateLimits).not.toHaveBeenCalled();
    expect(alertError).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it("does not open the auth URL when canceled while login is pending", async () => {
    let resolveLogin: ((value: { loginId: string; authUrl: string }) => void) | null = null;
    vi.mocked(runCodexLogin).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLogin = resolve;
        }),
    );
    vi.mocked(cancelCodexLogin).mockResolvedValue({ canceled: true, status: "canceled" });

    const refreshAccountInfo = vi.fn();
    const refreshAccountRateLimits = vi.fn();
    const alertError = vi.fn();

    const { root } = await mount({
      activeWorkspaceId: "ws-1",
      accountByWorkspace: { "ws-1": makeAccount() },
      refreshAccountInfo,
      refreshAccountRateLimits,
      alertError,
    });

    await act(async () => {
      void latest?.handleSwitchAccount();
    });
    expect(latest?.accountSwitching).toBe(true);

    await act(async () => {
      await latest?.handleCancelSwitchAccount();
    });
    expect(latest?.accountSwitching).toBe(false);

    await act(async () => {
      resolveLogin?.({ loginId: "login-pending", authUrl: "https://example.com/pending" });
      await Promise.resolve();
    });

    expect(openUrl).not.toHaveBeenCalled();
    expect(cancelCodexLogin).toHaveBeenCalledWith("ws-1");
    expect(refreshAccountInfo).not.toHaveBeenCalled();
    expect(refreshAccountRateLimits).not.toHaveBeenCalled();
    expect(alertError).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it("resets switching state when login fails with a cancellation-shaped error", async () => {
    vi.mocked(runCodexLogin).mockRejectedValue(new Error("request canceled"));

    const refreshAccountInfo = vi.fn();
    const refreshAccountRateLimits = vi.fn();
    const alertError = vi.fn();

    const { root } = await mount({
      activeWorkspaceId: "ws-1",
      accountByWorkspace: { "ws-1": makeAccount() },
      refreshAccountInfo,
      refreshAccountRateLimits,
      alertError,
    });

    await act(async () => {
      await latest?.handleSwitchAccount();
    });

    expect(latest?.accountSwitching).toBe(false);
    expect(alertError).not.toHaveBeenCalled();
    expect(openUrl).not.toHaveBeenCalled();
    expect(cancelCodexLogin).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it("clears switching state on workspace change and still completes the original login", async () => {
    vi.mocked(runCodexLogin).mockResolvedValue({
      loginId: "login-ws-1",
      authUrl: "https://example.com/ws-1",
    });

    const refreshAccountInfo = vi.fn();
    const refreshAccountRateLimits = vi.fn();
    const alertError = vi.fn();

    const { root, render } = await mount({
      activeWorkspaceId: "ws-1",
      accountByWorkspace: { "ws-1": makeAccount() },
      refreshAccountInfo,
      refreshAccountRateLimits,
      alertError,
    });

    await act(async () => {
      await latest?.handleSwitchAccount();
    });
    expect(latest?.accountSwitching).toBe(true);

    await render({
      activeWorkspaceId: "ws-2",
      accountByWorkspace: { "ws-1": makeAccount(), "ws-2": makeAccount() },
      refreshAccountInfo,
      refreshAccountRateLimits,
      alertError,
    });
    expect(latest?.accountSwitching).toBe(false);

    act(() => {
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "account/login/completed",
          params: { loginId: "login-ws-1", success: true, error: null },
        },
      });
    });

    expect(refreshAccountInfo).toHaveBeenCalledWith("ws-1");
    expect(refreshAccountRateLimits).toHaveBeenCalledWith("ws-1");
    expect(alertError).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });
});
