#!/usr/bin/env node
/**
 * Claude Bridge - JSON-RPC server bridging CodexMonitor to Claude Agent SDK
 *
 * This process implements the same JSON-RPC protocol as Codex app-server,
 * allowing CodexMonitor to use Claude as an alternative agent backend.
 *
 * Protocol flow:
 * 1. Client sends `initialize` request
 * 2. Server responds with capabilities
 * 3. Client sends `initialized` notification
 * 4. Client can now use thread/turn methods
 */

import { JsonRpcHandler } from './rpc.js';
import { ClaudeSession } from './claude-session.js';
import type {
  InitializeParams,
  ThreadListParams,
  ThreadArchiveParams,
  ThreadStartParams,
  ThreadResumeParams,
  TurnStartParams,
  TurnInterruptParams,
} from './types.js';

// Available Claude models
// Note: The Agent SDK doesn't expose a model listing API, so these are hardcoded.
// Update this list when new models are released.
const CLAUDE_MODELS = [
  {
    id: 'claude-opus-4-5-20251101',
    model: 'claude-opus-4-5-20251101',
    displayName: 'Claude Opus 4.5',
    isDefault: false,
  },
  {
    id: 'claude-sonnet-4-20250514',
    model: 'claude-sonnet-4-20250514',
    displayName: 'Claude Sonnet 4',
    isDefault: true,
  },
  {
    id: 'claude-opus-4-20250514',
    model: 'claude-opus-4-20250514',
    displayName: 'Claude Opus 4',
    isDefault: false,
  },
  {
    id: 'claude-3-5-haiku-20241022',
    model: 'claude-3-5-haiku-20241022',
    displayName: 'Claude 3.5 Haiku',
    isDefault: false,
  },
];

const SERVER_INFO = {
  name: 'claude-bridge',
  version: '0.1.0',
};

class ClaudeBridge {
  private rpc: JsonRpcHandler;
  private session: ClaudeSession;
  private initialized = false;

  constructor() {
    this.rpc = new JsonRpcHandler();
    const workspaceId = process.env.CODEX_MONITOR_WORKSPACE_ID ?? 'default';
    const dataDir = process.env.CODEX_MONITOR_DATA_DIR ?? null;
    const claudeCodePath = process.env.CODEX_MONITOR_CLAUDE_PATH ?? null;
    this.session = new ClaudeSession(this.rpc, {
      workspaceId,
      dataDir,
      claudeCodePath,
    });
    this.registerHandlers();
  }

  private registerHandlers(): void {
    // Initialization handshake
    this.rpc.onRequest('initialize', async (params) => {
      const initParams = params as InitializeParams;
      this.rpc.notify('codex/stderr', {
        message: `Claude bridge initializing for client: ${initParams?.clientInfo?.name || 'unknown'}`,
      });

      return {
        serverInfo: SERVER_INFO,
        capabilities: {
          threads: true,
          turns: true,
          streaming: true,
          tools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'WebSearch', 'WebFetch'],
        },
      };
    });

    this.rpc.onRequest('initialized', async () => {
      this.initialized = true;
      this.rpc.notify('codex/stderr', {
        message: 'Claude bridge initialized successfully',
      });
      return {};
    });

    // Thread management
    this.rpc.onRequest('thread/start', async (params) => {
      this.ensureInitialized();
      const threadParams = params as ThreadStartParams;
      return this.session.startThread(threadParams.cwd);
    });

    this.rpc.onRequest('thread/resume', async (params) => {
      this.ensureInitialized();
      const resumeParams = params as ThreadResumeParams;
      return this.session.resumeThread(resumeParams.threadId);
    });

    this.rpc.onRequest('thread/list', async (params) => {
      this.ensureInitialized();
      const listParams = (params as ThreadListParams | undefined) ?? {};
      const cursor = listParams.cursor ?? null;
      const limit =
        typeof listParams.limit === 'number' && listParams.limit > 0
          ? listParams.limit
          : 20;
      return this.session.listThreads(cursor, limit);
    });

    this.rpc.onRequest('thread/archive', async (params) => {
      this.ensureInitialized();
      const archiveParams = params as ThreadArchiveParams;
      return this.session.archiveThread(archiveParams.threadId);
    });

    // Turn management
    this.rpc.onRequest('turn/start', async (params) => {
      this.ensureInitialized();
      const turnParams = params as TurnStartParams;
      return this.session.startTurn(turnParams);
    });

    this.rpc.onRequest('turn/interrupt', async (params) => {
      this.ensureInitialized();
      const interruptParams = params as TurnInterruptParams;
      await this.session.interruptTurn(interruptParams.threadId, interruptParams.turnId);
      return { success: true };
    });

    // Model and account info
    this.rpc.onRequest('model/list', async () => {
      this.ensureInitialized();
      return { data: CLAUDE_MODELS };
    });

    this.rpc.onRequest('account/rateLimits/read', async () => {
      this.ensureInitialized();
      // Return placeholder rate limits
      return {
        limits: [],
      };
    });

    this.rpc.onRequest('skills/list', async () => {
      this.ensureInitialized();
      // Claude has built-in tools, not skills
      return { skills: [] };
    });

    this.rpc.onRequest('collaborationMode/list', async () => {
      this.ensureInitialized();
      return { modes: [] };
    });

    // Review (not implemented for Claude yet)
    this.rpc.onRequest('review/start', async () => {
      this.ensureInitialized();
      throw new Error('Review mode not supported by Claude bridge');
    });
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('Bridge not initialized. Send initialize request first.');
    }
  }
}

// Start the bridge
new ClaudeBridge();
