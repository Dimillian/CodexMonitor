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
  remoteBackends: AppSettings["remoteBackends"];
  activeRemoteBackendId: string | null;
  remoteStatusText: string | null;
  remoteStatusError: boolean;
  remoteNameError: string | null;
  remoteHostError: string | null;
  remoteNameDraft: string;
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
  onSetRemoteNameDraft: Dispatch<SetStateAction<string>>;
  onSetRemoteHostDraft: Dispatch<SetStateAction<string>>;
  onSetRemoteTokenDraft: Dispatch<SetStateAction<string>>;
  onSetOrbitWsUrlDraft: Dispatch<SetStateAction<string>>;
  onSetOrbitAuthUrlDraft: Dispatch<SetStateAction<string>>;
  onSetOrbitRunnerNameDraft: Dispatch<SetStateAction<string>>;
  onSetOrbitAccessClientIdDraft: Dispatch<SetStateAction<string>>;
  onSetOrbitAccessClientSecretRefDraft: Dispatch<SetStateAction<string>>;
  onCommitRemoteName: () => Promise<void>;
  onCommitRemoteHost: () => Promise<void>;
  onCommitRemoteToken: () => Promise<void>;
  onSelectRemoteBackend: (id: string) => Promise<void>;
  onAddRemoteBackend: () => Promise<void>;
  onMoveRemoteBackend: (id: string, direction: "up" | "down") => Promise<void>;
  onDeleteRemoteBackend: (id: string) => Promise<void>;
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

type RemoteBackendTarget = AppSettings["remoteBackends"][number];

