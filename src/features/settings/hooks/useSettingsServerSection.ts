import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type {
  AppSettings,
  TailscaleDaemonCommandPreview,
  TailscaleStatus,
  TcpDaemonStatus,
} from "@/types";
import {
  listWorkspaces,
  tailscaleDaemonCommandPreview as fetchTailscaleDaemonCommandPreview,
  tailscaleDaemonStart,
  tailscaleDaemonStatus,
  tailscaleDaemonStop,
  tailscaleStatus as fetchTailscaleStatus,
} from "@services/tauri";
import { isMobilePlatform } from "@utils/platformPaths";
import type { OrbitServiceClient } from "@settings/components/settingsTypes";
import {
  DEFAULT_REMOTE_HOST,
  ORBIT_DEFAULT_POLL_INTERVAL_SECONDS,
  ORBIT_MAX_INLINE_POLL_SECONDS,
} from "@settings/components/settingsViewConstants";
import {
  delay,
  getOrbitStatusText,
  normalizeOverrideValue,
  type OrbitActionResult,
} from "@settings/components/settingsViewHelpers";

type UseSettingsServerSectionArgs = {
  appSettings: AppSettings;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
  onMobileConnectSuccess?: () => Promise<void> | void;
  orbitServiceClient: OrbitServiceClient;
};

export type SettingsServerSectionProps = {
  appSettings: AppSettings;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
  isMobilePlatform: boolean;
  mobileConnectBusy: boolean;
  mobileConnectStatusText: string | null;
  mobileConnectStatusError: boolean;
  remoteHostDraft: string;
  remoteTokenDraft: string;
  orbitWsUrlDraft: string;
  orbitAuthUrlDraft: string;
  orbitRunnerNameDraft: string;
  orbitAccessClientIdDraft: string;
  orbitAccessClientSecretRefDraft: string;
  orbitStatusText: string | null;
  orbitAuthCode: string | null;
  orbitVerificationUrl: string | null;
  orbitBusyAction: string | null;
  tailscaleStatus: TailscaleStatus | null;
  tailscaleStatusBusy: boolean;
  tailscaleStatusError: string | null;
  tailscaleCommandPreview: TailscaleDaemonCommandPreview | null;
  tailscaleCommandBusy: boolean;
  tailscaleCommandError: string | null;
  tcpDaemonStatus: TcpDaemonStatus | null;
  tcpDaemonBusyAction: "start" | "stop" | "status" | null;
  onSetRemoteHostDraft: Dispatch<SetStateAction<string>>;
  onSetRemoteTokenDraft: Dispatch<SetStateAction<string>>;
  onSetOrbitWsUrlDraft: Dispatch<SetStateAction<string>>;
  onSetOrbitAuthUrlDraft: Dispatch<SetStateAction<string>>;
  onSetOrbitRunnerNameDraft: Dispatch<SetStateAction<string>>;
  onSetOrbitAccessClientIdDraft: Dispatch<SetStateAction<string>>;
  onSetOrbitAccessClientSecretRefDraft: Dispatch<SetStateAction<string>>;
  onCommitRemoteHost: () => Promise<void>;
  onCommitRemoteToken: () => Promise<void>;
  onChangeRemoteProvider: (provider: AppSettings["remoteBackendProvider"]) => Promise<void>;
  onRefreshTailscaleStatus: () => void;
  onRefreshTailscaleCommandPreview: () => void;
  onUseSuggestedTailscaleHost: () => Promise<void>;
  onTcpDaemonStart: () => Promise<void>;
  onTcpDaemonStop: () => Promise<void>;
  onTcpDaemonStatus: () => Promise<void>;
  onCommitOrbitWsUrl: () => Promise<void>;
  onCommitOrbitAuthUrl: () => Promise<void>;
  onCommitOrbitRunnerName: () => Promise<void>;
  onCommitOrbitAccessClientId: () => Promise<void>;
  onCommitOrbitAccessClientSecretRef: () => Promise<void>;
  onOrbitConnectTest: () => void;
  onOrbitSignIn: () => void;
  onOrbitSignOut: () => void;
  onOrbitRunnerStart: () => void;
  onOrbitRunnerStop: () => void;
  onOrbitRunnerStatus: () => void;
  onMobileConnectTest: () => void;
};

const formatErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") {
      return message;
    }
  }
  return fallback;
};

