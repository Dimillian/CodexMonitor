# Stratégie de Test et Validation

## Principe Général

La migration doit être validée à chaque étape. Utiliser les outils de test
existants du projet:

```bash
npm run typecheck    # Vérification TypeScript
npm run test         # Tests unitaires frontend
npm run lint         # Linting
cd src-tauri && cargo check  # Vérification Rust
cd src-tauri && cargo test   # Tests Rust
npm run tauri:dev    # Test manuel
```

## Phase 1: Renommage Mécanique

### Tests de régression

```bash
# Après chaque renommage en masse:
npm run typecheck        # Doit passer (pas de breaking TS)
cd src-tauri && cargo check  # Doit passer (pas de breaking Rust)
npm run test             # Les tests existants doivent toujours passer
cd src-tauri && cargo test   # Idem
```

### Vérifications manuelles

```bash
# Compter les références résiduelles à "codex" (doit être 0)
rg -i "codex" --include="*.rs" --include="*.ts" --include="*.tsx" \
  --include="*.json" --include="*.toml" --include="*.md" \
  --include="*.html" --include="*.sh" --include="*.yml" \
  --include="*.yaml" --include="*.nix" \
  --exclude-dir=node_modules --exclude-dir=target \
  --exclude-dir=.git --exclude="package-lock.json" \
  | grep -v "opencode" | grep -v "codec" | grep -v "unicode"
```

## Phase 2: Réécriture du Backend HTTP

### Stratégie de test

| Niveau | Méthode | Outil |
|--------|---------|-------|
| Unité | Tester les fonctions HTTP individuelles | `cargo test` |
| Intégration | Mock HTTP server pour simuler OpenCode | `wiremock` ou `httpmock` |
| Intégration | Tester avec un vrai `opencode serve` | Script shell |
| E2E | Tauri app complète | Test manuel |

### Test avec mock HTTP

```rust
// Ajouter wiremock dans Cargo.toml (dev-dependencies)
#[cfg(test)]
mod tests {
    use wiremock::MockServer;
    
    #[tokio::test]
    async fn test_start_session() {
        let mock_server = MockServer::start().await;
        let base_url = mock_server.uri();
        
        // Configurer le mock
        Mock::given(method("POST"))
            .and(path("/session"))
            .respond_with(ResponseTemplate::new(200)
                .set_body_json(json!({"id": "session-1"})))
            .mount(&mock_server)
            .await;
        
        // Tester la fonction
        let result = start_session_core(&base_url).await;
        assert!(result.is_ok());
    }
}
```

### Approche pour les tests d'intégration réels

```bash
# 1. Démarrer opencode serve en arrière-plan
opencode serve --port 9999 --hostname 127.0.0.1 &
OPENCODE_PID=$!

# 2. Lancer les tests Rust qui pointent sur ce serveur
OPENCODE_TEST_URL="http://127.0.0.1:9999" cargo test --test integration

# 3. Arrêter le serveur
kill $OPENCODE_PID
```

## Phase 3: Frontend

```bash
# Tests TypeScript (doivent tous passer)
npm run test

# Type checking
npm run typecheck

# Vérifier que les imports sont corrects
npx tsc --noEmit

# Test manuel dans le navigateur
npm run dev
```

### Points de vérification frontend

- [ ] Les types `AppSettings` sont correctement mis à jour
- [ ] Les appels IPC pointent vers les bonnes commandes Tauri
- [ ] Les clés localStorage sont mises à jour (anciennes données ignorées)
- [ ] Les noms d'événements sont corrects
- [ ] Les noms de tabs sont mis à jour ("Codex" → "OpenCode")
- [ ] Les labels et placeholders sont mis à jour
- [ ] Les imports utilisent les nouveaux chemins
- [ ] Les tests passent

## Phase 4: Configuration

```bash
# Tester la migration des settings
# Vérifier que l'ancien ~/.codex/ n'est plus utilisé
# Vérifier que ~/.config/opencode/opencode.json est correctement parsé
cd src-tauri && cargo test -- opencode_config
```

## Phase 5: Daemon

```bash
# Build les binaires
cargo build --bin opencode_monitor_daemon --bin opencode_monitor_daemonctl

# Tester le daemon
./target/debug/opencode_monitor_daemonctl status

# Tests Rust
cargo test --bin opencode_monitor_daemon
```

## Phase 6: Documentation et CI

- [ ] `cargo doc --no-deps` ne produit pas d'erreurs
- [ ] Les workflows GitHub sont valides (vérifier avec `actionlint`)
- [ ] Les scripts shell ne contiennent plus de références à "codex"

## Phase 7: Tests de Non-Régression Fonctionnels

### Checklist fonctionnelle

- [ ] L'application se lance et affiche la UI
- [ ] Les workspaces peuvent être ajoutés et configurés
- [ ] Les sessions OpenCode sont créées et listées
- [ ] Les messages peuvent être envoyés et reçus
- [ ] Le mode remote fonctionne (daemon TCP)
- [ ] Les paramètres sont persistés et chargés
- [ ] Les prompts personnalisés fonctionnent
- [ ] Les branches worktree sont créées correctement
- [ ] Le système de notification (tray) fonctionne
- [ ] Les raccourcis claviers sont fonctionnels
- [ ] Le panneau git affiche les changements
- [ ] Le panneau de terminal fonctionne
- [ ] Les mises à jour automatiques fonctionnent (si configurées)

## Validation Continue

Ajouter une GitHub Action qui valide la migration:

```yaml
name: Migration Validation

on:
  push:
    branches: [main]
  pull_request:

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm install
      - run: npm run typecheck
      - run: npm run test
      - run: npm run lint
      - name: Check no "codex" references remain
        run: |
          ! rg -i "codex" --include="*.rs" --include="*.ts" --include="*.tsx" \
            --exclude-dir=node_modules --exclude-dir=target --exclude-dir=.git \
            | grep -v "opencode" | grep -v "codec" | grep -v "unicode" \
            | grep "codex"
      - run: cargo check --manifest-path src-tauri/Cargo.toml
      - run: cargo test --manifest-path src-tauri/Cargo.toml
```
