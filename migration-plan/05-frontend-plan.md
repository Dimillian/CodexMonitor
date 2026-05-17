# Plan Frontend TypeScript/React

## 1. Types Partagés (`src/types.ts`)

```typescript
// Ancien
export interface AppSettings {
  codexBin: string | null;      // → opencodeBin
  codexArgs: string | null;     // → opencodeArgs
  // ...
}

// Nouveau
export interface AppSettings {
  opencodeBin: string | null;
  opencodeArgs: string | null;
  // ...
}
```

### Types à renommer

| Ancien | Nouveau |
|--------|---------|
| `CodexFeatureStage` | `OpenCodeFeatureStage` |
| `CodexFeature` | `OpenCodeFeature` |
| `CodexDoctorResult` | `OpenCodeCheckResult` |
| `CodexUpdateMethod` | `OpenCodeUpdateMethod` |
| `CodexUpdateResult` | `OpenCodeUpdateResult` |

## 2. Services IPC (`src/services/tauri.ts`)

```typescript
// Ancien
export async function getCodexConfigPath(): Promise<string> {
  return invoke<string>("get_codex_config_path");
}
export async function runCodexDoctor(codexBin, codexArgs): Promise<CodexDoctorResult> {
  return invoke<CodexDoctorResult>("codex_doctor", { codexBin, codexArgs });
}
export async function runCodexLogin(workspaceId) {
  return invoke("codex_login", { workspaceId });
}
export async function cancelCodexLogin(workspaceId) {
  return invoke("codex_login_cancel", { workspaceId });
}
export async function setCodexFeatureFlag(featureKey, enabled) {
  return invoke("set_codex_feature_flag", { featureKey, enabled });
}
export async function setWorkspaceRuntimeCodexArgs(workspaceId, codexArgs) {
  return invoke("set_workspace_runtime_codex_args", { workspaceId, codexArgs });
}

// Nouveau
export async function getOpenCodeConfigPath(): Promise<string> {
  return invoke<string>("get_opencode_config_path");
}
export async function runOpenCodeCheck(opencodeBin, opencodeArgs): Promise<OpenCodeCheckResult> {
  return invoke<OpenCodeCheckResult>("opencode_check", { opencodeBin, opencodeArgs });
}
// etc.
```

### Fonctions IPC à renommer (liste complète)

| Ancienne | Nouvelle |
|----------|----------|
| `getCodexConfigPath` | `getOpenCodeConfigPath` |
| `readGlobalCodexConfigToml` | `readGlobalOpenCodeConfigJson` |
| `writeGlobalCodexConfigToml` | `writeGlobalOpenCodeConfigJson` |
| `setWorkspaceRuntimeCodexArgs` | `setWorkspaceRuntimeOpenCodeArgs` |
| `setCodexFeatureFlag` | `setOpenCodeFeatureFlag` |
| `runCodexLogin` | `runOpenCodeLogin` |
| `cancelCodexLogin` | `cancelOpenCodeLogin` |
| `runCodexDoctor` | `runOpenCodeCheck` |
| `runCodexUpdate` | `runOpenCodeUpdate` |

## 3. Événements (`src/services/events.ts`, `src/utils/appServerEvents.ts`)

```typescript
// Ancien
export const APP_SERVER_EVENT_METHODS = {
  BACKGROUND: "codex/backgroundThread",
  CONNECTED: "codex/connected",
  SKILLS_UPDATE: "codex/event/skills_update_available",
} as const;

// Nouveau
export const APP_SERVER_EVENT_METHODS = {
  BACKGROUND: "opencode/backgroundThread",
  CONNECTED: "opencode/connected",
  SKILLS_UPDATE: "opencode/event/skills_update_available",
} as const;
```

## 4. Utilitaires Thread

### `src/features/threads/utils/threadStorage.ts`

```typescript
// Clés localStorage
STORAGE_KEY_THREAD_CODEX_PARAMS = "codexmonitor.threadCodexParams"
// → "opencodemonitor.threadOpenCodeParams"

// Type
export type ThreadCodexParams = {
  // → ThreadOpenCodeParams
  codexArgsOverride: string | null | undefined;
  // → opencodeArgsOverride
};

export function makeThreadCodexParamsKey(workspaceId: string, threadId: string): string {
  // → makeThreadOpenCodeParamsKey
}
```

