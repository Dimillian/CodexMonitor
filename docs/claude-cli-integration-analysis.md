# Claude CLI Integration Analysis

## Overview

This document summarizes the analysis of integrating Claude CLI as a backend provider for the Codex GUI, focusing on approach D (Bridge Binary) and its sub-variants.

---

## Architecture Context

### Current Codex Architecture
- **Frontend** (React/Electron) communicates via JSON-RPC over stdio with **Backend** (codex-rs binary)
- Backend manages Claude API sessions, tool execution, approval flow
- Frontend expects ~30 event types with specific data structures

### Goal
Replace the Codex backend with Claude CLI while preserving the existing frontend unchanged.

---

## Approach D: Bridge Binary

A standalone binary that wraps Claude CLI and translates its protocol into the Codex JSON-RPC protocol expected by the frontend.

### Sub-variants Analyzed

| Variant | Description | Merge Conflicts | Complexity | Testability |
|---------|------------|----------------|------------|-------------|
| **D1** | Separate Rust binary in new crate | Zero | Medium | High |
| **D2** | New mode inside codex-rs binary | High (touches codex-rs) | Medium-High | Medium |
| **D3** | TypeScript bridge (Node.js) | Low | Low-Medium | Medium |
| **D-NEW** | Bridge binary + Backend Mode API | Zero | Medium | Highest |

### Recommended: D-NEW (Bridge Binary with Backend Mode)

The bridge binary uses Claude CLI's `--output-format stream-json` to receive structured events, maps them to the Codex JSON-RPC protocol, and communicates with the frontend over stdio.

**Key advantages:**
- Zero merge conflicts with existing codebase
- Testable in isolation
- Clean separation of concerns
- Reusable for other CLI agent backends

---

## Frontend Event Protocol Analysis

### Supported Events (30 total)

The frontend dispatches events through `useAppServerEvents.ts`, which routes raw server methods to specific handlers.

### Easy Mapping (~15 events)

These events have simple ID/status fields and map directly:

| Server Method | Handler Parameters | Notes |
|--------------|-------------------|-------|
| `codex/connected` | `workspaceId: string` | Connection established |
| `thread/started` | `workspaceId, thread: Record<string, unknown>` | Thread has `id`, `preview?`, `source?` |
| `thread/archived` | `workspaceId, threadId` | Simple ID |
| `thread/unarchived` | `workspaceId, threadId` | Simple ID |
| `thread/closed` | `workspaceId, threadId` | Resets processing state |
| `turn/started` | `workspaceId, threadId, turnId` | Marks processing |
| `turn/completed` | `workspaceId, threadId, turnId` | Clears processing |
| `thread/name/updated` | `workspaceId, { threadId, threadName }` | Name defaults to null if empty |
| `thread/status/changed` | `workspaceId, threadId, status` | Status type normalized to lowercase |
| `thread/tokenUsage/updated` | `workspaceId, threadId, tokenUsage` | Token stats object |
| `item/agentMessage/delta` | `{ workspaceId, threadId, itemId, delta }` | **Most important** - text streaming |
| `item/reasoning/summaryTextDelta` | `workspaceId, threadId, itemId, delta` | Reasoning stream |
| `item/reasoning/summaryPartAdded` | `workspaceId, threadId, itemId` | Section boundary |
| `item/reasoning/textDelta` | `workspaceId, threadId, itemId, delta` | Full reasoning |
| `item/plan/delta` | `workspaceId, threadId, itemId, delta` | Plan text |

### Medium Mapping (~10 events)

These require constructing proper objects or tracking some state:

| Server Method | Complexity | Notes |
|--------------|-----------|-------|
| `item/started` | Need `item` object with correct `type` field | Types: agentMessage, commandExecution, fileChange, etc. |
| `item/completed` | Same as started + status field | `status: "inProgress" \| "completed"` |
| `turn/plan/updated` | Need `{explanation, plan}` with `steps[].status` | Plan step tracking |
| `turn/diff/updated` | Diff string | From Claude's file edits |
| `account/rateLimits/updated` | Rate limit object | From Claude's headers |
| `item/commandExecution/outputDelta` | Need itemId for tool use | Link to correct tool item |
| `item/fileChange/outputDelta` | Need itemId for file op | Link to correct file item |

### Hard Mapping (~5 events)

These require stateful bidirectional communication:

| Server Method | Complexity | Notes |
|--------------|-----------|-------|
| **Approval flow** | Bidirectional with `request_id` | See detailed section below |
| **`item/tool/requestUserInput`** | Complex questions/options structure | Needs `questions[].id, header, question, options[]` |
| **`error` with `willRetry`** | Retry semantics | Need to understand Claude's retry behavior |

---

## Approval Flow (Detailed)

