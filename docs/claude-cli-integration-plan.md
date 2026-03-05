# Claude CLI Integration Implementation Plan

## Context

**Problem:** CodeAgentMonitor currently depends on Codex backend (codex app-server). We need to integrate Claude CLI as an alternative backend to reduce external dependencies.

**Goal:** Replace Codex backend with Claude CLI while keeping the frontend unchanged by building a bridge binary that translates Claude CLI's stream-json output to the Codex JSON-RPC protocol.

**Why This Approach:** Minimizes changes to existing codebase, reuses proven patterns (EventSink trait, process management, JSON-RPC protocol), and maintains feature parity with existing backend.

---

## Architecture Decision: Bridge Binary (D-NEW)

A standalone binary (`claude-bridge`) that:
1. Spawns Claude CLI with `--output-format stream-json`
2. Parses newline-delimited JSON events
3. Maps Claude events to Codex JSON-RPC protocol
4. Communicates with frontend via EventSink trait
5. Handles bidirectional approval flow with request_id correlation

**Why:** Zero merge conflicts, testable in isolation, reusable for other CLI backends.

---

## Implementation Phases

### Phase 1: Core Bridge Binary & Basic Event Streaming (Weeks 1-2)

**Objectives:**
- New binary skeleton in `src-tauri/src/bin/claude_bridge.rs`
- Parse Claude CLI stream-json output
- Map essential events to Codex format
- Handle thread lifecycle

**Critical Files to Create/Modify:**
- `src-tauri/src/bin/claude_bridge.rs` (NEW) — Bridge binary main
- `src-tauri/src/bin/claude_bridge/event_mapper.rs` (NEW) — Event mapping logic
- `src-tauri/src/bin/claude_bridge/process.rs` (NEW) — Claude CLI process management
- `src-tauri/Cargo.toml` (MODIFY) — Add claude-bridge binary

**Key Tasks:**
1. Scaffold bridge binary with process spawning (tokio::process::Command)
2. Read Claude's stream-json output line-by-line
3. Parse JSON and extract event type
4. Map basic events:
   - `system/init` → `codex/connected` + `thread/started`
   - `assistant/text_delta` → `item/agentMessage/delta`
   - `assistant/text_done` → `item/completed`
5. Handle workspace/thread ID generation and tracking
6. Emit events via stdin back to parent process (Codex JSON-RPC format)

**Testing:**
- Unit tests for event mapping (mock JSON input, verify output)
- Integration test spawning dummy Claude CLI and reading output
- Test with real Claude CLI if available

**Verification:**
- Bridge accepts JSON-RPC requests and forwards to Claude CLI stdin
- Bridge reads Claude events and outputs Codex JSON-RPC notifications
- Basic agent message streaming works end-to-end

---

### Phase 2: Tool Execution & Item Management (Weeks 3-4)

**Objectives:**
- Map Claude tool use events to Codex item structure
- Track itemId correlation for streaming outputs
- Generate realistic item structures

**Critical Files:**
- `src-tauri/src/bin/claude_bridge/item_tracker.rs` (NEW) — Item ID generation and tracking
- Extend `event_mapper.rs` with tool execution logic

**Key Tasks:**
1. Add itemId generation and correlation tracking (use UUID)
2. Map `assistant/tool_use` → `item/started` (commandExecution/fileChange)
3. Map `result/tool_result` → output delta streams + `item/completed`
4. Handle file change detection (diff output)
5. Support streaming outputs:
   - `item/commandExecution/outputDelta`
   - `item/fileChange/outputDelta`

**Item Types to Support:**
- `commandExecution` (tool execution)
- `fileChange` (file modifications with diff)

**Testing:**
- Mock tool use events with various output streams
- Test item lifecycle (started → delta → delta → completed)
- Verify item IDs are unique and consistent

**Verification:**
- Tool execution appears as items in frontend
- Streaming output renders progressively
- File changes show diffs correctly

---

### Phase 3: Approval Flow & Bidirectional Communication (Weeks 5-6)

**Objectives:**
- Implement stateful approval request/response correlation
- Handle Claude CLI permission requests
- Route frontend approvals back to Claude

**Critical Files:**
- `src-tauri/src/bin/claude_bridge/approval_handler.rs` (NEW) — Approval state machine
- `src-tauri/src/bin/claude_bridge/request_router.rs` (NEW) — ID correlation logic

**Key Tasks:**
1. Track pending approval requests with request_id ↔ Claude event correlation
2. Map `permission_request` (Claude) → `item/tool/requestApproval` (Codex)
3. Assign JSON-RPC ID to each approval request for correlation
4. Store mapping: `{id: request_id, claude_state: ...}`
5. Route frontend `respond_to_server_request(workspace_id, request_id, result)` back to Claude
6. Support approval allowlist forwarding (auto-accept matching commands)

