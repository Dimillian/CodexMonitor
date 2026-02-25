# Quick Commands

Use these from repo root.

## Baseline

```bash
git -C ../Codex rev-parse HEAD
```

## Notifications

```bash
(rg -N -o '=>\s*"[^"]+"\s*\(v2::[^)]*Notification\)' ../Codex/codex-rs/app-server-protocol/src/protocol/common.rs | sed -E 's/.*"([^"]+)".*/\1/'; printf '%s\n' 'account/login/completed') | sort -u
rg -n "SUPPORTED_APP_SERVER_METHODS" src/utils/appServerEvents.ts
```

## Requests

```bash
awk '/client_request_definitions! \{/,/\/\/\/ DEPRECATED APIs below/' ../Codex/codex-rs/app-server-protocol/src/protocol/common.rs | rg -N -o '=>\s*"[^"]+"\s*\{' | sed -E 's/.*"([^"]+)".*/\1/' | sort -u
awk '/server_request_definitions! \{/,/\/\/\/ DEPRECATED APIs below/' ../Codex/codex-rs/app-server-protocol/src/protocol/common.rs | rg -N -o '=>\s*"[^"]+"\s*\{' | sed -E 's/.*"([^"]+)".*/\1/' | sort -u
perl -0777 -ne 'while(/send_request\(\s*"([^"]+)"/g){print "$1\n"}' $(rg --files src-tauri/src -g '*.rs') | sort -u
```

## Schema Drift

```bash
rg -n "struct .*Notification" ../Codex/codex-rs/app-server-protocol/src/protocol/v2.rs
rg -n "enum ThreadItem|CommandExecution|FileChange|McpToolCall|EnteredReviewMode|ExitedReviewMode|ContextCompaction" ../Codex/codex-rs/app-server-protocol/src/protocol/v2.rs
```
