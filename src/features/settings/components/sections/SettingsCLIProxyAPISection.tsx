import { useCallback, useEffect, useState } from "react";
import {
  getCLIProxyAPIConfig,
  saveCLIProxyAPIConfig,
  fetchCLIProxyAPIModels,
  testCLIProxyAPIConnection,
  categorizeModels,
  getModelDisplayName,
  type CLIProxyAPIConfig,
  type CLIProxyAPIModel,
  type ModelCategory,
} from "../../../../services/cliproxyapi";
import {
  readGlobalCodexConfigToml,
  writeGlobalCodexConfigToml,
} from "../../../../services/tauri";

type SettingsCLIProxyAPISectionProps = {
  onModelChange?: (modelId: string) => void;
};

// 从 TOML 内容中提取 model 配置
function parseModelFromToml(tomlContent: string): string | null {
  const match = tomlContent.match(/^\s*model\s*=\s*["']([^"']+)["']/m);
  return match ? match[1] : null;
}

// 从 TOML 内容中提取 base_url 配置
function parseBaseUrlFromToml(tomlContent: string): string | null {
  const match = tomlContent.match(/^\s*base_url\s*=\s*["']([^"']+)["']/m);
  return match ? match[1] : null;
}

// 更新或添加 TOML 中的 model 配置
function updateModelInToml(tomlContent: string, newModel: string): string {
  const modelRegex = /^(\s*model\s*=\s*["'])([^"']+)(["'])/m;
  if (modelRegex.test(tomlContent)) {
    return tomlContent.replace(modelRegex, `$1${newModel}$3`);
  }
  // 如果没有 model 字段，在文件开头添加
  return `model = "${newModel}"\n${tomlContent}`;
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

  // 从 config.toml 读取当前配置
  const loadConfiguredModel = useCallback(async () => {
    try {
      const result = await readGlobalCodexConfigToml();
      if (result.exists && result.content) {
        const model = parseModelFromToml(result.content);
        const baseUrl = parseBaseUrlFromToml(result.content);
        setConfiguredModel(model);
        setConfiguredBaseUrl(baseUrl);
        if (model) {
          setSelectedModel(model);
        }
      }
    } catch (error) {
      console.error("Failed to load config.toml:", error);
    }
  }, []);

  // 加载模型列表
  const loadModels = useCallback(async () => {
    setIsLoading(true);
    try {
      const modelList = await fetchCLIProxyAPIModels();
      setModels(modelList);
      setCategories(categorizeModels(modelList));
    } catch (error) {
      console.error("Failed to load models:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 测试连接
  const handleTestConnection = useCallback(async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await testCLIProxyAPIConnection({
        baseUrl: baseUrlDraft,
        apiKey: apiKeyDraft,
      });
      setTestResult({
        success: result.success,
        message: result.success
          ? `✅ 连接成功！发现 ${result.modelCount} 个可用模型`
          : `❌ 连接失败: ${result.error}`,
      });
      if (result.success) {
        // 保存配置并刷新模型列表
        const newConfig = { baseUrl: baseUrlDraft, apiKey: apiKeyDraft };
        saveCLIProxyAPIConfig(newConfig);
        setConfig(newConfig);
        setConfigDirty(false);
        await loadModels();
      }
    } finally {
      setIsTesting(false);
    }
  }, [baseUrlDraft, apiKeyDraft, loadModels]);

  // 保存配置
  const handleSaveConfig = useCallback(() => {
    const newConfig = { baseUrl: baseUrlDraft, apiKey: apiKeyDraft };
    saveCLIProxyAPIConfig(newConfig);
    setConfig(newConfig);
    setConfigDirty(false);
    loadModels();
  }, [baseUrlDraft, apiKeyDraft, loadModels]);

  // 选择模型
  const handleSelectModel = useCallback(
    (modelId: string) => {
      setSelectedModel(modelId);
      setSaveModelResult(null);
      onModelChange?.(modelId);
    },
    [onModelChange],
  );

  // 保存选中的模型到 config.toml
  const handleSaveModelToConfig = useCallback(async () => {
    if (!selectedModel) return;
    
    setIsSavingModel(true);
    setSaveModelResult(null);
    
    try {
      const result = await readGlobalCodexConfigToml();
      const currentContent = result.exists ? result.content : "";
      const updatedContent = updateModelInToml(currentContent, selectedModel);
      
      await writeGlobalCodexConfigToml(updatedContent);
      setConfiguredModel(selectedModel);
      
      setSaveModelResult({
        success: true,
        message: `✅ 已将默认模型设置为 ${selectedModel}`,
      });
    } catch (error) {
      setSaveModelResult({
        success: false,
        message: `❌ 保存失败: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      setIsSavingModel(false);
    }
  }, [selectedModel]);

  // 初始加载
  useEffect(() => {
    loadModels();
    loadConfiguredModel();
  }, [loadModels, loadConfiguredModel]);

  // 检测配置变更
  useEffect(() => {
    setConfigDirty(
      baseUrlDraft !== config.baseUrl || apiKeyDraft !== config.apiKey,
    );
  }, [baseUrlDraft, apiKeyDraft, config]);

  return (
    <section className="settings-section">
      <div className="settings-section-title">CLIProxyAPI 集成</div>
      <div className="settings-section-subtitle">
        配置 CLIProxyAPI 连接，管理和切换可用的 AI 模型。支持 Codex、Claude、Gemini
        等多种模型。
      </div>

      {/* 连接配置 */}
      <div className="settings-field">
        <label className="settings-field-label" htmlFor="cliproxy-baseurl">
          API 地址
        </label>
        <input
          id="cliproxy-baseurl"
          type="text"
          className="settings-input"
          value={baseUrlDraft}
          onChange={(e) => setBaseUrlDraft(e.target.value)}
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
          onChange={(e) => setApiKeyDraft(e.target.value)}
          placeholder="quotio-local-..."
        />
      </div>

      <div className="settings-field-actions">
        <button
          type="button"
          className="ghost settings-button-compact"
          onClick={handleTestConnection}
          disabled={isTesting}
        >
          {isTesting ? "测试中..." : "测试连接"}
        </button>
        <button
          type="button"
          className="primary settings-button-compact"
          onClick={handleSaveConfig}
          disabled={!configDirty}
        >
          保存配置
        </button>
      </div>

      {testResult && (
        <div
          className={`settings-status ${testResult.success ? "success" : "error"}`}
          style={{
            padding: "8px 12px",
            borderRadius: "6px",
            marginTop: "8px",
            backgroundColor: testResult.success
              ? "rgba(34, 197, 94, 0.1)"
              : "rgba(239, 68, 68, 0.1)",
            color: testResult.success ? "#22c55e" : "#ef4444",
          }}
        >
          {testResult.message}
        </div>
      )}

      {/* 当前配置状态 */}
      <div
        style={{
          marginTop: "24px",
          padding: "16px",
          backgroundColor: "var(--bg-secondary)",
          borderRadius: "8px",
          border: "1px solid var(--border)",
        }}
      >
        <div
          style={{
            fontSize: "13px",
            fontWeight: 600,
            marginBottom: "12px",
            color: "var(--text-primary)",
          }}
        >
          📊 当前 Codex CLI 配置
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "12px",
            fontSize: "12px",
          }}
        >
          <div>
            <div style={{ color: "var(--text-tertiary)", marginBottom: "4px" }}>
              默认模型
            </div>
            <div
              style={{
                color: "var(--text-primary)",
                fontFamily: "monospace",
                fontWeight: 500,
              }}
            >
              {configuredModel || "未配置"}
            </div>
          </div>
          <div>
            <div style={{ color: "var(--text-tertiary)", marginBottom: "4px" }}>
              API 端点
            </div>
            <div
              style={{
                color: "var(--text-primary)",
                fontFamily: "monospace",
                fontWeight: 500,
              }}
            >
              {configuredBaseUrl || "未配置"}
            </div>
          </div>
        </div>
        {selectedModel && selectedModel !== configuredModel && (
          <div style={{ marginTop: "12px" }}>
            <button
              type="button"
              className="primary settings-button-compact"
              onClick={handleSaveModelToConfig}
              disabled={isSavingModel}
              style={{ width: "100%" }}
            >
              {isSavingModel ? "保存中..." : `将 ${getModelDisplayName(selectedModel)} 设为默认模型`}
            </button>
          </div>
        )}
        {saveModelResult && (
          <div
            style={{
              marginTop: "8px",
              padding: "8px 12px",
              borderRadius: "6px",
              fontSize: "12px",
              backgroundColor: saveModelResult.success
                ? "rgba(34, 197, 94, 0.1)"
                : "rgba(239, 68, 68, 0.1)",
              color: saveModelResult.success ? "#22c55e" : "#ef4444",
            }}
          >
            {saveModelResult.message}
          </div>
        )}
      </div>

      {/* 模型列表 */}
      <div className="settings-field" style={{ marginTop: "24px" }}>
        <div className="settings-field-label">可用模型</div>
        <div className="settings-help">
          点击选择模型，然后点击上方的按钮将其设为 Codex CLI 的默认模型。
        </div>

        {isLoading ? (
          <div style={{ padding: "16px", textAlign: "center", opacity: 0.6 }}>
            加载模型列表中...
          </div>
        ) : models.length === 0 ? (
          <div style={{ padding: "16px", textAlign: "center", opacity: 0.6 }}>
            暂无可用模型，请检查 CLIProxyAPI 连接配置
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {categories.map((category) => (
              <div key={category.id}>
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "var(--text-secondary)",
                    marginBottom: "8px",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  {category.label}
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                    gap: "8px",
                  }}
                >
                  {category.models.map((model) => {
                    const isConfigured = model.id === configuredModel;
                    const isSelected = model.id === selectedModel;
                    return (
                      <button
                        key={model.id}
                        type="button"
                        onClick={() => handleSelectModel(model.id)}
                        style={{
                          padding: "10px 14px",
                          borderRadius: "8px",
                          border: isSelected
                            ? "2px solid var(--accent)"
                            : isConfigured
                            ? "2px solid #22c55e"
                            : "1px solid var(--border)",
                          backgroundColor: isSelected
                            ? "rgba(var(--accent-rgb), 0.1)"
                            : isConfigured
                            ? "rgba(34, 197, 94, 0.08)"
                            : "var(--bg-secondary)",
                          cursor: "pointer",
                          textAlign: "left",
                          transition: "all 0.15s ease",
                          position: "relative",
                        }}
                      >
                        {isConfigured && (
                          <div
                            style={{
                              position: "absolute",
                              top: "6px",
                              right: "8px",
                              fontSize: "10px",
                              fontWeight: 600,
                              color: "#22c55e",
                              backgroundColor: "rgba(34, 197, 94, 0.15)",
                              padding: "2px 6px",
                              borderRadius: "4px",
                            }}
                          >
                            默认
                          </div>
                        )}
                        <div
                          style={{
                            fontSize: "13px",
                            fontWeight: 500,
                            color: "var(--text-primary)",
                            paddingRight: isConfigured ? "48px" : 0,
                          }}
                        >
                          {getModelDisplayName(model.id)}
                        </div>
                        <div
                          style={{
                            fontSize: "11px",
                            color: "var(--text-tertiary)",
                            marginTop: "2px",
                            fontFamily: "monospace",
                          }}
                        >
                          {model.id}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 刷新按钮 */}
      <div style={{ marginTop: "16px" }}>
        <button
          type="button"
          className="ghost settings-button-compact"
          onClick={loadModels}
          disabled={isLoading}
        >
          {isLoading ? "刷新中..." : "刷新模型列表"}
        </button>
      </div>

      {/* 快速操作说明 */}
      <div
        style={{
          marginTop: "24px",
          padding: "12px 16px",
          backgroundColor: "var(--bg-tertiary)",
          borderRadius: "8px",
          fontSize: "12px",
          color: "var(--text-secondary)",
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: "8px" }}>💡 使用说明</div>
        <ul style={{ margin: 0, paddingLeft: "16px", lineHeight: 1.6 }}>
          <li>
            选择一个模型后，点击「设为默认模型」按钮即可自动更新{" "}
            <code>~/.codex/config.toml</code>
          </li>
          <li>
            在终端使用 <code>codex --model MODEL_ID</code> 可临时切换模型
          </li>
          <li>
            带有<span style={{ color: "#22c55e", fontWeight: 600 }}>「默认」</span>
            标签的模型是当前配置的默认模型
          </li>
        </ul>
        <div style={{ marginTop: "12px", fontWeight: 600 }}>📦 模型来源</div>
        <ul style={{ margin: 0, paddingLeft: "16px", lineHeight: 1.6, marginTop: "8px" }}>
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
