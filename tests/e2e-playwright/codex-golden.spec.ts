import { expect, test } from "@playwright/test";

type MockWorkspace = {
  id: string;
  name: string;
  path: string;
  connected: boolean;
  codex_bin: string | null;
  kind: "main" | "worktree";
  parentId: string | null;
  worktree: null;
  settings: {
    sidebarCollapsed: boolean;
    codexBin?: string | null;
    codexHome?: string | null;
    codexArgs?: string | null;
  };
};

type MockState = {
  settings: Record<string, unknown>;
  workspaces: MockWorkspace[];
};

const defaultMockState: MockState = {
  settings: {},
  workspaces: [
    {
      id: "ws-1",
      name: "Workspace One",
      path: "/tmp/workspace-one",
      connected: false,
      codex_bin: null,
      kind: "main",
      parentId: null,
      worktree: null,
      settings: {
        sidebarCollapsed: false,
      },
    },
  ],
};

async function installTauriMock(
  page: import("@playwright/test").Page,
  initial: MockState = defaultMockState,
) {
  await page.addInitScript((state: MockState) => {
    const mockState: MockState = JSON.parse(JSON.stringify(state));
    const metadata = {
      currentWindow: { label: "main" },
      currentWebview: { label: "main" },
      windows: [{ label: "main" }],
      webviews: [{ label: "main", windowLabel: "main" }],
    };
    const callbacks = new Map<number, (payload: unknown) => void>();
    let callbackId = 1;

    (window as unknown as { __TAURI_INTERNALS__?: Record<string, unknown> }).__TAURI_INTERNALS__ =
      {
        metadata,
        invoke: async (cmd: string, args?: Record<string, unknown>) => {
          if (cmd === "get_app_settings") {
            return mockState.settings;
          }
          if (cmd === "update_app_settings") {
            mockState.settings = (args?.settings as Record<string, unknown>) ?? {};
            return mockState.settings;
          }
          if (cmd === "list_workspaces") {
            return mockState.workspaces;
          }
          if (cmd === "update_workspace_cli_bin") {
            const id = args?.id as string;
            const value = (args?.codex_bin as string | null) ?? null;
            const workspace = mockState.workspaces.find((entry) => entry.id === id);
            if (!workspace) {
              throw new Error("workspace not found");
            }
            workspace.settings.codexBin = value;
            workspace.codex_bin = value;
            return workspace;
          }
          if (cmd === "update_workspace_settings") {
            const id = args?.id as string;
            const patch = (args?.settings as Record<string, unknown>) ?? {};
            const workspace = mockState.workspaces.find((entry) => entry.id === id);
            if (!workspace) {
              throw new Error("workspace not found");
            }
            workspace.settings = { ...workspace.settings, ...patch };
            return workspace;
          }
          if (cmd === "list_threads") {
            return { items: [], has_more: false, next_cursor: null };
          }
          if (cmd === "get_local_usage" || cmd === "get_local_usage_snapshot") {
            return null;
          }
          if (cmd === "list_workspace_files") {
            return [];
          }
          return null;
        },
        transformCallback: (cb: (payload: unknown) => void) => {
          const id = callbackId++;
          callbacks.set(id, cb);
          return id;
        },
        unregisterCallback: (id: number) => {
          callbacks.delete(id);
        },
        runCallback: (id: number, payload: unknown) => {
          const cb = callbacks.get(id);
          cb?.(payload);
        },
        convertFileSrc: (filePath: string) => filePath,
        plugins: {
          path: {
            sep: "/",
            delimiter: ":",
          },
        },
      };

    (
      window as unknown as {
        __TAURI_EVENT_PLUGIN_INTERNALS__?: Record<string, unknown>;
      }
    ).__TAURI_EVENT_PLUGIN_INTERNALS__ = {
      unregisterListener: () => {},
    };
  }, initial);
}

async function openCliBackendSettings(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "CLI Backend" }).click();
  await expect(
    page.locator(".settings-section-title", { hasText: "CLI Backend" }),
  ).toBeVisible();
}

test("keeps Codex as default active CLI and persists default CLI path/args", async ({
  page,
}) => {
  await installTauriMock(page);
  await openCliBackendSettings(page);

  await expect(page.getByLabel("Active CLI")).toHaveValue("codex");

  await page.getByLabel("Default Agent path").fill("/usr/local/bin/codex");
  await page.getByLabel("Default Agent args").fill("--approval never");
  await page.getByRole("button", { name: "Save" }).first().click();

  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "CLI Backend" }).click();

  await expect(page.getByLabel("Active CLI")).toHaveValue("codex");
  await expect(page.getByLabel("Default Agent path")).toHaveValue(
    "/usr/local/bin/codex",
  );
  await expect(page.getByLabel("Default Agent args")).toHaveValue("--approval never");
});

test("persists Codex workspace binary/home/args overrides", async ({ page }) => {
  await installTauriMock(page);
  await openCliBackendSettings(page);

  const name = "Workspace One";
  const binInput = page.getByLabel(`Agent binary override for ${name}`);
  const homeInput = page.getByLabel(`Agent home override for ${name}`);
  const argsInput = page.getByLabel(`Agent args override for ${name}`);

  await binInput.fill("/opt/codex/bin/codex");
  await binInput.blur();

  await homeInput.fill(".codex-home");
  await homeInput.blur();

  await argsInput.fill("--profile default");
  await argsInput.blur();

  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "CLI Backend" }).click();

  await expect(page.getByLabel(`Agent binary override for ${name}`)).toHaveValue(
    "/opt/codex/bin/codex",
  );
  await expect(page.getByLabel(`Agent home override for ${name}`)).toHaveValue(
    ".codex-home",
  );
  await expect(page.getByLabel(`Agent args override for ${name}`)).toHaveValue(
    "--profile default",
  );
});