The approval flow is the most complex mapping requirement.

### Frontend Expectation

```typescript
// Incoming approval request
ApprovalRequest {
  workspace_id: string;
  request_id: string | number;  // For response correlation
  method: string;               // Command method
  params: Record<string, unknown>;
}

// Response back to server
respondToServerRequest(workspace_id, request_id, "accept" | "reject")
```

### Claude CLI Side

Claude CLI emits `permission_request` events when tool use requires approval, and expects `permission_response` back via stdin.

### Bridge Mapping

1. Intercept Claude `permission_request` event
2. Assign a JSON-RPC `id` for correlation
3. Send as approval event to frontend: `{"id": 42, "method": "...", "params": {...}}`
4. Receive frontend response: `{"id": 42, "result": {"approved": true}}`
5. Forward approval/rejection to Claude CLI

This is stateful but straightforward in a bridge binary.

---

## Frontend Data Structure Details

### Item Types

| Type | Description | Special Handling |
|------|------------|-----------------|
| `enteredReviewMode` | User enters review | Marks thread as reviewing |
| `exitedReviewMode` | User exits review | Marks thread as not reviewing |
| `contextCompaction` | Memory optimization | Shows inProgress/completed status |
| `webSearch` | Search result | Shows inProgress/completed status |
| `agentMessage` | LLM response | Triggers user message callback |
| `commandExecution` | Tool execution | Has output delta stream |
| `fileChange` | File modification | Has output delta stream |
| `reasoning` | Internal reasoning | Has text delta stream |
| `plan` | Agent's planned steps | Has delta stream |

### Key Format Flexibility

- Frontend supports both camelCase and snake_case: `threadId` / `thread_id`
- All ID fields converted to strings with empty string fallback
- String values trimmed of whitespace
- Status type normalized: lowercase, spaces/underscores/hyphens removed

---

## Claude CLI Output Format

With `--output-format stream-json`, Claude CLI emits newline-delimited JSON:

```jsonl
{"type": "system", "subtype": "init", ...}
{"type": "assistant", "subtype": "text_delta", "text": "..."}
{"type": "assistant", "subtype": "tool_use", "tool": "Bash", "input": {...}}
{"type": "result", "subtype": "tool_result", ...}
{"type": "assistant", "subtype": "text_done", "text": "..."}
```

### Mapping to Codex Events

| Claude Event | Codex Event |
|-------------|-------------|
| `system/init` | `codex/connected` + `thread/started` |
| `assistant/text_delta` | `item/agentMessage/delta` |
| `assistant/text_done` | `item/completed` (agentMessage) |
| `assistant/tool_use` | `item/started` (commandExecution/fileChange) |
| `result/tool_result` | `item/completed` + output deltas |
| `assistant/thinking_delta` | `item/reasoning/textDelta` |
| Permission request | Approval flow (see above) |

---

## Mapping Coverage Summary

- **~80%** of events map trivially or with moderate effort
- **~20%** (tool execution, file changes, approval) require careful state management
- This complexity is **equal across all D variants** - the mapping logic is the same regardless of implementation language or architecture

---

## Implementation Plan (D-NEW)

### Phase 1: Core Bridge
1. New Rust crate `claude-bridge/` with own `Cargo.toml`
2. Spawn Claude CLI with `--output-format stream-json`
3. Parse NDJSON stream, map to Codex JSON-RPC
4. Emit events to stdout for frontend consumption

### Phase 2: Essential Events
1. Thread lifecycle (started/closed/status)
2. Turn lifecycle (started/completed)
3. Agent message streaming (delta/completed)
4. Basic item tracking with generated IDs

### Phase 3: Tool Execution & Approval
1. Tool use → item started/completed mapping
2. Permission request → approval flow with request_id correlation
3. File change detection and output streaming

### Phase 4: Polish
1. Token usage tracking
2. Error handling with retry semantics
3. Thread naming from first message preview
4. Rate limit forwarding

---

## Files Analyzed

### Frontend (React)
- `codex-rs/web/src/hooks/useAppServerEvents.ts` — Main event router (30 methods)
- `codex-rs/web/src/hooks/useThreadApprovalEvents.ts` — Approval flow
- `codex-rs/web/src/hooks/useThreadItemEvents.ts` — Item/message streaming
- `codex-rs/web/src/hooks/useThreadTurnEvents.ts` — Turn/thread lifecycle
- `codex-rs/web/src/hooks/useThreadUserInputEvents.ts` — User input requests

### Backend (Rust)
- `codex-rs/core/src/protocol.rs` — JSON-RPC protocol definitions
- `codex-rs/core/src/client_common.rs` — Client event handling
- `codex-rs/exec/src/event_handler.rs` — Server-side event emission
