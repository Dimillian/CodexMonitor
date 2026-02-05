/**
 * Copilot SDK Service
 *
 * Low-level wrapper around @github/copilot-sdk that manages client lifecycle
 * and provides a workspace-centric API similar to the Codex app-server pattern.
 */

import {
  CopilotClient,
  CopilotSession,
  type CopilotClientOptions,
  type SessionConfig,
  type SessionEvent,
  type MessageOptions,
  type PermissionRequest,
  type PermissionRequestResult,
} from "@github/copilot-sdk";

export type CopilotWorkspaceClient = {
  client: CopilotClient;
  session: CopilotSession | null;
  workspacePath: string;
  connected: boolean;
};

export type CopilotEventCallback = (
  workspaceId: string,
  event: SessionEvent,
) => void;

export type CopilotPermissionCallback = (
  workspaceId: string,
  request: PermissionRequest,
) => Promise<PermissionRequestResult>;

type WorkspaceClients = Map<string, CopilotWorkspaceClient>;

const workspaceClients: WorkspaceClients = new Map();
let globalEventCallback: CopilotEventCallback | null = null;
let globalPermissionCallback: CopilotPermissionCallback | null = null;

/** Get the current permission callback (for testing) */
export function getGlobalPermissionCallback(): CopilotPermissionCallback | null {
  return globalPermissionCallback;
}

/**
 * Set the global event callback for all workspaces.
 * Events from any workspace session will be routed through this callback.
 */
export function setGlobalEventCallback(callback: CopilotEventCallback | null) {
  globalEventCallback = callback;
}

/**
 * Set the global permission callback for approval requests.
 */
export function setGlobalPermissionCallback(
  callback: CopilotPermissionCallback | null,
) {
  globalPermissionCallback = callback;
}

/**
 * Connect to Copilot for a workspace.
 * Creates a CopilotClient instance for the workspace.
 */
export async function connectWorkspace(
  workspaceId: string,
  workspacePath: string,
  options?: {
    cliPath?: string;
    cliArgs?: string[];
  },
): Promise<void> {
  console.log("[copilot-sdk] connectWorkspace called:", { workspaceId, workspacePath, options });

  // Disconnect existing client if any
  await disconnectWorkspace(workspaceId);

  const clientOptions: CopilotClientOptions = {
    cwd: workspacePath,
    useStdio: true,
    autoStart: true,
    autoRestart: true,
  };

  if (options?.cliPath) {
    clientOptions.cliPath = options.cliPath;
  }

  if (options?.cliArgs) {
    clientOptions.cliArgs = options.cliArgs;
  }

  console.log("[copilot-sdk] Creating CopilotClient with options:", clientOptions);

  try {
    const client = new CopilotClient(clientOptions);
    console.log("[copilot-sdk] CopilotClient created successfully");

    workspaceClients.set(workspaceId, {
      client,
      session: null,
      workspacePath,
      connected: true,
    });

    // Emit a connected event (synthetic)
    globalEventCallback?.(workspaceId, {
      id: `connected-${Date.now()}`,
      timestamp: new Date().toISOString(),
      parentId: null,
      type: "session.info",
      data: { infoType: "connected", message: "Workspace connected" },
    });
    console.log("[copilot-sdk] Workspace connected successfully");
  } catch (error) {
    console.error("[copilot-sdk] Failed to create CopilotClient:", error);
    throw error;
  }
}

/**
 * Disconnect a workspace's Copilot client.
 */
export async function disconnectWorkspace(workspaceId: string): Promise<void> {
  const workspace = workspaceClients.get(workspaceId);
  if (!workspace) {
    return;
  }

  try {
    if (workspace.session) {
      await workspace.session.destroy();
    }
    await workspace.client.stop();
  } catch (error) {
    console.warn(`[copilot-sdk] Error disconnecting workspace ${workspaceId}:`, error);
  }

  workspaceClients.delete(workspaceId);
}

/**
 * Check if a workspace is connected.
 */
export function isWorkspaceConnected(workspaceId: string): boolean {
  return workspaceClients.has(workspaceId);
}

/**
 * Create a new session (thread) for a workspace.
 */
export async function createSession(
  workspaceId: string,
  config?: Partial<SessionConfig>,
): Promise<string> {
  const workspace = workspaceClients.get(workspaceId);
  if (!workspace) {
    throw new Error(`Workspace ${workspaceId} is not connected`);
  }

  // Destroy existing session if any
  if (workspace.session) {
    await workspace.session.destroy();
    workspace.session = null;
  }

  const sessionConfig: SessionConfig = {
    model: config?.model ?? "claude-sonnet-4",
    streaming: true,
    ...config,
  };

  const session = await workspace.client.createSession(sessionConfig);
  workspace.session = session;

  // Subscribe to all session events and route to global callback
  session.on((event) => {
    globalEventCallback?.(workspaceId, event);
  });

  return session.sessionId;
}

