import { randomUUID } from 'crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  HookInput,
  PermissionResult,
  SDKAssistantMessage,
  SDKMessage,
  SDKPartialAssistantMessage,
  SDKResultMessage,
  SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';
import type { JsonRpcHandler } from './rpc.js';
import type { SessionState, TurnStartParams, TurnInput } from './types.js';

// Map reasoning effort to maxThinkingTokens for the Claude SDK
const EFFORT_TO_THINKING_TOKENS: Record<string, number | undefined> = {
  default: undefined, // Let SDK decide
  low: 4096,
  medium: 16384,
  high: 65536,
};

type StoredThread = {
  id: string;
  cwd: string;
  createdAt: number;
  updatedAt: number;
  preview?: string;
  sessionId?: string | null;
  turns: StoredTurn[];
};

type StoredTurn = {
  id: string;
  createdAt: number;
  items: StoredItem[];
};

type FileChange = {
  path: string;
  kind?: 'add' | 'modify' | 'delete';
  diff?: string;
};

type StoredItem =
  | {
      id: string;
      type: 'userMessage';
      content: TurnInput[];
    }
  | {
      id: string;
      type: 'agentMessage';
      text: string;
    }
  | {
      id: string;
      type: 'reasoning';
      summary?: string;
      content?: string;
    }
  | {
      id: string;
      type: 'commandExecution';
      command?: string | string[];
      cwd?: string;
      status?: string;
      aggregatedOutput?: string;
    }
  | {
      id: string;
      type: 'fileChange';
      changes?: FileChange[];
      cwd?: string;
      status?: string;
      diff?: string;
    };

type ToolKind = 'commandExecution' | 'fileChange';
type ToolOutputMethod = 'item/commandExecution/outputDelta' | 'item/fileChange/outputDelta';

type ClaudeSessionConfig = {
  workspaceId: string;
  dataDir?: string | null;
  claudeCodePath?: string | null;
};

type SessionUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  totalCostUsd: number;
  turnCount: number;
  startedAt: number;
};

type ToolStartEvent = {
  method: 'item/started';
  params: {
    threadId: string;
    turnId: string;
    item: StoredItem;
  };
};

type ToolOutputEvent = {
  method: ToolOutputMethod;
  params: {
    threadId: string;
    turnId: string;
    itemId: string;
    delta: string;
  };
};

type TurnErrorEvent = {
  method: 'error';
  params: {
    threadId: string;
    turnId: string;
    error: { message: string };
    willRetry: boolean;
  };
};

export function mapDecisionToPermissionResult(
  response: unknown,
  toolUseId?: string,
  originalInput?: Record<string, unknown>,
): PermissionResult {
  const data = response as { decision?: string; approved?: boolean } | null;
  // Claude SDK expects { behavior: 'allow', updatedInput: Record } for allow
  if (data?.approved === true || data?.decision === 'accept') {
    return {
      behavior: 'allow',
      updatedInput: originalInput ?? {},
      toolUseID: toolUseId,
    };
  }
  if (data?.decision === 'decline') {
    return {
      behavior: 'deny',
      message: 'Tool use denied by user.',
      toolUseID: toolUseId,
    };
  }
  return {
    behavior: 'deny',
    message: 'Tool use denied.',
    toolUseID: toolUseId,
  };
}

export function buildToolStartEvent(
  threadId: string,
  turnId: string,
  item: StoredItem,
): ToolStartEvent {
  return {
    method: 'item/started',
    params: { threadId, turnId, item },
  };
}

export function buildToolOutputEvent(
  threadId: string,
  turnId: string,
  itemId: string,
  delta: string,
  method: ToolOutputMethod,
): ToolOutputEvent {
  return {
    method,
    params: { threadId, turnId, itemId, delta },
  };
}

export function buildTurnErrorEvent(
  threadId: string,
  turnId: string,
  message: string,
): TurnErrorEvent {
  return {
    method: 'error',
    params: {
      threadId,
      turnId,
      error: { message },
      willRetry: false,
    },
  };
}

function formatToolOutput(toolResponse: unknown): string {
  if (toolResponse === null || toolResponse === undefined) {
    return '';
  }
  if (typeof toolResponse === 'string') {
    return toolResponse;
  }
  if (typeof toolResponse === 'number' || typeof toolResponse === 'boolean') {
    return String(toolResponse);
  }
  try {
    return JSON.stringify(toolResponse, null, 2);
  } catch {
    return String(toolResponse);
  }
}