const createRemoteBackendId = () =>
  `remote-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const buildFallbackRemoteBackend = (settings: AppSettings): RemoteBackendTarget => ({
  id: settings.activeRemoteBackendId ?? "remote-default",
  name: "Primary remote",
  provider: settings.remoteBackendProvider,
  host: settings.remoteBackendHost,
  token: settings.remoteBackendToken,
  orbitWsUrl: settings.orbitWsUrl,
  lastConnectedAtMs: null,
});

const getConfiguredRemoteBackends = (settings: AppSettings): RemoteBackendTarget[] => {
  if (settings.remoteBackends.length > 0) {
    return settings.remoteBackends;
  }
  return [buildFallbackRemoteBackend(settings)];
};

const getActiveRemoteBackend = (settings: AppSettings): RemoteBackendTarget => {
  const configured = getConfiguredRemoteBackends(settings);
  return configured.find((entry) => entry.id === settings.activeRemoteBackendId) ?? configured[0];
};

const validateRemoteHost = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "Host is required.";
  }
  const match = trimmed.match(/^([^:\s]+|\[[^\]]+\]):([0-9]{1,5})$/);
  if (!match) {
    return "Use host:port (for example `macbook.tailnet.ts.net:4732`).";
  }
  const port = Number(match[2]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return "Port must be between 1 and 65535.";
  }
  return null;
};

const buildNextRemoteName = (remoteBackends: RemoteBackendTarget[]) => {
  const normalized = new Set(remoteBackends.map((entry) => entry.name.trim().toLowerCase()));
  let index = remoteBackends.length + 1;
  let candidate = `Remote ${index}`;
  while (normalized.has(candidate.toLowerCase())) {
    index += 1;
    candidate = `Remote ${index}`;
  }
  return candidate;
};

export const useSettingsServerSection = ({
  appSettings,
  onUpdateAppSettings,
  onMobileConnectSuccess,
  orbitServiceClient,
}: UseSettingsServerSectionArgs): SettingsServerSectionProps => {
  const initialActiveRemoteBackend = getActiveRemoteBackend(appSettings);
  const [remoteNameDraft, setRemoteNameDraft] = useState(initialActiveRemoteBackend.name);
  const [remoteHostDraft, setRemoteHostDraft] = useState(initialActiveRemoteBackend.host);
  const [remoteTokenDraft, setRemoteTokenDraft] = useState(initialActiveRemoteBackend.token ?? "");
  const [orbitWsUrlDraft, setOrbitWsUrlDraft] = useState(initialActiveRemoteBackend.orbitWsUrl ?? "");
  const [remoteStatusText, setRemoteStatusText] = useState<string | null>(null);
  const [remoteStatusError, setRemoteStatusError] = useState(false);
  const [remoteNameError, setRemoteNameError] = useState<string | null>(null);
  const [remoteHostError, setRemoteHostError] = useState<string | null>(null);
  const [orbitAuthUrlDraft, setOrbitAuthUrlDraft] = useState(appSettings.orbitAuthUrl ?? "");
  const [orbitRunnerNameDraft, setOrbitRunnerNameDraft] = useState(appSettings.orbitRunnerName ?? "");
  const [orbitAccessClientIdDraft, setOrbitAccessClientIdDraft] = useState(
    appSettings.orbitAccessClientId ?? "",
  );
  const [orbitAccessClientSecretRefDraft, setOrbitAccessClientSecretRefDraft] =
    useState(appSettings.orbitAccessClientSecretRef ?? "");
  const [orbitStatusText, setOrbitStatusText] = useState<string | null>(null);
  const [orbitAuthCode, setOrbitAuthCode] = useState<string | null>(null);
  const [orbitVerificationUrl, setOrbitVerificationUrl] = useState<string | null>(null);
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
  const [mobileConnectStatusText, setMobileConnectStatusText] = useState<string | null>(null);
  const [mobileConnectStatusError, setMobileConnectStatusError] = useState(false);
  const mobilePlatform = useMemo(() => isMobilePlatform(), []);

  const latestSettingsRef = useRef(appSettings);
  const activeRemoteBackend = useMemo(() => getActiveRemoteBackend(appSettings), [appSettings]);

  const setRemoteStatus = useCallback((message: string | null, isError = false) => {
    setRemoteStatusText(message);
    setRemoteStatusError(isError);
  }, []);

  useEffect(() => {
    latestSettingsRef.current = appSettings;
  }, [appSettings]);

  useEffect(() => {
    setRemoteNameDraft(activeRemoteBackend.name);
    setRemoteHostDraft(activeRemoteBackend.host);
    setRemoteTokenDraft(activeRemoteBackend.token ?? "");
    setOrbitWsUrlDraft(activeRemoteBackend.orbitWsUrl ?? "");
    setRemoteNameError(null);
    setRemoteHostError(null);
  }, [activeRemoteBackend]);

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

  const normalizeRemoteBackendEntry = (
    entry: RemoteBackendTarget,
    index: number,
  ): RemoteBackendTarget => ({
    id: entry.id?.trim() || `remote-${index + 1}`,
    name: entry.name?.trim() || `Remote ${index + 1}`,
    provider: entry.provider === "orbit" ? "orbit" : "tcp",
    host: entry.host?.trim() || DEFAULT_REMOTE_HOST,
    token: entry.token?.trim() ? entry.token.trim() : null,
    orbitWsUrl: entry.orbitWsUrl?.trim() ? entry.orbitWsUrl.trim() : null,
    lastConnectedAtMs:
      typeof entry.lastConnectedAtMs === "number" && Number.isFinite(entry.lastConnectedAtMs)
        ? entry.lastConnectedAtMs
        : null,
  });

  const buildSettingsFromRemoteBackends = useCallback(
    (
      latestSettings: AppSettings,
      remoteBackends: RemoteBackendTarget[],
      preferredActiveId?: string | null,
    ): AppSettings => {
      const normalizedBackends = remoteBackends.length
        ? remoteBackends.map(normalizeRemoteBackendEntry)
        : [normalizeRemoteBackendEntry(buildFallbackRemoteBackend(latestSettings), 0)];
      const active =
        normalizedBackends.find((entry) => entry.id === preferredActiveId) ??
        normalizedBackends.find((entry) => entry.id === latestSettings.activeRemoteBackendId) ??
        normalizedBackends[0];
      return {
        ...latestSettings,
        remoteBackends: normalizedBackends,
        activeRemoteBackendId: active.id,
        remoteBackendProvider: active.provider,
        remoteBackendHost: active.host,
        remoteBackendToken: active.token,
        orbitWsUrl: active.orbitWsUrl,
        ...(mobilePlatform
          ? {
              backendMode: "remote",
            }
          : {}),
      };
    },
    [mobilePlatform],
  );

  const persistRemoteBackends = useCallback(
    async (remoteBackends: RemoteBackendTarget[], preferredActiveId?: string | null) => {
      const latestSettings = latestSettingsRef.current;
      const nextSettings = buildSettingsFromRemoteBackends(
        latestSettings,
        remoteBackends,
        preferredActiveId,
      );
      const unchanged =
        nextSettings.remoteBackendHost === latestSettings.remoteBackendHost &&
        nextSettings.remoteBackendToken === latestSettings.remoteBackendToken &&
        nextSettings.orbitWsUrl === latestSettings.orbitWsUrl &&
        nextSettings.backendMode === latestSettings.backendMode &&
        nextSettings.remoteBackendProvider === latestSettings.remoteBackendProvider &&
        nextSettings.activeRemoteBackendId === latestSettings.activeRemoteBackendId &&
        JSON.stringify(nextSettings.remoteBackends) === JSON.stringify(latestSettings.remoteBackends);
      if (unchanged) {
        return;
      }
      await onUpdateAppSettings(nextSettings);
      latestSettingsRef.current = nextSettings;
    },
    [buildSettingsFromRemoteBackends, onUpdateAppSettings],
  );

  const updateActiveRemoteBackend = useCallback(
    async (patch: Partial<RemoteBackendTarget>) => {
      const latestSettings = latestSettingsRef.current;
      const active = getActiveRemoteBackend(latestSettings);
      const nextBackends = [...getConfiguredRemoteBackends(latestSettings)];
      const activeIndex = nextBackends.findIndex((entry) => entry.id === active.id);
      const safeIndex = activeIndex >= 0 ? activeIndex : 0;
      nextBackends[safeIndex] = {
        ...nextBackends[safeIndex],
        ...patch,
      };
      await persistRemoteBackends(nextBackends, nextBackends[safeIndex].id);
    },
    [persistRemoteBackends],
  );

  const applyRemoteHost = async (rawValue: string) => {
    const active = getActiveRemoteBackend(latestSettingsRef.current);
    const nextHost = rawValue.trim();
    if (active.provider === "tcp") {
      const validationError = validateRemoteHost(nextHost);
      if (validationError) {
        setRemoteHostError(validationError);
        setRemoteStatus(validationError, true);
        return false;
      }
    }
    const normalizedHost = nextHost || DEFAULT_REMOTE_HOST;
    setRemoteHostError(null);
    setRemoteHostDraft(normalizedHost);
    await updateActiveRemoteBackend({ host: normalizedHost });
    setRemoteStatus("Remote host saved.");
    return true;
  };

  const handleCommitRemoteName = async () => {
    const latestSettings = latestSettingsRef.current;
    const active = getActiveRemoteBackend(latestSettings);
    const nextName = remoteNameDraft.trim();
    if (!nextName) {
      const message = "Name is required.";
      setRemoteNameError(message);
      setRemoteStatus(message, true);
      return;
    }
    const duplicate = getConfiguredRemoteBackends(latestSettings).some(
      (entry) => entry.id !== active.id && entry.name.trim().toLowerCase() === nextName.toLowerCase(),
    );
    if (duplicate) {
      const message = `A remote named \"${nextName}\" already exists.`;
      setRemoteNameError(message);
      setRemoteStatus(message, true);
      return;
    }
    setRemoteNameError(null);
    setRemoteNameDraft(nextName);
    await updateActiveRemoteBackend({ name: nextName });
    setRemoteStatus(`Saved remote name \"${nextName}\".`);
  };

  const handleCommitRemoteHost = async () => {
    await applyRemoteHost(remoteHostDraft);
  };

  const handleCommitRemoteToken = async () => {
    const nextToken = remoteTokenDraft.trim() ? remoteTokenDraft.trim() : null;
    setRemoteTokenDraft(nextToken ?? "");
    await updateActiveRemoteBackend({ token: nextToken });
    setRemoteStatus("Remote token saved.");
  };

  const handleSelectRemoteBackend = async (id: string) => {
    const latestSettings = latestSettingsRef.current;
    const candidates = getConfiguredRemoteBackends(latestSettings);
    const selected = candidates.find((entry) => entry.id === id);
    if (!selected) {
      return;
    }
    await persistRemoteBackends(candidates, id);
    setRemoteStatus(`Active remote set to \"${selected.name}\".`);
  };

  const handleAddRemoteBackend = async () => {
    const latestSettings = latestSettingsRef.current;
    const existingBackends = getConfiguredRemoteBackends(latestSettings);
    const nextId = createRemoteBackendId();
    const nextRemote: RemoteBackendTarget = {
      id: nextId,
      name: buildNextRemoteName(existingBackends),
      provider: latestSettings.remoteBackendProvider,
      host: DEFAULT_REMOTE_HOST,
      token: null,
      orbitWsUrl: null,
      lastConnectedAtMs: null,
    };
    await persistRemoteBackends([...existingBackends, nextRemote], nextId);
    setRemoteStatus(`Added \"${nextRemote.name}\".`);
  };

  const handleSetRemoteNameDraft: Dispatch<SetStateAction<string>> = (value) => {
    setRemoteNameError(null);
    setRemoteStatus(null);
    setRemoteNameDraft((previous) => (typeof value === "function" ? value(previous) : value));
  };

  const handleSetRemoteHostDraft: Dispatch<SetStateAction<string>> = (value) => {
    setRemoteHostError(null);
    setRemoteStatus(null);
    setRemoteHostDraft((previous) => (typeof value === "function" ? value(previous) : value));
  };

  const handleMoveRemoteBackend = async (id: string, direction: "up" | "down") => {
    const latestSettings = latestSettingsRef.current;
    const nextBackends = [...getConfiguredRemoteBackends(latestSettings)];
    const index = nextBackends.findIndex((entry) => entry.id === id);
    if (index < 0) {
      return;
    }
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= nextBackends.length) {
      return;
    }
    const entry = nextBackends[index];
    nextBackends[index] = nextBackends[targetIndex];
    nextBackends[targetIndex] = entry;
    await persistRemoteBackends(nextBackends);
    setRemoteStatus(`Moved \"${entry.name}\" ${direction}.`);
  };

  const handleDeleteRemoteBackend = async (id: string) => {
    const latestSettings = latestSettingsRef.current;
    const existingBackends = getConfiguredRemoteBackends(latestSettings);
    if (existingBackends.length <= 1) {
      setRemoteStatus("You need at least one remote.", true);
      return;
    }
    const index = existingBackends.findIndex((entry) => entry.id === id);
    if (index < 0) {
      return;
    }
    const removed = existingBackends[index];
    const remaining = existingBackends.filter((entry) => entry.id !== id);
    const nextActiveId =
      latestSettings.activeRemoteBackendId === id
        ? remaining[Math.min(index, remaining.length - 1)]?.id ?? remaining[0]?.id ?? null
        : latestSettings.activeRemoteBackendId;
    await persistRemoteBackends(remaining, nextActiveId);
    setRemoteStatus(`Deleted \"${removed.name}\".`);
  };

  const handleMobileConnectTest = () => {
    void (async () => {
      const active = getActiveRemoteBackend(latestSettingsRef.current);
      const provider = active.provider;
      const nextToken = remoteTokenDraft.trim() ? remoteTokenDraft.trim() : null;
      setRemoteTokenDraft(nextToken ?? "");

      if (!nextToken) {
        setMobileConnectStatusError(true);
        setMobileConnectStatusText("Remote backend token is required.");
        return;
      }

      if (provider === "tcp") {
        const hostError = validateRemoteHost(remoteHostDraft);
        if (hostError) {
          setRemoteHostError(hostError);
          setMobileConnectStatusError(true);
          setMobileConnectStatusText(hostError);
          return;
        }
      }

      setMobileConnectBusy(true);
      setMobileConnectStatusText(null);
      setMobileConnectStatusError(false);
      try {
        if (provider === "tcp") {
          const nextHost = remoteHostDraft.trim() || DEFAULT_REMOTE_HOST;
          setRemoteHostDraft(nextHost);
          await updateActiveRemoteBackend({
            host: nextHost,
            token: nextToken,
          });
        } else {
          const nextOrbitWsUrl = normalizeOverrideValue(orbitWsUrlDraft);
          setOrbitWsUrlDraft(nextOrbitWsUrl ?? "");
          if (!nextOrbitWsUrl) {
            throw new Error("Orbit websocket URL is required.");
          }
          await updateActiveRemoteBackend({
            token: nextToken,
            orbitWsUrl: nextOrbitWsUrl,
          });
        }
        const workspaces = await listWorkspaces();
        const workspaceCount = workspaces.length;
        const workspaceWord = workspaceCount === 1 ? "workspace" : "workspaces";
        try {
          await updateActiveRemoteBackend({ lastConnectedAtMs: Date.now() });
        } catch {
          // Keep successful connectivity outcome even if timestamp persistence fails.
        }
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
    if (provider === getActiveRemoteBackend(latestSettingsRef.current).provider) {
      return;
    }
    await updateActiveRemoteBackend({
      provider,
    });
    setRemoteStatus(`Connection type set to ${provider.toUpperCase()}.`);
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
    await updateActiveRemoteBackend({
      orbitWsUrl: nextValue,
    });
    setRemoteStatus("Orbit websocket URL saved.");
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
    await updateActiveRemoteBackend({ token: normalizedToken });
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
        const tokenTargetRemoteId = latestSettingsRef.current.activeRemoteBackendId ?? undefined;
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
            tokenTargetRemoteId,
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
      const tokenTargetRemoteId = latestSettingsRef.current.activeRemoteBackendId ?? undefined;
      const result = await runOrbitAction(
        "sign-out",
        "Sign Out",
        () => orbitServiceClient.orbitSignOut(tokenTargetRemoteId),
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
    remoteBackends: getConfiguredRemoteBackends(appSettings),
    activeRemoteBackendId:
      appSettings.activeRemoteBackendId ?? getConfiguredRemoteBackends(appSettings)[0]?.id ?? null,
    remoteStatusText,
    remoteStatusError,
    remoteNameError,
    remoteHostError,
    remoteNameDraft,
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
    onSetRemoteNameDraft: handleSetRemoteNameDraft,
    onSetRemoteHostDraft: handleSetRemoteHostDraft,
    onSetRemoteTokenDraft: setRemoteTokenDraft,
    onSetOrbitWsUrlDraft: setOrbitWsUrlDraft,
    onSetOrbitAuthUrlDraft: setOrbitAuthUrlDraft,
    onSetOrbitRunnerNameDraft: setOrbitRunnerNameDraft,
    onSetOrbitAccessClientIdDraft: setOrbitAccessClientIdDraft,
    onSetOrbitAccessClientSecretRefDraft: setOrbitAccessClientSecretRefDraft,
    onCommitRemoteName: handleCommitRemoteName,
    onCommitRemoteHost: handleCommitRemoteHost,
    onCommitRemoteToken: handleCommitRemoteToken,
    onSelectRemoteBackend: handleSelectRemoteBackend,
    onAddRemoteBackend: handleAddRemoteBackend,
    onMoveRemoteBackend: handleMoveRemoteBackend,
    onDeleteRemoteBackend: handleDeleteRemoteBackend,
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