**State Machine:**
- Approval request received → assign ID, emit to frontend
- Frontend approval response → lookup mapping, send to Claude CLI stdin
- Claude stdin format: `{"approved": true/false}` or similar

**Testing:**
- Mock approval requests and responses
- Test request_id correlation across multiple pending requests
- Test timeout handling (what if frontend never responds?)

**Verification:**
- Approval dialog appears in frontend for tool execution
- Frontend approval/rejection blocks CLI correctly
- Multiple concurrent approvals are tracked independently

---

### Phase 4: Polish & Integration (Weeks 7-8)

**Objectives:**
- Handle edge cases and error scenarios
- Token usage tracking
- Rate limit forwarding
- Integration with Tauri IPC

**Critical Files:**
- `src-tauri/src/codex/mod.rs` (MODIFY) — Add claude-bridge spawning logic
- `src-tauri/src/backend/mod.rs` (MODIFY) — Dual-mode support
- `.github/workflows/ci.yml` (MODIFY) — Add bridge tests
- `.github/workflows/release.yml` (MODIFY) — Add daemon binary build

**Key Tasks:**
1. **Error Handling:**
   - Claude CLI not found → emit helpful error to frontend
   - Stream parse errors → emit `codex/parseError` events
   - Process exit → emit `thread/closed` for cleanup

2. **Token Usage:** Map Claude's token counts to `thread/tokenUsage/updated`

3. **Rate Limits:** Forward from Claude headers to `account/rateLimits/updated`

4. **Thread Naming:** Use first message preview (first 38 chars) for thread name

5. **Dual-Mode Integration:**
   - Settings UI dropdown: "Backend: Codex / Claude CLI"
   - Auto-detect `claude` from PATH (no env var needed)
   - Default: Codex (backward compatible)
   - Persist selection in app settings store

6. **CI/CD Integration:**
   - Add `cargo test` for bridge binary in CI
   - Build bridge binary in release workflow
   - Platform-specific handling (Windows exe, macOS/Linux binary)

7. **Documentation:**
   - Update README with Claude CLI backend option
   - Add troubleshooting guide for common errors
   - Document event mapping in docs/app-server-events.md

**Testing:**
- End-to-end integration with frontend (if possible with mock)
- Error scenario testing (missing CLI, parse errors, timeout)
- Stress test with large streaming outputs

**Verification:**
- Bridge binary builds on all platforms (macOS, Linux, Windows)
- CI/CD tests pass
- Release binary includes bridge
- Feature flag works (can switch backends)
- No regression in existing Codex functionality

---

## Key Implementation Patterns (Reuse from Existing Code)

### 1. Process Management
**Source:** `src-tauri/src/backend/app_server.rs` (lines 494-542, 970+)
```rust
// Use this pattern for spawning Claude CLI
let mut child = Command::new("claude")
    .arg("chat")
    .arg("--output-format")
    .arg("stream-json")
    .stdin(Stdio::piped())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .spawn()?;

// Wrap in Mutex for thread-safe stdin
let stdin = Mutex::new(child.stdin.take().unwrap());

// Read with BufReader line-by-line
let stdout = child.stdout.take().unwrap();
let reader = BufReader::new(stdout);
for line in reader.lines() {
    let json: Value = serde_json::from_str(&line)?;
    // Process event
}
```

### 2. Request-Response Correlation
**Source:** `src-tauri/src/remote_backend/transport.rs` (lines 95-147)
```rust
// Use atomic ID counter
static REQUEST_ID: AtomicU64 = AtomicU64::new(0);

// Store pending requests
let mut pending: HashMap<u64, oneshot::Sender<Value>> = HashMap::new();
let mut context: HashMap<u64, RequestContext> = HashMap::new();

// For responses
if let Some(tx) = pending.remove(&id) {
    let _ = tx.send(value);
}
```

### 3. Event Emission
**Source:** `src-tauri/src/backend/events.rs`
```rust
// Emit via EventSink trait (already defined)
pub trait EventSink: Clone + Send + Sync + 'static {
    fn emit_app_server_event(&self, event: AppServerEvent);
}

// Create bridge-specific implementation or reuse existing
let event = AppServerEvent {
    workspace_id: "workspace-1".to_string(),
    message: serde_json::json!({
        "method": "thread/started",
        "params": { /* ... */ }
    }),
};
event_sink.emit_app_server_event(event);
```

### 4. Error Handling
**Source:** `src-tauri/src/backend/app_server.rs` (lines 1032-1047)
```rust
// Emit parse errors to frontend
let parse_error_event = serde_json::json!({
    "method": "codex/parseError",
    "params": {
        "line": line.to_string(),
        "error": err.to_string(),
    }
});
```

---

## Event Mapping Reference

