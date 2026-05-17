# Catégories de Changements

Les changements sont classés en 7 catégories distinctes.

## 1. Renommage (Mécanique)

Simples substitutions de noms, sans changement de logique.

| Pattern source | Pattern cible |
|----------------|---------------|
| `codex` (CLI binaire) | `opencode` |
| `CodexMonitor` | `OpenCodeMonitor` |
| `codex-monitor` | `opencode-monitor` |
| `codex_monitor` | `opencode_monitor` |
| `CODEX_HOME` | `OPENCODE_CONFIG_DIR` ou `XDG_CONFIG_HOME/opencode` |
| `~/.codex/` | `~/.config/opencode/` |
| `com.dimillian.codexmonitor` | `com.dimillian.opencodemonitor` |
| `codex/event/...` | `opencode/event/...` |
| `codexBin`, `codexArgs` | `opencodeBin`, `opencodeArgs` |
| `CodexFeature*` | `OpenCodeFeature*` |
| `gpt-5-codex` (modèle) | Modèle OpenCode correspondant |

## 2. Changements de Protocole (Complexité Haute)

Réécriture du calque de communication.

| Fichier | Changement |
|---------|------------|
| `backend/app_server.rs` | Réécrire `WorkspaceSession` (JSON-RPC stdio) → `OpenCodeSession` (HTTP) |
| `shared/codex_core.rs` | Réécrire tous les appels JSON-RPC → appels HTTP REST |
| `shared/codex_aux_core.rs` | Adapter `codex_doctor_core`, background prompts |
| `codex/mod.rs` → `opencode/mod.rs` | Adapter les Tauri commands |
| `codex/args.rs` | Réviser la résolution d'arguments |
| `events.rs` (Rust backend) | Adapter le format des événements |
| `appServerEvents.ts` (frontend) | Adapter les noms d'événements |
| `utils/codexArgsInput.ts` | Adapter la normalisation d'args |
| `utils/codexArgsProfiles.ts` | Revoir les profils d'args OpenCode |

## 3. Configuration (Complexité Haute)

Adaptation des formats de configuration.

| Fichier | Changement |
|---------|------------|
| `codex/config.rs` → `opencode/config.rs` | Lire/écrire `opencode.json` au lieu de `config.toml` |
| `codex/home.rs` → `opencode/home.rs` | Résoudre `~/.config/opencode/` au lieu de `~/.codex` |
| `shared/config_toml_core.rs` | Adapter ou supprimer (plus de config.toml) |
| `shared/settings_core.rs` | Adapter la synchronisation de settings |
| `shared/agents_config_core.rs` | Adapter/réécrire la gestion d'agents |
| `src/types.ts` (AppSettings) | Renommer `codexBin`/`codexArgs`, adapter types |
| `src/services/tauri.ts` | Adapter les appels IPC |

## 4. Système d'Agents (Complexité Moyenne)

OpenCode a un concept d'agents différent.

| Fichier | Changement |
|---------|------------|
| `shared/agents_config_core.rs` | Adapter au format OpenCode (subagents dans `opencode.json`) |
| `codex/mod.rs` (agent commands) | Adapter les Tauri commands agents |
| Frontend agents UI | Adapter l'UI des paramètres d'agents |

## 5. Daemon RPC (Complexité Haute)

Adaptation du daemon TCP au nouveau protocole.

| Fichier | Changement |
|---------|------------|
| `bin/codex_monitor_daemon.rs` | Réécrire: `opencode_monitor_daemon.rs` |
| `bin/codex_monitor_daemonctl.rs` | Réécrire: `opencode_monitor_daemonctl.rs` |
| `bin/codex_monitor_daemon/rpc/*` | Adapter au nouveau protocole |
| `remote_backend/*` | Adapter le transport |

## 6. Frontend (Complexité Moyenne)

Mise à jour de l'UI et de l'IPC.

| Fichier | Changement |
|---------|------------|
| `src/features/settings/*` | Renommer sections, adapter labels |
| `src/features/app/*` | Renommer hooks, adapter état |
| `src/features/composer/*` | Mettre à jour placeholders, autocomplete |
| `src/features/threads/*` | Renommer storage keys, types |
| `src/services/events.ts` | Adapter les événements |
| `src/services/tauri.ts` | Renommer fonctions IPC |
| `src/types.ts` | Renommer types |
| `src/App.tsx` | Mettre à jour les références |

## 7. Documentation, Scripts, CI (Complexité Faible)

Mise à jour mécanique.

| Fichier | Changement |
|---------|------------|
| `README.md` | Réécrire pour OpenCode |
| `docs/*.md` | Mettre à jour références Codex → OpenCode |
| `docs/index.html` | Réécrire site web |
| `AGENTS.md` | Mettre à jour le fichier agent |
| `scripts/*.sh` | Renommer binaires, chemins |
| `.github/workflows/release.yml` | Adater les artefacts, noms |
| `flake.nix` | Renommer packages |
