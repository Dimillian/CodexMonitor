import * as readline from 'readline';
import type { JsonRpcRequest, JsonRpcResponse, JsonRpcNotification } from './types.js';

/**
 * JSON-RPC handler for stdio communication
 * Matches the Codex app-server protocol
 */
export class JsonRpcHandler {
  private rl: readline.Interface;
  private requestHandlers: Map<string, (params: unknown) => Promise<unknown>>;
  private pendingRequests: Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>;
  private nextId: number = 1;

  constructor() {
    this.requestHandlers = new Map();
    this.pendingRequests = new Map();

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    this.rl.on('line', (line) => this.handleLine(line));
    this.rl.on('close', () => process.exit(0));
  }

  /**
   * Register a handler for a specific method
   */
  onRequest(method: string, handler: (params: unknown) => Promise<unknown>): void {
    this.requestHandlers.set(method, handler);
  }

  /**
   * Send a notification (no response expected)
   */
  notify(method: string, params?: unknown): void {
    const notification: JsonRpcNotification = { method };
    if (params !== undefined) {
      notification.params = params;
    }
    this.writeLine(JSON.stringify(notification));
  }

  /**
   * Send a request and wait for response (for server-initiated requests like approvals)
   */
  async request(method: string, params?: unknown): Promise<unknown> {
    const id = this.nextId++;
    const message: JsonRpcRequest = { id, method };
    if (params !== undefined) {
      message.params = params;
    }

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.writeLine(JSON.stringify(message));
    });
  }

  /**
   * Send a response to a request
   */
  respond(id: number, result: unknown): void {
    const response: JsonRpcResponse = { id, result };
    this.writeLine(JSON.stringify(response));
  }

  /**
   * Send an error response
   */
  respondError(id: number, code: number, message: string, data?: unknown): void {
    const response: JsonRpcResponse = {
      id,
      error: { code, message, data },
    };
    this.writeLine(JSON.stringify(response));
  }

  private writeLine(line: string): void {
    process.stdout.write(line + '\n');
  }

  private async handleLine(line: string): Promise<void> {
    if (!line.trim()) return;

    let message: JsonRpcRequest | JsonRpcResponse;
    try {
      message = JSON.parse(line);
    } catch {
      this.notify('codex/parseError', { error: 'Invalid JSON', raw: line });
      return;
    }

    // Check if this is a response to a pending request
    if ('result' in message || 'error' in message) {
      const response = message as JsonRpcResponse;
      const pending = this.pendingRequests.get(response.id);
      if (pending) {
        this.pendingRequests.delete(response.id);
        if (response.error) {
          pending.reject(new Error(response.error.message));
        } else {
          pending.resolve(response.result);
        }
      }
      return;
    }

    // Handle as a request
    const request = message as JsonRpcRequest;
    const handler = this.requestHandlers.get(request.method);

    if (!handler) {
      if (request.id !== undefined) {
        this.respondError(request.id, -32601, `Method not found: ${request.method}`);
      }
      return;
    }

    try {
      const result = await handler(request.params);
      if (request.id !== undefined) {
        this.respond(request.id, result);
      }
    } catch (error) {
      if (request.id !== undefined) {
        const message = error instanceof Error ? error.message : String(error);
        this.respondError(request.id, -32000, message);
      }
    }
  }
}