### Simple 1:1 Mappings
| Claude Event | Codex Event | Notes |
|---|---|---|
| `system/init` | `codex/connected` + `thread/started` | Emit both on startup |
| `assistant/text_delta` | `item/agentMessage/delta` | Stream text |
| `assistant/text_done` | `item/completed` | Mark message done |
| `assistant/thinking_delta` | `item/reasoning/textDelta` | Thinking output |

### Complex Mappings
| Claude Event | Codex Event(s) | Implementation |
|---|---|---|
| `assistant/tool_use` | `item/started` (commandExecution) | Generate itemId, track item type |
| `result/tool_result` | `item/commandExecution/outputDelta` + `item/completed` | Stream output, mark done |
| `permission_request` | `item/tool/requestApproval` | ID correlation, bidirectional |

---

## File Structure

```
src-tauri/
├── src/
│   ├── bin/
│   │   └── claude_bridge.rs              (main binary - ~400 lines)
│   │       ├── event_mapper.rs           (event translation - ~300 lines)
│   │       ├── process.rs                (Claude process mgmt - ~200 lines)
│   │       ├── item_tracker.rs           (item correlation - ~150 lines)
│   │       ├── approval_handler.rs       (approval flow - ~200 lines)
│   │       ├── request_router.rs         (ID routing - ~100 lines)
│   │       └── mod.rs                    (exports)
│   ├── codex/mod.rs                      (MODIFY - add claude-bridge option)
│   └── [other existing modules]
└── Cargo.toml                             (MODIFY - add binary)
```

---

## Testing Strategy

### Unit Tests
- Location: `src-tauri/src/bin/claude_bridge/` (co-located with modules)
- Focus: Event mapping logic, ID correlation, approval state machine
- Mock Claude JSON input, verify Codex JSON-RPC output

### Integration Tests
- Location: `src-tauri/tests/claude_bridge_integration.rs` (NEW)
- Focus: Process spawning, stream reading, full event flow
- Mock Claude CLI subprocess with predetermined output

### Manual Testing
- Run with real Claude CLI and frontend
- Test approval flow interactively
- Verify all 30 event types appear correctly

### CI/CD
- Add to `.github/workflows/ci.yml`: `cargo test --lib --bin claude_bridge`
- Build in release workflow as daemon-like binary

---

## Dependencies to Add

In `src-tauri/Cargo.toml`:
- Already available: tokio, serde_json, uuid (for itemId)
- No new major dependencies needed

---

## Timeline

| Phase | Duration | MVP Complete | Testable |
|-------|----------|--------------|----------|
| 1: Core Streaming | Weeks 1-2 | 50% (basic events) | ✓ Unit tests |
| 2: Tool Execution | Weeks 3-4 | 75% (tools working) | ✓ Integration tests |
| 3: Approval Flow | Weeks 5-6 | 95% (all critical paths) | ✓ E2E with frontend |
| 4: Polish & Deploy | Weeks 7-8 | 100% (production-ready) | ✓ CI/CD tests |

**MVP Definition (End of Phase 2):** Basic Claude CLI agent conversation with message streaming and tool execution visible in frontend.

**Production Ready (End of Phase 4):** Full feature parity with Codex backend, all events mapped, approval flow working, dual-mode support with flag.

---

## Success Criteria

1. ✓ Bridge binary compiles and runs
2. ✓ Claude CLI spawns and connects
3. ✓ Agent messages stream to frontend in real-time
4. ✓ Tool execution appears as items with outputs
5. ✓ Approval dialog appears for tool approvals
6. ✓ Frontend approval/rejection controls Claude execution
7. ✓ All 30 Codex events are mapped or explicitly handled
8. ✓ No regression in existing Codex backend functionality
9. ✓ CI/CD tests pass on all platforms
10. ✓ Feature toggle (USE_CLAUDE_CLI) works as expected

---

## Known Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Claude CLI not installed | Check PATH, emit helpful error to user |
| Complex approval state conflicts | Use atomic operations, extensive testing |
| Performance degradation | Profile streaming paths, optimize JSON parsing |
| Platform-specific issues | Test on macOS, Linux, Windows CI |
| Breaking Claude CLI changes | Version pin, handle gracefully with fallback |

---

## Decisions (Confirmed)

1. **Configuration:** Auto-detect Claude CLI from PATH. No additional config needed.

2. **Dual-mode support:** Both backends available, user selects in Settings UI.
   - Settings page gets a "Backend" dropdown: "Codex" / "Claude CLI"
   - Default: Codex (existing behavior preserved)
   - Selection persisted in app settings

3. **Feature availability:** Available after Phase 1 (MVP).
   - Basic message streaming usable immediately
   - Tools and approval flow added incrementally in later phases
   - Users can switch back to Codex if Claude CLI lacks features

4. **Testing:** Mock Claude CLI output for unit/integration tests.
   - Real Claude CLI used for manual testing only
