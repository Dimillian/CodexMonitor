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

// 默认配置 - 基于用户的 CLIProxyAPI 设置
const DEFAULT_CONFIG: CLIProxyAPIConfig = {
  baseUrl: "http://all.local:18317",
  apiKey: "quotio-local-2EB4C0A8-C0A5-4514-8B3A-9882F8EB267C",
};

/**
 * 获取 CLIProxyAPI 配置
 * 优先从 localStorage 读取，否则使用默认配置
 */
export function getCLIProxyAPIConfig(): CLIProxyAPIConfig {
  if (typeof window === "undefined") {
    return DEFAULT_CONFIG;
  }
  
  const stored = window.localStorage.getItem("cliproxyapi_config");
  if (stored) {
    try {
      return JSON.parse(stored) as CLIProxyAPIConfig;
    } catch {
      return DEFAULT_CONFIG;
    }
  }
  return DEFAULT_CONFIG;
}

/**
 * 保存 CLIProxyAPI 配置到 localStorage
 */
export function saveCLIProxyAPIConfig(config: CLIProxyAPIConfig): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem("cliproxyapi_config", JSON.stringify(config));
}

/**
 * 从 CLIProxyAPI 获取可用模型列表
 */
export async function fetchCLIProxyAPIModels(): Promise<CLIProxyAPIModel[]> {
  const config = getCLIProxyAPIConfig();
  
  try {
    const response = await fetch(`${config.baseUrl}/v1/models`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data: CLIProxyAPIModelsResponse = await response.json();
    return data.data || [];
  } catch (error) {
    console.error("Failed to fetch CLIProxyAPI models:", error);
    return [];
  }
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
