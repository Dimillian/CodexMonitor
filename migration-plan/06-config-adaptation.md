# Adaptation du Système de Configuration

## Différence Fondamentale

| Aspect | Codex | OpenCode |
|--------|-------|----------|
| Format | `config.toml` (TOML) | `opencode.json` (JSON/JSONC) |
| Emplacement | `$CODEX_HOME/config.toml` (`~/.codex/`) | `~/.config/opencode/opencode.json` |
| Features | `[features]` section | Pas équivalent direct |
| Personnalité | `personality = "pragmatic"` | Configurable dans `opencode.json` |
| Agents | `.codex/agents/config.toml` | `subagents` dans `opencode.json` |
| Auth | `auth.json` séparé | Providers dans `opencode.json` + keyring |

## 1. Fichier `opencode/config.rs`

### Nouvelle Structure

```rust
pub(crate) fn read_opencode_config() -> Result<Option<OpenCodeConfig>, String> {
    let config_dir = resolve_opencode_config_dir();
    let config_path = config_dir.join("opencode.json");
    // Lire et parser le JSON
}

pub(crate) fn write_opencode_config(config: &OpenCodeConfig) -> Result<(), String> {
    let config_dir = resolve_opencode_config_dir();
    let config_path = config_dir.join("opencode.json");
    // Écrire le JSON formaté
}

pub(crate) fn read_model() -> Result<Option<String>, String> {
    // Lire "model" depuis opencode.json
}

pub(crate) fn read_feature_flags() -> Result<FeatureFlags, String> {
    // OpenCode n'a pas de feature flags équivalents
    // Retourner des valeurs par défaut
}
```

### Mapping des Paramètres

| Paramètre Codex | Paramètre OpenCode |
|-----------------|-------------------|
| `model` | `model` (même clé) |
| `personality` | (non supporté) |
| `features.steer` | (géré par OpenCode automatiquement) |
| `features.collaboration_modes` | (non supporté) |
| `features.unified_exec` | (non supporté) |
| `features.apps` | (plugins MCP) |
| `review_model` | (non supporté) |
| `model_provider` | Provider dans `opencode.json` |
| `service_tier` | (non supporté) |
| `developer_instructions` | `instructions` (fichiers) |
| `commit_attribution` | (non supporté) |

## 2. Fichier `opencode/home.rs`

```rust
pub(crate) fn resolve_default_opencode_home() -> Option<PathBuf> {
    // Priorité:
    // 1. $OPENCODE_CONFIG_DIR env var
    // 2. $XDG_CONFIG_HOME/opencode (Linux)
    // 3. ~/.config/opencode (fallback)
    // 4. ~/Library/Application Support/opencode (macOS)
    // 5. %APPDATA%/opencode (Windows)
}

pub(crate) fn resolve_workspace_opencode_home(
    entry: &WorkspaceEntry,
    app_settings: Option<&AppSettings>,
) -> Option<PathBuf> {
    // Similaire à resolve_workspace_codex_home mais avec le nouveau chemin
}

pub(crate) fn opencode_config_path() -> PathBuf {
    resolve_default_opencode_home().map(|h| h.join("opencode.json"))
}
```

## 3. Fichier `shared/settings_core.rs`

Adapter pour ne plus synchroniser les feature flags avec `config.toml`:

```rust
pub(crate) fn get_app_settings_core() -> Result<AppSettings, String> {
    // Lire les settings depuis settings.json (inchangé)
    // MAIS: ne plus lire config.toml pour les features flags
}

pub(crate) fn update_app_settings_core(settings: AppSettings) -> Result<AppSettings, String> {
    // Écrire les settings
    // MAIS: ne plus écrire dans config.toml
    // Optionnel: synchroniser certaines valeurs dans opencode.json
}
```

## 4. Fichier `shared/config_toml_core.rs`

**Option A**: Supprimer le fichier (si OpenCode ne supporte pas config.toml).

**Option B**: Garder pour compatibilité avec les utilisateurs qui ont encore Codex
installé, mais le rendre optionnel.

**Recommandation**: Supprimer. OpenCode utilise `opencode.json`, pas `config.toml`.

## 5. Fichier `shared/agents_config_core.rs`

OpenCode a un concept de sub-agents différent. Vérifier la documentation OpenCode
pour savoir comment configurer les sub-agents.

```rust
// Structure probable pour OpenCode (à vérifier avec ctx7)
// opencode.json:
// {
//   "subagents": {
//     "explorer": {
//       "model": "anthropic/claude-sonnet-4-5",
//       "instructions": "..."
//     }
//   }
// }

pub(crate) fn collect_agents(opencode_home: &Path) -> Result<Vec<AgentConfig>, String> {
    let config_path = opencode_home.join("opencode.json");
    // Lire et parser les sub-agents depuis le JSON
}
```

## 6. Fichier `shared/account.rs`

```rust
pub(crate) fn read_auth_account(opencode_home: Option<PathBuf>) -> Option<AuthAccount> {
    let opencode_home = opencode_home?;
    // OpenCode stocke l'auth dans opencode.json ou via keyring OS
    // À adapter selon la doc OpenCode
    let auth_path = opencode_home.join("opencode.json");
    // ...
}
```

## 7. Fichiers de Prompts

```rust
// shared/prompts_core.rs

// Ancien: ~/.codex/prompts/
// Nouveau: ~/.config/opencode/prompts/

pub(crate) fn global_prompts_dir() -> Option<PathBuf> {
    resolve_default_opencode_home().map(|h| h.join("prompts"))
}
```

## Résumé: Changements dans les Fichiers

| Fichier | Action |
|---------|--------|
| `codex/config.rs` → `opencode/config.rs` | Réécrire: TOML → JSON |
| `codex/home.rs` → `opencode/home.rs` | Réécrire: ~/.codex → ~/.config/opencode |
| `shared/config_toml_core.rs` | Supprimer |
| `shared/settings_core.rs` | Adapter: enlever sync config.toml |
| `shared/agents_config_core.rs` | Adapter: format JSON au lieu de TOML |
| `shared/account.rs` | Adapter: auth depuis opencode.json |
| `shared/prompts_core.rs` | Adapter: nouveaux chemins |
| `shared/files_core.rs` | Adapter: nouveaux chemins |
| `shared/local_usage_core.rs` | Adapter: nouveaux chemins |
