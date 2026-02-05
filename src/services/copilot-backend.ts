/**
 * Copilot Backend Adapter
 *
 * Maps Copilot SDK events to CodexMonitor's AppServerEvent format,
 * providing a drop-in replacement for the Codex app-server backend.
 */

import type { SessionEvent } from "@github/copilot-sdk";
import type { AppServerEvent } from "../types";
import * as copilotSdk from "./copilot-sdk";
import { emitAppServerEvent } from "./events";

/**
 * Map Copilot SDK event types to Codex app-server method names.
 */
function mapEventToMethod(event: SessionEvent): string | null {
  switch (event.type) {
    // Session lifecycle
    case "session.idle":
      return "turn/completed";
    case "session.error":
      return "error";

    // Assistant messages
    case "assistant.message":
      return "item/completed";
    case "assistant.message_delta":
      return "item/agentMessage/delta";

    // Tool execution (maps to item events)
    case "tool.execution_start":
      return "item/started";
    case "tool.execution_complete":
      return "item/completed";

    // Reasoning/thinking
    case "assistant.reasoning":
      return "item/reasoning/textDelta";
    case "assistant.reasoning_delta":
      return "item/reasoning/textDelta";

    // Turn lifecycle
    case "assistant.turn_start":
      return "turn/started";
    case "assistant.turn_end":
      return "turn/completed";

    default:
      return null;
  }
}

/**
 * Transform a Copilot SDK event into a CodexMonitor AppServerEvent.
 */
function transformEvent(
  workspaceId: string,
  event: SessionEvent,
): AppServerEvent | null {
  const method = mapEventToMethod(event);
  if (!method) {
    // Return raw event for debugging/passthrough
    return {
      workspace_id: workspaceId,
      message: {
        method: `copilot/${event.type}`,
        params: event.data ?? {},
      },
    };
  }

  const baseMessage = {
    method,
    params: {} as Record<string, unknown>,
  };

  // Transform event data to match Codex format
  switch (event.type) {
    case "assistant.message_delta": {
      const data = event.data;
      baseMessage.params = {
        threadId: workspaceId, // SDK doesn't have threads, use workspace as proxy
        itemId: event.id ?? "current",
        delta: data.deltaContent ?? "",
      };
      break;
    }

    case "assistant.message": {
      const data = event.data;
      baseMessage.params = {
        threadId: workspaceId,
        item: {
          id: event.id ?? "current",
          type: "agentMessage",
          text: data.content ?? "",
        },
      };
      break;
    }

    case "session.idle": {
      baseMessage.params = {
        threadId: workspaceId,
        turn: {
          id: "current",
          threadId: workspaceId,
        },
      };
      break;
    }

    case "session.error": {
      const data = event.data;
      baseMessage.params = {
        threadId: workspaceId,
        turnId: "current",
        error: {
          message: data.message ?? "Unknown error",
          code: data.errorType,
        },
        willRetry: false,
      };
      break;
    }

    case "tool.execution_start": {
      const data = event.data;
      baseMessage.params = {
        threadId: workspaceId,
        item: {
          id: data.toolCallId ?? "tool",
          type: "tool",
          toolType: data.toolName ?? "unknown",
          status: "running",
          arguments: data.arguments,
        },
      };
      break;
    }

    case "tool.execution_complete": {
      const data = event.data;
      baseMessage.params = {
        threadId: workspaceId,
        item: {
          id: data.toolCallId ?? "tool",
          type: "tool",
          toolType: "unknown", // toolName not available in completion event
          status: data.success ? "completed" : "error",
          output: data.result?.content ?? (data.error?.message ?? ""),
        },
      };
      break;
    }

    case "assistant.reasoning":
    case "assistant.reasoning_delta": {
      const data = event.data;
      baseMessage.params = {
        threadId: workspaceId,
        itemId: "reasoning",
        delta: "deltaContent" in data ? data.deltaContent : (data.content ?? ""),
      };
      break;
    }

    case "assistant.turn_start": {
      baseMessage.params = {
        threadId: workspaceId,
        turn: {
          id: event.id ?? "current",
          threadId: workspaceId,
        },
      };
      break;
    }

    case "assistant.turn_end": {
      baseMessage.params = {
        threadId: workspaceId,
        turn: {
          id: event.id ?? "current",
          threadId: workspaceId,
        },
      };
      break;
    }

    default:
      baseMessage.params = event.data ?? {};
  }

  return {
    workspace_id: workspaceId,
    message: baseMessage,
  };
}

