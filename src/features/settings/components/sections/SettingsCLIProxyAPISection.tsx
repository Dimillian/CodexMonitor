import { useCallback, useEffect, useState } from "react";
import {
  categorizeModels,
  fetchCLIProxyAPIModels,
  getCLIProxyAPIConfig,
  getModelDisplayName,
  saveCLIProxyAPIConfig,
  testCLIProxyAPIConnection,
  type CLIProxyAPIConfig,
  type CLIProxyAPIModel,
  type ModelCategory,
} from "../../../../services/cliproxyapi";
import {
  readGlobalCodexConfigToml,
  writeGlobalCodexConfigToml,
} from "../../../../services/tauri";
import { pushErrorToast } from "../../../../services/toasts";

type SettingsCLIProxyAPISectionProps = {
  onModelChange?: (modelId: string) => void;
};

function parseModelFromToml(tomlContent: string): string | null {
  const match = tomlContent.match(/^\s*model\s*=\s*["']([^"']+)["']/m);
  return match ? match[1] : null;
}

function parseBaseUrlFromToml(tomlContent: string): string | null {
  const match = tomlContent.match(/^\s*base_url\s*=\s*["']([^"']+)["']/m);
  return match ? match[1] : null;
}

function updateModelInToml(tomlContent: string, newModel: string): string {
  const modelRegex = /^(\s*model\s*=\s*["'])([^"']+)(["'])/m;
  if (modelRegex.test(tomlContent)) {
    return tomlContent.replace(modelRegex, `$1${newModel}$3`);
  }
  return `model = "${newModel}"\n${tomlContent}`;
}

function updateBaseUrlInToml(tomlContent: string, newBaseUrl: string): string {
  const baseUrlRegex = /^(\s*base_url\s*=\s*["'])([^"']*)(["'])/m;
  if (baseUrlRegex.test(tomlContent)) {
    return tomlContent.replace(baseUrlRegex, `$1${newBaseUrl}$3`);
  }
  return `base_url = "${newBaseUrl}"\n${tomlContent}`;
}