function extractPreview(inputs: TurnInput[]): string {
  for (const input of inputs) {
    if (input.type === 'text' && input.text) {
      const trimmed = input.text.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }
  return '';
}

function inferToolKind(toolName: string): ToolKind {
  const normalized = toolName.toLowerCase();
  if (
    normalized.includes('write') ||
    normalized.includes('edit') ||
    normalized.includes('str_replace')
  ) {
    return 'fileChange';
  }
  return 'commandExecution';
}

function inferFileChangeKind(toolName: string): FileChange['kind'] {
  const normalized = toolName.toLowerCase();
  if (normalized.includes('write')) {
    return 'add';
  }
  if (normalized.includes('delete') || normalized.includes('remove')) {
    return 'delete';
  }
  return 'modify';
}

function formatCommand(toolName: string, toolInput: Record<string, unknown>): string {
  const normalized = toolName.toLowerCase();
  const command = toolInput.command;
  if (normalized === 'bash' && typeof command === 'string') {
    return command;
  }
  if (normalized === 'grep' && typeof toolInput.pattern === 'string') {
    return `grep ${toolInput.pattern}`;
  }
  if (normalized === 'glob' && typeof toolInput.pattern === 'string') {
    return `glob ${toolInput.pattern}`;
  }
  if (normalized === 'websearch' && typeof toolInput.query === 'string') {
    return `websearch ${toolInput.query}`;
  }
  if (normalized === 'webfetch' && typeof toolInput.url === 'string') {
    return `webfetch ${toolInput.url}`;
  }
  return toolName;
}

export function buildToolItem(
  toolName: string,
  toolInput: Record<string, unknown>,
  cwd: string,
  itemId: string,
): { item: StoredItem; outputMethod: ToolOutputMethod } {
  const toolKind = inferToolKind(toolName);
  if (toolKind === 'fileChange') {
    const filePath =
      typeof toolInput.file_path === 'string'
        ? toolInput.file_path
        : typeof toolInput.path === 'string'
          ? toolInput.path
          : typeof toolInput.filePath === 'string'
            ? toolInput.filePath
            : '';
    const changes = filePath
      ? [{ path: filePath, kind: inferFileChangeKind(toolName) }]
      : [];
    return {
      item: {
        id: itemId,
        type: 'fileChange',
        cwd,
        status: 'running',
        changes,
        diff: '',
      },
      outputMethod: 'item/fileChange/outputDelta',
    };
  }

  return {
    item: {
      id: itemId,
      type: 'commandExecution',
      cwd,
      status: 'running',
      command: formatCommand(toolName, toolInput),
      aggregatedOutput: '',
    },
    outputMethod: 'item/commandExecution/outputDelta',
  };
}

type ContentBlock = { type: string; text?: string; thinking?: string };

function extractAssistantText(message: SDKAssistantMessage['message']): string {
  const blocks = Array.isArray(message.content) ? message.content : [];
  return blocks
    .filter((block: ContentBlock) => block.type === 'text')
    .map((block: ContentBlock) => block.text ?? '')
    .join('')
    .trim();
}

function extractAssistantThinking(message: SDKAssistantMessage['message']): string {
  const blocks = Array.isArray(message.content) ? message.content : [];
  return blocks
    .filter((block: ContentBlock) => block.type === 'thinking')
    .map((block: ContentBlock) => block.thinking ?? '')
    .join('')
    .trim();
}

function isStreamEvent(
  message: SDKMessage,
): message is SDKPartialAssistantMessage {
  return message.type === 'stream_event';
}

function isAssistantMessage(
  message: SDKMessage,
): message is SDKAssistantMessage {
  return message.type === 'assistant';
}

function isResultMessage(message: SDKMessage): message is SDKResultMessage {
  return message.type === 'result';
}

/**
 * Manages Claude Agent SDK sessions and translates events to Codex format
 */
export class ClaudeSession {
  private rpc: JsonRpcHandler;
  private sessions: Map<string, SessionState> = new Map();
  private threads: Map<string, StoredThread> = new Map();
  private toolOutputMethods: Map<string, ToolOutputMethod> = new Map();
  private currentTurnId: string | null = null;
  private currentThreadId: string | null = null;
  private currentReasoningItemId: string | null = null;
  private currentReasoningBlockIndex: number | null = null;
  private abortController: AbortController | null = null;
  private approvalRequestId: number = 1;
  private activeQuery: { interrupt?: () => Promise<void> } | null = null;
  private dataPath: string | null = null;
  private loadPromise: Promise<void> | null = null;
  private workspaceId: string;
  private claudeCodePath: string | null;
  private sessionUsage: SessionUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    totalCostUsd: 0,
    turnCount: 0,
    startedAt: Date.now(),
  };

  constructor(rpc: JsonRpcHandler, config: ClaudeSessionConfig) {
    this.rpc = rpc;
    this.workspaceId = config.workspaceId;
    this.claudeCodePath = config.claudeCodePath ?? null;
    if (config.dataDir) {
      this.dataPath = path.join(
        config.dataDir,
        'claude-threads',
        `${config.workspaceId}.json`,
      );
    }
  }

  /**
   * Get current rate limits snapshot for the session
   */
  getRateLimits(): Record<string, unknown> {
    const usage = this.sessionUsage;
    const totalTokens = usage.inputTokens + usage.outputTokens;
    // Use a reasonable session budget for percentage calculation (1M tokens)
    const sessionBudget = 1_000_000;
    const usedPercent = Math.min((totalTokens / sessionBudget) * 100, 100);

    return {
      primary: {
        usedPercent,
        windowDurationMins: null,
        resetsAt: null,
      },
      secondary: null,
      credits: {
        hasCredits: true,
        unlimited: false,
        balance: `$${usage.totalCostUsd.toFixed(4)}`,
      },
      planType: 'claude-api',
      // Additional Claude-specific stats
      usage: {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadTokens: usage.cacheReadTokens,
        cacheCreationTokens: usage.cacheCreationTokens,
        totalTokens,
        totalCostUsd: usage.totalCostUsd,
        turnCount: usage.turnCount,
        sessionDurationMs: Date.now() - usage.startedAt,
      },
    };
  }

  /**
   * Emit rate limits update notification
   */
  private emitRateLimitsUpdate(): void {
    this.rpc.notify('account/rateLimits/updated', {
      rateLimits: this.getRateLimits(),
    });
  }

  private async ensureLoaded(): Promise<void> {
    if (!this.loadPromise) {
      this.loadPromise = this.loadThreads();
    }
    return this.loadPromise;
  }

  private async loadThreads(): Promise<void> {
    if (!this.dataPath) {
      return;
    }
    try {
      const raw = await fs.readFile(this.dataPath, 'utf8');
      const parsed = JSON.parse(raw) as { threads?: StoredThread[] } | null;
      const threads = Array.isArray(parsed?.threads) ? parsed?.threads : [];
      threads.forEach((thread) => {
        if (!thread?.id || !thread?.cwd) {
          return;
        }
        this.threads.set(thread.id, thread);
        this.sessions.set(thread.id, {
          sessionId: thread.sessionId ?? null,
          threadId: thread.id,
          cwd: thread.cwd,
          initialized: true,
        });
      });
    } catch {
      // Ignore missing or malformed thread history.
    }
  }

  private async persistThreads(): Promise<void> {
    if (!this.dataPath) {
      return;
    }
    const dir = path.dirname(this.dataPath);
    await fs.mkdir(dir, { recursive: true });
    const payload = {
      threads: Array.from(this.threads.values()),
    };
    await fs.writeFile(this.dataPath, JSON.stringify(payload, null, 2));
  }

  private getThread(threadId: string, cwd?: string): StoredThread {
    let thread = this.threads.get(threadId) ?? null;
    if (!thread) {
      thread = {
        id: threadId,
        cwd: cwd ?? process.cwd(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        preview: '',
        sessionId: null,
        turns: [],
      };
      this.threads.set(threadId, thread);
    }
    return thread;
  }

  private getTurn(thread: StoredThread, turnId: string): StoredTurn {
    let turn = thread.turns.find((item) => item.id === turnId) ?? null;
    if (!turn) {
      turn = { id: turnId, createdAt: Date.now(), items: [] };
      thread.turns.push(turn);
    }
    return turn;
  }

  private touchThread(thread: StoredThread): void {
    thread.updatedAt = Date.now();
  }

  private upsertAgentMessage(
    thread: StoredThread,
    turn: StoredTurn,
    itemId: string,
    delta: string,
    isFinal: boolean,
  ): void {
    type AgentMessageItem = Extract<StoredItem, { type: 'agentMessage' }>;
    let item = turn.items.find(
      (entry): entry is AgentMessageItem => entry.id === itemId && entry.type === 'agentMessage',
    );
    if (!item) {
      item = { id: itemId, type: 'agentMessage', text: '' };
      turn.items.push(item);
    }
    item.text = isFinal ? delta : `${item.text}${delta}`;
  }

  private upsertReasoningMessage(
    _thread: StoredThread,
    turn: StoredTurn,
    itemId: string,
    delta: string,
    isFinal: boolean,
  ): void {
    type ReasoningItem = Extract<StoredItem, { type: 'reasoning' }>;
    let item = turn.items.find(
      (entry): entry is ReasoningItem => entry.id === itemId && entry.type === 'reasoning',
    );
    if (!item) {
      item = { id: itemId, type: 'reasoning', content: '' };
      turn.items.push(item);
    }
    const current = item.content ?? '';
    item.content = isFinal ? delta : `${current}${delta}`;
  }

  private upsertToolOutput(
    turn: StoredTurn,
    itemId: string,
    delta: string,
    method: ToolOutputMethod,
  ): void {
    type CommandItem = Extract<StoredItem, { type: 'commandExecution' }>;
    type FileChangeItem = Extract<StoredItem, { type: 'fileChange' }>;
    if (method === 'item/fileChange/outputDelta') {
      const item = turn.items.find(
        (entry): entry is FileChangeItem => entry.id === itemId && entry.type === 'fileChange',
      );
      if (!item) {
        return;
      }
      const current = item.diff ?? '';
      item.diff = `${current}${delta}`;
      if (Array.isArray(item.changes) && item.changes.length > 0) {
        const change = item.changes[0];
        const currentDiff = change.diff ?? '';
        change.diff = `${currentDiff}${delta}`;
      }
      return;
    }
    const item = turn.items.find(
      (entry): entry is CommandItem => entry.id === itemId && entry.type === 'commandExecution',
    );
    if (!item) {
      return;
    }
    const current = item.aggregatedOutput ?? '';
    item.aggregatedOutput = `${current}${delta}`;
  }

  private async buildUserMessage(
    inputs: TurnInput[],
    sessionId: string | null,
  ): Promise<SDKUserMessage> {
    const blocks: Array<Record<string, unknown>> = [];
    for (const input of inputs) {
      if (input.type === 'text' && input.text) {
        const trimmed = input.text.trim();
        if (trimmed) {
          blocks.push({ type: 'text', text: trimmed });
        }
      }
      if (input.type === 'image' && input.url) {
        // Handle data URIs by converting to base64 format
        if (input.url.startsWith('data:')) {
          const match = input.url.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            const [, mediaType, base64Data] = match;
            blocks.push({
              type: 'image',
              source: { type: 'base64', data: base64Data, media_type: mediaType },
            });
          } else {
            this.rpc.notify('codex/stderr', {
              message: `Invalid data URI format: ${input.url.substring(0, 50)}...`,
            });
          }
        } else {
          // Regular HTTP/HTTPS URLs
          blocks.push({
            type: 'image',
            source: { type: 'url', url: input.url },
          });
        }
      }
      if (input.type === 'localImage' && input.path) {
        try {
          const data = await fs.readFile(input.path);
          const base64 = data.toString('base64');
          const ext = path.extname(input.path).toLowerCase();
          const mediaType =
            ext === '.jpg' || ext === '.jpeg'
              ? 'image/jpeg'
              : ext === '.gif'
                ? 'image/gif'
                : ext === '.webp'
                  ? 'image/webp'
                  : 'image/png';
          blocks.push({
            type: 'image',
            source: { type: 'base64', data: base64, media_type: mediaType },
          });
        } catch (error) {
          this.rpc.notify('codex/stderr', {
            message: `Failed to read image at ${input.path}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          });
        }
      }
    }

    return {
      type: 'user',
      session_id: sessionId ?? '',
      parent_tool_use_id: null,
      message: {
        role: 'user',
        content: blocks.length ? blocks : [{ type: 'text', text: '' }],
      },
    };
  }

  private async buildPromptInput(
    inputs: TurnInput[],
    sessionId: string | null,
  ): Promise<string | AsyncIterable<SDKUserMessage>> {
    const message = await this.buildUserMessage(inputs, sessionId);
    return (async function* () {
      yield message;
    })();
  }

  /**
   * Handle tool approval - called by Claude SDK's canUseTool callback
   * Sends a JSON-RPC request to the client and waits for response
   */
  async requestToolApproval(
    toolName: string,
    args: Record<string, unknown>,
    details: {
      toolUseId?: string;
      blockedPath?: string;
      decisionReason?: string;
      suggestions?: unknown;
    },
  ): Promise<PermissionResult> {
    const requestId = this.approvalRequestId++;

    try {
      const response = await this.rpc.request('codex/requestApproval/tool', {
        threadId: this.currentThreadId,
        turnId: this.currentTurnId,
        tool: toolName,
        args,
        blockedPath: details.blockedPath,
        decisionReason: details.decisionReason,
        toolUseId: details.toolUseId,
        suggestions: details.suggestions,
        requestId,
      });

      return mapDecisionToPermissionResult(response, details.toolUseId, args);
    } catch {
      return {
        behavior: 'deny',
        message: 'Tool approval request failed.',
        toolUseID: details.toolUseId,
      };
    }
  }

  /**
   * Start a new thread (creates a new Claude session)
   */
  async startThread(cwd: string): Promise<{ threadId: string; thread: StoredThread }> {
    await this.ensureLoaded();
    const threadId = randomUUID();
    const thread = this.getThread(threadId, cwd);
    this.sessions.set(threadId, {
      sessionId: thread.sessionId ?? null,
      threadId,
      cwd,
      initialized: true,
    });
    await this.persistThreads();

    return { threadId, thread };
  }

  /**
   * Resume an existing thread
   */
  async resumeThread(
    threadId: string,
  ): Promise<{ threadId: string; thread: StoredThread }> {
    await this.ensureLoaded();
    const thread = this.getThread(threadId);
    this.sessions.set(threadId, {
      sessionId: thread.sessionId ?? null,
      threadId,
      cwd: thread.cwd,
      initialized: true,
    });

    return { threadId, thread };
  }

  async listThreads(
    cursor: string | null,
    limit: number,
  ): Promise<{ data: StoredThread[]; nextCursor: string | null }> {
    await this.ensureLoaded();
    const threads = Array.from(this.threads.values()).sort(
      (a, b) => b.updatedAt - a.updatedAt,
    );
    const start = cursor ? Number(cursor) : 0;
    const slice = threads.slice(start, start + limit);
    const nextCursor = start + slice.length < threads.length ? `${start + slice.length}` : null;
    return { data: slice, nextCursor };
  }

  async archiveThread(threadId: string): Promise<{ success: boolean }> {
    await this.ensureLoaded();
    this.threads.delete(threadId);
    this.sessions.delete(threadId);
    await this.persistThreads();
    return { success: true };
  }

  /**
   * Start a new turn (send message to Claude)
   */
  async startTurn(params: TurnStartParams): Promise<{ turn: { id: string } }> {
    await this.ensureLoaded();
    const session = this.sessions.get(params.threadId);
    if (!session) {
      throw new Error('Thread not found');
    }

    const turnId = randomUUID();
    this.currentTurnId = turnId;
    this.currentThreadId = params.threadId;
    this.currentReasoningItemId = null;
    this.currentReasoningBlockIndex = null;
    this.abortController = new AbortController();

    const thread = this.getThread(params.threadId, params.cwd);
    const turn = this.getTurn(thread, turnId);
    const userItem: StoredItem = {
      id: randomUUID(),
      type: 'userMessage',
      content: params.input,
    };
    turn.items.push(userItem);
    const preview = extractPreview(params.input);
    if (!thread.preview && preview) {
      thread.preview = preview;
    }
    this.touchThread(thread);
    await this.persistThreads();

    // Emit turn started
    this.rpc.notify('turn/started', {
      threadId: params.threadId,
      turnId,
    });

    // Build prompt from input
    const prompt = await this.buildPromptInput(params.input, session.sessionId ?? null);

    // Start processing in background
    this.processWithClaude(session, thread, turn, turnId, prompt, params).catch((error) => {
      const payload = buildTurnErrorEvent(
        params.threadId,
        turnId,
        error instanceof Error ? error.message : String(error),
      );
      this.rpc.notify(payload.method, payload.params);
    });

    return { turn: { id: turnId } };
  }

  /**
   * Interrupt the current turn
   */
  async interruptTurn(threadId: string, turnId: string): Promise<void> {
    if (this.currentTurnId === turnId && this.abortController) {
      this.abortController.abort();
      if (this.activeQuery?.interrupt) {
        await this.activeQuery.interrupt().catch(() => {});
      }
      this.rpc.notify('turn/completed', {
        threadId,
        turnId,
        interrupted: true,
      });
    }
  }

  private async processWithClaude(
    session: SessionState,
    thread: StoredThread,
    turn: StoredTurn,
    turnId: string,
    prompt: string | AsyncIterable<SDKUserMessage>,
    params: TurnStartParams,
  ): Promise<void> {
    try {
      const { query } = await import('@anthropic-ai/claude-agent-sdk');
      const approvalPolicy = params.approvalPolicy ?? 'on-request';
      const bypass = approvalPolicy === 'never';
      const canUseTool = async (
        toolName: string,
        input: Record<string, unknown>,
        options: {
          blockedPath?: string;
          decisionReason?: string;
          suggestions?: unknown;
          toolUseID: string;
        },
      ): Promise<PermissionResult> => {
        if (bypass) {
          return { behavior: 'allow', toolUseID: options.toolUseID };
        }
        return this.requestToolApproval(toolName, input, {
          toolUseId: options.toolUseID,
          blockedPath: options.blockedPath,
          decisionReason: options.decisionReason,
          suggestions: options.suggestions,
        });
      };

      const hooks = {
        PreToolUse: [
          {
            hooks: [async (input: HookInput, toolUseID: string | undefined) => {
              if (input.hook_event_name !== 'PreToolUse') {
                return { continue: true };
              }
              const toolUseId = toolUseID ?? input.tool_use_id;
              const toolInput = input.tool_input as Record<string, unknown>;
              if (!this.currentThreadId || !this.currentTurnId) {
                return { continue: true };
              }
              if (toolUseId && this.toolOutputMethods.has(toolUseId)) {
                return { continue: true };
              }
              const itemId = toolUseId ?? randomUUID();
              const toolCwd =
                typeof input.cwd === 'string' && input.cwd ? input.cwd : thread.cwd;
              const { item, outputMethod } = buildToolItem(
                input.tool_name,
                toolInput,
                toolCwd,
                itemId,
              );
              this.toolOutputMethods.set(itemId, outputMethod);
              turn.items.push(item);
              this.touchThread(thread);
              const payload = buildToolStartEvent(
                this.currentThreadId,
                this.currentTurnId,
                item,
              );
              this.rpc.notify(payload.method, payload.params);
              return { continue: true };
            }],
          },
        ],
        PostToolUse: [
          {
            hooks: [async (input: HookInput, toolUseID: string | undefined) => {
              if (input.hook_event_name !== 'PostToolUse') {
                return { continue: true };
              }
              if (!this.currentThreadId || !this.currentTurnId) {
                return { continue: true };
              }
              const toolUseId = toolUseID ?? input.tool_use_id;
              if (!toolUseId) {
                return { continue: true };
              }
              const outputMethod =
                this.toolOutputMethods.get(toolUseId) ??
                'item/commandExecution/outputDelta';
              const delta = formatToolOutput(input.tool_response);
              if (delta) {
                this.upsertToolOutput(turn, toolUseId, delta, outputMethod);
                this.touchThread(thread);
                const payload = buildToolOutputEvent(
                  this.currentThreadId,
                  this.currentTurnId,
                  toolUseId,
                  delta,
                  outputMethod,
                );
                this.rpc.notify(payload.method, payload.params);
              }
              this.finalizeToolItem(thread, turn, turnId, toolUseId, 'completed');
              await this.persistThreads();
              return { continue: true };
            }],
          },
        ],
        PostToolUseFailure: [
          {
            hooks: [async (input: HookInput, toolUseID: string | undefined) => {
              if (input.hook_event_name !== 'PostToolUseFailure') {
                return { continue: true };
              }
              if (!this.currentThreadId || !this.currentTurnId) {
                return { continue: true };
              }
              const toolUseId = toolUseID ?? input.tool_use_id;
              if (!toolUseId) {
                return { continue: true };
              }
              const outputMethod =
                this.toolOutputMethods.get(toolUseId) ??
                'item/commandExecution/outputDelta';
              const delta = formatToolOutput(input.error);
              if (delta) {
                this.upsertToolOutput(turn, toolUseId, delta, outputMethod);
                this.touchThread(thread);
                const payload = buildToolOutputEvent(
                  this.currentThreadId,
                  this.currentTurnId,
                  toolUseId,
                  delta,
                  outputMethod,
                );
                this.rpc.notify(payload.method, payload.params);
              }
              this.finalizeToolItem(thread, turn, turnId, toolUseId, 'failed');
              await this.persistThreads();
              return { continue: true };
            }],
          },
        ],
      };

      // Determine maxThinkingTokens from effort parameter
      const effort = params.effort ?? 'default';
      const maxThinkingTokens = EFFORT_TO_THINKING_TOKENS[effort];

      const options = {
        cwd: params.cwd || session.cwd,
        model: params.model,
        permissionMode: bypass ? 'bypassPermissions' : 'default',
        allowDangerouslySkipPermissions: bypass,
        systemPrompt: {
          type: 'preset',
          preset: 'claude_code',
        },
        tools: {
          type: 'preset',
          preset: 'claude_code',
        },
        settingSources: ['user', 'project', 'local'],
        resume: session.sessionId ?? undefined,
        canUseTool,
        hooks,
        includePartialMessages: true,
        persistSession: true,
        abortController: this.abortController ?? undefined,
        stderr: (data: string) => {
          this.rpc.notify('codex/stderr', { message: data.trim() });
        },
        pathToClaudeCodeExecutable: this.claudeCodePath ?? undefined,
        maxThinkingTokens,
      } satisfies Parameters<typeof query>[0]['options'];

      // Start an agent message item
      const itemId = randomUUID();
      this.rpc.notify('item/started', {
        threadId: thread.id,
        turnId,
        item: {
          id: itemId,
          type: 'agentMessage',
        },
      });

      let fullContent = '';

      const queryInstance = query({ prompt, options });
      this.activeQuery = queryInstance;

      for await (const message of queryInstance) {
        if (this.abortController?.signal.aborted) {
          break;
        }
        const updated = await this.handleSdkMessage(
          thread,
          turn,
          turnId,
          itemId,
          message,
        );
        if (updated) {
          fullContent = updated;
        }
        const sessionId = (message as { session_id?: string }).session_id;
        if (sessionId && session.sessionId !== sessionId) {
          session.sessionId = sessionId;
          thread.sessionId = sessionId;
          await this.persistThreads();
        }
      }

      // Complete the item
      this.rpc.notify('item/completed', {
        threadId: thread.id,
        turnId,
        item: {
          id: itemId,
          type: 'agentMessage',
          text: fullContent,
        },
      });

      // Complete the turn
      if (!this.abortController?.signal.aborted) {
        this.rpc.notify('turn/completed', {
          threadId: thread.id,
          turnId,
          interrupted: false,
        });
      }

      await this.persistThreads();
    } catch (error) {
      const payload = buildTurnErrorEvent(
        thread.id,
        turnId,
        error instanceof Error ? error.message : 'Claude SDK error',
      );
      this.rpc.notify(payload.method, payload.params);
      await this.persistThreads();
    } finally {
      this.currentTurnId = null;
      this.currentThreadId = null;
      this.currentReasoningItemId = null;
      this.currentReasoningBlockIndex = null;
      this.abortController = null;
      this.activeQuery = null;
    }
  }

  private async handleSdkMessage(
    thread: StoredThread,
    turn: StoredTurn,
    turnId: string,
    itemId: string,
    message: SDKMessage,
  ): Promise<string | null> {
    if (isStreamEvent(message)) {
      const event = message.event;
      if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          const delta = event.delta.text ?? '';
          if (delta) {
            this.rpc.notify('item/agentMessage/delta', {
              threadId: thread.id,
              turnId,
              itemId,
              delta,
            });
            this.upsertAgentMessage(thread, turn, itemId, delta, false);
            this.touchThread(thread);
          }
        }
        if (event.delta.type === 'thinking_delta') {
          const delta = event.delta.thinking ?? '';
          if (delta) {
            if (!this.currentReasoningItemId) {
              // Fallback: create reasoning item if we missed content_block_start
              const reasoningId = randomUUID();
              this.currentReasoningItemId = reasoningId;
              const reasoningItem: StoredItem = {
                id: reasoningId,
                type: 'reasoning',
                summary: '',
                content: '',
              };
              turn.items.push(reasoningItem);
              this.touchThread(thread);
              this.rpc.notify('item/started', {
                threadId: thread.id,
                turnId,
                item: reasoningItem,
              });
            }
            const reasoningId = this.currentReasoningItemId;
            // Emit both summaryTextDelta (for UI preview) and textDelta (for full content)
            this.rpc.notify('item/reasoning/summaryTextDelta', {
              threadId: thread.id,
              turnId,
              itemId: reasoningId,
              delta,
            });
            this.rpc.notify('item/reasoning/textDelta', {
              threadId: thread.id,
              turnId,
              itemId: reasoningId,
              delta,
            });
            this.upsertReasoningMessage(thread, turn, reasoningId, delta, false);
            this.touchThread(thread);
          }
        }
      }
      if (event.type === 'content_block_start') {
        const block = event.content_block as { type: string; id?: string; name?: string; input?: unknown };
        const blockIndex = (event as { index?: number }).index;
        if (block.type === 'thinking' && this.currentThreadId && this.currentTurnId) {
          // Start a new reasoning block
          const reasoningId = randomUUID();
          this.currentReasoningItemId = reasoningId;
          this.currentReasoningBlockIndex = blockIndex ?? null;
          const reasoningItem: StoredItem = {
            id: reasoningId,
            type: 'reasoning',
            summary: '',
            content: '',
          };
          turn.items.push(reasoningItem);
          this.touchThread(thread);
          this.rpc.notify('item/started', {
            threadId: thread.id,
            turnId,
            item: reasoningItem,
          });
        }
        if (block.type === 'tool_use' && this.currentThreadId && this.currentTurnId) {
          const toolUseId = block.id ?? randomUUID();
          if (!this.toolOutputMethods.has(toolUseId)) {
            const toolInput = (block.input as Record<string, unknown>) ?? {};
            const { item, outputMethod } = buildToolItem(
              block.name ?? 'Tool',
              toolInput,
              thread.cwd,
              toolUseId,
            );
            this.toolOutputMethods.set(toolUseId, outputMethod);
            turn.items.push(item);
            this.touchThread(thread);
            const payload = buildToolStartEvent(
              this.currentThreadId,
              this.currentTurnId,
              item,
            );
            this.rpc.notify(payload.method, payload.params);
          }
        }
      }
      if (event.type === 'content_block_stop') {
        const blockIndex = (event as { index?: number }).index;
        // Check if this is the end of a thinking block
        if (
          this.currentReasoningItemId &&
          this.currentReasoningBlockIndex !== null &&
          blockIndex === this.currentReasoningBlockIndex &&
          this.currentThreadId &&
          this.currentTurnId
        ) {
          // Find the reasoning item and emit completed
          const reasoningItem = turn.items.find(
            (entry) => entry.id === this.currentReasoningItemId && entry.type === 'reasoning',
          );
          if (reasoningItem) {
            this.rpc.notify('item/completed', {
              threadId: thread.id,
              turnId,
              item: reasoningItem,
            });
          }
          this.currentReasoningBlockIndex = null;
        }
      }
      return null;
    }

    if (isAssistantMessage(message)) {
      const assistantText = extractAssistantText(message.message);
      if (assistantText) {
        this.upsertAgentMessage(thread, turn, itemId, assistantText, true);
        this.touchThread(thread);
        return assistantText;
      }
      const reasoning = extractAssistantThinking(message.message);
      if (reasoning) {
        const reasoningId = this.currentReasoningItemId ?? randomUUID();
        this.currentReasoningItemId = reasoningId;
        this.upsertReasoningMessage(thread, turn, reasoningId, reasoning, true);
        this.touchThread(thread);
      }
      return null;
    }

    if (isResultMessage(message)) {
      const errors =
        'errors' in message && Array.isArray(message.errors)
          ? message.errors
          : [];
      if (message.subtype && message.subtype.startsWith('error')) {
        const errorText = errors.length
          ? errors.join('\n')
          : 'Claude SDK execution failed.';
        const payload = buildTurnErrorEvent(thread.id, turnId, errorText);
        this.rpc.notify(payload.method, payload.params);
      }

      // Extract usage information from successful results
      if (message.subtype === 'success') {
        const result = message as {
          usage?: {
            input_tokens?: number;
            output_tokens?: number;
            cache_read_input_tokens?: number;
            cache_creation_input_tokens?: number;
          };
          modelUsage?: Record<
            string,
            {
              inputTokens?: number;
              outputTokens?: number;
              cacheReadInputTokens?: number;
              cacheCreationInputTokens?: number;
            }
          >;
          total_cost_usd?: number;
        };

        // Aggregate usage from modelUsage (more detailed) or fallback to usage
        if (result.modelUsage) {
          for (const modelStats of Object.values(result.modelUsage)) {
            this.sessionUsage.inputTokens += modelStats.inputTokens ?? 0;
            this.sessionUsage.outputTokens += modelStats.outputTokens ?? 0;
            this.sessionUsage.cacheReadTokens += modelStats.cacheReadInputTokens ?? 0;
            this.sessionUsage.cacheCreationTokens += modelStats.cacheCreationInputTokens ?? 0;
          }
        } else if (result.usage) {
          this.sessionUsage.inputTokens += result.usage.input_tokens ?? 0;
          this.sessionUsage.outputTokens += result.usage.output_tokens ?? 0;
          this.sessionUsage.cacheReadTokens += result.usage.cache_read_input_tokens ?? 0;
          this.sessionUsage.cacheCreationTokens += result.usage.cache_creation_input_tokens ?? 0;
        }

        if (typeof result.total_cost_usd === 'number') {
          this.sessionUsage.totalCostUsd += result.total_cost_usd;
        }
        this.sessionUsage.turnCount += 1;

        // Emit updated rate limits
        this.emitRateLimitsUpdate();
      }

      return null;
    }

    return null;
  }

  private finalizeToolItem(
    thread: StoredThread,
    turn: StoredTurn,
    turnId: string,
    itemId: string,
    status: string,
  ): void {
    const item = turn.items.find(
      (entry) =>
        entry.id === itemId &&
        (entry.type === 'commandExecution' || entry.type === 'fileChange'),
    ) as
      | Extract<StoredItem, { type: 'commandExecution' | 'fileChange' }>
      | undefined;
    if (!item) {
      return;
    }
    item.status = status;
    this.toolOutputMethods.delete(itemId);
    this.touchThread(thread);
    this.rpc.notify('item/completed', {
      threadId: thread.id,
      turnId,
      item,
    });
  }
}
