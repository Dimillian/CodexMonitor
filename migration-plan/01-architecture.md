# Architecture: Codex vs OpenCode

## Architecture Codex (actuelle)

```
┌─────────────────────────────────────────────────────────────────┐
│                      CodexMonitor (Tauri App)                    │
│                                                                  │
│  ┌──────────┐   ┌────────────────────┐   ┌───────────────────┐  │
│  │ Frontend │◄──► Tauri IPC (JSON)   │   │  codex/mod.rs     │  │
│  │ (React)  │   │ lib.rs commands    │   │  (Tauri adapter)  │  │
│  └──────────┘   └────────┬───────────┘   └────────┬──────────┘  │
│                          │                        │             │
│                          ▼                        ▼             │
│                   ┌──────────────────────────────────────┐      │
│                   │          shared/codex_core.rs        │      │
│                   │    (business logic, JSON-RPC calls)  │      │
│                   └────────────────┬─────────────────────┘      │
│                                    │                            │
│                                    ▼                            │
│                   ┌──────────────────────────────────────┐      │
│                   │      backend/app_server.rs           │      │
│                   │   WorkspaceSession (JSON-RPC stdio)  │      │
│                   │   spawn: codex app-server            │      │
│                   └────────────────┬─────────────────────┘      │
│                                    │                            │
│                                    ▼ stdin/stdout               │
│                   ┌──────────────────────────────────────┐      │
│                   │    codex app-server (child process)  │      │
│                   │    Workspace CWD + CODEX_HOME env    │      │
│                   └──────────────────────────────────────┘      │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Remote Mode: TCP → codex-monitor-daemon → codex app-server │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Flux Actuel (Codex)

1. L'app Tauri lance `codex app-server` par workspace (process enfant)
2. Communication JSON-RPC bidirectionnelle via stdin/stdout
3. `WorkspaceSession` gère : envoi requêtes, routage réponses, dispatch événements
4. Événements asynchrones poussés vers le frontend via Tauri events
5. Mode remote : TCP → daemon → même protocole JSON-RPC stdio

## Architecture OpenCode (cible)

```
┌─────────────────────────────────────────────────────────────────┐
│                     OpenCodeMonitor (Tauri App)                  │
│                                                                  │
│  ┌──────────┐   ┌────────────────────┐   ┌───────────────────┐  │
│  │ Frontend │◄──► Tauri IPC (JSON)   │   │ opencode/mod.rs   │  │
│  │ (React)  │   │ lib.rs commands    │   │ (Tauri adapter)   │  │
│  └──────────┘   └────────┬───────────┘   └────────┬──────────┘  │
│                          │                        │             │
│                          ▼                        ▼             │
│                   ┌──────────────────────────────────────┐      │
│                   │     shared/opencode_core.rs          │      │
│                   │   (business logic, HTTP API calls)   │      │
│                   └────────────────┬─────────────────────┘      │
│                                    │                            │
│                                    ▼                            │
│                   ┌──────────────────────────────────────┐      │
│                   │   backend/opencode_server.rs         │      │
│                   │   OpenCodeSession (HTTP client)      │      │
│                   │   spawn: opencode serve              │      │
│                   └────────────────┬─────────────────────┘      │
│                                    │                            │
│                                    ▼ HTTP REST API              │
│                   ┌──────────────────────────────────────┐      │
│                   │   opencode serve (child process)     │      │
│                   │   API: /session/*, /config, /connect │      │
│                   └──────────────────────────────────────┘      │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Remote Mode: TCP → opencode-monitor-daemon → HTTP        │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Flux Cible (OpenCode)

1. L'app Tauri lance `opencode serve` par workspace (process enfant)
2. Communication via API HTTP REST sur `http://127.0.0.1:{port}`
3. `OpenCodeSession` gère : appels HTTP, polling événements, dispatch
4. Événements récupérés par polling HTTP ou endpoint SSE
5. Mode remote : TCP → daemon → HTTP API

## Mapping Protocole

| Codex (JSON-RPC stdio) | OpenCode (HTTP API) |
|------------------------|---------------------|
| `thread/start` | `POST /session` ou `opencode session new` |
| `turn/start` | Envoi message texte dans session |
| `turn/steer` | Envoi message follow-up |
| `turn/interrupt` | `POST /session/:id/stop` |
| `thread/list` | `GET /session` |
| `thread/resume` | `GET /session/:id` |
| `thread/archive` | Fermeture session |
| `model/list` | `GET /models` dans le CLI ou `config.providers()` |
| `account/read` | `GET /me` ou infos provider |
| `review/start` | `/review` dans le prompt |
| `compact/start` | Non applicable (géré par OpenCode) |
| `skills/list` | Skills installés côté OpenCode |
| `app/list` | Non applicable (plugins MCP) |
| `collaborationMode/list` | Non applicable |
| `mcpServerStatus/list` | `GET /mcp` ou config |
| `experimentalFeature/list` | Non applicable |

## Différences Clés

### Points d'attention

1. **OpenCode n'a pas de mode `app-server` dédié** — il utilise `opencode serve`
   qui expose une API HTTP REST, pas de JSON-RPC stdio.

2. **Pas de workspace intégré** dans OpenCode — chaque instance `opencode serve`
   gère une session unique. L'orchestration multi-workspace doit être maintenue
   par l'app Tauri.

3. **Événements push** — Codex pousse les événements via stdout (notifications
   JSON-RPC). OpenCode n'a pas d'équivalent SSE direct documenté. Solution:
   polling périodique ou utiliser `opencode run` en mode non-interactif.

4. **Configuration** — Codex utilise `config.toml` avec `[features]` pour les
   flags. OpenCode utilise `opencode.json` avec une structure différente.

5. **Login/Auth** — Codex a `account/login/start`. OpenCode utilise `/connect`
   pour les providers.
