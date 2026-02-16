// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsCLIProxyAPISection } from "./SettingsCLIProxyAPISection";

const fetchCLIProxyAPIModelsMock = vi.fn();
const saveCLIProxyAPIConfigMock = vi.fn();
const testCLIProxyAPIConnectionMock = vi.fn();
const categorizeModelsMock = vi.fn();
const getModelDisplayNameMock = vi.fn();
const readGlobalCodexConfigTomlMock = vi.fn();
const writeGlobalCodexConfigTomlMock = vi.fn();
const pushErrorToastMock = vi.fn();

vi.mock("../../../../services/cliproxyapi", () => ({
  getCLIProxyAPIConfig: () => ({ baseUrl: "http://all.local:18317", apiKey: "" }),
  saveCLIProxyAPIConfig: (...args: unknown[]) => saveCLIProxyAPIConfigMock(...args),
  fetchCLIProxyAPIModels: (...args: unknown[]) => fetchCLIProxyAPIModelsMock(...args),
  testCLIProxyAPIConnection: (...args: unknown[]) => testCLIProxyAPIConnectionMock(...args),
  categorizeModels: (...args: unknown[]) => categorizeModelsMock(...args),
  getModelDisplayName: (...args: unknown[]) => getModelDisplayNameMock(...args),
}));

vi.mock("../../../../services/tauri", () => ({
  readGlobalCodexConfigToml: (...args: unknown[]) => readGlobalCodexConfigTomlMock(...args),
  writeGlobalCodexConfigToml: (...args: unknown[]) => writeGlobalCodexConfigTomlMock(...args),
}));

vi.mock("../../../../services/toasts", () => ({
  pushErrorToast: (...args: unknown[]) => pushErrorToastMock(...args),
}));

describe("SettingsCLIProxyAPISection", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    fetchCLIProxyAPIModelsMock.mockReset();
    saveCLIProxyAPIConfigMock.mockReset();
    testCLIProxyAPIConnectionMock.mockReset();
    categorizeModelsMock.mockReset();
    getModelDisplayNameMock.mockReset();
    readGlobalCodexConfigTomlMock.mockReset();
    writeGlobalCodexConfigTomlMock.mockReset();
    pushErrorToastMock.mockReset();

    getModelDisplayNameMock.mockImplementation((modelId: unknown) =>
      String(modelId ?? ""),
    );
    fetchCLIProxyAPIModelsMock.mockResolvedValue([]);
    categorizeModelsMock.mockReturnValue([]);
    readGlobalCodexConfigTomlMock.mockResolvedValue({
      exists: false,
      content: "",
      truncated: false,
    });
  });

  it("shows visible toasts when model loading and config loading fail", async () => {
    fetchCLIProxyAPIModelsMock.mockRejectedValueOnce(new Error("models unavailable"));
    readGlobalCodexConfigTomlMock.mockRejectedValueOnce(new Error("config unavailable"));

    render(<SettingsCLIProxyAPISection />);

    expect(screen.getByText("CLIProxyAPI 集成")).not.toBeNull();

    await waitFor(() => {
      expect(pushErrorToastMock).toHaveBeenCalled();
    });

    const toastTitles = pushErrorToastMock.mock.calls.map((call) => String(call[0]?.title ?? ""));
    expect(toastTitles.includes("读取配置失败")).toBe(true);
    expect(toastTitles.includes("加载模型失败")).toBe(true);
  });

  it("renders model cards and saves selected model to config.toml", async () => {
    fetchCLIProxyAPIModelsMock.mockResolvedValueOnce([
      { id: "gpt-5-codex", object: "model", created: 1, owned_by: "codex" },
      { id: "gpt-5.3-codex", object: "model", created: 1, owned_by: "codex" },
    ]);
    categorizeModelsMock.mockReturnValueOnce([
      {
        id: "codex",
        label: "Codex (OpenAI)",
        description: "GPT-5 Codex",
        models: [
          { id: "gpt-5-codex", object: "model", created: 1, owned_by: "codex" },
          { id: "gpt-5.3-codex", object: "model", created: 1, owned_by: "codex" },
        ],
      },
    ]);
    readGlobalCodexConfigTomlMock.mockResolvedValueOnce({
      exists: true,
      content: 'model = "gpt-5-codex"\nbase_url = "http://all.local:18317"\n',
      truncated: false,
    });
    const onModelChange = vi.fn();

    render(<SettingsCLIProxyAPISection onModelChange={onModelChange} />);

    await waitFor(() => {
      const modelCards = screen
        .getAllByRole("button")
        .filter((entry) => entry.textContent?.includes("gpt-5.3-codex"));
      expect(modelCards.length > 0).toBe(true);
    });

    const candidateCards = screen
      .getAllByRole("button")
      .filter((entry) => entry.textContent?.includes("gpt-5.3-codex"));
    expect(candidateCards.length > 0).toBe(true);
    fireEvent.click(candidateCards[0]);
    expect(onModelChange).toHaveBeenCalledWith("gpt-5.3-codex");

    const saveButton = await screen.findByRole("button", {
      name: /将 gpt-5\.3-codex 设为默认模型/i,
    });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(writeGlobalCodexConfigTomlMock).toHaveBeenCalledTimes(1);
    });
    const savedToml = String(writeGlobalCodexConfigTomlMock.mock.calls[0]?.[0] ?? "");
    expect(savedToml.includes('model = "gpt-5.3-codex"')).toBe(true);
    expect(screen.getByText(/已将默认模型设置为 gpt-5.3-codex/)).not.toBeNull();
  });

  it("saves config and refreshes model list after successful connection test", async () => {
    testCLIProxyAPIConnectionMock.mockResolvedValueOnce({
      success: true,
      modelCount: 3,
    });

    render(<SettingsCLIProxyAPISection />);

    fireEvent.change(screen.getByLabelText("API 地址"), {
      target: { value: "http://proxy.local:18317" },
    });
    fireEvent.change(screen.getByLabelText("API Key"), {
      target: { value: "token-xyz" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "测试连接" })[0]);

    await waitFor(() => {
      expect(saveCLIProxyAPIConfigMock).toHaveBeenCalledWith({
        baseUrl: "http://proxy.local:18317",
        apiKey: "token-xyz",
      });
    });
    await waitFor(() => {
      expect(writeGlobalCodexConfigTomlMock).toHaveBeenCalled();
    });
    const writeCalls = writeGlobalCodexConfigTomlMock.mock.calls;
    const latestWriteArgs = writeCalls[writeCalls.length - 1];
    expect(String(latestWriteArgs?.[0] ?? "")).toContain(
      'base_url = "http://proxy.local:18317"',
    );
    expect(screen.getByText(/连接成功/)).not.toBeNull();
  });
});
