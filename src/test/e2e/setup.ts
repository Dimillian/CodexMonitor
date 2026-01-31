/**
 * E2E Test Setup
 *
 * Sets up global mocks for E2E tests.
 * This file is run before E2E tests.
 */

import { vi, beforeEach } from "vitest";
import { resetMocks } from "./mocks/tauri.mock";

// Mock Tauri core - this is hoisted
vi.mock("@tauri-apps/api/core", () => ({
  invoke: async (cmd: string, args?: Record<string, unknown>) => {
    const { invoke: mockInvoke } = await import("./mocks/tauri.mock");
    return mockInvoke(cmd, args);
  },
}));

// Mock Tauri event system
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
  emit: vi.fn(() => Promise.resolve()),
}));

// Mock Tauri plugins
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(() => Promise.resolve(null)),
  ask: vi.fn(() => Promise.resolve(true)),
  confirm: vi.fn(() => Promise.resolve(true)),
  message: vi.fn(() => Promise.resolve()),
  save: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  revealItemInDir: vi.fn(() => Promise.resolve()),
  openUrl: vi.fn(() => Promise.resolve()),
  openPath: vi.fn(() => Promise.resolve()),
}));

vi.mock("@tauri-apps/plugin-process", () => ({
  exit: vi.fn(() => Promise.resolve()),
}));

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: vi.fn(() => Promise.resolve(null)),
  Update: class MockUpdate {
    metadata = { version: "0.0.0" };
    async download() { return null; }
    async install() { return null; }
  },
}));

vi.mock("tauri-plugin-liquid-glass-api", () => ({
  isLiquidGlassEnabled: vi.fn(() => Promise.resolve(false)),
  setLiquidGlassEnabled: vi.fn(() => Promise.resolve()),
}));

vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: vi.fn(() => ({
    setZoom: vi.fn(() => Promise.resolve()),
    metadata: { label: "main" },
  })),
  Webview: class MockWebview {
    metadata = { label: "main" };
    setZoom() { return Promise.resolve(); }
  },
}));

vi.mock("@tauri-apps/api/webviewWindow", () => ({
  getCurrentWebviewWindow: vi.fn(() => ({
    setZoom: vi.fn(() => Promise.resolve()),
    label: "main",
    metadata: { label: "main" },
  })),
}));

// Reset mocks before each test
beforeEach(() => {
  resetMocks();
  localStorage.clear();
});
