// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  categorizeModels,
  fetchCLIProxyAPIModels,
  getCLIProxyAPIConfig,
  getModelDisplayName,
  saveCLIProxyAPIConfig,
  testCLIProxyAPIConnection,
} from "./cliproxyapi";

describe("cliproxyapi service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("returns default config when local storage is empty or invalid", () => {
    expect(getCLIProxyAPIConfig()).toEqual({
      baseUrl: "http://all.local:18317",
      apiKey: "",
    });

    localStorage.setItem("cliproxyapi_config", "{invalid");
    expect(getCLIProxyAPIConfig()).toEqual({
      baseUrl: "http://all.local:18317",
      apiKey: "",
    });
  });

  it("loads and saves CLIProxy config while only persisting baseUrl", () => {
    saveCLIProxyAPIConfig({
      baseUrl: "http://proxy.local:18317",
      apiKey: "token-abc",
    });

    expect(getCLIProxyAPIConfig()).toEqual({
      baseUrl: "http://proxy.local:18317",
      apiKey: "token-abc",
    });
    expect(localStorage.getItem("cliproxyapi_base_url")).toBe(
      "http://proxy.local:18317",
    );
    expect(localStorage.getItem("cliproxyapi_config")).toBeNull();
  });

  it("does not persist api key across module reloads", async () => {
    saveCLIProxyAPIConfig({
      baseUrl: "http://proxy.local:18317",
      apiKey: "token-abc",
    });
    expect(localStorage.getItem("cliproxyapi_base_url")).toBe(
      "http://proxy.local:18317",
    );

    vi.resetModules();
    const reloaded = await import("./cliproxyapi");
    expect(reloaded.getCLIProxyAPIConfig()).toEqual({
      baseUrl: "http://proxy.local:18317",
      apiKey: "",
    });
  });

  it("fetches model list with configured auth headers", async () => {
    saveCLIProxyAPIConfig({
      baseUrl: "http://proxy.local:18317",
      apiKey: "token-abc",
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            object: "list",
            data: [{ id: "gpt-5-codex", object: "model", created: 1, owned_by: "codex" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    const models = await fetchCLIProxyAPIModels();
    expect(models).toHaveLength(1);
    expect(models[0]?.id).toBe("gpt-5-codex");
    expect(fetchMock).toHaveBeenCalledWith("http://proxy.local:18317/v1/models", {
      method: "GET",
      headers: {
        Authorization: "Bearer token-abc",
        "Content-Type": "application/json",
      },
    });
  });

  it("throws when model fetch fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("network down"));
    await expect(fetchCLIProxyAPIModels()).rejects.toThrow("network down");
  });

  it("returns success and model count when connection test passes", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          object: "list",
          data: [
            { id: "gpt-5-codex", object: "model", created: 1, owned_by: "codex" },
            { id: "gemini-2.5-pro", object: "model", created: 1, owned_by: "gemini" },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(
      testCLIProxyAPIConnection({
        baseUrl: "http://all.local:18317",
        apiKey: "token-123",
      }),
    ).resolves.toEqual({
      success: true,
      modelCount: 2,
    });
  });

  it("returns an error payload when connection test receives non-ok status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("unauthorized", { status: 401, statusText: "Unauthorized" }),
    );

    const result = await testCLIProxyAPIConnection({
      baseUrl: "http://all.local:18317",
      apiKey: "bad-token",
    });

    expect(result.success).toBe(false);
    expect(result.modelCount).toBe(0);
    expect(String(result.error ?? "")).toContain("HTTP 401");
  });

  it("categorizes models by provider and returns display names", () => {
    const categories = categorizeModels([
      { id: "gpt-5-codex", object: "model", created: 1, owned_by: "codex" },
      { id: "gemini-claude-opus-4-6-thinking", object: "model", created: 1, owned_by: "claude" },
      { id: "gemini-2.5-pro", object: "model", created: 1, owned_by: "gemini" },
      { id: "custom-model-x", object: "model", created: 1, owned_by: "other" },
    ]);

    const categoryIds = categories.map((entry) => entry.id);
    expect(categoryIds).toEqual(["codex", "claude", "gemini", "other"]);
    expect(getModelDisplayName("gpt-5.3-codex")).toBe("GPT-5.3 Codex");
    expect(getModelDisplayName("unknown-model")).toBe("unknown-model");
  });
});
