# Migration Plan - CodexMonitor → OpenCodeMonitor

## Résumé Exécutif

Ce plan détaille la migration de **CodexMonitor** (Tauri app qui orchestre des agents
OpenAI Codex CLI) vers **OpenCodeMonitor** (Tauri app qui orchestre des agents
OpenCode CLI).

### Pourquoi cette migration ?

- Le projet utilisait `@openai/codex` (Codex CLI) comme backend agent.
- L'utilisateur souhaite utiliser **OpenCode CLI** (`opencode`) à la place.
- Les deux CLI ont des architectures, protocoles et formats de configuration
  fondamentalement différents.

### Différence Fondamentale

| Aspect | Codex CLI | OpenCode CLI |
|--------|-----------|--------------|
| Protocole | JSON-RPC over stdio (`codex app-server`) | API HTTP REST (`opencode serve`) |
| Configuration | `config.toml` (`~/.codex/config.toml`) | `opencode.json` (`~/.config/opencode/opencode.json`) |
| Home | `$CODEX_HOME` / `~/.codex` | `~/.config/opencode/` |
| Auth | Fichier `auth.json` | `opencode.json` + providers |
| Sessions | Threads with turns/items | Sessions with messages |
| Modèle de données | `thread/turn/item` | `session/message` |

### Envergure du Projet

| Métrique | Valeur |
|----------|--------|
| Fichiers Rust impactés | ~50+ fichiers |
| Fichiers TypeScript/TSX impactés | ~80+ fichiers |
| Fichiers de documentation | ~8 fichiers |
| Scripts | ~6 fichiers |
| CI/Release | ~2 workflows GitHub |
| **Total estimé** | **~150+ fichiers** |

### Grands Chantiers

1. **Renommage systématique** `codex` → `opencode` (projet, binaires, modules, types)
2. **Réécriture du calque de communication** (`WorkspaceSession` JSON-RPC stdio → HTTP client)
3. **Adaptation du système de configuration** (`config.toml` → `opencode.json`)
4. **Refonte du daemon RPC** (adaptation au nouveau protocole)
5. **Mise à jour du frontend** (IPC, types, UI, localStorage)
6. **Documentation, scripts, CI/CD**
7. **Optimisations post-migration**

### Risques

- **Haut**: Le protocole HTTP d'OpenCode est différent du JSON-RPC de Codex — toute la couche
  `backend/app_server.rs` et `codex_core.rs` doit être réécrite.
- **Moyen**: Le système d'agents (`.codex/agents/`) et les features flags (`config.toml`)
  n'ont pas d'équivalent direct dans OpenCode.
- **Moyen**: Le daemon RPC TCP doit être adapté au nouveau protocole.
- **Faible**: Le renommage et la doc sont volumineux mais mécaniques.
