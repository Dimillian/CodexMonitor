import { randomUUID } from 'crypto';
import type { JsonRpcHandler } from './rpc.js';
import type { SessionState, TurnStartParams, TurnInput } from './types.js';

// Claude Agent SDK types (based on the plan's description)
// These will be replaced with actual imports once we verify the SDK package
interface ClaudeMessage {
  type: string;
  content?: unknown;
  tool?: string;
  toolInput?: unknown;
  text?: string;
  delta?: string;
}

interface ClaudeQueryOptions {
  prompt: string;
  options?: {
    allowedTools?: string[];
    model?: string;
    cwd?: string;
    permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';
  };
  resume?: string;
}

/**
 * Manages Claude Agent SDK sessions and translates events to Codex format
 */
export class ClaudeSession {
  private rpc: JsonRpcHandler;
  private sessions: Map<string, SessionState> = new Map();
  private currentTurnId: string | null = null;
  private currentThreadId: string | null = null;
  private abortController: AbortController | null = null;
  private approvalRequestId: number = 1;

  constructor(rpc: JsonRpcHandler) {
    this.rpc = rpc;
  }

  /**
   * Handle tool approval - called by Claude SDK's canUseTool callback
   * Sends a JSON-RPC request to the client and waits for response
   */
  async requestToolApproval(tool: string, args: unknown): Promise<boolean> {
    const requestId = this.approvalRequestId++;

    try {
      // Send approval request matching Codex protocol
      const response = await this.rpc.request('requestApproval/tool', {
        threadId: this.currentThreadId,
        turnId: this.currentTurnId,
        tool,
        args,
        requestId,
      });

      // Response should be { approved: boolean }
      return (response as { approved?: boolean })?.approved === true;
    } catch {
      // If approval request fails, deny by default
      return false;
    }
  }

  /**
   * Start a new thread (creates a new Claude session)
   */
  async startThread(cwd: string): Promise<{ threadId: string }> {
    const threadId = randomUUID();
    const sessionId = randomUUID();

    this.sessions.set(threadId, {
      sessionId,
      threadId,
      cwd,
      initialized: true,
    });

    return { threadId };
  }

  /**
   * Resume an existing thread
   */
  async resumeThread(threadId: string): Promise<{ threadId: string; items: unknown[] }> {
    const session = this.sessions.get(threadId);
    if (!session) {
      // For now, just create a new session with this ID
      // In production, we'd load from persistent storage
      this.sessions.set(threadId, {
        sessionId: threadId,
        threadId,
        cwd: process.cwd(),
        initialized: true,
      });
    }

    return { threadId, items: [] };
  }

