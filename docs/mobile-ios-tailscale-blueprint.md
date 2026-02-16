# CodexMonitor iOS Remote Blueprint (Tailscale + TCP)

This document is the canonical runbook for iOS remote usage with a desktop-hosted CodexMonitor backend over Tailscale.

## Scope

- iOS app runs in remote backend mode.
- Desktop app runs the TCP mobile access daemon.
- Connectivity is provided by the user-managed Tailscale tailnet.
- Hosted relay providers are out of scope.

## Current Architecture

1. Desktop CodexMonitor hosts the daemon and executes Codex workflows.
2. iOS CodexMonitor connects to the desktop daemon using `remoteBackendHost` + token.
3. Transport is TCP only (`remoteBackendProvider = "tcp"`).
4. Tailscale is used as the network path between iOS and desktop.

## Prerequisites

- Desktop and iPhone are signed into the same Tailscale tailnet.
- Desktop CodexMonitor is installed and able to run local workspaces.
- iOS build/runtime is available (simulator or device).
- A non-empty remote backend token is configured.

## Desktop Setup (Source of Truth)

In desktop CodexMonitor:

1. Open `Settings > Server`.
2. Set `Remote backend token`.
3. In `Mobile access daemon`, click `Start daemon`.
4. In `Tailscale helper`, click `Detect Tailscale`.
5. Use `Use suggested host` or copy the suggested host manually (example: `macbook.your-tailnet.ts.net:4732`).

Optional fallback:

- Use `Refresh daemon command` to get a manual launch command template.

## iOS Setup

In iOS CodexMonitor:

1. Open `Settings > Server` (or the mobile setup wizard).
2. Enter the desktop Tailscale host (including port).
3. Enter the same remote backend token used on desktop.
4. Tap `Connect & test`.

Success criteria:

- Connectivity check passes.
- Workspace list loads from desktop backend.

## Operational Notes

- Desktop daemon must remain running while iOS is connected.
- Mobile flow is remote-only and uses user infrastructure.
- Desktop remains local-first unless switched to remote mode explicitly.

## Known Mobile Limits

- Terminal tooling is unavailable on mobile builds.
- Dictation is unavailable on mobile builds.

## Troubleshooting

- `Unable to reach remote backend`:
  - Verify desktop daemon is running.
  - Verify host/token match desktop settings.
  - Verify both devices are online in the same tailnet.
- `Token (required)` / auth failures:
  - Set a non-empty token in desktop Server settings.
  - Re-enter the same token on iOS.
- No suggested host shown:
  - Confirm Tailscale is installed and connected on desktop.
  - Retry `Detect Tailscale`.

