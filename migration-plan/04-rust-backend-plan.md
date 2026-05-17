# Plan Backend Rust

## Structure des Fichiers Après Migration

```
src-tauri/src/
├── opencode/                        # (ex: codex/)
│   ├── mod.rs                       # Tauri commands → appels HTTP
│   ├── args.rs                      # Résolution d'arguments opencode
│   ├── config.rs                    # Lecture/écriture opencode.json
│   └── home.rs                      # Résolution OPENCODE_CONFIG_DIR
├── backend/
│   ├── app_server.rs                # SUPPRIMER (remplacé par opencode_server.rs)
│   ├── opencode_server.rs           # NOUVEAU: OpenCodeSession (HTTP client)
│   ├── process_core.rs              # (inchangé: tokio process utils)
│   └── events.rs                    # Adapter EventSink
├── shared/
│   ├── mod.rs                       # Renommer modules
│   ├── opencode_core.rs             # (ex: codex_core.rs) Appels HTTP
│   ├── opencode_aux_core.rs         # (ex: codex_aux_core.rs)
│   ├── opencode_update_core.rs      # (ex: codex_update_core.rs)
│   ├── config_toml_core.rs          # SUPPRIMER ou adapter
│   ├── settings_core.rs             # Adapter (plus de sync config.toml)
│   ├── agents_config_core.rs        # Adapter au format OpenCode
│   ├── prompts_core.rs              # Adapter chemins
│   ├── files_core.rs                # Adapter chemins
│   ├── local_usage_core.rs          # Adapter chemins
│   └── ...autres modules            # Ajustements mineurs
├── bin/
│   ├── opencode_monitor_daemon.rs   # (ex: codex_monitor_daemon.rs)
│   ├── opencode_monitor_daemonctl   # (ex: codex_monitor_daemonctl.rs)
│   └── opencode_monitor_daemon/     # (ex: codex_monitor_daemon/)
│       ├── rpc.rs
│       ├── dispatcher.rs
│       ├── opencode.rs              # RPC methods pour OpenCode
│       ├── workspace.rs
│       ├── git.rs
│       ├── prompts.rs
│       └── daemon.rs
├── lib.rs                           # Renommer imports de modules
├── state.rs                         # Renommer types
├── types.rs                         # Renommer champs
└── ...autres fichiers               # Renommer références
```

## Étape 1: Renommage des Modules et Fichiers

```bash
# Déplacer/renommer les dossiers
mv src-tauri/src/codex src-tauri/src/opencode
mv src-tauri/src/bin/codex_monitor_daemon.rs src-tauri/src/bin/opencode_monitor_daemon.rs
mv src-tauri/src/bin/codex_monitor_daemonctl.rs src-tauri/src/bin/opencode_monitor_daemonctl.rs
mv src-tauri/src/bin/codex_monitor_daemon src-tauri/src/bin/opencode_monitor_daemon

# Renommer les fichiers dans le nouveau dossier opencode/
mv src-tauri/src/opencode/config.rs src-tauri/src/opencode/config.rs  # déjà bon
mv src-tauri/src/opencode/args.rs src-tauri/src/opencode/args.rs      # déjà bon
mv src-tauri/src/opencode/home.rs src-tauri/src/opencode/home.rs      # déjà bon

# Renommer les modules shared
mv src-tauri/src/shared/codex_core.rs src-tauri/src/shared/opencode_core.rs
mv src-tauri/src/shared/codex_aux_core.rs src-tauri/src/shared/opencode_aux_core.rs
mv src-tauri/src/shared/codex_update_core.rs src-tauri/src/shared/opencode_update_core.rs
```

## Étape 2: Réécriture du Calque de Communication

### Nouveau fichier: `backend/opencode_server.rs`

Remplacer `WorkspaceSession` (JSON-RPC stdio) par `OpenCodeSession` (HTTP):

```rust
// Architecture de OpenCodeSession
pub(crate) struct OpenCodeSession {
    process: tokio::process::Child,
    base_url: String,        // http://127.0.0.1:{port}
    client: reqwest::Client, // HTTP client
    // ... channels pour événements
}

pub(crate) async fn spawn_opencode_session(
    entry: &WorkspaceEntry,
    default_bin: Option<String>,
    opencode_args: Option<String>,
    app_handle: AppHandle,
    opencode_home: Option<PathBuf>,
) -> Arc<OpenCodeSession> {
    // 1. Vérifier installation: opencode --version
    // 2. Construire commande: opencode serve --port {auto} --hostname 127.0.0.1
    // 3. Lire le port depuis stdout (opencode imprime le port)
    // 4. Initialiser le client HTTP
    // 5. Ping l'API /health pour confirmer
    // 6. Retourner la session
}
```