  /**
   * Start a new turn (send message to Claude)
   */
  async startTurn(params: TurnStartParams): Promise<{ turnId: string }> {
    const session = this.sessions.get(params.threadId);
    if (!session) {
      throw new Error('Thread not found');
    }

    const turnId = randomUUID();
    this.currentTurnId = turnId;
    this.currentThreadId = params.threadId;
    this.abortController = new AbortController();

    // Emit turn started
    this.rpc.notify('turn/started', {
      threadId: params.threadId,
      turnId,
    });

    // Build prompt from input
    const prompt = this.buildPrompt(params.input);

    // Start processing in background
    this.processWithClaude(session, turnId, prompt, params).catch((error) => {
      this.rpc.notify('turn/error', {
        threadId: params.threadId,
        turnId,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    return { turnId };
  }

  /**
   * Interrupt the current turn
   */
  async interruptTurn(threadId: string, turnId: string): Promise<void> {
    if (this.currentTurnId === turnId && this.abortController) {
      this.abortController.abort();
      this.rpc.notify('turn/completed', {
        threadId,
        turnId,
        interrupted: true,
      });
    }
  }

  /**
   * Build a text prompt from turn inputs
   */
  private buildPrompt(inputs: TurnInput[]): string {
    return inputs
      .filter((input) => input.type === 'text' && input.text)
      .map((input) => input.text)
      .join('\n');
  }

  /**
   * Process the turn using Claude Agent SDK
   */
  private async processWithClaude(
    session: SessionState,
    turnId: string,
    prompt: string,
    params: TurnStartParams
  ): Promise<void> {
    try {
      // Dynamic import of Claude Agent SDK to handle potential missing package gracefully
      const { query } = await import('@anthropic-ai/claude-agent-sdk');

      const options: ClaudeQueryOptions = {
        prompt,
        options: {
          cwd: params.cwd || session.cwd,
          model: params.model,
          // Map approval policy to permission mode
          permissionMode: params.approvalPolicy === 'never' ? 'bypassPermissions' : 'default',
        },
        // Resume from existing session if available
        resume: session.sessionId !== session.threadId ? session.sessionId : undefined,
      };

      // Start an agent message item
      const itemId = randomUUID();
      this.rpc.notify('item/started', {
        threadId: session.threadId,
        turnId,
        item: {
          id: itemId,
          type: 'agentMessage',
        },
      });

      let fullContent = '';

      // Stream messages from Claude SDK
      for await (const message of query(options)) {
        if (this.abortController?.signal.aborted) {
          break;
        }

        // Translate Claude messages to Codex event format
        await this.translateMessage(session.threadId, turnId, itemId, message as ClaudeMessage);

        if ((message as ClaudeMessage).text) {
          fullContent += (message as ClaudeMessage).text;
        }
        if ((message as ClaudeMessage).delta) {
          fullContent += (message as ClaudeMessage).delta;
        }
      }

      // Complete the item
      this.rpc.notify('item/completed', {
        threadId: session.threadId,
        turnId,
        item: {
          id: itemId,
          type: 'agentMessage',
          content: fullContent,
        },
      });

      // Complete the turn
      if (!this.abortController?.signal.aborted) {
        this.rpc.notify('turn/completed', {
          threadId: session.threadId,
          turnId,
          interrupted: false,
        });
      }
    } catch (error) {
      // If SDK not available, emit error
      this.rpc.notify('turn/error', {
        threadId: session.threadId,
        turnId,
        error: error instanceof Error ? error.message : 'Claude SDK error',
      });
    } finally {
      this.currentTurnId = null;
      this.currentThreadId = null;
      this.abortController = null;
    }
  }

  /**
   * Translate Claude SDK message to Codex event format
   */
  private async translateMessage(
    threadId: string,
    turnId: string,
    itemId: string,
    message: ClaudeMessage
  ): Promise<void> {
    switch (message.type) {
      case 'text':
      case 'assistant':
        // Stream text delta
        if (message.delta || message.text) {
          this.rpc.notify('item/agentMessage/delta', {
            threadId,
            turnId,
            itemId,
            delta: message.delta || message.text,
          });
        }
        break;

      case 'tool_use':
        // Tool execution - emit as command or file change
        if (message.tool === 'bash' || message.tool === 'Bash') {
          this.rpc.notify('item/commandExecution/outputDelta', {
            threadId,
            turnId,
            itemId,
            tool: message.tool,
            args: message.toolInput,
          });
        } else if (message.tool === 'Edit' || message.tool === 'Write') {
          this.rpc.notify('item/fileChange/outputDelta', {
            threadId,
            turnId,
            itemId,
            tool: message.tool,
            args: message.toolInput,
          });
        }
        break;

      case 'tool_result':
        // Tool result
        this.rpc.notify('item/completed', {
          threadId,
          turnId,
          itemId: randomUUID(),
          type: 'toolResult',
          result: message.content,
        });
        break;

      case 'thinking':
      case 'reasoning':
        // Reasoning/thinking content
        this.rpc.notify('item/reasoning/textDelta', {
          threadId,
          turnId,
          itemId,
          delta: message.text || message.delta,
        });
        break;

      default:
        // Unknown message type - log for debugging
        this.rpc.notify('codex/stderr', {
          message: `Unknown Claude message type: ${message.type}`,
        });
    }
  }
}
