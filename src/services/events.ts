import { listen } from "@tauri-apps/api/event";
import type { AppServerEvent, DictationEvent, DictationModelStatus } from "../types";

export type Unsubscribe = () => void;

export type TerminalOutputEvent = {
  workspaceId: string;
  terminalId: string;
  data: string;
};

type SubscriptionOptions = {
  onError?: (error: unknown) => void;
};

type Listener<T> = (payload: T) => void;

function createEventHub<T>(eventName: string) {
  const listeners = new Set<Listener<T>>();
  let unlisten: Unsubscribe | null = null;
  let listenPromise: Promise<Unsubscribe> | null = null;

  const start = (options?: SubscriptionOptions) => {
    if (unlisten || listenPromise) {
      return;
    }
    listenPromise = listen<T>(eventName, (event) => {
      for (const listener of listeners) {
        try {
          listener(event.payload);
        } catch (error) {
          console.error(`[events] ${eventName} listener failed`, error);
        }
      }
    });
    listenPromise
      .then((handler) => {
        listenPromise = null;
        if (listeners.size === 0) {
          handler();
          return;
        }
        unlisten = handler;
      })
      .catch((error) => {
        listenPromise = null;
        options?.onError?.(error);
      });
  };

  const stop = () => {
    if (unlisten) {
      try {
        unlisten();
      } catch {
        // Ignore double-unlisten when tearing down.
      }
      unlisten = null;
    }
  };

  const subscribe = (
    onEvent: Listener<T>,
    options?: SubscriptionOptions,
  ): Unsubscribe => {
    listeners.add(onEvent);
    start(options);
    return () => {
      listeners.delete(onEvent);
      if (listeners.size === 0) {
        stop();
      }
    };
  };

  return { subscribe };
}

const appServerHub = createEventHub<AppServerEvent>("app-server-event");
const dictationDownloadHub = createEventHub<DictationModelStatus>("dictation-download");
const dictationEventHub = createEventHub<DictationEvent>("dictation-event");
const terminalOutputHub = createEventHub<TerminalOutputEvent>("terminal-output");
const updaterCheckHub = createEventHub<void>("updater-check");
const menuNewAgentHub = createEventHub<void>("menu-new-agent");
const menuNewWorktreeAgentHub = createEventHub<void>("menu-new-worktree-agent");
const menuNewCloneAgentHub = createEventHub<void>("menu-new-clone-agent");
const menuAddWorkspaceHub = createEventHub<void>("menu-add-workspace");
const menuOpenSettingsHub = createEventHub<void>("menu-open-settings");
const menuToggleDebugPanelHub = createEventHub<void>("menu-toggle-debug-panel");
const menuToggleTerminalHub = createEventHub<void>("menu-toggle-terminal");
const menuCycleModelHub = createEventHub<void>("menu-composer-cycle-model");
const menuCycleAccessHub = createEventHub<void>("menu-composer-cycle-access");
const menuCycleReasoningHub = createEventHub<void>("menu-composer-cycle-reasoning");
const menuComposerCycleModelHub = createEventHub<void>("menu-composer-cycle-model");
const menuComposerCycleAccessHub = createEventHub<void>("menu-composer-cycle-access");
const menuComposerCycleReasoningHub = createEventHub<void>("menu-composer-cycle-reasoning");

export function subscribeAppServerEvents(
  onEvent: (event: AppServerEvent) => void,
  options?: SubscriptionOptions,
): Unsubscribe {
  return appServerHub.subscribe(onEvent, options);
}

export function subscribeDictationDownload(
  onEvent: (event: DictationModelStatus) => void,
  options?: SubscriptionOptions,
): Unsubscribe {
  return dictationDownloadHub.subscribe(onEvent, options);
}

export function subscribeDictationEvents(
  onEvent: (event: DictationEvent) => void,
  options?: SubscriptionOptions,
): Unsubscribe {
  return dictationEventHub.subscribe(onEvent, options);
}

export function subscribeTerminalOutput(
  onEvent: (event: TerminalOutputEvent) => void,
  options?: SubscriptionOptions,
): Unsubscribe {
  return terminalOutputHub.subscribe(onEvent, options);
}

export function subscribeUpdaterCheck(
  onEvent: () => void,
  options?: SubscriptionOptions,
): Unsubscribe {
  return updaterCheckHub.subscribe(() => {
    onEvent();
  }, options);
}

export function subscribeMenuNewAgent(
  onEvent: () => void,
  options?: SubscriptionOptions,
): Unsubscribe {
  return menuNewAgentHub.subscribe(() => {
    onEvent();
  }, options);
}

export function subscribeMenuNewWorktreeAgent(
  onEvent: () => void,
  options?: SubscriptionOptions,
): Unsubscribe {
  return menuNewWorktreeAgentHub.subscribe(() => {
    onEvent();
  }, options);
}

export function subscribeMenuNewCloneAgent(
  onEvent: () => void,
  options?: SubscriptionOptions,
): Unsubscribe {
  return menuNewCloneAgentHub.subscribe(() => {
    onEvent();
  }, options);
}

export function subscribeMenuAddWorkspace(
  onEvent: () => void,
  options?: SubscriptionOptions,
): Unsubscribe {
  return menuAddWorkspaceHub.subscribe(() => {
    onEvent();
  }, options);
}

export function subscribeMenuOpenSettings(
  onEvent: () => void,
  options?: SubscriptionOptions,
): Unsubscribe {
  return menuOpenSettingsHub.subscribe(() => {
    onEvent();
  }, options);
}

export function subscribeMenuToggleDebugPanel(
  onEvent: () => void,
  options?: SubscriptionOptions,
): Unsubscribe {
  return menuToggleDebugPanelHub.subscribe(() => {
    onEvent();
  }, options);
}

export function subscribeMenuToggleTerminal(
  onEvent: () => void,
  options?: SubscriptionOptions,
): Unsubscribe {
  return menuToggleTerminalHub.subscribe(() => {
    onEvent();
  }, options);
}

export function subscribeMenuCycleModel(
  onEvent: () => void,
  options?: SubscriptionOptions,
): Unsubscribe {
  return menuCycleModelHub.subscribe(() => {
    onEvent();
  }, options);
}

export function subscribeMenuCycleAccessMode(
  onEvent: () => void,
  options?: SubscriptionOptions,
): Unsubscribe {
  return menuCycleAccessHub.subscribe(() => {
    onEvent();
  }, options);
}

export function subscribeMenuCycleReasoning(
  onEvent: () => void,
  options?: SubscriptionOptions,
): Unsubscribe {
  return menuCycleReasoningHub.subscribe(() => {
    onEvent();
  }, options);
}

export function subscribeMenuComposerCycleModel(
  onEvent: () => void,
  options?: SubscriptionOptions,
): Unsubscribe {
  return menuComposerCycleModelHub.subscribe(() => {
    onEvent();
  }, options);
}

export function subscribeMenuComposerCycleAccess(
  onEvent: () => void,
  options?: SubscriptionOptions,
): Unsubscribe {
  return menuComposerCycleAccessHub.subscribe(() => {
    onEvent();
  }, options);
}

export function subscribeMenuComposerCycleReasoning(
  onEvent: () => void,
  options?: SubscriptionOptions,
): Unsubscribe {
  return menuComposerCycleReasoningHub.subscribe(() => {
    onEvent();
  }, options);
}