export function SettingsCLIProxyAPISection({
  onModelChange,
}: SettingsCLIProxyAPISectionProps) {
  const [config, setConfig] = useState<CLIProxyAPIConfig>(getCLIProxyAPIConfig);
  const [baseUrlDraft, setBaseUrlDraft] = useState(config.baseUrl);
  const [apiKeyDraft, setApiKeyDraft] = useState(config.apiKey);
  const [models, setModels] = useState<CLIProxyAPIModel[]>([]);
  const [categories, setCategories] = useState<ModelCategory[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [configuredModel, setConfiguredModel] = useState<string | null>(null);
  const [configuredBaseUrl, setConfiguredBaseUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSavingModel, setIsSavingModel] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [saveModelResult, setSaveModelResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [configDirty, setConfigDirty] = useState(false);

  const loadConfiguredModel = useCallback(async (): Promise<CLIProxyAPIConfig> => {
    const runtimeConfig = getCLIProxyAPIConfig();
    let resolvedBaseUrl = runtimeConfig.baseUrl;
    try {
      const result = await readGlobalCodexConfigToml();
      if (result.exists && result.content) {
        const model = parseModelFromToml(result.content);
        const baseUrl = parseBaseUrlFromToml(result.content);
        setConfiguredModel(model);
        setConfiguredBaseUrl(baseUrl ?? runtimeConfig.baseUrl);
        if (model) {
          setSelectedModel(model);
        }
        if (baseUrl?.trim()) {
          resolvedBaseUrl = baseUrl.trim();
        }
      }
    } catch (error) {
      console.error("Failed to load config.toml:", error);
      pushErrorToast({
        title: "读取配置失败",
        message: "无法读取 ~/.codex/config.toml，请检查文件权限或路径。",
      });
    }
    setBaseUrlDraft(resolvedBaseUrl);
    setConfig((current) => ({ ...current, baseUrl: resolvedBaseUrl }));
    saveCLIProxyAPIConfig({
      baseUrl: resolvedBaseUrl,
      apiKey: runtimeConfig.apiKey,
    });
    return { baseUrl: resolvedBaseUrl, apiKey: runtimeConfig.apiKey };
  }, []);

  const loadModels = useCallback(async (nextConfig?: CLIProxyAPIConfig) => {
    const effectiveConfig = nextConfig ?? getCLIProxyAPIConfig();
    setIsLoading(true);
    try {
      const modelList = await fetchCLIProxyAPIModels(effectiveConfig);
      setModels(modelList);
      setCategories(categorizeModels(modelList));
    } catch (error) {
      console.error("Failed to load models:", error);
      pushErrorToast({
        title: "加载模型失败",
        message: "无法获取模型列表，请检查 CLIProxyAPI 配置与网络连接。",
      });
      setModels([]);
      setCategories([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const persistBaseUrlToConfigToml = useCallback(async (baseUrl: string) => {
    const normalizedBaseUrl = baseUrl.trim();
    if (!normalizedBaseUrl) {
      return;
    }
    const result = await readGlobalCodexConfigToml();
    const currentContent = result.exists ? result.content : "";
    const updatedContent = updateBaseUrlInToml(currentContent, normalizedBaseUrl);
    if (updatedContent !== currentContent) {
      await writeGlobalCodexConfigToml(updatedContent);
    }
    setConfiguredBaseUrl(normalizedBaseUrl);
  }, []);

  const handleTestConnection = useCallback(async () => {
    const nextConfig = {
      baseUrl: baseUrlDraft.trim() || config.baseUrl,
      apiKey: apiKeyDraft,
    };
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await testCLIProxyAPIConnection(nextConfig);
      if (!result.success) {
        setTestResult({
          success: false,
          message: `连接失败: ${result.error ?? "未知错误"}`,
        });
        return;
      }

      setTestResult({
        success: true,
        message: `连接成功！发现 ${result.modelCount} 个可用模型`,
      });
      saveCLIProxyAPIConfig(nextConfig);
      setConfig(nextConfig);
      setConfigDirty(false);
      await persistBaseUrlToConfigToml(nextConfig.baseUrl);
      await loadModels(nextConfig);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setTestResult({
        success: false,
        message: `连接失败: ${message}`,
      });
      pushErrorToast({
        title: "连接测试失败",
        message: `CLIProxyAPI 连接测试失败：${message}`,
      });
    } finally {
      setIsTesting(false);
    }
  }, [
    apiKeyDraft,
    baseUrlDraft,
    config.baseUrl,
    loadModels,
    persistBaseUrlToConfigToml,
  ]);

  const handleSaveConfig = useCallback(async () => {
    const newConfig = {
      baseUrl: baseUrlDraft.trim() || config.baseUrl,
      apiKey: apiKeyDraft,
    };
    saveCLIProxyAPIConfig(newConfig);
    setConfig(newConfig);
    setConfigDirty(false);
    try {
      await persistBaseUrlToConfigToml(newConfig.baseUrl);
      await loadModels(newConfig);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      pushErrorToast({
        title: "保存配置后刷新失败",
        message,
      });
    }
  }, [
    apiKeyDraft,
    baseUrlDraft,
    config.baseUrl,
    loadModels,
    persistBaseUrlToConfigToml,
  ]);

  const handleSelectModel = useCallback(
    (modelId: string) => {
      setSelectedModel(modelId);
      setSaveModelResult(null);
      onModelChange?.(modelId);
    },
    [onModelChange],
  );

  const handleSaveModelToConfig = useCallback(async () => {
    if (!selectedModel) {
      return;
    }

    setIsSavingModel(true);
    setSaveModelResult(null);

    try {
      const result = await readGlobalCodexConfigToml();
      const currentContent = result.exists ? result.content : "";
      let updatedContent = updateModelInToml(currentContent, selectedModel);
      const normalizedBaseUrl = baseUrlDraft.trim();
      if (normalizedBaseUrl) {
        updatedContent = updateBaseUrlInToml(updatedContent, normalizedBaseUrl);
      }

      await writeGlobalCodexConfigToml(updatedContent);
      setConfiguredModel(selectedModel);
      if (normalizedBaseUrl) {
        setConfiguredBaseUrl(normalizedBaseUrl);
      }

      setSaveModelResult({
        success: true,
        message: `已将默认模型设置为 ${selectedModel}`,
      });
    } catch (error) {
      setSaveModelResult({
        success: false,
        message: `保存失败: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      setIsSavingModel(false);
    }
  }, [baseUrlDraft, selectedModel]);

  useEffect(() => {
    void (async () => {
      const initialConfig = await loadConfiguredModel();
      await loadModels(initialConfig);
    })();
  }, [loadConfiguredModel, loadModels]);

  useEffect(() => {
    setConfigDirty(
      baseUrlDraft !== config.baseUrl || apiKeyDraft !== config.apiKey,
    );
  }, [apiKeyDraft, baseUrlDraft, config]);

  return (
    <section className="settings-section">
      <div className="settings-section-title">CLIProxyAPI 集成</div>
      <div className="settings-section-subtitle">
        配置 CLIProxyAPI 连接，管理和切换可用的 AI 模型。支持 Codex、Claude、Gemini
        等多种模型。
      </div>

      <div className="settings-field">
        <label className="settings-field-label" htmlFor="cliproxy-baseurl">
          API 地址
        </label>
        <input
          id="cliproxy-baseurl"
          type="text"
          className="settings-input"
          value={baseUrlDraft}
          onChange={(event) => setBaseUrlDraft(event.target.value)}
          placeholder="http://all.local:18317"
        />
      </div>

      <div className="settings-field">
        <label className="settings-field-label" htmlFor="cliproxy-apikey">
          API Key
        </label>
        <input
          id="cliproxy-apikey"
          type="password"
          className="settings-input"
          value={apiKeyDraft}
          onChange={(event) => setApiKeyDraft(event.target.value)}
          placeholder="quotio-local-..."
        />
      </div>

      <div className="settings-field-actions">
        <button
          type="button"
          className="ghost settings-button-compact"
          onClick={() => {
            void handleTestConnection();
          }}
          disabled={isTesting}
        >
          {isTesting ? "测试中..." : "测试连接"}
        </button>
        <button
          type="button"
          className="primary settings-button-compact"
          onClick={() => {
            void handleSaveConfig();
          }}
          disabled={!configDirty}
        >
          保存配置
        </button>
      </div>

      {testResult && (
        <div className={`settings-status ${testResult.success ? "success" : "error"}`}>
          {testResult.message}
        </div>
      )}

      <div className="settings-cliproxy-summary-card">
        <div className="settings-cliproxy-summary-title">当前 Codex CLI 配置</div>
        <div className="settings-cliproxy-summary-grid">
          <div className="settings-cliproxy-summary-item">
            <div className="settings-cliproxy-summary-label">默认模型</div>
            <div className="settings-cliproxy-summary-value">
              {configuredModel || "未配置"}
            </div>
          </div>
          <div className="settings-cliproxy-summary-item">
            <div className="settings-cliproxy-summary-label">API 端点</div>
            <div className="settings-cliproxy-summary-value">
              {configuredBaseUrl || "未配置"}
            </div>
          </div>
        </div>
        {selectedModel && selectedModel !== configuredModel && (
          <div className="settings-cliproxy-save-default-wrap">
            <button
              type="button"
              className="primary settings-button-compact settings-cliproxy-save-default-button"
              onClick={() => {
                void handleSaveModelToConfig();
              }}
              disabled={isSavingModel}
            >
              {isSavingModel
                ? "保存中..."
                : `将 ${getModelDisplayName(selectedModel)} 设为默认模型`}
            </button>
          </div>
        )}
        {saveModelResult && (
          <div
            className={`settings-status settings-status--compact ${
              saveModelResult.success ? "success" : "error"
            }`}
          >
            {saveModelResult.message}
          </div>
        )}
      </div>

      <div className="settings-field settings-cliproxy-model-list">
        <div className="settings-field-label">可用模型</div>
        <div className="settings-help">
          点击选择模型，然后点击上方的按钮将其设为 Codex CLI 的默认模型。
        </div>

        {isLoading ? (
          <div className="settings-cliproxy-loading-state">加载模型列表中...</div>
        ) : models.length === 0 ? (
          <div className="settings-cliproxy-loading-state">
            暂无可用模型，请检查 CLIProxyAPI 连接配置
          </div>
        ) : (
          <div className="settings-cliproxy-categories">
            {categories.map((category) => (
              <div key={category.id}>
                <div className="settings-cliproxy-category-title">{category.label}</div>
                <div className="settings-cliproxy-model-grid">
                  {category.models.map((model) => {
                    const isConfigured = model.id === configuredModel;
                    const isSelected = model.id === selectedModel;
                    return (
                      <button
                        key={model.id}
                        type="button"
                        onClick={() => handleSelectModel(model.id)}
                        className={`settings-cliproxy-model-card ${
                          isSelected
                            ? "is-selected"
                            : isConfigured
                              ? "is-configured"
                              : ""
                        }`}
                      >
                        {isConfigured && (
                          <div className="settings-cliproxy-model-badge">默认</div>
                        )}
                        <div
                          className={`settings-cliproxy-model-name ${
                            isConfigured ? "has-badge" : ""
                          }`}
                        >
                          {getModelDisplayName(model.id)}
                        </div>
                        <div className="settings-cliproxy-model-id">{model.id}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="settings-cliproxy-refresh">
        <button
          type="button"
          className="ghost settings-button-compact"
          onClick={() => {
            void loadModels();
          }}
          disabled={isLoading}
        >
          {isLoading ? "刷新中..." : "刷新模型列表"}
        </button>
      </div>

      <div className="settings-cliproxy-help-card">
        <div className="settings-cliproxy-help-title">使用说明</div>
        <ul className="settings-cliproxy-help-list">
          <li>
            选择一个模型后，点击「设为默认模型」按钮即可自动更新{" "}
            <code>~/.codex/config.toml</code>
          </li>
          <li>
            在终端使用 <code>codex --model MODEL_ID</code> 可临时切换模型
          </li>
          <li>
            带有<span className="settings-cliproxy-default-chip">「默认」</span>
            标签的模型是当前配置的默认模型
          </li>
        </ul>
        <div className="settings-cliproxy-help-title settings-cliproxy-help-title--spaced">
          模型来源
        </div>
        <ul className="settings-cliproxy-help-list">
          <li>
            <strong>Codex 模型</strong>：由 Codex 账号池提供（gpt-5.3-codex 等）
          </li>
          <li>
            <strong>Claude 模型</strong>：由 Antigravity 账号池提供（claude-opus-4-6 等）
          </li>
          <li>
            <strong>Gemini 模型</strong>：由 Antigravity 账号池提供（gemini-3-pro 等）
          </li>
        </ul>
      </div>
    </section>
  );
}
