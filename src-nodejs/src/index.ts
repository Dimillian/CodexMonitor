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
  ThreadStartParams,
  ThreadResumeParams,
  TurnStartParams,
  TurnInterruptParams,
} from './types.js';

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
    this.session = new ClaudeSession(this.rpc);
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

    this.rpc.onRequest('thread/list', async () => {
      this.ensureInitialized();
      // For now, return empty list - session persistence not yet implemented
      return { threads: [], cursor: null };
    });

    this.rpc.onRequest('thread/archive', async () => {
      this.ensureInitialized();
      return { success: true };
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

    // Model and account info (return defaults for Claude)
    this.rpc.onRequest('model/list', async () => {
      this.ensureInitialized();
      return {
        models: [
          { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', default: true },
          { id: 'claude-opus-4-20250514', name: 'Claude Opus 4' },
          { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku' },
        ],
      };
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
