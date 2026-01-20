import { useEffect, useMemo, useRef, useState } from "react";
import { useAppSettings } from "../../settings/hooks/useAppSettings";
import { useCloudClient } from "../hooks/useCloudClient";
import type { CloudProvider, ConversationItem, NatsAuthMode } from "../../../types";

function formatTime(timestamp: number) {
  try {
    return new Date(timestamp).toLocaleTimeString();
  } catch {
    return "";
  }
}

function itemLabel(item: ConversationItem) {
  if (item.kind === "message") {
    return item.role === "assistant" ? "assistant" : "user";
  }
  if (item.kind === "reasoning") {
    return "reasoning";
  }
  if (item.kind === "tool") {
    return item.toolType;
  }
  if (item.kind === "diff") {
    return "diff";
  }
  return item.kind;
}

export function CloudClientApp() {
  const { settings: appSettings, setSettings: setAppSettings, saveSettings } =
    useAppSettings();
  const {
    runnerId,
    workspaces,
    activeWorkspaceId,
    setActiveWorkspaceId,
    threadId,
    items,
    busy,
    logs,
    e2eStatus,
    e2eDetail,
    connectionLabel,
    checkNats,
    discover,
    loadWorkspaces,
    connectWorkspace,
    startThread,
    sendText,
    e2eRun,
  } = useCloudClient();

  const isE2E = import.meta.env.VITE_E2E === "1";
  const ranE2ERef = useRef(false);

  const [natsUrlDraft, setNatsUrlDraft] = useState(appSettings.natsUrl ?? "");
  const [natsAuthModeDraft, setNatsAuthModeDraft] = useState<NatsAuthMode>(
    appSettings.natsAuthMode,
  );
  const [natsUsernameDraft, setNatsUsernameDraft] = useState(appSettings.natsUsername ?? "");
  const [natsPasswordDraft, setNatsPasswordDraft] = useState(appSettings.natsPassword ?? "");
  const [natsCredsDraft, setNatsCredsDraft] = useState(appSettings.natsCreds ?? "");
  const [messageDraft, setMessageDraft] = useState("");

  useEffect(() => {
    setNatsUrlDraft(appSettings.natsUrl ?? "");
  }, [appSettings.natsUrl]);

  useEffect(() => {
    setNatsAuthModeDraft(appSettings.natsAuthMode);
  }, [appSettings.natsAuthMode]);

  useEffect(() => {
    setNatsUsernameDraft(appSettings.natsUsername ?? "");
  }, [appSettings.natsUsername]);

  useEffect(() => {
    setNatsPasswordDraft(appSettings.natsPassword ?? "");
  }, [appSettings.natsPassword]);

  useEffect(() => {
    setNatsCredsDraft(appSettings.natsCreds ?? "");
  }, [appSettings.natsCreds]);

  const provider = (appSettings.cloudProvider ?? "local") as CloudProvider;
  const providerDraft = provider;

  const canUseCloud = providerDraft === "nats";
  const selectedWorkspace = useMemo(
    () => workspaces.find((ws) => ws.id === activeWorkspaceId) ?? null,
    [activeWorkspaceId, workspaces],
  );

  useEffect(() => {
    if (!isE2E || ranE2ERef.current) {
      return;
    }
    ranE2ERef.current = true;
    void e2eRun();
  }, [e2eRun, isE2E]);

  async function saveCloudSettings(nextProvider: CloudProvider) {
    const next = {
      ...appSettings,
      cloudProvider: nextProvider,
      natsUrl: natsUrlDraft.trim(),
      natsAuthMode: natsAuthModeDraft,
      natsUsername: natsUsernameDraft.trim() ? natsUsernameDraft.trim() : null,
      natsPassword: natsPasswordDraft.length ? natsPasswordDraft : null,
      natsCreds: natsCredsDraft.trim() ? natsCredsDraft.trim() : null,
    };
    setAppSettings(next);
    await saveSettings(next);
  }

  const logsCard = (
    <div className="cloudClientCard cloudClientCardFill cloudClientLogsCard">
      <div className="cloudClientSectionTitle">Logs</div>
      <div className="cloudClientLogs cloudClientLogsFill">
        {logs.length === 0 ? (
          <div className="cloudClientHint">(no logs yet)</div>
        ) : (
          logs.map((entry) => (
            <div key={`${entry.at}-${entry.message}`} className="cloudClientLogLine">
              <span className="cloudClientMono">{formatTime(entry.at)}</span>{" "}
              {entry.message}
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div className="cloudClientShell">
      <div className="cloudClientHeader">
        <div>
          <div className="cloudClientTitle">CodexMonitor Cloud Client</div>
          <div className="cloudClientSubtitle">
            Provider: <span className="cloudClientMono">{providerDraft}</span>{" "}
            Runner:{" "}
            <span className="cloudClientMono">{runnerId ?? "(none)"}</span>
          </div>
        </div>
        <div className="cloudClientHeaderActions">
          <button className="button" disabled={busy} onClick={() => void checkNats()}>
            Test NATS
          </button>
          <button
            className="button primary"
            disabled={busy || !canUseCloud}
            onClick={() => void discover()}
          >
            Discover Runner
          </button>
        </div>
      </div>

      <div className="cloudClientBody">
        <div className="cloudClientPane cloudClientSidebar">
          <div className="cloudClientCard cloudClientCardTight">
            <div className="cloudClientSectionTitle">Connection</div>
            <label className="cloudClientLabel">
              Provider
              <select
                className="cloudClientSelect"
                value={providerDraft}
                onChange={(event) => {
                  void saveCloudSettings(event.target.value as CloudProvider);
                }}
                disabled={busy}
              >
                <option value="local">local</option>
                <option value="nats">nats</option>
                <option value="cloudkit">cloudkit</option>
              </select>
            </label>
            <label className="cloudClientLabel">
              NATS URL
              <input
                className="cloudClientInput"
                value={natsUrlDraft}
                onChange={(event) => setNatsUrlDraft(event.target.value)}
                placeholder={natsAuthModeDraft === "url" ? "nats://token@host:4222" : "nats://host:4222"}
                disabled={busy || providerDraft !== "nats"}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </label>
            <label className="cloudClientLabel">
              NATS Auth
              <select
                className="cloudClientSelect"
                value={natsAuthModeDraft}
                onChange={(event) => setNatsAuthModeDraft(event.target.value as NatsAuthMode)}
                disabled={busy || providerDraft !== "nats"}
              >
                <option value="url">from URL</option>
                <option value="userpass">username/password</option>
                <option value="creds">creds (.creds)</option>
              </select>
            </label>

            {natsAuthModeDraft === "userpass" ? (
              <>
                <label className="cloudClientLabel">
                  NATS Username
                  <input
                    className="cloudClientInput"
                    value={natsUsernameDraft}
                    onChange={(event) => setNatsUsernameDraft(event.target.value)}
                    placeholder="username"
                    disabled={busy || providerDraft !== "nats"}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </label>
                <label className="cloudClientLabel">
                  NATS Password
                  <input
                    className="cloudClientInput"
                    type="password"
                    value={natsPasswordDraft}
                    onChange={(event) => setNatsPasswordDraft(event.target.value)}
                    placeholder="password"
                    disabled={busy || providerDraft !== "nats"}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </label>
              </>
            ) : null}

            {natsAuthModeDraft === "creds" ? (
              <label className="cloudClientLabel">
                NATS Creds
                <textarea
                  className="cloudClientTextarea"
                  value={natsCredsDraft}
                  onChange={(event) => setNatsCredsDraft(event.target.value)}
                  placeholder="-----BEGIN NATS USER JWT-----"
                  disabled={busy || providerDraft !== "nats"}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  rows={7}
                />
              </label>
            ) : null}
            <div className="cloudClientRow cloudClientRowTight">
              <button
                className="button"
                disabled={busy || providerDraft !== "nats"}
                onClick={() => void saveCloudSettings("nats")}
              >
                Save
              </button>
              <button
                className="button"
                disabled={busy || !canUseCloud}
                onClick={() => void checkNats()}
              >
                Test
              </button>
              <button
                className="button primary"
                disabled={busy || !canUseCloud}
                onClick={() => void discover()}
              >
                Discover
              </button>
            </div>
            {!canUseCloud && (
              <div className="cloudClientHint">
                Select <span className="cloudClientMono">nats</span> to control a
                macOS runner.
              </div>
            )}
          </div>

          <div className="cloudClientCard cloudClientCardFill">
            <div className="cloudClientSectionTitle">Workspaces</div>
            <div className="cloudClientRow cloudClientRowTight">
              <button
                className="button"
                disabled={busy || !runnerId || !canUseCloud}
                onClick={() => void loadWorkspaces(runnerId!)}
              >
                Refresh
              </button>
              <button
                className="button"
                disabled={busy || !runnerId || !activeWorkspaceId}
                onClick={() => void connectWorkspace(runnerId!, activeWorkspaceId!)}
              >
                Connect
              </button>
              <button
                className="button primary"
                disabled={busy || !runnerId || !activeWorkspaceId}
                onClick={() => void startThread(runnerId!, activeWorkspaceId!)}
              >
                New
              </button>
            </div>
            <div className="cloudClientList cloudClientListTall">
              {workspaces.length === 0 ? (
                <div className="cloudClientHint">(no workspaces)</div>
              ) : (
                workspaces.map((ws) => (
                  <button
                    key={ws.id}
                    className={
                      ws.id === activeWorkspaceId
                        ? "cloudClientListItem active"
                        : "cloudClientListItem"
                    }
                    onClick={() => setActiveWorkspaceId(ws.id)}
                  >
                    <div className="cloudClientListTitle">{ws.name}</div>
                    <div className="cloudClientListSubtitle">{ws.path}</div>
                  </button>
                ))
              )}
            </div>
            <div className="cloudClientHint">
              Selected:{" "}
              <span className="cloudClientMono">
                {selectedWorkspace?.name ?? "(none)"}
              </span>
            </div>
          </div>

          <div className="cloudClientCard cloudClientCardTight">
            <div className="cloudClientSectionTitle">E2E</div>
            <div className="cloudClientRow cloudClientRowTight">
              <button
                className="button primary"
                disabled={busy || e2eStatus === "running"}
                onClick={() => void e2eRun()}
              >
                Run Joke Test
              </button>
              <div className="cloudClientHintInline">
                <span className="cloudClientMono">{e2eStatus}</span>
                {e2eDetail ? ` — ${e2eDetail}` : ""}
              </div>
            </div>
            {isE2E && (
              <div className="cloudClientHint">
                Auto-run: <span className="cloudClientMono">VITE_E2E=1</span>
              </div>
            )}
          </div>

          <div className="cloudClientLogsCardSidebar">{logsCard}</div>
        </div>

        <div className="cloudClientPane cloudClientChatPane">
          <div className="cloudClientCard cloudClientCardFill cloudClientChatCard">
            <div className="cloudClientChatHeader">
              <div>
                <div className="cloudClientSectionTitle">Chat</div>
                <div className="cloudClientHint cloudClientHintNoTop">
                  Workspace:{" "}
                  <span className="cloudClientMono">
                    {connectionLabel.workspace?.name ?? "(none)"}
                  </span>{" "}
                  · Thread:{" "}
                  <span className="cloudClientMono">{threadId ?? "(none)"}</span>
                </div>
              </div>
            </div>

            <div className="cloudClientMessages cloudClientMessagesFill">
              {items.length === 0 ? (
                <div className="cloudClientHint">(no messages yet)</div>
              ) : (
                items.map((item) => (
                  <div key={item.id} className="cloudClientMessage">
                    <div className="cloudClientMessageMeta">{itemLabel(item)}</div>
                    <pre className="cloudClientMessageBody">
                      {item.kind === "message"
                        ? item.text
                        : item.kind === "reasoning"
                          ? `${item.summary}\n\n${item.content}`.trim()
                          : item.kind === "diff"
                            ? item.diff
                            : item.kind === "tool"
                              ? [item.title, item.detail, item.output]
                                  .filter(Boolean)
                                  .join("\n")
                              : JSON.stringify(item, null, 2)}
                    </pre>
                  </div>
                ))
              )}
            </div>

            <div className="cloudClientComposer">
              <input
                className="cloudClientInput cloudClientGrow"
                placeholder="Type a message…"
                value={messageDraft}
                onChange={(event) => setMessageDraft(event.target.value)}
                disabled={busy || !runnerId || !activeWorkspaceId || !threadId}
              />
              <button
                className="button primary"
                disabled={busy || !runnerId || !activeWorkspaceId || !threadId}
                onClick={() => {
                  const text = messageDraft;
                  setMessageDraft("");
                  void sendText(runnerId!, activeWorkspaceId!, threadId!, text);
                }}
              >
                Send
              </button>
            </div>
          </div>
        </div>

        <div className="cloudClientPane cloudClientLogsPane">
          <div className="cloudClientLogsCardPane">{logsCard}</div>
        </div>
      </div>
    </div>
  );
}
