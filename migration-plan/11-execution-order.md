# Ordre d'Exécution Recommandé

## Légende

- **Durée**: Estimation basse/haute en heures de travail effectif
- **Risque**: Faible/Moyen/Élevé (impact sur la stabilité du projet)
- **Dépendances**: Étapes qui doivent être faites avant

---

## Phase 0: Préparation (1h)

```bash
# 1. Sauvegarder l'état actuel
git checkout -b migration/opencode-prep
git tag pre-migration-$(date +%Y%m%d)

# 2. Vérifier l'installation OpenCode
opencode --version

# 3. Étudier la doc OpenCode
opencode ai docs    # si dispo, ou lire https://opencode.ai/docs

# 4. Lire les fichiers de référence
# - opencode_ai_llms.txt (déjà lu)
# - developers_openai_codex_llms.txt (déjà lu)
```

---

## Phase 1: Renommage Projet et Binaires (4-6h) ⚠️ Risque: Faible

**Objectif**: Renommer le projet, les binaires, les packages sans changer la logique.

### Ordre

1. **Cargo.toml** — Renommer le crate et les binaires
2. **package.json** — Renommer le package npm
3. **lib.rs** — Renommer les modules imports
4. **Fichiers Rust** — Renommer modules `codex/` → `opencode/`, `codex_core` → `opencode_core`, etc.
5. **Fichiers TypeScript** — Renommer types, fonctions, imports
6. **Chemins** — Renommer dossiers et fichiers (via git mv)
7. **Validation**: `cargo check`, `npm run typecheck`, `npm run test`

✅ **Checkpoint**: Le projet compile et les tests passent (même si la logique Codex
est encore utilisée).

---

## Phase 2: Rewrite du Calque de Communication (8-16h) ⚠️ Risque: Élevé

**Objectif**: Remplacer le JSON-RPC stdio de Codex par l'API HTTP REST d'OpenCode.

### Sous-étapes

#### 2a. Créer `backend/opencode_server.rs` (4-6h)
- Lancer `opencode serve` au lieu de `codex app-server`
- Implémenter `OpenCodeSession` avec reqwest HTTP client
- Lire le port depuis la sortie stdout
- Implémenter health check
- **Test**: `cargo test` + test manuel avec `opencode serve`

#### 2b. Réécrire `shared/opencode_core.rs` (3-5h)
- Adapter tous les appels JSON-RPC → HTTP REST
- start_session, send_message, list_sessions, etc.
- Remplacer les oneshot channels par des appels HTTP directs
- **Test**: Tests unitaires avec mock HTTP + tests d'intégration

#### 2c. Réécrire `shared/opencode_aux_core.rs` (2-3h)
- `opencode_check_core` (ex: codex_doctor)
- Background prompts via `opencode run` au lieu de threads cachés
- Génération de commit messages, run metadata
- **Test**: Tests manuels

#### 2d. Réécrire `codex/mod.rs` → `opencode/mod.rs` (1-2h)
- Adapter les Tauri commands
- **Test**: `cargo check`

✅ **Checkpoint**: Les opérations de base fonctionnent (création session, envoi message).

---

## Phase 3: Configuration (4-8h) ⚠️ Risque: Moyen

**Objectif**: Remplacer la config TOML par la config JSON OpenCode.

### Sous-étapes

1. **`opencode/config.rs`** — Lire/écrire `opencode.json`
2. **`opencode/home.rs`** — Résoudre `~/.config/opencode/`
3. **`shared/settings_core.rs`** — Adapter la synchronisation
4. **Supprimer** `shared/config_toml_core.rs`
5. **`shared/agents_config_core.rs`** — Adapter
6. **`shared/account.rs`** — Adapter l'auth
7. **`shared/prompts_core.rs`**, **`shared/files_core.rs`** — Nouveaux chemins
8. **Validation**: Tests de lecture/écriture de config

✅ **Checkpoint**: Les settings sont chargés depuis opencode.json.

---

## Phase 4: Frontend (4-8h) ⚠️ Risque: Moyen

**Objectif**: Mettre à jour toute la couche frontend.

### Ordre recommandé