### API HTTP OpenCode à utiliser

Basé sur `opencode_ai_llms.txt`:

| Méthode | Endpoint / Commande |
|---------|-------------------|
| POST | `/session/:id/init` |
| GET | `/session/:id/children` |
| GET | `/config` |
| GET | `/config/providers` |
| CLI | `opencode run "prompt"` (pour prompts one-shot) |
| CLI | `opencode github install` (GitHub agent) |

### Nouveau fichier: `shared/opencode_core.rs`

```rust
// Exemple de structure des appels HTTP

pub(crate) async fn start_session_core(
    sessions: &HashMap<String, Arc<OpenCodeSession>>,
    workspace_id: &str,
) -> Result<SessionStartResult, String> {
    let session = sessions.get(workspace_id).ok_or("Session not found")?;
    let resp = session.client
        .post(format!("{}/session", session.base_url))
        .json(&serde_json::json!({
            "model": "anthropic/claude-sonnet-4-5",
        }))
        .send()
        .await
        .map_err(|e| format!("HTTP error: {e}"))?;
    // ... parsing réponse
}

pub(crate) async fn send_message_core(
    sessions: &HashMap<String, Arc<OpenCodeSession>>,
    workspace_id: &str,
    thread_id: &str,
    message: &str,
) -> Result<(), String> {
    let session = sessions.get(workspace_id).ok_or("Session not found")?;
    // Utiliser opencode run pour envoyer le message dans la session
    // ou POST à l'API session/:id/turn
    todo!("Implémenter selon l'API OpenCode réelle")
}
```

### Nouveau fichier: `shared/opencode_aux_core.rs`

```rust
pub(crate) async fn opencode_check_core(
    settings: &AppSettings,
    opencode_bin: Option<String>,
    opencode_args: Option<String>,
) -> OpenCodeCheckResult {
    // opencode --version au lieu de codex --version
    // opencode serve --help au lieu de codex app-server --help
}

pub(crate) async fn generate_commit_message_core(
    // Utiliser opencode run avec un prompt dédié
    // au lieu de background thread codex
) -> Result<String, String> {
    // Lancer: opencode run "Generate a git commit message..."
    // Récupérer la sortie
}
```

## Étape 3: Mise à Jour de Cargo.toml

```toml
[package]
name = "opencode-monitor"   # au lieu de "codex-monitor"

[[bin]]
name = "opencode-monitor"   # au lieu de "codex-monitor"

[[bin]]
name = "opencode-monitor-daemon"   # au lieu de "codex-monitor-daemon"

[[bin]]
name = "opencode-monitor-daemonctl" # au lieu de "codex-monitor-daemonctl"

[lib]
name = "opencode_monitor_lib"  # au lieu de "codex_monitor_lib"
```

## Étape 4: Mise à Jour de lib.rs

```rust
// Renommer les mod imports
mod opencode;        // au lieu de mod codex;
// ...
use opencode::...   // au lieu de use codex::...

// Renommer les commandes Tauri
// "codex_doctor" → "opencode_check"
// "codex_update" → "opencode_update"
// etc.
```

## Étape 5: Adaptation des Autres Modules

| Fichier | Changement |
|---------|------------|
| `state.rs` | `codex_login_cancels` → `opencode_login_cancels`, `sessions` type change |
| `types.rs` | Renommer champs `codex_bin` → `opencode_bin`, `codex_args` → `opencode_args` |
| `tray.rs` | Renommer tooltip |
| `storage.rs` | Chemins de données |
| `workspaces/` | Adapter les appels à `spawn_opencode_session` |
| `files/` | Adapter les chemins CODEX_HOME |
| `tailscale/` | Renommer nom du daemon |
| `remote_backend/` | Adapter au nouveau protocole |
| `settings/` | Adapter les commandes Tauri |
| `prompts/` | Adapter les chemins |
| `menu.rs` | Renommer les références |

## Fichier Clé: `backend/app_server.rs`

C'est le fichier le plus impacté (~1100 lignes). Il doit être réécrit pour:

1. Lancer `opencode serve` au lieu de `codex app-server`
2. Utiliser reqwest HTTP client au lieu de JSON-RPC stdio parsing
3. Adapter le système d'initialization (pas de `initialize` JSON-RPC)
4. Adapter le routage des événements (pas de notifications JSON-RPC push)
5. Remplacer le système de pending requests one-shot par des appels HTTP directs

**Approche recommandée**: Ne pas modifier `app_server.rs` — créer `opencode_server.rs`
et supprimer l'ancien fichier. C'est une réécriture complète.