/**
 * Initialize the Copilot backend event routing.
 * Call this once at app startup.
 */
export function initCopilotBackend() {
  copilotSdk.setGlobalEventCallback((workspaceId, event) => {
    const transformedEvent = transformEvent(workspaceId, event);
    if (transformedEvent) {
      emitAppServerEvent(transformedEvent);
    }
  });

  // Set up permission handler to route approval requests
  copilotSdk.setGlobalPermissionCallback(async (workspaceId, request) => {
    // Emit approval request event
    emitAppServerEvent({
      workspace_id: workspaceId,
      message: {
        id: request.toolCallId ?? `approval-${Date.now()}`,
        method: `approval/${request.kind}`,
        params: request,
      },
    });

    // For now, auto-approve all requests
    // TODO: Implement proper approval UI flow
    return { kind: "approved" };
  });
}

/**
 * Connect a workspace using Copilot backend.
 */
export async function connectWorkspace(
  workspaceId: string,
  workspacePath: string,
  options?: {
    copilotBin?: string | null;
    copilotArgs?: string | null;
  },
): Promise<void> {
  const cliArgs = options?.copilotArgs
    ? options.copilotArgs.split(/\s+/).filter(Boolean)
    : undefined;

  await copilotSdk.connectWorkspace(workspaceId, workspacePath, {
    cliPath: options?.copilotBin ?? undefined,
    cliArgs,
  });

  // Emit connected event in Codex format
  emitAppServerEvent({
    workspace_id: workspaceId,
    message: {
      method: "codex/connected",
      params: {},
    },
  });
}

/**
 * Disconnect a workspace.
 */
export async function disconnectWorkspace(workspaceId: string): Promise<void> {
  await copilotSdk.disconnectWorkspace(workspaceId);
}

/**
 * Start a new thread (session) in a workspace.
 */
export async function startThread(
  workspaceId: string,
  options?: {
    model?: string;
  },
): Promise<{ threadId: string }> {
  const sessionId = await copilotSdk.createSession(workspaceId, {
    model: options?.model,
  });

  // Emit thread started event
  emitAppServerEvent({
    workspace_id: workspaceId,
    message: {
      method: "thread/started",
      params: {
        thread: {
          id: sessionId,
          name: null,
          createdAt: Date.now(),
        },
      },
    },
  });

  return { threadId: sessionId };
}

/**
 * Resume a thread (session).
 */
export async function resumeThread(
  workspaceId: string,
  threadId: string,
): Promise<void> {
  await copilotSdk.resumeSession(workspaceId, threadId);
}

/**
 * Send a user message.
 */
export async function sendUserMessage(
  workspaceId: string,
  _threadId: string,
  text: string,
  options?: {
    model?: string | null;
    images?: string[];
  },
): Promise<void> {
  // Emit turn started
  emitAppServerEvent({
    workspace_id: workspaceId,
    message: {
      method: "turn/started",
      params: {
        threadId: _threadId,
        turn: {
          id: `turn-${Date.now()}`,
          threadId: _threadId,
        },
      },
    },
  });

  await copilotSdk.sendMessage(workspaceId, text, {
    model: options?.model ?? undefined,
    images: options?.images,
  });
}

/**
 * Interrupt the current turn.
 */
export async function interruptTurn(workspaceId: string): Promise<void> {
  await copilotSdk.abortSession(workspaceId);
}

/**
 * Archive (destroy) a thread.
 */
export async function archiveThread(workspaceId: string): Promise<void> {
  await copilotSdk.destroySession(workspaceId);
}

/**
 * List available models.
 */
export async function listModels(
  workspaceId: string,
): Promise<{ models: Array<{ id: string; displayName: string }> }> {
  const result = await copilotSdk.listModels(workspaceId);
  return {
    models: result.models.map((m) => ({
      id: m.id,
      displayName: m.name,
    })),
  };
}

/**
 * Get account/auth status.
 */
export async function getAccountInfo(
  workspaceId: string,
): Promise<{ authenticated: boolean; user?: string }> {
  return copilotSdk.getAuthStatus(workspaceId);
}

/**
 * Check if workspace is connected.
 */
export function isConnected(workspaceId: string): boolean {
  return copilotSdk.isWorkspaceConnected(workspaceId);
}

/**
 * Cleanup all connections on app exit.
 */
export async function cleanup(): Promise<void> {
  await copilotSdk.disconnectAll();
}
