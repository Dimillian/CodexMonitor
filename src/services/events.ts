import { listen } from "@tauri-apps/api/event";
import type { AppServerEvent, DictationEvent, DictationModelStatus } from "../types";

export type Unsubscribe = () => void;

export type TerminalOutputEvent = {
  workspaceId: string;
  terminalId: string;
  data: string;
};

export async function subscribeAppServerEvents(
  onEvent: (event: AppServerEvent) => void,
): Promise<Unsubscribe> {
  return listen<AppServerEvent>("app-server-event", (event) => {
    onEvent(event.payload);
  });
}

export async function subscribeDictationDownload(
  onEvent: (event: DictationModelStatus) => void,
): Promise<Unsubscribe> {
  return listen<DictationModelStatus>("dictation-download", (event) => {
    onEvent(event.payload);
  });
}

export async function subscribeDictationEvents(
  onEvent: (event: DictationEvent) => void,
): Promise<Unsubscribe> {
  return listen<DictationEvent>("dictation-event", (event) => {
    onEvent(event.payload);
  });
}

export async function subscribeTerminalOutput(
  onEvent: (event: TerminalOutputEvent) => void,
): Promise<Unsubscribe> {
  return listen<TerminalOutputEvent>("terminal-output", (event) => {
    onEvent(event.payload);
  });
}

export async function subscribeUpdaterCheck(
  onEvent: () => void,
): Promise<Unsubscribe> {
  return listen("updater-check", () => {
    onEvent();
  });
}

export async function subscribeMenuNewAgent(
  onEvent: () => void,
): Promise<Unsubscribe> {
  return listen("menu-new-agent", () => {
    onEvent();
  });
}

export async function subscribeMenuNewWorktreeAgent(
  onEvent: () => void,
): Promise<Unsubscribe> {
  return listen("menu-new-worktree-agent", () => {
    onEvent();
  });
}

export async function subscribeMenuNewCloneAgent(
  onEvent: () => void,
): Promise<Unsubscribe> {
  return listen("menu-new-clone-agent", () => {
    onEvent();
  });
}

export async function subscribeMenuAddWorkspace(
  onEvent: () => void,
): Promise<Unsubscribe> {
  return listen("menu-add-workspace", () => {
    onEvent();
  });
}

export async function subscribeMenuOpenSettings(
  onEvent: () => void,
): Promise<Unsubscribe> {
  return listen("menu-open-settings", () => {
    onEvent();
  });
}
