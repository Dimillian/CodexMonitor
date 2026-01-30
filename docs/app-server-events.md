# App-Server Events Reference (Codex `d550fbf41afc09d7d7b5ac813aea38de07b2a73f`)

This document helps agents quickly answer:
- Which app-server events CodexMonitor supports right now.
- Where to look in CodexMonitor to add support.
- Where to look in `../codex` to compare event lists and find emitters.

When updating this document:
1. Update the Codex hash in the title using `git -C ../codex rev-parse HEAD`.
2. Compare Codex events vs CodexMonitor routing.
3. Update both the supported and missing lists below.

## Where To Look In CodexMonitor

Primary event router:
- `src/features/app/hooks/useAppServerEvents.ts`

Event handler composition:
- `src/features/threads/hooks/useThreadEventHandlers.ts`

Thread/turn/item handlers:
- `src/features/threads/hooks/useThreadTurnEvents.ts`
- `src/features/threads/hooks/useThreadItemEvents.ts`
- `src/features/threads/hooks/useThreadApprovalEvents.ts`
- `src/features/threads/hooks/useThreadUserInputEvents.ts`

State updates:
- `src/features/threads/hooks/useThreadsReducer.ts`

Item normalization / display shaping:
- `src/utils/threadItems.ts`

UI rendering of items:
- `src/features/messages/components/Messages.tsx`

## Supported Events (Current)

These are the events explicitly routed in `useAppServerEvents.ts` (plus
`requestApproval` methods matched by substring):

- `codex/connected`
- `*requestApproval*` (matched via `method.includes("requestApproval")`)
- `item/tool/requestUserInput`
- `item/agentMessage/delta`
- `turn/started`
- `error`
- `turn/completed`
- `thread/compacted`
- `turn/plan/updated`
- `turn/diff/updated`
- `thread/tokenUsage/updated`
- `thread/started`
- `account/rateLimits/updated`
- `item/completed`
- `item/started`
- `item/reasoning/summaryTextDelta`
- `item/reasoning/summaryPartAdded`
- `item/reasoning/textDelta`
- `item/commandExecution/outputDelta`
- `item/commandExecution/terminalInteraction`
- `item/fileChange/outputDelta`

## Missing Events (Codex v2 Notifications)

Compared against Codex app-server protocol v2 notifications, the following
events are currently not routed:

- `account/updated`
- `configWarning`
- `deprecationNotice`
- `item/mcpToolCall/progress`
- `mcpServer/oauthLogin/completed`
- `rawResponseItem/completed`
- `windows/worldWritableWarning`

## Where To Look In ../codex

Start here for the authoritative v2 notification list:
- `../codex/codex-rs/app-server-protocol/src/protocol/common.rs`

Useful follow-ups:
- Notification payload types:
  - `../codex/codex-rs/app-server-protocol/src/protocol/v2.rs`
- Emitters / wiring from core events to server notifications:
  - `../codex/codex-rs/app-server/src/bespoke_event_handling.rs`
- Human-readable protocol notes:
  - `../codex/codex-rs/app-server/README.md`

## Quick Comparison Workflow

Use this workflow to update the lists above:

1. Get the current Codex hash:
   - `git -C ../codex rev-parse HEAD`
2. List Codex v2 notification methods:
   - `rg -n \"=> \\\".*\\\" \\(v2::.*Notification\\)\" ../codex/codex-rs/app-server-protocol/src/protocol/common.rs`
3. List CodexMonitor routed methods:
   - `rg -n \"method === \\\"\" src/features/app/hooks/useAppServerEvents.ts`
4. Update the Supported and Missing sections.

## Schema Drift Workflow (Best)

Use this when the method list is unchanged but behavior looks off.

1. Confirm the current Codex hash:
   - `git -C ../codex rev-parse HEAD`
2. Inspect the authoritative notification structs:
   - `rg -n \"struct .*Notification\" ../codex/codex-rs/app-server-protocol/src/protocol/v2.rs`
3. For a specific method, jump to its struct definition:
   - Example: `rg -n \"struct TurnPlanUpdatedNotification|struct ThreadTokenUsageUpdatedNotification|struct AccountRateLimitsUpdatedNotification|struct ItemStartedNotification|struct ItemCompletedNotification\" ../codex/codex-rs/app-server-protocol/src/protocol/v2.rs`
4. Compare payload shapes to the router expectations:
   - Router: `src/features/app/hooks/useAppServerEvents.ts`
   - Turn/plan/token/rate-limit normalization: `src/features/threads/utils/threadNormalize.ts`
   - Item shaping for display: `src/utils/threadItems.ts`
5. Verify the ThreadItem schema (many UI issues start here):
   - `rg -n \"enum ThreadItem|CommandExecution|FileChange|McpToolCall|EnteredReviewMode|ExitedReviewMode|ContextCompaction\" ../codex/codex-rs/app-server-protocol/src/protocol/v2.rs`
6. Check for camelCase vs snake_case mismatches:
   - The protocol uses `#[serde(rename_all = \"camelCase\")]`, but fields are often declared in snake_case.
   - CodexMonitor generally defends against this by checking both forms (for example in `threadNormalize.ts` and `useAppServerEvents.ts`).
7. If a schema change is found, fix it at the edges first:
   - Prefer updating `useAppServerEvents.ts` and `threadNormalize.ts` rather than spreading conditionals into components.

## Notes

- Not all missing events must be surfaced in the conversation view; some may
  be better as toasts, settings warnings, or debug-only entries.
- For conversation view changes, prefer:
  - Route in `useAppServerEvents.ts`
  - Handle in `useThreadTurnEvents.ts` or `useThreadItemEvents.ts`
  - Update state in `useThreadsReducer.ts`
  - Render in `Messages.tsx`
- `turn/diff/updated` is routed in `useAppServerEvents.ts` but currently has no
  downstream handler wired in `useThreadEventHandlers.ts`.
