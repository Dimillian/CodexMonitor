/**
 * CLIProxyAPI Service
 * 
 * 直接与 CLIProxyAPI 通信，提供模型列表获取和配置更新功能。
 * 这是一个补充服务，允许用户在 UI 中直接配置模型，而不需要手动编辑 config.toml。
 */

export interface CLIProxyAPIModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

export interface CLIProxyAPIModelsResponse {
  object: string;
  data: CLIProxyAPIModel[];
}

export interface CLIProxyAPIConfig {
  baseUrl: string;
  apiKey: string;
}

const DEFAULT_CONFIG: CLIProxyAPIConfig = {
  baseUrl: "http://all.local:18317",
  apiKey: "",
};

const CONFIG_BASE_URL_STORAGE_KEY = "cliproxyapi_base_url";
const LEGACY_CONFIG_STORAGE_KEY = "cliproxyapi_config";
let runtimeConfig: CLIProxyAPIConfig = { ...DEFAULT_CONFIG };

function normalizeBaseUrl(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_CONFIG.baseUrl;
}

function readPersistedBaseUrl(): string {
  if (typeof window === "undefined") {
    return runtimeConfig.baseUrl;
  }
  const nextStorageValue = window.localStorage.getItem(CONFIG_BASE_URL_STORAGE_KEY);
  if (nextStorageValue) {
    return normalizeBaseUrl(nextStorageValue);
  }
  const legacy = window.localStorage.getItem(LEGACY_CONFIG_STORAGE_KEY);
  if (!legacy) {
    return runtimeConfig.baseUrl;
  }
  try {
    const parsed = JSON.parse(legacy) as Partial<CLIProxyAPIConfig>;
    return normalizeBaseUrl(parsed.baseUrl);
  } catch {
    return runtimeConfig.baseUrl;
  }
}

/**
 * 获取 CLIProxyAPI 配置
 * 仅持久化 baseUrl；apiKey 仅保留在内存中，避免落盘。
 */
export function getCLIProxyAPIConfig(): CLIProxyAPIConfig {
  runtimeConfig = {
    ...runtimeConfig,
    baseUrl: readPersistedBaseUrl(),
  };
  return { ...runtimeConfig };
}

/**
 * 保存 CLIProxyAPI 配置。
 * - baseUrl: 可持久化
 * - apiKey: 仅内存保留，不写入 localStorage
 */
export function saveCLIProxyAPIConfig(config: CLIProxyAPIConfig): void {
  runtimeConfig = {
    baseUrl: normalizeBaseUrl(config.baseUrl),
    apiKey: config.apiKey,
  };
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(CONFIG_BASE_URL_STORAGE_KEY, runtimeConfig.baseUrl);
  window.localStorage.removeItem(LEGACY_CONFIG_STORAGE_KEY);
}

/**
 * 从 CLIProxyAPI 获取可用模型列表
 */
export async function fetchCLIProxyAPIModels(
  config?: CLIProxyAPIConfig,
): Promise<CLIProxyAPIModel[]> {
  const resolvedConfig = config ?? getCLIProxyAPIConfig();
  const response = await fetch(`${resolvedConfig.baseUrl}/v1/models`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${resolvedConfig.apiKey}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data: CLIProxyAPIModelsResponse = await response.json();
  return Array.isArray(data.data) ? data.data : [];
}

/**
 * 测试 CLIProxyAPI 连接
 */
export async function testCLIProxyAPIConnection(config?: CLIProxyAPIConfig): Promise<{
  success: boolean;
  modelCount: number;
  error?: string;
}> {
  const testConfig = config || getCLIProxyAPIConfig();
  
  try {
    const response = await fetch(`${testConfig.baseUrl}/v1/models`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${testConfig.apiKey}`,
        "Content-Type": "application/json",
      },
    });
    
    if (!response.ok) {
      return {
        success: false,
        modelCount: 0,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }
    
    const data: CLIProxyAPIModelsResponse = await response.json();
    return {
      success: true,
      modelCount: data.data?.length || 0,
    };
  } catch (error) {
    return {
      success: false,
      modelCount: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 模型分类信息
 */
export interface ModelCategory {
  id: string;
  label: string;
  description: string;
  models: CLIProxyAPIModel[];
}

/**
 * 将模型按来源分类
 */
export function categorizeModels(models: CLIProxyAPIModel[]): ModelCategory[] {
  const categories: Record<string, ModelCategory> = {
    codex: {
      id: "codex",
      label: "Codex (OpenAI)",
      description: "GPT-5 Codex 系列模型",
      models: [],
    },
    claude: {
      id: "claude",
      label: "Claude (Antigravity)",
      description: "Claude 系列模型（通过 Antigravity）",
      models: [],
    },
    gemini: {
      id: "gemini",
      label: "Gemini (Antigravity)",
      description: "Gemini 系列模型（通过 Antigravity）",
      models: [],
    },
    other: {
      id: "other",
      label: "其他模型",
      description: "其他可用模型",
      models: [],
    },
  };
  
  for (const model of models) {
    const id = model.id.toLowerCase();
    if (id.includes("codex") || id.includes("gpt-5")) {
      categories.codex.models.push(model);
    } else if (id.includes("claude")) {
      categories.claude.models.push(model);
    } else if (id.includes("gemini")) {
      categories.gemini.models.push(model);
    } else {
      categories.other.models.push(model);
    }
  }
  
  // 只返回有模型的分类
  return Object.values(categories).filter((cat) => cat.models.length > 0);
}

/**
 * 获取模型的友好显示名称
 */
export function getModelDisplayName(modelId: string): string {
  const displayNames: Record<string, string> = {
    "gpt-5.3-codex": "GPT-5.3 Codex",
    "gpt-5-codex": "GPT-5 Codex",
    "gemini-claude-opus-4-6-thinking": "Claude 4.6 Opus (Thinking)",
    "gemini-claude-opus-4-5-thinking": "Claude 4.5 Opus (Thinking)",
    "gemini-claude-sonnet-4-5-thinking": "Claude Sonnet 4.5 (Thinking)",
    "gemini-claude-sonnet-4-5": "Claude Sonnet 4.5",
    "gemini-3-pro-preview": "Gemini 3.0 Pro",
    "gemini-3-flash-preview": "Gemini 3.0 Flash",
    "gemini-2.5-flash": "Gemini 2.5 Flash",
    "gemini-2.5-flash-lite": "Gemini 2.5 Flash Lite",
    "gemini-2.5-pro": "Gemini 2.5 Pro",
  };
  
  return displayNames[modelId] || modelId;
}