1. **`src/types.ts`** — Renommer les types (plus risqué, beaucoup de dépendances)
2. **`src/services/tauri.ts`** — Renommer les wrappers IPC
3. **`src/services/events.ts`** — Mettre à jour les noms d'événements
4. **Utils thread** — `codexArgsProfiles.ts`, `codexArgsInput.ts`, `threadStorage.ts`
5. **Hooks thread** — `useThreadCodexParams.ts`, `useThreads.ts`, etc.
6. **Composants app** — `MainApp.tsx`, `TabBar.tsx`, `TabletNav.tsx`
7. **Composants composer** — `Composer.tsx`, `ComposerInput.tsx`, `ComposerMetaBar.tsx`
8. **Paramètres** — `SettingsCodexSection.tsx`, `useSettingsCodexSection.ts`
9. **Mettre à jour les clés localStorage**
10. **Fichiers de test** — Adapter les tests

✅ **Checkpoint**: `npm run typecheck` et `npm run test` passent.

---

## Phase 5: Daemon RPC (4-8h) ⚠️ Risque: Élevé

**Objectif**: Adapter le daemon TCP au nouveau protocole.

### Ordre

1. Renommer les binaires daemon
2. Adapter `bin/opencode_monitor_daemon.rs` pour lancer `opencode serve`
3. Adapter `bin/opencode_monitor_daemonctl.rs`
4. Adapter les handlers RPC
5. Adapter `remote_backend/`
6. Adapter `tailscale/`

✅ **Checkpoint**: `cargo build` et le mode remote fonctionne.

---

## Phase 6: Documentation, Scripts, CI (2-4h) ⚠️ Risque: Faible

**Objectif**: Mettre à jour tous les fichiers non-code.

### Ordre

1. `README.md`
2. `docs/*.md`
3. `docs/index.html`, `docs/changelog.html`, `docs/CNAME`
4. `scripts/*.sh`
5. `.github/workflows/release.yml`
6. `flake.nix`
7. `AGENTS.md`, `REMOTE_BACKEND_POC.md`

✅ **Checkpoint**: Aucune référence résiduelle à "codex" dans les fichiers
(voir commande `rg` dans le plan de test).

---

## Phase 7: Optimisations (4-8h) ⚠️ Risque: Moyen

**Objectif**: Améliorer le code après la migration.

### Ordre

1. Nettoyer le code mort (anciens modules, fonctions dépréciées)
2. Simplifier le système d'agents
3. Ajouter résilience HTTP (retry, timeouts)
4. Explorer l'utilisation du SDK OpenCode (`@opencode-ai/sdk`)
5. Réduire les dépendances inutiles

✅ **Checkpoint**: Code propre, performant, maintenable.

---

## Phase 8: Tests Finaux (2-4h) ⚠️ Risque: Faible

**Objectif**: Validation complète.

1. Exécuter la checklist fonctionnelle (voir `10-testing-strategy.md`)
2. Test manuel de l'application complète
3. Test du daemon en mode remote
4. Test sur macOS, Linux, Windows
5. Test iOS (simulateur)
6. Build release avec `npm run tauri:build`

---

## Résumé du Planning

| Phase | Description | Durée | Risque | Dépendances |
|-------|-------------|-------|--------|-------------|
| 0 | Préparation | 1h | Faible | - |
| 1 | Renommage | 4-6h | Faible | - |
| 2 | Calque communication | 8-16h | **Élevé** | Phase 1 |
| 3 | Configuration | 4-8h | Moyen | Phase 1 |
| 4 | Frontend | 4-8h | Moyen | Phase 1, 2 |
| 5 | Daemon RPC | 4-8h | **Élevé** | Phase 1, 2, 3 |
| 6 | Docs/CI | 2-4h | Faible | Phase 1 |
| 7 | Optimisations | 4-8h | Moyen | Phase 2, 3, 4, 5 |
| 8 | Tests finaux | 2-4h | Faible | Toutes |
| **Total** | | **29-55h** | | |

## Approche Recommandée

### Par lots (recommandé)

Travailler par phases dans l'ordre, avec validation entre chaque.

### Par feature (alternatif)

Implémenter feature par feature:
1. Communication: fonctionnelle mais avec les anciens noms
2. Renommage: une fois que tout fonctionne

**Non recommandé** car le renommage en masse est moins risqué quand le code
est déjà fonctionnel, et les conflits de merge seront nombreux.

### Branches Git

```bash
git checkout -b migration/phase-1-rename
git checkout -b migration/phase-2-http
git checkout -b migration/phase-3-config
git checkout -b migration/phase-4-frontend
git checkout -b migration/phase-5-daemon
git checkout -b migration/phase-6-docs
git checkout -b migration/phase-7-optimizations
git checkout -b migration/phase-8-testing
```

Chaque phase est mergée dans `main` après validation.
