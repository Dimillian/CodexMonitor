# App-Server Events Reference (Codex `f72ab43fd193b31208cd3c306293b1b71a52a709`)

This document helps agents quickly answer:
- Which app-server events CodexMonitor supports right now.
- Which app-server requests CodexMonitor sends right now.
- Where to look in CodexMonitor to add support.
- Where to look in `../Codex` to compare event lists and find emitters.

When updating this document:
1. Fetch latest refs with `git -C ../Codex fetch --all --prune`.
2. Update the Codex hash in the title using `git -C ../Codex rev-parse origin/main`.
3. Compare Codex events vs CodexMonitor routing.
4. Compare Codex client request methods vs CodexMonitor outgoing request methods.
5. Compare Codex server request methods vs CodexMonitor inbound request handling.
6. Update supported and missing lists below.

Related project skill:
- `.codex/skills/app-server-events-sync/SKILL.md`

## Where To Look In CodexMonitor

Primary app-server event source of truth (methods + typed parsing helpers):
- `src/utils/appServerEvents.ts`

Primary event router:
- `src/features/app/hooks/useAppServerEvents.ts`

Event handler composition:
- `src/features/threads/hooks/useThreadEventHandlers.ts`

Thread/turn/item handlers:
- `src/features/threads/hooks/useThreadTurnEvents.ts`
- `src/features/threads/hooks/useThreadItemEvents.ts`
- `src/features/threads/hooks/useThreadApprovalEvents.ts`
- `src/features/threads/hooks/useThreadUserInputEvents.ts`
- `src/features/skills/hooks/useSkills.ts`

State updates:
- `src/features/threads/hooks/useThreadsReducer.ts`

Item normalization / display shaping:
- `src/utils/threadItems.ts`

UI rendering of items:
- `src/features/messages/components/Messages.tsx`

Primary outgoing request layer:
- `src/services/tauri.ts`
- `src-tauri/src/shared/codex_core.rs`
- `src-tauri/src/codex/mod.rs`
- `src-tauri/src/bin/codex_monitor_daemon.rs`

## Supported Events (Current)

These are the app-server methods currently supported in
`src/utils/appServerEvents.ts` (`SUPPORTED_APP_SERVER_METHODS`) and then either
routed in `useAppServerEvents.ts` or handled in feature-specific subscriptions.

- `app/list/updated`
- `codex/connected`
- `*requestApproval` methods (matched via
  `isApprovalRequestMethod(method)`; suffix check)
- `item/tool/requestUserInput`
- `item/agentMessage/delta`
- `turn/started`
- `thread/started`
- `thread/archived`
- `thread/closed`
- `thread/name/updated`
- `thread/status/changed`
- `thread/unarchived`
- `codex/backgroundThread`
- `error`
- `turn/completed`
- `turn/plan/updated`
- `turn/diff/updated`
- `thread/tokenUsage/updated`
- `account/rateLimits/updated`
- `account/updated`
- `account/login/completed`
- `item/started`
- `item/completed`
- `item/reasoning/summaryTextDelta`
- `item/reasoning/summaryPartAdded`
- `item/reasoning/textDelta`
- `item/plan/delta`
- `item/commandExecution/outputDelta`
- `item/commandExecution/terminalInteraction`
- `item/fileChange/outputDelta`
- `codex/event/skills_update_available` (handled via
  `isSkillsUpdateAvailableEvent(...)` in `useSkills.ts`)

## Conversation Compaction Signals (Codex v2)

Codex currently exposes two compaction signals:

- Preferred: `item/started` + `item/completed` with `item.type = "contextCompaction"` (`ThreadItem::ContextCompaction`).
- Deprecated: `thread/compacted` (`ContextCompactedNotification`).

CodexMonitor status:

- It routes `item/started` and `item/completed`, so the preferred signal reaches the frontend event layer.
- It renders/stores `contextCompaction` items via the normal item lifecycle.
- It no longer routes deprecated `thread/compacted`.

## Missing Events (Codex v2 Notifications)

Compared against Codex app-server protocol v2 notifications, the following
events are currently not routed:

