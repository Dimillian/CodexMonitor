# Plan Daemon RPC

## Architecture Actuelle

```
┌──────────────┐     TCP JSON-RPC      ┌──────────────────────────┐
│  Tauri App   │ ◄──────────────────►  │  codex-monitor-daemon    │
│  (Remote)    │     std: JSON-RPC     │                          │
│              │                       │  ┌────────────────────┐  │
│              │                       │  │ codex app-server   │  │
│              │                       │  │ (stdin/stdout)     │  │
│              │                       │  └────────────────────┘  │
└──────────────┘                       └──────────────────────────┘
```

## Architecture Cible

```
┌──────────────┐     TCP JSON-RPC      ┌──────────────────────────┐
│  Tauri App   │ ◄──────────────────►  │ opencode-monitor-daemon  │
│  (Remote)    │     (adapté)          │                          │
│              │                       │  ┌────────────────────┐  │
│              │                       │  │ opencode serve     │  │
│              │                       │  │ (HTTP REST API)    │  │
│              │                       │  └────────────────────┘  │
└──────────────┘                       └──────────────────────────┘
```

## 1. Renommage des Binaires

| Ancien | Nouveau |
|--------|---------|
| `codex-monitor-daemon` | `opencode-monitor-daemon` |
| `codex-monitor-daemonctl` | `opencode-monitor-daemonctl` |
| `codex_monitor_daemon` (source) | `opencode_monitor_daemon` |
| `codex_monitor_daemonctl` (source) | `opencode_monitor_daemonctl` |
| `CODEX_MONITOR_DAEMON_TOKEN` | `OPENCODE_MONITOR_DAEMON_TOKEN` |
| `CODEX_MONITOR_DAEMON_PATH` | `OPENCODE_MONITOR_DAEMON_PATH` |
| `EXPECTED_DAEMON_NAME: "codex-monitor-daemon"` | `"opencode-monitor-daemon"` |

## 2. Adaptation du Fichier Principal `bin/opencode_monitor_daemon.rs`

### Ancien: Lance `codex app-server` (JSON-RPC stdio)
### Nouveau: Lance `opencode serve` (HTTP REST)

Les changements principaux:

```rust
// Ancien (codex)
fn spawn_workspace_session(entry, bin, args, ...) {
    let mut cmd = tokio::process::Command("codex");
    cmd.args(["app-server"])
       .stdin(Stdio::piped())
       .stdout(Stdio::piped())
       .stderr(Stdio::piped());
    // JSON-RPC over stdio
}

// Nouveau (opencode)
fn spawn_opencode_session(entry, bin, args, ...) {
    let mut cmd = tokio::process::Command("opencode");
    cmd.args(["serve", "--port", "0", "--hostname", "127.0.0.1"])
       .stdout(Stdio::piped())
       .stderr(Stdio::piped());
    // Lire le port depuis stdout
    // Utiliser reqwest HTTP client pour la communication
}
```

### Auth

```rust
// Ancien
let token = env::var("CODEX_MONITOR_DAEMON_TOKEN");

// Nouveau
let token = env::var("OPENCODE_MONITOR_DAEMON_TOKEN");
```

## 3. Adaptation du Daemonctl

### `bin/opencode_monitor_daemonctl.rs`

```rust
// Ancien
const EXPECTED_DAEMON_NAME: &str = "codex-monitor-daemon";
const APP_IDENTIFIER: &str = "com.dimillian.codexmonitor";

// Nouveau
const EXPECTED_DAEMON_NAME: &str = "opencode-monitor-daemon";
const APP_IDENTIFIER: &str = "com.dimillian.opencodemonitor";
```

### Commandes daemonctl

```rust
// Ancien: ./codex-monitor-daemonctl start
// Nouveau: ./opencode-monitor-daemonctl start

// Ancien: cargo run --bin codex_monitor_daemonctl
// Nouveau: cargo run --bin opencode_monitor_daemonctl
```

## 4. Adaptation du RPC Layer

### `bin/opencode_monitor_daemon/rpc.rs`

```rust
// Ancien (codex.rs handler)
"get_codex_config_path" => {
    settings_core::get_codex_config_path_core()
}
"set_codex_feature_flag" => {
    state.set_codex_feature_flag(feature_key, enabled)
}
"codex_login" => {
    state.codex_login(workspace_id)
}

// Nouveau (opencode.rs handler)
"get_opencode_config_path" => {
    settings_core::get_opencode_config_path_core()
}
"set_opencode_feature_flag" => {
    state.set_opencode_feature_flag(feature_key, enabled)
}
"opencode_login" => {
    state.opencode_login(workspace_id)
}
```

### `bin/opencode_monitor_daemon/rpc/codex.rs` → `opencode.rs`

Adapter les method handlers pour le nouveau protocole OpenCode:
- Les appels JSON-RPC deviennent des appels HTTP
- Les réponses asynchrones deviennent des réponses HTTP synchrones (ou avec polling)
- Les événements push doivent être gérés différemment

## 5. Adaptation du Remote Backend

### `remote_backend/transport.rs` et `tcp_transport.rs`

Le transport TCP peut rester largement inchangé — il encapsule juste des messages
JSON-RPC. C'est le contenu des messages qui change.

### `remote_backend/protocol.rs`

Adapter les méthodes RPC pour correspondre au nouveau protocole OpenCode.

### `remote_backend/mod.rs`

```rust
// Ancien
"set_workspace_runtime_codex_args"

// Nouveau
"set_workspace_runtime_opencode_args"
```

## 6. Adaptation du Module Tailscale

### `tailscale/daemon_commands.rs`

```rust
// Ancien
const EXPECTED_DAEMON_NAME: &str = "codex-monitor-daemon";

// Nouveau
const EXPECTED_DAEMON_NAME: &str = "opencode-monitor-daemon";
```

### `tailscale/core.rs`

Mettre à jour les chemins de binaires dans les tests.

## 7. Tableau Récapitulatif

| Fichier | Changement |
|---------|------------|
| `bin/codex_monitor_daemon.rs` | Renommer + adapter spawn pour `opencode serve` |
| `bin/codex_monitor_daemonctl.rs` | Renommer + adapter noms |
| `bin/codex_monitor_daemon/rpc.rs` | Renommer |
| `bin/codex_monitor_daemon/rpc/codex.rs` | Renommer + adapter method handlers |
| `bin/codex_monitor_daemon/rpc/dispatcher.rs` | Mettre à jour dispatch |
| `bin/codex_monitor_daemon/rpc/workspace.rs` | Renommer méthodes |
| `bin/codex_monitor_daemon/rpc/daemon.rs` | (inchangé) |
| `bin/codex_monitor_daemon/rpc/git.rs` | (inchangé) |
| `bin/codex_monitor_daemon/rpc/prompts.rs` | Adapter chemins |
| `remote_backend/mod.rs` | Adapter noms de méthodes |
| `remote_backend/transport.rs` | (inchangé) |
| `remote_backend/tcp_transport.rs` | (inchangé) |
| `tailscale/daemon_commands.rs` | Renommer daemon name |
| `tailscale/core.rs` | Adapter chemins |
