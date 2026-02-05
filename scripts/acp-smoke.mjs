#!/usr/bin/env node
/*
 * ACP smoke test for agents that speak JSON-RPC 2.0 over stdio.
 *
 * Runs a minimal ACP flow:
 * - initialize
 * - session/new
 * - session/prompt
 *
 * Usage:
 *   node scripts/acp-smoke.mjs
 *   COPILOT_BIN=/path/to/copilot node scripts/acp-smoke.mjs
 */

import { spawn } from "node:child_process";
import process from "node:process";

function nowMs() {
  return Date.now();
}

function fail(message, detail) {
  const error = new Error(message);
  // @ts-ignore - attach extra info for printing
  error.detail = detail;
  throw error;
}

function asJsonRpcRequest({ id, method, params }) {
  return {
    jsonrpc: "2.0",
    id,
    method,
    params,
  };
}

function assertJsonRpcEnvelope(msg, label) {
  if (!msg || typeof msg !== "object") {
    fail(`${label}: not an object`, msg);
  }
  if (msg.jsonrpc !== "2.0") {
    fail(`${label}: missing/invalid jsonrpc`, msg);
  }
}

function readLines(stream, onLine) {
  let buffer = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    buffer += chunk;
    while (true) {
      const idx = buffer.indexOf("\n");
      if (idx === -1) break;
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      onLine(trimmed);
    }
  });
}

async function waitFor(predicate, { timeoutMs, tickMs = 10, label }) {
  const start = nowMs();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (predicate()) return;
    if (nowMs() - start > timeoutMs) {
      fail(`timeout waiting for ${label}`);
    }
    await new Promise((r) => setTimeout(r, tickMs));
  }
}

async function main() {
  const bin = process.env.COPILOT_BIN?.trim() ? process.env.COPILOT_BIN.trim() : "copilot";
  const args = ["--acp", "--stdio"];

  const child = spawn(bin, args, {
    stdio: ["pipe", "pipe", "pipe"],
    env: process.env,
  });

  const transcript = {
    stdout: [],
    stderr: [],
  };

  const pendingById = new Map();
  const notifications = [];

  readLines(child.stdout, (line) => {
    transcript.stdout.push(line);
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      // Not JSON; keep transcript only.
      return;
    }

    if (msg && typeof msg === "object" && ("id" in msg) && ("result" in msg || "error" in msg)) {
      pendingById.set(String(msg.id), msg);
      return;
    }

    if (msg && typeof msg === "object" && ("method" in msg) && typeof msg.method === "string") {
      notifications.push(msg);
    }
  });

  readLines(child.stderr, (line) => {
    transcript.stderr.push(line);
  });

  child.on("error", (err) => {
    fail(`failed to spawn: ${String(err?.message ?? err)}`);
  });

  const send = (obj) => {
    const line = JSON.stringify(obj);
    child.stdin.write(`${line}\n`);
  };

  // 1) initialize
  const initId = 0;
  send(
    asJsonRpcRequest({
      id: initId,
      method: "initialize",
      params: {
        protocolVersion: 1,
        clientCapabilities: {
          fs: { readTextFile: true, writeTextFile: true },
          terminal: true,
        },
        clientInfo: {
          name: "codex-monitor-acp-smoke",
          title: "CodexMonitor ACP Smoke",
          version: "0.0.0",
        },
      },
    }),
  );

  await waitFor(() => pendingById.has(String(initId)), {
    timeoutMs: 15_000,
    label: "initialize response",
  });
  const initResp = pendingById.get(String(initId));
  assertJsonRpcEnvelope(initResp, "initialize response");
  if (initResp.error) {
    fail("initialize returned error", initResp);
  }
  const protocolVersion = initResp.result?.protocolVersion;
  if (typeof protocolVersion !== "number") {
    fail("initialize result missing protocolVersion", initResp);
  }

  // 2) session/new
  const newId = 1;
  send(
    asJsonRpcRequest({
      id: newId,
      method: "session/new",
      params: {
        cwd: process.cwd(),
        mcpServers: [],
      },
    }),
  );

  await waitFor(() => pendingById.has(String(newId)), {
    timeoutMs: 15_000,
    label: "session/new response",
  });
  const newResp = pendingById.get(String(newId));
  assertJsonRpcEnvelope(newResp, "session/new response");
  if (newResp.error) {
    fail("session/new returned error", newResp);
  }
  const sessionId = newResp.result?.sessionId;
  if (typeof sessionId !== "string" || sessionId.trim().length === 0) {
    fail("session/new result missing sessionId", newResp);
  }

  // 3) session/prompt
  const promptId = 2;
  send(
    asJsonRpcRequest({
      id: promptId,
      method: "session/prompt",
      params: {
        sessionId,
        prompt: [{ type: "text", text: "Reply with a short greeting." }],
      },
    }),
  );

  await waitFor(() => pendingById.has(String(promptId)), {
    timeoutMs: 60_000,
    label: "session/prompt response",
  });
  const promptResp = pendingById.get(String(promptId));
  assertJsonRpcEnvelope(promptResp, "session/prompt response");
  if (promptResp.error) {
    fail("session/prompt returned error", promptResp);
  }
  const stopReason = promptResp.result?.stopReason;
  if (typeof stopReason !== "string") {
    fail("session/prompt result missing stopReason", promptResp);
  }

  // Basic check: received at least one session/update notification during prompt.
  const sawUpdate = notifications.some(
    (n) => n.method === "session/update" && n.params && n.params.sessionId === sessionId,
  );

  const report = {
    ok: true,
    bin,
    args,
    protocolVersion,
    sessionId,
    stopReason,
    sawSessionUpdate: sawUpdate,
    notificationMethods: Array.from(new Set(notifications.map((n) => n.method))).sort(),
  };

  // Clean up.
  try {
    child.kill();
  } catch {
    // ignore
  }

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((err) => {
  const detail = err && typeof err === "object" && "detail" in err ? err.detail : undefined;
  const payload = {
    ok: false,
    error: String(err?.message ?? err),
    detail: detail ?? null,
  };
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exitCode = 1;
});