export const useSettingsServerSection = ({
  appSettings,
  onUpdateAppSettings,
  onMobileConnectSuccess,
  orbitServiceClient,
}: UseSettingsServerSectionArgs): SettingsServerSectionProps => {
  const [remoteHostDraft, setRemoteHostDraft] = useState(appSettings.remoteBackendHost);
  const [remoteTokenDraft, setRemoteTokenDraft] = useState(appSettings.remoteBackendToken ?? "");
  const [orbitWsUrlDraft, setOrbitWsUrlDraft] = useState(appSettings.orbitWsUrl ?? "");
  const [orbitAuthUrlDraft, setOrbitAuthUrlDraft] = useState(appSettings.orbitAuthUrl ?? "");
  const [orbitRunnerNameDraft, setOrbitRunnerNameDraft] = useState(
    appSettings.orbitRunnerName ?? "",
  );
  const [orbitAccessClientIdDraft, setOrbitAccessClientIdDraft] = useState(
    appSettings.orbitAccessClientId ?? "",
  );
  const [orbitAccessClientSecretRefDraft, setOrbitAccessClientSecretRefDraft] =
    useState(appSettings.orbitAccessClientSecretRef ?? "");
  const [orbitStatusText, setOrbitStatusText] = useState<string | null>(null);
  const [orbitAuthCode, setOrbitAuthCode] = useState<string | null>(null);
  const [orbitVerificationUrl, setOrbitVerificationUrl] = useState<string | null>(
    null,
  );
  const [orbitBusyAction, setOrbitBusyAction] = useState<string | null>(null);
  const [tailscaleStatus, setTailscaleStatus] = useState<TailscaleStatus | null>(null);
  const [tailscaleStatusBusy, setTailscaleStatusBusy] = useState(false);
  const [tailscaleStatusError, setTailscaleStatusError] = useState<string | null>(null);
  const [tailscaleCommandPreview, setTailscaleCommandPreview] =
    useState<TailscaleDaemonCommandPreview | null>(null);
  const [tailscaleCommandBusy, setTailscaleCommandBusy] = useState(false);
  const [tailscaleCommandError, setTailscaleCommandError] = useState<string | null>(null);
  const [tcpDaemonStatus, setTcpDaemonStatus] = useState<TcpDaemonStatus | null>(null);
  const [tcpDaemonBusyAction, setTcpDaemonBusyAction] = useState<
    "start" | "stop" | "status" | null
  >(null);
  const [mobileConnectBusy, setMobileConnectBusy] = useState(false);
  const [mobileConnectStatusText, setMobileConnectStatusText] = useState<string | null>(
    null,
  );
  const [mobileConnectStatusError, setMobileConnectStatusError] = useState(false);
  const mobilePlatform = useMemo(() => isMobilePlatform(), []);

  const latestSettingsRef = useRef(appSettings);

  useEffect(() => {
    latestSettingsRef.current = appSettings;
  }, [appSettings]);

  useEffect(() => {
    setRemoteHostDraft(appSettings.remoteBackendHost);
  }, [appSettings.remoteBackendHost]);

  useEffect(() => {
    setRemoteTokenDraft(appSettings.remoteBackendToken ?? "");
  }, [appSettings.remoteBackendToken]);

  useEffect(() => {
    setOrbitWsUrlDraft(appSettings.orbitWsUrl ?? "");
  }, [appSettings.orbitWsUrl]);

  useEffect(() => {
    setOrbitAuthUrlDraft(appSettings.orbitAuthUrl ?? "");
  }, [appSettings.orbitAuthUrl]);

  useEffect(() => {
    setOrbitRunnerNameDraft(appSettings.orbitRunnerName ?? "");
  }, [appSettings.orbitRunnerName]);

  useEffect(() => {
    setOrbitAccessClientIdDraft(appSettings.orbitAccessClientId ?? "");
  }, [appSettings.orbitAccessClientId]);

  useEffect(() => {
    setOrbitAccessClientSecretRefDraft(appSettings.orbitAccessClientSecretRef ?? "");
  }, [appSettings.orbitAccessClientSecretRef]);

  const updateRemoteBackendSettings = useCallback(
    async ({
      host,
      token,
      provider,
      orbitWsUrl,
    }: {
      host?: string;
      token?: string | null;
      provider?: AppSettings["remoteBackendProvider"];
      orbitWsUrl?: string | null;
    }) => {
      const latestSettings = latestSettingsRef.current;
      const nextHost = host ?? latestSettings.remoteBackendHost;
      const nextToken =
        token === undefined ? latestSettings.remoteBackendToken : token;
      const nextProvider = provider ?? latestSettings.remoteBackendProvider;
      const nextOrbitWsUrl =
        orbitWsUrl === undefined ? latestSettings.orbitWsUrl : orbitWsUrl;
      const nextSettings: AppSettings = {
        ...latestSettings,
        remoteBackendHost: nextHost,
        remoteBackendToken: nextToken,
        remoteBackendProvider: nextProvider,
        orbitWsUrl: nextOrbitWsUrl,
        ...(mobilePlatform
          ? {
              backendMode: "remote",
            }
          : {}),
      };
      const unchanged =
        nextSettings.remoteBackendHost === latestSettings.remoteBackendHost &&
        nextSettings.remoteBackendToken === latestSettings.remoteBackendToken &&
        nextSettings.orbitWsUrl === latestSettings.orbitWsUrl &&
        nextSettings.backendMode === latestSettings.backendMode &&
        nextSettings.remoteBackendProvider === latestSettings.remoteBackendProvider;
      if (unchanged) {
        return;
      }
      await onUpdateAppSettings(nextSettings);
      latestSettingsRef.current = nextSettings;
    },
    [mobilePlatform, onUpdateAppSettings],
  );

  const applyRemoteHost = async (rawValue: string) => {
    const nextHost = rawValue.trim() || DEFAULT_REMOTE_HOST;
    setRemoteHostDraft(nextHost);
    await updateRemoteBackendSettings({ host: nextHost });
  };

  const handleCommitRemoteHost = async () => {
    await applyRemoteHost(remoteHostDraft);
  };

  const handleCommitRemoteToken = async () => {
    const nextToken = remoteTokenDraft.trim() ? remoteTokenDraft.trim() : null;
    setRemoteTokenDraft(nextToken ?? "");
    await updateRemoteBackendSettings({ token: nextToken });
  };

  const handleMobileConnectTest = () => {
    void (async () => {
      const provider = latestSettingsRef.current.remoteBackendProvider;
      const nextToken = remoteTokenDraft.trim() ? remoteTokenDraft.trim() : null;
      setRemoteTokenDraft(nextToken ?? "");
      setMobileConnectBusy(true);
      setMobileConnectStatusText(null);
      setMobileConnectStatusError(false);
      try {
        if (provider === "tcp") {
          const nextHost = remoteHostDraft.trim() || DEFAULT_REMOTE_HOST;
          setRemoteHostDraft(nextHost);
          await updateRemoteBackendSettings({
            host: nextHost,
            token: nextToken,
          });
        } else {
          const nextOrbitWsUrl = normalizeOverrideValue(orbitWsUrlDraft);
          setOrbitWsUrlDraft(nextOrbitWsUrl ?? "");
          if (!nextOrbitWsUrl) {
            throw new Error("Orbit websocket URL is required.");
          }
          await updateRemoteBackendSettings({
            token: nextToken,
            orbitWsUrl: nextOrbitWsUrl,
          });
        }
        const workspaces = await listWorkspaces();
        const workspaceCount = workspaces.length;
        const workspaceWord = workspaceCount === 1 ? "workspace" : "workspaces";
        setMobileConnectStatusText(
          `Connected. ${workspaceCount} ${workspaceWord} reachable on the remote backend.`,
        );
        await onMobileConnectSuccess?.();
      } catch (error) {
        setMobileConnectStatusError(true);
        setMobileConnectStatusText(
          error instanceof Error ? error.message : "Unable to connect to remote backend.",
        );
      } finally {
        setMobileConnectBusy(false);
      }
    })();
  };

  useEffect(() => {
    if (!mobilePlatform) {
      return;
    }
    setMobileConnectStatusText(null);
    setMobileConnectStatusError(false);
  }, [
    appSettings.remoteBackendProvider,
    mobilePlatform,
    orbitWsUrlDraft,
    remoteHostDraft,
    remoteTokenDraft,
  ]);

  const handleChangeRemoteProvider = async (
    provider: AppSettings["remoteBackendProvider"],
  ) => {
    if (provider === latestSettingsRef.current.remoteBackendProvider) {
      return;
    }
    await updateRemoteBackendSettings({
      provider,
    });
  };

  const handleRefreshTailscaleStatus = useCallback(() => {
    void (async () => {
      setTailscaleStatusBusy(true);
      setTailscaleStatusError(null);
      try {
        const status = await fetchTailscaleStatus();
        setTailscaleStatus(status);
      } catch (error) {
        setTailscaleStatusError(
          formatErrorMessage(error, "Unable to load Tailscale status."),
        );
      } finally {
        setTailscaleStatusBusy(false);
      }
    })();
  }, []);

  const handleRefreshTailscaleCommandPreview = useCallback(() => {
    void (async () => {
      setTailscaleCommandBusy(true);
      setTailscaleCommandError(null);
      try {
        const preview = await fetchTailscaleDaemonCommandPreview();
        setTailscaleCommandPreview(preview);
      } catch (error) {
        setTailscaleCommandError(
          formatErrorMessage(error, "Unable to build Tailscale daemon command."),
        );
      } finally {
        setTailscaleCommandBusy(false);
      }
    })();
  }, []);

  const handleUseSuggestedTailscaleHost = async () => {
    const suggestedHost = tailscaleStatus?.suggestedRemoteHost ?? null;
    if (!suggestedHost) {
      return;
    }
    await applyRemoteHost(suggestedHost);
  };

  const runTcpDaemonAction = useCallback(
    async (
      action: "start" | "stop" | "status",
      run: () => Promise<TcpDaemonStatus>,
    ) => {
      setTcpDaemonBusyAction(action);
      try {
        const status = await run();
        setTcpDaemonStatus(status);
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : typeof error === "string"
              ? error
              : "Unable to update mobile access daemon status.";
        setTcpDaemonStatus((prev) => ({
          state: "error",
          pid: null,
          startedAtMs: null,
          lastError: errorMessage,
          listenAddr: prev?.listenAddr ?? null,
        }));
      } finally {
        setTcpDaemonBusyAction(null);
      }
    },
    [],
  );

  const handleTcpDaemonStart = useCallback(async () => {
    await runTcpDaemonAction("start", tailscaleDaemonStart);
  }, [runTcpDaemonAction]);

  const handleTcpDaemonStop = useCallback(async () => {
    await runTcpDaemonAction("stop", tailscaleDaemonStop);
  }, [runTcpDaemonAction]);

  const handleTcpDaemonStatus = useCallback(async () => {
    await runTcpDaemonAction("status", tailscaleDaemonStatus);
  }, [runTcpDaemonAction]);

  const handleCommitOrbitWsUrl = async () => {
    const nextValue = normalizeOverrideValue(orbitWsUrlDraft);
    setOrbitWsUrlDraft(nextValue ?? "");
    await updateRemoteBackendSettings({
      orbitWsUrl: nextValue,
    });
  };

  const handleCommitOrbitAuthUrl = async () => {
    const nextValue = normalizeOverrideValue(orbitAuthUrlDraft);
    setOrbitAuthUrlDraft(nextValue ?? "");
    if (nextValue === appSettings.orbitAuthUrl) {
      return;
    }
    await onUpdateAppSettings({
      ...appSettings,
      orbitAuthUrl: nextValue,
    });
  };

  const handleCommitOrbitRunnerName = async () => {
    const nextValue = normalizeOverrideValue(orbitRunnerNameDraft);
    setOrbitRunnerNameDraft(nextValue ?? "");
    if (nextValue === appSettings.orbitRunnerName) {
      return;
    }
    await onUpdateAppSettings({
      ...appSettings,
      orbitRunnerName: nextValue,
    });
  };

  const handleCommitOrbitAccessClientId = async () => {
    const nextValue = normalizeOverrideValue(orbitAccessClientIdDraft);
    setOrbitAccessClientIdDraft(nextValue ?? "");
    if (nextValue === appSettings.orbitAccessClientId) {
      return;
    }
    await onUpdateAppSettings({
      ...appSettings,
      orbitAccessClientId: nextValue,
    });
  };

  const handleCommitOrbitAccessClientSecretRef = async () => {
    const nextValue = normalizeOverrideValue(orbitAccessClientSecretRefDraft);
    setOrbitAccessClientSecretRefDraft(nextValue ?? "");
    if (nextValue === appSettings.orbitAccessClientSecretRef) {
      return;
    }
    await onUpdateAppSettings({
      ...appSettings,
      orbitAccessClientSecretRef: nextValue,
    });
  };

  const runOrbitAction = async <T extends OrbitActionResult>(
    actionKey: string,
    actionLabel: string,
    action: () => Promise<T>,
    successFallback: string,
  ): Promise<T | null> => {
    setOrbitBusyAction(actionKey);
    setOrbitStatusText(`${actionLabel}...`);
    try {
      const result = await action();
      setOrbitStatusText(getOrbitStatusText(result, successFallback));
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Orbit error";
      setOrbitStatusText(`${actionLabel} failed: ${message}`);
      return null;
    } finally {
      setOrbitBusyAction(null);
    }
  };

  const syncRemoteBackendToken = async (nextToken: string | null) => {
    const normalizedToken = nextToken?.trim() ? nextToken.trim() : null;
    setRemoteTokenDraft(normalizedToken ?? "");
    const latestSettings = latestSettingsRef.current;
    if (normalizedToken === latestSettings.remoteBackendToken) {
      return;
    }
    const nextSettings = {
      ...latestSettings,
      remoteBackendToken: normalizedToken,
    };
    await onUpdateAppSettings({
      ...nextSettings,
    });
    latestSettingsRef.current = nextSettings;
  };

  const handleOrbitConnectTest = () => {
    void runOrbitAction(
      "connect-test",
      "Connect test",
      orbitServiceClient.orbitConnectTest,
      "Orbit connection test succeeded.",
    );
  };

  const handleOrbitSignIn = () => {
    void (async () => {
      setOrbitBusyAction("sign-in");
      setOrbitStatusText("Starting Orbit sign in...");
      setOrbitAuthCode(null);
      setOrbitVerificationUrl(null);
      try {
        const startResult = await orbitServiceClient.orbitSignInStart();
        setOrbitAuthCode(startResult.userCode ?? startResult.deviceCode);
        setOrbitVerificationUrl(
          startResult.verificationUriComplete ?? startResult.verificationUri,
        );
        setOrbitStatusText(
          "Orbit sign in started. Finish authorization in the browser window, then keep this dialog open while we poll for completion.",
        );

        const maxPollWindowSeconds = Math.max(
          1,
          Math.min(startResult.expiresInSeconds, ORBIT_MAX_INLINE_POLL_SECONDS),
        );
        const deadlineMs = Date.now() + maxPollWindowSeconds * 1000;
        let pollIntervalSeconds = Math.max(
          1,
          startResult.intervalSeconds || ORBIT_DEFAULT_POLL_INTERVAL_SECONDS,
        );

        while (Date.now() < deadlineMs) {
          await delay(pollIntervalSeconds * 1000);
          const pollResult = await orbitServiceClient.orbitSignInPoll(
            startResult.deviceCode,
          );
          setOrbitStatusText(
            getOrbitStatusText(pollResult, "Orbit sign in status refreshed."),
          );

          if (pollResult.status === "pending") {
            if (typeof pollResult.intervalSeconds === "number") {
              pollIntervalSeconds = Math.max(1, pollResult.intervalSeconds);
            }
            continue;
          }

          if (pollResult.status === "authorized") {
            if (pollResult.token) {
              await syncRemoteBackendToken(pollResult.token);
            }
          }
          return;
        }

        setOrbitStatusText(
          "Orbit sign in is still pending. Leave this window open and try Sign In again if authorization just completed.",
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown Orbit error";
        setOrbitStatusText(`Sign In failed: ${message}`);
      } finally {
        setOrbitBusyAction(null);
      }
    })();
  };

  const handleOrbitSignOut = () => {
    void (async () => {
      const result = await runOrbitAction(
        "sign-out",
        "Sign Out",
        orbitServiceClient.orbitSignOut,
        "Signed out from Orbit.",
      );
      if (result !== null) {
        try {
          await syncRemoteBackendToken(null);
          setOrbitAuthCode(null);
          setOrbitVerificationUrl(null);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown Orbit error";
          setOrbitStatusText(`Sign Out failed: ${message}`);
        }
      }
    })();
  };

  const handleOrbitRunnerStart = () => {
    void runOrbitAction(
      "runner-start",
      "Start Runner",
      orbitServiceClient.orbitRunnerStart,
      "Orbit runner started.",
    );
  };

  const handleOrbitRunnerStop = () => {
    void runOrbitAction(
      "runner-stop",
      "Stop Runner",
      orbitServiceClient.orbitRunnerStop,
      "Orbit runner stopped.",
    );
  };

  const handleOrbitRunnerStatus = () => {
    void runOrbitAction(
      "runner-status",
      "Refresh Status",
      orbitServiceClient.orbitRunnerStatus,
      "Orbit runner status refreshed.",
    );
  };

  useEffect(() => {
    if (appSettings.remoteBackendProvider !== "tcp") {
      return;
    }
    if (!mobilePlatform) {
      handleRefreshTailscaleCommandPreview();
      void handleTcpDaemonStatus();
    }
    if (tailscaleStatus === null && !tailscaleStatusBusy && !tailscaleStatusError) {
      handleRefreshTailscaleStatus();
    }
  }, [
    appSettings.remoteBackendProvider,
    appSettings.remoteBackendToken,
    handleRefreshTailscaleCommandPreview,
    handleRefreshTailscaleStatus,
    handleTcpDaemonStatus,
    mobilePlatform,
    tailscaleStatus,
    tailscaleStatusBusy,
    tailscaleStatusError,
  ]);

  return {
    appSettings,
    onUpdateAppSettings,
    remoteHostDraft,
    remoteTokenDraft,
    orbitWsUrlDraft,
    orbitAuthUrlDraft,
    orbitRunnerNameDraft,
    orbitAccessClientIdDraft,
    orbitAccessClientSecretRefDraft,
    orbitStatusText,
    orbitAuthCode,
    orbitVerificationUrl,
    orbitBusyAction,
    tailscaleStatus,
    tailscaleStatusBusy,
    tailscaleStatusError,
    tailscaleCommandPreview,
    tailscaleCommandBusy,
    tailscaleCommandError,
    tcpDaemonStatus,
    tcpDaemonBusyAction,
    onSetRemoteHostDraft: setRemoteHostDraft,
    onSetRemoteTokenDraft: setRemoteTokenDraft,
    onSetOrbitWsUrlDraft: setOrbitWsUrlDraft,
    onSetOrbitAuthUrlDraft: setOrbitAuthUrlDraft,
    onSetOrbitRunnerNameDraft: setOrbitRunnerNameDraft,
    onSetOrbitAccessClientIdDraft: setOrbitAccessClientIdDraft,
    onSetOrbitAccessClientSecretRefDraft: setOrbitAccessClientSecretRefDraft,
    onCommitRemoteHost: handleCommitRemoteHost,
    onCommitRemoteToken: handleCommitRemoteToken,
    onChangeRemoteProvider: handleChangeRemoteProvider,
    onRefreshTailscaleStatus: handleRefreshTailscaleStatus,
    onRefreshTailscaleCommandPreview: handleRefreshTailscaleCommandPreview,
    onUseSuggestedTailscaleHost: handleUseSuggestedTailscaleHost,
    onTcpDaemonStart: handleTcpDaemonStart,
    onTcpDaemonStop: handleTcpDaemonStop,
    onTcpDaemonStatus: handleTcpDaemonStatus,
    onCommitOrbitWsUrl: handleCommitOrbitWsUrl,
    onCommitOrbitAuthUrl: handleCommitOrbitAuthUrl,
    onCommitOrbitRunnerName: handleCommitOrbitRunnerName,
    onCommitOrbitAccessClientId: handleCommitOrbitAccessClientId,
    onCommitOrbitAccessClientSecretRef: handleCommitOrbitAccessClientSecretRef,
    onOrbitConnectTest: handleOrbitConnectTest,
    onOrbitSignIn: handleOrbitSignIn,
    onOrbitSignOut: handleOrbitSignOut,
    onOrbitRunnerStart: handleOrbitRunnerStart,
    onOrbitRunnerStop: handleOrbitRunnerStop,
    onOrbitRunnerStatus: handleOrbitRunnerStatus,
    isMobilePlatform: mobilePlatform,
    mobileConnectBusy,
    mobileConnectStatusText,
    mobileConnectStatusError,
    onMobileConnectTest: handleMobileConnectTest,
  };
};
