import { listen } from "@tauri-apps/api/event";
import type { AppServerEvent } from "../types";

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

export async function subscribeTerminalOutput(
  onEvent: (event: TerminalOutputEvent) => void,
): Promise<Unsubscribe> {
  return listen<TerminalOutputEvent>("terminal-output", (event) => {
    onEvent(event.payload);
  });
}