### `src/features/threads/utils/codexArgsProfiles.ts`

Migrer les profiles d'arguments Codex → OpenCode. OpenCode a une interface CLI
différente: `opencode [project]`, `opencode run`, `opencode serve`, etc.

Les flags ignorés (`--model`, `--sandbox`) doivent être adaptés aux flags OpenCode.

### `src/features/threads/utils/threadCodexParamsSeed.ts`

Renommer tous les types et fonctions:
- `ThreadCodexParams` → `ThreadOpenCodeParams`
- `ThreadCodexSeedPatch` → `ThreadOpenCodeSeedPatch`
- `ResolvedThreadCodexState` → `ResolvedThreadOpenCodeState`
- `resolveWorkspaceRuntimeCodexArgsOverride` → `resolveWorkspaceRuntimeOpenCodeArgsOverride`

### `src/features/threads/utils/threadCodexMetadata.ts`

```typescript
// extractThreadCodexMetadata → extractThreadOpenCodeMetadata
// Modèle par défaut: "gpt-5-codex" → modèle par défaut OpenCode
```

## 5. Hooks Thread

### `src/features/threads/hooks/useThreadCodexParams.ts`

Renommer:
- `STORAGE_KEY_THREAD_CODEX_PARAMS`
- `ThreadCodexParams`, `ThreadCodexParamsMap`
- `useThreadCodexParams`
- `getThreadCodexParams`, `patchThreadCodexParams`, `deleteThreadCodexParams`
- `codexArgsOverride` dans les types

### `src/features/threads/hooks/useThreads.ts`

Renommer:
- `ensureWorkspaceRuntimeCodexArgs` → `ensureWorkspaceRuntimeOpenCodeArgs`
- `shouldPreflightRuntimeCodexArgsForSend` → `shouldPreflightRuntimeOpenCodeArgsForSend`
- `onThreadCodexMetadataDetected` → `onThreadOpenCodeMetadataDetected`
- `thread/runtime-codex-args` → `thread/runtime-opencode-args`

### `src/features/threads/hooks/useThreadEventHandlers.ts`

```typescript
// codex/stderr → opencode/stderr
const inferredSource = method === "opencode/stderr" ? "stderr" : "event";
```

## 6. Composants Principaux

### `src/App.tsx`

Mettre à jour imports, références à Codex.

### `src/features/app/components/MainApp.tsx`

Renommer hooks et état:
- `useMainAppThreadCodexState` → `useMainAppThreadOpenCodeState`
- `useThreadCodexBootstrapOrchestration` → `useThreadOpenCodeBootstrapOrchestration`
- `useThreadCodexSyncOrchestration` → `useThreadOpenCodeSyncOrchestration`
- `preferredCodexArgsOverride` → `preferredOpenCodeArgsOverride`
- `selectedCodexArgsOverride` → `selectedOpenCodeArgsOverride`
- `codexArgsOptions` → `opencodeArgsOptions`
- `compactEmptyCodexNode` → `compactEmptyOpenCodeNode`
- `showCompactCodexThreadActions` → `showCompactOpenCodeThreadActions`
- `activeTab = "codex"` → `activeTab = "opencode"`
- `setActiveTab("codex")` → `setActiveTab("opencode")`

### `src/features/app/components/TabBar.tsx`

```tsx
// Ancien
{ id: "codex", label: "Codex", icon: <MessagesSquare /> },

// Nouveau
{ id: "opencode", label: "OpenCode", icon: <MessagesSquare /> },
```

### `src/features/app/components/TabletNav.tsx`

Même changement pour le type `TabletNavTab` et les labels.

### `src/features/composer/components/Composer.tsx`

```tsx
// Props renommées
codexArgsOptions → opencodeArgsOptions
selectedCodexArgsOverride → selectedOpenCodeArgsOverride
onSelectCodexArgsOverride → onSelectOpenCodeArgsOverride
```

### `src/features/composer/components/ComposerInput.tsx`