/**
 * Resume an existing session.
 */
export async function resumeSession(
  workspaceId: string,
  sessionId: string,
): Promise<void> {
  const workspace = workspaceClients.get(workspaceId);
  if (!workspace) {
    throw new Error(`Workspace ${workspaceId} is not connected`);
  }

  // Destroy existing session if different
  if (workspace.session && workspace.session.sessionId !== sessionId) {
    await workspace.session.destroy();
    workspace.session = null;
  }

  const session = await workspace.client.resumeSession(sessionId);
  workspace.session = session;

  // Subscribe to all session events
  session.on((event) => {
    globalEventCallback?.(workspaceId, event);
  });
}

/**
 * Send a message to the active session.
 */
export async function sendMessage(
  workspaceId: string,
  text: string,
  options?: {
    model?: string;
    images?: string[];
  },
): Promise<string> {
  const workspace = workspaceClients.get(workspaceId);
  if (!workspace?.session) {
    throw new Error(`No active session for workspace ${workspaceId}`);
  }

  const messageOptions: MessageOptions = {
    prompt: text,
  };

  // Add image attachments if provided
  if (options?.images?.length) {
    messageOptions.attachments = options.images.map((path) => ({
      type: "file" as const,
      path,
    }));
  }

  return workspace.session.send(messageOptions);
}

/**
 * Send a message and wait for completion.
 */
export async function sendMessageAndWait(
  workspaceId: string,
  text: string,
  options?: {
    model?: string;
    images?: string[];
    timeout?: number;
  },
): Promise<string | undefined> {
  const workspace = workspaceClients.get(workspaceId);
  if (!workspace?.session) {
    throw new Error(`No active session for workspace ${workspaceId}`);
  }

  const messageOptions: MessageOptions = {
    prompt: text,
  };

  if (options?.images?.length) {
    messageOptions.attachments = options.images.map((path) => ({
      type: "file" as const,
      path,
    }));
  }

  const response = await workspace.session.sendAndWait(
    messageOptions,
    options?.timeout,
  );

  return response?.data.content;
}

/**
 * Abort the current message processing.
 */
export async function abortSession(workspaceId: string): Promise<void> {
  const workspace = workspaceClients.get(workspaceId);
  if (!workspace?.session) {
    return;
  }

  await workspace.session.abort();
}

/**
 * Destroy the current session.
 */
export async function destroySession(workspaceId: string): Promise<void> {
  const workspace = workspaceClients.get(workspaceId);
  if (!workspace?.session) {
    return;
  }

  await workspace.session.destroy();
  workspace.session = null;
}

/**
 * Get the session ID for a workspace.
 */
export function getSessionId(workspaceId: string): string | null {
  const workspace = workspaceClients.get(workspaceId);
  return workspace?.session?.sessionId ?? null;
}

/**
 * Get messages from the current session.
 */
export async function getSessionMessages(
  workspaceId: string,
): Promise<SessionEvent[]> {
  const workspace = workspaceClients.get(workspaceId);
  if (!workspace?.session) {
    return [];
  }

  return workspace.session.getMessages();
}

/**
 * List available models.
 */
export async function listModels(
  workspaceId: string,
): Promise<{ models: Array<{ id: string; name: string }> }> {
  const workspace = workspaceClients.get(workspaceId);
  if (!workspace) {
    throw new Error(`Workspace ${workspaceId} is not connected`);
  }

  const models = await workspace.client.listModels();
  return {
    models: models.map((m) => ({
      id: m.id,
      name: m.name ?? m.id,
    })),
  };
}

/**
 * Get authentication status.
 */
export async function getAuthStatus(
  workspaceId: string,
): Promise<{ authenticated: boolean; user?: string }> {
  const workspace = workspaceClients.get(workspaceId);
  if (!workspace) {
    throw new Error(`Workspace ${workspaceId} is not connected`);
  }

  const status = await workspace.client.getAuthStatus();
  return {
    authenticated: status.isAuthenticated,
    user: status.login,
  };
}

/**
 * Disconnect all workspaces (cleanup on app exit).
 */
export async function disconnectAll(): Promise<void> {
  const workspaceIds = Array.from(workspaceClients.keys());
  await Promise.all(workspaceIds.map(disconnectWorkspace));
}
