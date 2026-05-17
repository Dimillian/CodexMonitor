# Documentation, Scripts et CI/CD

## 1. README.md

Réécrire `README.md` avec les références OpenCode:

```markdown
# OpenCodeMonitor

OpenCodeMonitor is a Tauri app for orchestrating multiple OpenCode agents across
local workspaces. It provides a sidebar to manage projects, a home screen for
quick actions, and a conversation view backed by the OpenCode serve API.
```

### Sections à mettre à jour

| Ligne | Ancien | Nouveau |
|-------|--------|---------|
| 1 | `# CodexMonitor` | `# OpenCodeMonitor` |
| 3 | Badge gitcgr (CodexMonitor) | Badge gitcgr (OpenCodeMonitor) |
| 7 | `CodexMonitor is a Tauri app for orchestrating multiple Codex agents` | `OpenCodeMonitor is a Tauri app for orchestrating multiple OpenCode agents` |
| 14 | `Spawn one codex app-server per workspace` | `Spawn one opencode serve per workspace` |
| 17 | `Optional remote backend (daemon) mode for running Codex on another machine` | `Optional remote backend (daemon) mode for running OpenCode on another machine` |
| 55 | `Codex CLI installed and available as codex in PATH` | `OpenCode CLI installed and available as opencode in PATH` |
| 114-130 | `codex_monitor_daemon`, `codex_monitor_daemonctl` | `opencode_monitor_daemon`, `opencode_monitor_daemonctl` |
| 279-301 | `codex_monitor_daemon.rs`, `codex/` | `opencode_monitor_daemon.rs`, `opencode/` |
| 293 | `~/.codex` | `~/.config/opencode` |
| 299 | `codex app-server` | `opencode serve` |

### Nouvelles sections à ajouter

```markdown
## Prerequisites

- OpenCode CLI installed as `opencode` in PATH
- Run `opencode` at least once to configure your provider
```

## 2. Documentation (`docs/`)

### `docs/codebase-map.md`

Mettre à jour tous les chemins et noms de modules.

| Ancien | Nouveau |
|--------|---------|
| `codex_monitor_daemon/rpc.rs` | `opencode_monitor_daemon/rpc.rs` |
| `src-tauri/src/codex/` | `src-tauri/src/opencode/` |
| `bin/codex_monitor_daemon/` | `bin/opencode_monitor_daemon/` |
| `shared/codex_core.rs` | `shared/opencode_core.rs` |
| `shared/codex_aux_core.rs` | `shared/opencode_aux_core.rs` |
| `shared/codex_update_core.rs` | `shared/opencode_update_core.rs` |

### `docs/app-server-events.md`

| Ancien | Nouveau |
|--------|---------|
| `CodexMonitor` | `OpenCodeMonitor` |
| `codex/backgroundThread` | `opencode/backgroundThread` |
| `codex/connected` | `opencode/connected` |
| `codex/event/skills_update_available` | `opencode/event/skills_update_available` |
| `codex_core.rs` | `opencode_core.rs` |
| `codex/mod.rs` | `opencode/mod.rs` |
| `codex_monitor_daemon.rs` | `opencode_monitor_daemon.rs` |

Note: La section "Where To Look In ../Codex" doit être réécrite car OpenCode
est un projet différent (anomalyco/opencode).

### `docs/multi-agent-sync-runbook.md`

Ce fichier référençait `../Codex` comme upstream (le repo OpenAI Codex).
Doit être réécrit pour pointer vers la doc OpenCode: `https://opencode.ai/docs`.

### `docs/mobile-ios-tailscale-blueprint.md`

| Ancien | Nouveau |
|--------|---------|
| `CodexMonitor iOS Remote Blueprint` | `OpenCodeMonitor iOS Remote Blueprint` |
| `codex_monitor_daemon` | `opencode_monitor_daemon` |
| `codex_monitor_daemonctl` | `opencode_monitor_daemonctl` |
| `com.dimillian.codexmonitor` | `com.dimillian.opencodemonitor` |

### `docs/index.html`

Réécrire complètement le site web de documentation:

- Titre: `Codex Monitor` → `OpenCode Monitor`
- Description: "Orchestrate Codex agents" → "Orchestrate OpenCode agents"
- URLs GitHub: `Dimillian/CodexMonitor` → `Dimillian/OpenCodeMonitor`
- Meta tags, OG tags, Twitter cards
- Testimonials, screenshots, footer

### `docs/changelog.html`

