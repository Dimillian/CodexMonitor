# Multi-Agent Sync Runbook

## Purpose

Keep CodexMonitor's Agents settings behavior in sync with upstream Codex (`../Codex`) whenever Codex changes:

- multi-agent feature flags
- `[agents]` config schema
- role resolution/config-file semantics
- role defaults (including built-ins)

## When To Run This

- After pulling updates in `../Codex`
- Before changing `src-tauri/src/shared/agents_config_core.rs`
- When users report a mismatch between CodexMonitor settings and Codex runtime behavior

## Upstream Source Of Truth (Check These First)

1. Feature key + legacy alias:
- `../Codex/codex-rs/core/src/features.rs`
- `../Codex/codex-rs/core/src/features/legacy.rs`

2. Config schema + parsing:
- `../Codex/codex-rs/core/src/config/mod.rs`
- `../Codex/codex-rs/core/config.schema.json`

3. Role loading and built-ins:
- `../Codex/codex-rs/core/src/agent/role.rs`
- `../Codex/codex-rs/core/src/agent/builtins/explorer.toml`

4. Runtime thread-limit behavior:
- `../Codex/codex-rs/core/src/agent/control.rs`
- `../Codex/codex-rs/core/src/tools/handlers/multi_agents.rs`

Notes:
- `../Codex/docs/config.md` points to web docs; treat code + schema above as canonical for compatibility work.

## Fast Upstream Diff Commands

Run from `CodexMonitor` repo root:

```bash
cd ../Codex

git log --oneline -- \
  codex-rs/core/src/features.rs \
  codex-rs/core/src/features/legacy.rs \
  codex-rs/core/src/config/mod.rs \
  codex-rs/core/config.schema.json \
  codex-rs/core/src/agent/role.rs \
  codex-rs/core/src/agent/builtins/explorer.toml \
  codex-rs/core/src/agent/control.rs \
  codex-rs/core/src/tools/handlers/multi_agents.rs

rg -n "multi_agent|max_threads|AgentsToml|AgentRoleToml|config_file|apply_role_to_config|DEFAULT_ROLE_NAME|explorer" \
  codex-rs/core/src/features.rs \
  codex-rs/core/src/features/legacy.rs \
  codex-rs/core/src/config/mod.rs \
  codex-rs/core/src/agent/role.rs \
  codex-rs/core/src/agent/control.rs \
  codex-rs/core/src/tools/handlers/multi_agents.rs
```

## CodexMonitor Files To Update If Upstream Changes

1. Shared read/write core:
- `src-tauri/src/shared/agents_config_core.rs`

2. Tauri/app + daemon adapters (keep parity):
- `src-tauri/src/codex/mod.rs`
- `src-tauri/src/lib.rs`
- `src-tauri/src/bin/codex_monitor_daemon.rs`
- `src-tauri/src/bin/codex_monitor_daemon/rpc/codex.rs`
- `src-tauri/src/remote_backend/mod.rs`

3. Frontend settings contracts + UI:
- `src/services/tauri.ts`
- `src/features/settings/hooks/useSettingsAgentsSection.ts`
- `src/features/settings/hooks/useSettingsViewOrchestration.ts`
- `src/features/settings/components/sections/SettingsAgentsSection.tsx`
- `src/features/settings/components/sections/SettingsSectionContainers.tsx`

4. Tests:
- `src/services/tauri.test.ts`
- `src/features/settings/components/SettingsView.test.tsx`

## Sync Checklist

1. Feature flags
- Verify upstream key remains `features.multi_agent`.
- Keep CodexMonitor scoped to the new key only (no legacy alias read/write).
- Keep CodexMonitor writes aligned with upstream expectations.

2. Agents schema
- Verify `[agents]` shape still supports `max_threads` plus dynamic role tables.
- Verify role fields (`description`, `config_file`) and path semantics.

3. Defaults/validation
- Check upstream default for `agents.max_threads` and validation constraints.
- Reconcile CodexMonitor guardrails when upstream changes.

4. Role setup behavior
- Verify built-in role names/descriptions and built-in config files (currently includes `explorer.toml`).
- Verify per-role override keys used in role configs (for example `model`, `model_reasoning_effort`).

5. Runtime behavior
- Verify thread-limit enforcement still flows through agent control spawn/resume paths.
- Verify multi-agent tool behavior (`spawn_agent`, `send_input`, `wait`, `close_agent`, `resume_agent`) if surfaced in UX.

## Known Intentional Divergence

- Upstream Codex default `agents.max_threads` is `6`.
- CodexMonitor currently enforces a product cap of `12` in UI + backend.

If upstream introduces a hard max or materially changes spawn behavior, revisit this cap and update both:

- `src-tauri/src/shared/agents_config_core.rs`
- `src/features/settings/components/sections/SettingsAgentsSection.tsx`

## Validation Before Merge

```bash
npm run typecheck
npm run test -- src/services/tauri.test.ts src/features/settings/components/SettingsView.test.tsx
cd src-tauri && cargo check
```