- `configWarning`
- `deprecationNotice`
- `item/mcpToolCall/progress`
- `mcpServer/oauthLogin/completed`
- `model/rerouted`
- `rawResponseItem/completed`
- `serverRequest/resolved`
- `skills/changed`
- `thread/compacted` (deprecated; intentionally not routed)
- `thread/realtime/closed`
- `thread/realtime/error`
- `thread/realtime/itemAdded`
- `thread/realtime/outputAudio/delta`
- `thread/realtime/started`
- `windows/worldWritableWarning`
- `windowsSandbox/setupCompleted`

## Supported Requests (CodexMonitor -> App-Server, v2)

These are v2 request methods CodexMonitor currently sends to Codex app-server:

- `thread/start`
- `thread/resume`
- `thread/fork`
- `thread/list`
- `thread/archive`
- `thread/compact/start`
- `thread/name/set`
- `turn/start`
- `turn/steer` (used for explicit steer follow-ups while a turn is active)
- `turn/interrupt`
- `review/start`
- `model/list`
- `experimentalFeature/list`
- `collaborationMode/list`
- `mcpServerStatus/list`
- `account/login/start`
- `account/login/cancel`
- `account/rateLimits/read`
- `account/read`
- `skills/list`
- `app/list`

## Missing Client Requests (Codex v2 ClientRequest Methods)

Compared against Codex v2 request methods, CodexMonitor currently does not send:

- `account/logout`
- `command/exec`
- `config/batchWrite`
- `config/mcpServer/reload`
- `config/read`
- `config/value/write`
- `configRequirements/read`
- `externalAgentConfig/detect`
- `externalAgentConfig/import`
- `feedback/upload`
- `mcpServer/oauth/login`
- `mock/experimentalMethod`
- `skills/config/write`
- `skills/remote/export`
- `skills/remote/list`
- `thread/backgroundTerminals/clean`
- `thread/loaded/list`
- `thread/metadata/update`
- `thread/read`
- `thread/realtime/appendAudio`
- `thread/realtime/appendText`
- `thread/realtime/start`
- `thread/realtime/stop`
- `thread/rollback`
- `thread/unarchive`
- `thread/unsubscribe`
- `windowsSandbox/setupStart`

## Server Requests (App-Server -> CodexMonitor, v2)

Supported server requests:

- `*requestApproval` methods (handled via suffix match in `isApprovalRequestMethod(method)`)
- `item/tool/requestUserInput`

Missing server requests:

- `item/tool/call`
- `account/chatgptAuthTokens/refresh`

## Where To Look In ../Codex

Start here for the authoritative v2 notification list:
- `../Codex/codex-rs/app-server-protocol/src/protocol/common.rs`

Useful follow-ups:
- Notification payload types:
  - `../Codex/codex-rs/app-server-protocol/src/protocol/v2.rs`
- Emitters / wiring from core events to server notifications:
  - `../Codex/codex-rs/app-server/src/bespoke_event_handling.rs`
- Human-readable protocol notes:
  - `../Codex/codex-rs/app-server/README.md`

## Quick Comparison Workflow

Use this workflow to update the lists above:

1. Get the current Codex hash:
   - `git -C ../Codex fetch --all --prune && git -C ../Codex rev-parse origin/main`
2. List Codex v2 notification methods:
   - `(git -C ../Codex show origin/main:codex-rs/app-server-protocol/src/protocol/common.rs | rg -N -o '=>\\s*\"[^\"]+\"\\s*\\(v2::[^)]*Notification\\)' | sed -E 's/.*\"([^\"]+)\".*/\\1/'; printf '%s\\n' 'account/login/completed') | sort -u`
3. List CodexMonitor routed methods:
   - `rg -n \"SUPPORTED_APP_SERVER_METHODS\" src/utils/appServerEvents.ts`
4. Update the Supported and Missing sections.

## Quick Request Comparison Workflow

Use this workflow to update request support lists:

1. Get the current Codex hash:
   - `git -C ../Codex fetch --all --prune && git -C ../Codex rev-parse origin/main`
2. List Codex client request methods:
   - `git -C ../Codex show origin/main:codex-rs/app-server-protocol/src/protocol/common.rs | awk '/client_request_definitions! \\{/,/\\/\\/\\/ DEPRECATED APIs below/' | rg -N -o '=>\\s*\"[^\"]+\"\\s*\\{' | sed -E 's/.*\"([^\"]+)\".*/\\1/' | sort -u`
