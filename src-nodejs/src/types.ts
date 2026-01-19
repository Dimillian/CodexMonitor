/**
 * JSON-RPC 2.0 types for the bridge protocol
 */

export interface JsonRpcRequest {
  id?: number;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  id: number;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcNotification {
  method: string;
  params?: unknown;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

/**
 * Initialize request params (matching Codex protocol)
 */
export interface InitializeParams {
  clientInfo: {
    name: string;
    title: string;
    version: string;
  };
}

/**
 * Thread/Turn related params
 */
export interface ThreadStartParams {
  cwd: string;
  approvalPolicy?: 'on-request' | 'never';
}

export interface ThreadResumeParams {
  threadId: string;
}

export interface TurnStartParams {
  threadId: string;
  input: TurnInput[];
  cwd: string;
  approvalPolicy?: 'on-request' | 'never';
  sandboxPolicy?: SandboxPolicy;
  model?: string;
  effort?: string;
  collaborationMode?: unknown;
}

export interface TurnInput {
  type: 'text' | 'image' | 'localImage';
  text?: string;
  url?: string;
  path?: string;
}

export interface SandboxPolicy {
  type: 'dangerFullAccess' | 'readOnly' | 'workspaceWrite';
  writableRoots?: string[];
  networkAccess?: boolean;
}

export interface TurnInterruptParams {
  threadId: string;
  turnId: string;
}

/**
 * Session state tracking
 */
export interface SessionState {
  sessionId: string;
  threadId: string;
  cwd: string;
  initialized: boolean;
}

/**
 * Approval request from Claude SDK
 */
export interface ApprovalRequest {
  id: number;
  method: string;
  params: {
    tool: string;
    args: unknown;
    description?: string;
  };
}
