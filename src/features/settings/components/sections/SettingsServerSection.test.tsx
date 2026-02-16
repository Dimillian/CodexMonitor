// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { AppSettings } from "../../../../types";
import { SettingsServerSection } from "./SettingsServerSection";

function createAppSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return ({
    backendMode: "local",
    remoteBackendProvider: "tcp",
    keepDaemonRunningAfterAppClose: false,
    orbitAutoStartRunner: false,
    orbitUseAccess: false,
    ...overrides,
  } as unknown) as AppSettings;
}

function buildProps(
  overrides: Partial<Parameters<typeof SettingsServerSection>[0]> = {},
): Parameters<typeof SettingsServerSection>[0] {
  return {
    appSettings: createAppSettings(),
    onUpdateAppSettings: vi.fn(async () => undefined),
    isMobilePlatform: false,
    mobileConnectBusy: false,
    mobileConnectStatusText: null,
    mobileConnectStatusError: false,
    remoteHostDraft: "127.0.0.1:4732",
    remoteTokenDraft: "",
    orbitWsUrlDraft: "",
    orbitAuthUrlDraft: "",
    orbitRunnerNameDraft: "",
    orbitAccessClientIdDraft: "",
    orbitAccessClientSecretRefDraft: "",
    orbitStatusText: null,
    orbitAuthCode: null,
    orbitVerificationUrl: null,
    orbitBusyAction: null,
    tailscaleStatus: null,
    tailscaleStatusBusy: false,
    tailscaleStatusError: null,
    tailscaleCommandPreview: null,
    tailscaleCommandBusy: false,
    tailscaleCommandError: null,
    tcpDaemonStatus: null,
    tcpDaemonBusyAction: null,
    onSetRemoteHostDraft: vi.fn(),
    onSetRemoteTokenDraft: vi.fn(),
    onSetOrbitWsUrlDraft: vi.fn(),
    onSetOrbitAuthUrlDraft: vi.fn(),
    onSetOrbitRunnerNameDraft: vi.fn(),
    onSetOrbitAccessClientIdDraft: vi.fn(),
    onSetOrbitAccessClientSecretRefDraft: vi.fn(),
    onCommitRemoteHost: vi.fn(async () => undefined),
    onCommitRemoteToken: vi.fn(async () => undefined),
    onChangeRemoteProvider: vi.fn(async () => undefined),
    onRefreshTailscaleStatus: vi.fn(),
    onRefreshTailscaleCommandPreview: vi.fn(),
    onUseSuggestedTailscaleHost: vi.fn(async () => undefined),
    onTcpDaemonStart: vi.fn(async () => undefined),
    onTcpDaemonStop: vi.fn(async () => undefined),
    onTcpDaemonStatus: vi.fn(async () => undefined),
    onCommitOrbitWsUrl: vi.fn(async () => undefined),
    onCommitOrbitAuthUrl: vi.fn(async () => undefined),
    onCommitOrbitRunnerName: vi.fn(async () => undefined),
    onCommitOrbitAccessClientId: vi.fn(async () => undefined),
    onCommitOrbitAccessClientSecretRef: vi.fn(async () => undefined),
    onOrbitConnectTest: vi.fn(),
    onOrbitSignIn: vi.fn(),
    onOrbitSignOut: vi.fn(),
    onOrbitRunnerStart: vi.fn(),
    onOrbitRunnerStop: vi.fn(),
    onOrbitRunnerStatus: vi.fn(),
    onMobileConnectTest: vi.fn(),
    ...overrides,
  };
}

describe("SettingsServerSection", () => {
  afterEach(() => {
    cleanup();
  });

  it("updates backend mode through app settings", () => {
    const onUpdateAppSettings = vi.fn(async () => undefined);
    const appSettings = createAppSettings({ backendMode: "local" });

    render(
      <SettingsServerSection
        {...buildProps({
          appSettings,
          onUpdateAppSettings,
        })}
      />,
    );

    fireEvent.change(screen.getByLabelText("后端模式"), {
      target: { value: "remote" },
    });

    expect(onUpdateAppSettings).toHaveBeenCalledWith(
      expect.objectContaining({ backendMode: "remote" }),
    );
  });

  it("calls provider switch handler when remote provider changes", () => {
    const onChangeRemoteProvider = vi.fn(async () => undefined);

    render(
      <SettingsServerSection
        {...buildProps({
          onChangeRemoteProvider,
        })}
      />,
    );

    fireEvent.change(screen.getByLabelText("远程提供方"), {
      target: { value: "orbit" },
    });

    expect(onChangeRemoteProvider).toHaveBeenCalledWith("orbit");
  });

  it("toggles daemon keep-running switch via settings update", () => {
    const onUpdateAppSettings = vi.fn(async () => undefined);
    const appSettings = createAppSettings({ keepDaemonRunningAfterAppClose: false });

    render(
      <SettingsServerSection
        {...buildProps({
          appSettings,
          onUpdateAppSettings,
        })}
      />,
    );

    const row = screen
      .getByText("关闭应用后保持守护进程运行")
      .closest(".settings-toggle-row");
    expect(row).not.toBeNull();
    const button = within(row as HTMLElement).getByRole("button");
    fireEvent.click(button);

    expect(onUpdateAppSettings).toHaveBeenCalledWith(
      expect.objectContaining({ keepDaemonRunningAfterAppClose: true }),
    );
  });

  it("toggles orbit-only feature flags when provider is orbit", () => {
    const onUpdateAppSettings = vi.fn(async () => undefined);
    const appSettings = createAppSettings({
      remoteBackendProvider: "orbit",
      orbitAutoStartRunner: false,
      orbitUseAccess: false,
    });

    render(
      <SettingsServerSection
        {...buildProps({
          appSettings,
          onUpdateAppSettings,
        })}
      />,
    );

    const autoRunnerRow = screen
      .getByText("自动启动 Runner")
      .closest(".settings-toggle-row");
    const orbitAccessRow = screen
      .getByText("使用 Orbit Access")
      .closest(".settings-toggle-row");
    expect(autoRunnerRow).not.toBeNull();
    expect(orbitAccessRow).not.toBeNull();
    fireEvent.click(within(autoRunnerRow as HTMLElement).getByRole("button"));
    fireEvent.click(within(orbitAccessRow as HTMLElement).getByRole("button"));

    expect(onUpdateAppSettings).toHaveBeenCalledWith(
      expect.objectContaining({ orbitAutoStartRunner: true }),
    );
    expect(onUpdateAppSettings).toHaveBeenCalledWith(
      expect.objectContaining({ orbitUseAccess: true }),
    );
  });

  it("renders friendly tailscale error hint for missing binary", () => {
    render(
      <SettingsServerSection
        {...buildProps({
          tailscaleStatusError: "No such file or directory",
        })}
      />,
    );

    expect(screen.getByText("未检测到 Tailscale，请安装后重试。")).not.toBeNull();
  });
});
