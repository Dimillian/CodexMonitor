// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { open } from "@tauri-apps/plugin-dialog";
import type { AppSettings } from "@/types";
import { getCodexHome, getCodexConfigPath, validateCodexHome } from "@services/tauri";
import { useSettingsCodexSection } from "@settings/hooks/useSettingsCodexSection";
import { SettingsCodexSection } from "./SettingsCodexSection";

vi.mock("@services/tauri", () => ({ getCodexHome: vi.fn(), getCodexConfigPath: vi.fn(), validateCodexHome: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("@settings/hooks/useSettingsDefaultModels", () => ({
  useSettingsDefaultModels: () => ({ models: [], isLoading: false, error: null, connectedWorkspaceCount: 0, refresh: vi.fn() }),
}));
vi.mock("@settings/hooks/useGlobalAgentsMd", () => ({ useGlobalAgentsMd: () => editor() }));
vi.mock("@settings/hooks/useGlobalCodexConfigToml", () => ({ useGlobalCodexConfigToml: () => editor() }));

function editor() {
  return {
    content: "", exists: true, truncated: false, isLoading: false, isSaving: false,
    error: null, isDirty: false, setContent: vi.fn(), refresh: vi.fn(), save: vi.fn(),
  };
}

const home = {
  configuredPath: "/Users/me/.codex-alternative",
  effectivePath: "/Volumes/External/codex-alternative",
  source: "application" as const,
};

function Harness({ save, remote = false }: { save: (next: AppSettings) => Promise<void>; remote?: boolean }) {
  const props = useSettingsCodexSection({
    appSettings: { codexBin: null, codexArgs: null, codexHome: home.configuredPath, backendMode: remote ? "remote" : "local" } as AppSettings,
    projects: [], onUpdateAppSettings: save, onRunDoctor: vi.fn(),
  });
  return <SettingsCodexSection {...props} />;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getCodexHome).mockResolvedValue(home);
});
afterEach(cleanup);

describe("Codex Home settings", () => {
  it("shows the configured symlink and canonical file locations", async () => {
    render(<Harness save={vi.fn()} />);
    expect((screen.getByLabelText("Codex Home") as HTMLInputElement).value).toBe(home.configuredPath);
    await waitFor(() => expect(screen.getByText(`${home.effectivePath}/config.toml`)).toBeTruthy());
    expect(screen.getByText(`${home.effectivePath}/AGENTS.md`)).toBeTruthy();
    expect(screen.queryByText("~/.codex/config.toml")).toBeNull();
  });

  it("uses the native directory picker", async () => {
    vi.mocked(open).mockResolvedValue("/chosen/home");
    render(<Harness save={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Browse home" }));
    await waitFor(() => expect((screen.getByLabelText("Codex Home") as HTMLInputElement).value).toBe("/chosen/home"));
    expect(open).toHaveBeenCalledWith({ multiple: false, directory: true, title: "Select Codex Home" });
  });

  it("does not persist an inaccessible home", async () => {
    vi.mocked(validateCodexHome).mockRejectedValue(new Error("Configured home is unavailable"));
    const save = vi.fn();
    render(<Harness save={save} />);
    fireEvent.change(screen.getByLabelText("Codex Home"), { target: { value: "/missing/home" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("unavailable"));
    expect(save).not.toHaveBeenCalled();
  });

  it("validates before persisting a changed home", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    vi.mocked(validateCodexHome).mockResolvedValue({ ...home, configuredPath: "/chosen/home" });
    // jsdom reports its unsupported full-page reload; the real app reboots its caches.
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      render(<Harness save={save} />);
      fireEvent.change(screen.getByLabelText("Codex Home"), { target: { value: "/chosen/home" } });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ codexHome: "/chosen/home" })));
      expect(validateCodexHome).toHaveBeenCalledWith("/chosen/home");
    } finally {
      consoleError.mockRestore();
    }
  });

  it("disables local home controls remotely and displays the daemon’s file paths", async () => {
    vi.mocked(getCodexConfigPath).mockResolvedValue("/remote/codex/config.toml");
    render(<Harness remote save={vi.fn()} />);
    expect((screen.getByLabelText("Codex Home") as HTMLInputElement).disabled).toBe(true);
    for (const name of ["Browse home", "Use default", "Validate"]) {
      expect((screen.getByRole("button", { name }) as HTMLButtonElement).disabled).toBe(true);
    }
    await waitFor(() => expect(screen.getByText("/remote/codex/config.toml")).toBeTruthy());
    expect(screen.getByText("/remote/codex/AGENTS.md")).toBeTruthy();
    expect(getCodexHome).not.toHaveBeenCalled();
    expect(screen.queryByText(home.effectivePath)).toBeNull();
  });

  it("restores inherited/default resolution without saving until requested", async () => {
    const save = vi.fn();
    vi.mocked(validateCodexHome).mockResolvedValue({ configuredPath: null, effectivePath: "/inherited/home", source: "environment" });
    render(<Harness save={save} />);
    fireEvent.click(screen.getByRole("button", { name: "Use default" }));
    expect((screen.getByLabelText("Codex Home") as HTMLInputElement).value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Validate" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("/inherited/home"));
    expect(validateCodexHome).toHaveBeenCalledWith(null);
    expect(save).not.toHaveBeenCalled();
  });
});