```tsx
// Placeholder
"Ask Codex to do something..." → "Ask OpenCode to do something..."
```

### `src/features/composer/components/ComposerMetaBar.tsx`

```tsx
// Imports
import type { CodexArgsOption } from "../../threads/utils/codexArgsProfiles";
// → import type { OpenCodeArgsOption } from "../../threads/utils/opencodeArgsProfiles";
```

## 7. Paramètres (Settings)

### `src/features/settings/components/sections/SettingsCodexSection.tsx`

Renommer le composant en `SettingsOpenCodeSection.tsx`, titres et descriptions.

### `src/features/settings/hooks/useSettingsCodexSection.ts`

Renommer le hook et les appels IPC.

### `src/features/settings/hooks/useGlobalCodexConfigToml.ts`

Adapter au format JSON d'OpenCode au lieu de TOML.

## 8. Hooks et Services Divers

| Fichier | Changement |
|---------|------------|
| `src/features/workspaces/hooks/useWorktreePrompt.ts` | `codex/` → `opencode/` branch prefix |
| `src/features/workspaces/hooks/useWorkspaceSelection.ts` | `tab: "codex"` → `tab: "opencode"` |
| `src/features/layout/hooks/layoutNodes/types.ts` | `compactEmptyCodexNode` → `compactEmptyOpenCodeNode` |
| `src/features/layout/hooks/layoutNodes/buildSecondaryNodes.tsx` | Renommer |
| `src/features/update/utils/postUpdateRelease.ts` | GitHub URLs |
| `src/features/prompts/components/PromptPanel.tsx` | `CODEX_HOME/prompts` → `OPENCODE_CONFIG_DIR/prompts` |
| `src/features/git/hooks/usePullRequestComposer.ts` | `tab: "codex"` → `tab: "opencode"` |
| `src/features/git/hooks/useAutoExitEmptyDiff.ts` | `tab: "codex"` → `tab: "opencode"` |
| `src/features/about/components/AboutView.tsx` | Texte, GitHub URL |
| `src/features/skills/hooks/useSkills.test.tsx` | Event names dans les tests |
| `src/features/app/components/WorktreeCard.tsx` | Texte tooltip |
| `src/features/app/components/WorkspaceCard.tsx` | Texte tooltip |
| `vite.config.ts` | `.codex-worktrees/` → `.opencode-worktrees/` |

## 9. localStorage Keys

Toutes les clés `codexmonitor.*` → `opencodemonitor.*` dans:

- `src/features/threads/utils/threadStorage.ts`
- `src/features/layout/hooks/useResizablePanels.ts`
- `src/features/layout/hooks/useSidebarToggles.tsx`
- `src/features/composer/hooks/usePromptHistory.test.tsx`
- `src/features/update/utils/postUpdateRelease.ts`

## 10. Fichiers de Test

Tous les fichiers `.test.ts` et `.test.tsx` qui référencent Codex doivent être mis à jour:

- `src/services/tauri.test.ts`
- `src/utils/appServerEvents.test.ts`
- `src/utils/codexArgsInput.test.ts`
- `src/utils/threadItems.test.ts`
- `src/features/threads/utils/threadCodexParamsSeed.test.ts`
- `src/features/threads/utils/threadCodexMetadata.test.ts`
- `src/features/threads/utils/codexArgsProfiles.test.ts`
- `src/features/threads/hooks/useThreadCodexParams.test.tsx`
- `src/features/threads/hooks/useThreads.integration.test.tsx`
- `src/features/threads/hooks/useThreadMessaging.test.tsx`
- `src/features/threads/hooks/useThreadActions.test.tsx`
- `src/features/threads/hooks/useThreadItemEvents.test.ts`
- `src/features/settings/hooks/useUpdater.test.ts`
- `src/features/layout/hooks/useResizablePanels.test.ts`
- `src/features/composer/hooks/usePromptHistory.test.tsx`
- `src/features/skills/hooks/useSkills.test.tsx`
- `src/features/prompts/hooks/useCustomPrompts.test.tsx`
- `src/features/update/components/UpdateToast.test.tsx`