- `Codex Monitor` → `OpenCode Monitor`
- URLs mises à jour

### `docs/CNAME`

- `www.codexmonitor.app` → `www.opencodemonitor.app`

## 3. Scripts (`scripts/`)

### `scripts/build_run_ios_device.sh`

```bash
# Ancien
BUNDLE_ID="com.dimillian.codexmonitor.ios"
APP_PATH=".../Codex Monitor.app"

# Nouveau
BUNDLE_ID="com.dimillian.opencodemonitor.ios"
APP_PATH=".../OpenCode Monitor.app"
```

### `scripts/build_run_ios.sh`

```bash
# Mêmes changements que ci-dessus
BUNDLE_ID="com.dimillian.opencodemonitor.ios"
```

### `scripts/release_testflight_ios.sh`

```bash
# Ancien
BETA_DESCRIPTION="Codex Monitor iOS beta build..."
BUNDLE_ID="com.dimillian.codexmonitor.ios"
IPA_PATH=".../Codex Monitor.ipa"

# Nouveau
BETA_DESCRIPTION="OpenCode Monitor iOS beta build..."
BUNDLE_ID="com.dimillian.opencodemonitor.ios"
IPA_PATH=".../OpenCode Monitor.ipa"
```

### `scripts/macos-fix-openssl.sh`

```bash
# Ancien
app_path=".../Codex Monitor.app"
bin_path=".../codex-monitor"
daemon_path=".../codex_monitor_daemon"
daemonctl_path=".../codex_monitor_daemonctl"

# Nouveau
app_path=".../OpenCode Monitor.app"
bin_path=".../opencode-monitor"
daemon_path=".../opencode_monitor_daemon"
daemonctl_path=".../opencode_monitor_daemonctl"
```

## 4. CI/CD (`.github/workflows/`)

### `.github/workflows/release.yml`

| Ancien | Nouveau |
|--------|---------|
| `codexmonitor.key` (signing key) | `opencodemonitor.key` |
| `codex_monitor_daemon` (build) | `opencode_monitor_daemon` |
| `codex_monitor_daemonctl` (build) | `opencode_monitor_daemonctl` |
| `Codex Monitor.app` | `OpenCode Monitor.app` |
| `CodexMonitor.zip` | `OpenCodeMonitor.zip` |
| `CodexMonitor_${VERSION}_aarch64.dmg` | `OpenCodeMonitor_${VERSION}_aarch64.dmg` |
| `CodexMonitor.app.tar.gz.sig` | `OpenCodeMonitor.app.tar.gz.sig` |
| `CodexMonitor/releases` | `OpenCodeMonitor/releases` |
| `Cargo.lock` package `codex-monitor` | `opencode-monitor` |
| `codex-monitor_iOS/Info.plist` | `opencode-monitor_iOS/Info.plist` |

### `.github/workflows/ci.yml`

- Aucune référence directe à "codex". Ajuster si nécessaire.

## 5. Autres Fichiers

### `AGENTS.md`

```markdown
# Ancien
# CodexMonitor Agent Guide
CodexMonitor is a Tauri app that orchestrates Codex agents across local workspaces.

# Nouveau
# OpenCodeMonitor Agent Guide
OpenCodeMonitor is a Tauri app that orchestrates OpenCode agents across local workspaces.
```

### `REMOTE_BACKEND_POC.md`

Mettre à jour les noms de binaires et les chemins.

### `flake.nix`

```nix
# Ancien
description = "CodexMonitor Tauri app for orchestrating Codex agents";
pname = "codex-monitor-frontend";
pname = "codex-monitor";
cp "$target_dir/release/codex-monitor" $out/bin/

# Nouveau
description = "OpenCodeMonitor Tauri app for orchestrating OpenCode agents";
pname = "opencode-monitor-frontend";
pname = "opencode-monitor";
cp "$target_dir/release/opencode-monitor" $out/bin/
```

### `package.json`

```json
{
  "name": "opencode-monitor",
  // au lieu de "codex-monitor"
}
```

### `.vscode/extensions.json`

Aucun changement nécessaire.

### `.github/FUNDING.yml`

Aucun changement nécessaire.

## 6. Doctor Scripts

### `scripts/doctor.sh`

Mettre à jour les messages et chemins. Vérifier que `opencode` est dans le PATH
au lieu de `codex`.

### `scripts/doctor.mjs`

Adapter pour vérifier l'installation d'OpenCode au lieu de Codex.
