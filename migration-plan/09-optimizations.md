# Optimisations Post-Migration

Cette section liste les optimisations possibles après la migration fonctionnelle
vers OpenCode. Certaines sont spécifiques à OpenCode, d'autres sont des
améliorations générales.

## 1. Utiliser l'API HTTP REST d'OpenCode

Contrairement à Codex qui utilisait un protocole JSON-RPC propriétaire sur stdio,
OpenCode expose une API HTTP REST. Cela permet:

- **Moins de code boilerplate**: Plus besoin de parser des lignes JSON-RPC,
  gérer des IDs de requêtes, des channels one-shot, etc.
- **Timeouts standard**: HTTP a des timeouts natifs.
- **Parallelisme**: Possibilité d'envoyer plusieurs requêtes simultanément.
- **Instrumentation**: Métriques HTTP standard (latence, status codes).

```rust
// Au lieu de:
let (tx, rx) = oneshot::channel();
pending.insert(request_id, tx);
stdin.write_line(json!({"id": request_id, "method": method, "params": params}));
let response = rx.await.map_err(|_| "timeout")?;

// On peut faire:
let response = client
    .post(format!("{}/session/{}/start", base_url, session_id))
    .json(&params)
    .timeout(Duration::from_secs(300))
    .send()
    .await?;
```

## 2. Remplacer `opencode serve` par SDK si disponible

Si OpenCode propose un SDK npm/rust, l'utiliser au lieu de lancer un sous-processus:

```typescript
// Au lieu de spawn opencode serve + HTTP
// Utiliser le SDK OpenCode directement
import { createOpencode } from "@opencode-ai/sdk";
const { client } = await createOpencode();
```

L'`opencode_ai_llms.txt` mentionne `@opencode-ai/sdk`. Cela permettrait
d'éliminer complètement la gestion de processus enfant.

## 3. Simplifier le Système d'Événements

Codex utilisait un système complexe d'événements push JSON-RPC. OpenCode
pourrait simplifier cela:

- **Polling HTTP**: Remplacer les événements push par du polling périodique
  sur l'API REST.
- **Webhooks/SSE**: Si OpenCode supporte Server-Sent Events, les utiliser.

## 4. Nettoyer le Code Mort

Après la migration, plusieurs modules et fonctions deviendront obsolètes:

- `backend/app_server.rs`: Remplacé par `opencode_server.rs`
- `shared/codex_core.rs`: Remplacé par `opencode_core.rs`
- `shared/codex_aux_core.rs`: Remplacé par `opencode_aux_core.rs`
- `shared/codex_update_core.rs`: Remplacé par `opencode_update_core.rs`
- `shared/config_toml_core.rs`: Supprimé
- Fonctions `codex_login`/`codex_login_cancel`: À adapter ou supprimer
- Fonctions `set_codex_feature_flag`: À adapter ou supprimer

## 5. Simplifier les Agents

OpenCode n'a probablement pas le même système d'agents que Codex (multi-agent,
collaboration modes). Simplifier l'UI et la logique des agents pour correspondre
à ce qu'OpenCode supporte réellement.

## 6. Améliorer la Résilience

Avec HTTP:

- **Retry automatique**: Utiliser `reqwest::Client` avec retry policy.
- **Circuit breaker**: Détecter si `opencode serve` est en panne et réessayer.
- **Health check**: `GET /health` si disponible.
- **Graceful shutdown**: `POST /shutdown` si disponible.

## 7. Unifier le Mode Local et Remote

Avec Codex, le mode local utilisait stdio et le mode remote utilisait TCP.
Les deux avaient des chemins de code différents.

Avec OpenCode, les deux modes peuvent utiliser HTTP:
- Local: `http://127.0.0.1:{port}` (process enfant)
- Remote: `http://{host}:{port}` (daemon TCP)

Le code du client HTTP peut être partagé à 100%.

## 8. Réduire les Dépendances

Vérifier les dépendances devenues inutiles après la migration:

- `tokio-tungstenite`: Probablement plus nécessaire (était pour WebSocket)
- Réduire l'utilisation de `serde_json` si le format change
- Vérifier si `git2` avec vendored est toujours nécessaire

## 9. Améliorer les Tests

- Écrire des tests d'intégration avec un mock HTTP server
- Tester la résilience (timeouts, erreurs réseau)
- Tester la migration des données (localStorage, settings.json)

## 10. Monitoring et Observabilité

- Ajouter des métriques sur les appels API OpenCode
- Logger les performances (latence des appels)
- Dashboard de statut pour les sessions OpenCode

## Priorité des Optimisations

| Optimisation | Impact | Effort | Priorité |
|-------------|--------|--------|----------|
| 1. API HTTP REST | Élevé | Moyen | Haute |
| 2. SDK OpenCode | Très élevé | Faible | Haute |
| 3. Nettoyage code mort | Moyen | Faible | Haute |
| 4. Unifier local/remote | Moyen | Faible | Haute |
| 5. Résilience HTTP | Moyen | Faible | Moyenne |
| 6. Agents simplifiés | Moyen | Faible | Moyenne |
| 7. Tests améliorés | Moyen | Moyen | Moyenne |
| 8. Monitoring | Faible | Faible | Basse |
| 9. Réduire dépendances | Faible | Faible | Basse |