3. List Codex server request methods:
   - `git -C ../Codex show origin/main:codex-rs/app-server-protocol/src/protocol/common.rs | awk '/server_request_definitions! \\{/,/\\/\\/\\/ DEPRECATED APIs below/' | rg -N -o '=>\\s*\"[^\"]+\"\\s*\\{' | sed -E 's/.*\"([^\"]+)\".*/\\1/' | sort -u`
4. List CodexMonitor outgoing requests:
   - `perl -0777 -ne 'while(/send_request_for_workspace\\(\\s*&[^,]+\\s*,\\s*\"([^\"]+)\"/g){print \"$1\\n\"}' src-tauri/src/shared/codex_core.rs | sort -u`
5. Update the Supported Requests, Missing Client Requests, and Server Requests sections.

## Schema Drift Workflow (Best)

Use this when the method list is unchanged but behavior looks off.

1. Confirm the current Codex hash:
   - `git -C ../Codex fetch --all --prune && git -C ../Codex rev-parse origin/main`
2. Inspect the authoritative notification structs:
   - `git -C ../Codex show origin/main:codex-rs/app-server-protocol/src/protocol/v2.rs | rg -n \"struct .*Notification\"`
3. For a specific method, jump to its struct definition:
   - Example: `git -C ../Codex show origin/main:codex-rs/app-server-protocol/src/protocol/v2.rs | rg -n \"struct TurnPlanUpdatedNotification|struct ThreadTokenUsageUpdatedNotification|struct AccountRateLimitsUpdatedNotification|struct ItemStartedNotification|struct ItemCompletedNotification\"`
4. Compare payload shapes to the router expectations:
   - Parser/source of truth: `src/utils/appServerEvents.ts`
   - Router: `src/features/app/hooks/useAppServerEvents.ts`
   - Turn/plan/token/rate-limit normalization: `src/features/threads/utils/threadNormalize.ts`
   - Item shaping for display: `src/utils/threadItems.ts`
5. Verify the ThreadItem schema (many UI issues start here):
   - `git -C ../Codex show origin/main:codex-rs/app-server-protocol/src/protocol/v2.rs | rg -n \"enum ThreadItem|CommandExecution|FileChange|McpToolCall|EnteredReviewMode|ExitedReviewMode|ContextCompaction\"`
6. Check for camelCase vs snake_case mismatches:
   - The protocol uses `#[serde(rename_all = \"camelCase\")]`, but fields are often declared in snake_case.
   - CodexMonitor generally defends against this by checking both forms (for example in `threadNormalize.ts` and `useAppServerEvents.ts`), while centralizing method/type parsing in `appServerEvents.ts`.
7. If a schema change is found, fix it at the edges first:
   - Prefer updating `src/utils/appServerEvents.ts`, `useAppServerEvents.ts`, and `threadNormalize.ts` rather than spreading conditionals into components.

## Notes

- Not all missing events must be surfaced in the conversation view; some may
  be better as toasts, settings warnings, or debug-only entries.
- For conversation view changes, prefer:
  - Add method/type support in `src/utils/appServerEvents.ts`
  - Route in `useAppServerEvents.ts`
  - Handle in `useThreadTurnEvents.ts` or `useThreadItemEvents.ts`
  - Update state in `useThreadsReducer.ts`
  - Render in `Messages.tsx`
- `turn/diff/updated` is now fully wired:
  - Routed in `useAppServerEvents.ts`
  - Handled in `useThreadTurnEvents.ts` / `useThreadEventHandlers.ts`
  - Stored in `useThreadsReducer.ts` (`turnDiffByThread`)
  - Exposed by `useThreads.ts` for UI consumers
- Steering behavior while a turn is processing:
  - CodexMonitor attempts `turn/steer` only when steer capability is enabled, the thread is processing, and an active turn id exists.
  - If `turn/steer` fails, CodexMonitor does not fall back to `turn/start`; it clears stale processing/turn state when applicable, surfaces an error, and returns `steer_failed`.
  - Local queue fallback on `steer_failed` is handled in the composer queued-send flow (`useQueuedSend`), not by all direct `sendUserMessageToThread` callers.
- Feature toggles in Settings:
  - `experimentalFeature/list` is an app-server request.
  - Toggle writes use local/daemon command surfaces (`set_codex_feature_flag` and app settings update),
    which write `config.toml`; they are not app-server `ClientRequest` methods.
