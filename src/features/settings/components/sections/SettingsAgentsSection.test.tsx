// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SettingsAgentsSectionProps } from "@settings/hooks/useSettingsAgentsSection";
import { SettingsAgentsSection } from "./SettingsAgentsSection";

const baseProps = (): SettingsAgentsSectionProps => ({
  settings: {
    configPath: "/Users/me/.codex/config.toml",
    multiAgentEnabled: false,
    maxThreads: 6,
    agents: [
      {
        name: "researcher",
        description: "Research-focused role",
        developerInstructions: "Investigate and propose safe changes.",
        configFile: "researcher.toml",
        resolvedPath: "/Users/me/.codex/agents/researcher.toml",
        managedByApp: true,
        fileExists: true,
      },
    ],
  },
  isLoading: false,
  isUpdatingCore: false,
  creatingAgent: false,
  updatingAgentName: null,
  deletingAgentName: null,
  readingConfigAgentName: null,
  writingConfigAgentName: null,
  createDescriptionGenerating: false,
  editDescriptionGenerating: false,
  error: null,
  onRefresh: vi.fn(),
  onSetMultiAgentEnabled: vi.fn(async () => true),
  onSetMaxThreads: vi.fn(async () => true),
  onCreateAgent: vi.fn(async () => true),
  onUpdateAgent: vi.fn(async () => true),
  onDeleteAgent: vi.fn(async () => true),
  onReadAgentConfig: vi.fn(async () => "model = \"gpt-5-codex\""),
  onWriteAgentConfig: vi.fn(async () => true),
  onGenerateCreateDescription: vi.fn(async () => null),
  onGenerateEditDescription: vi.fn(async () => null),
  modelOptions: [
    {
      id: "gpt-5-codex",
      model: "gpt-5-codex",
      displayName: "gpt-5-codex",
      description: "",
      supportedReasoningEfforts: [],
      defaultReasoningEffort: null,
      isDefault: true,
    },
  ],
  modelOptionsLoading: false,
  modelOptionsError: null,
});

describe("SettingsAgentsSection", () => {
  afterEach(() => {
    cleanup();
  });

  it("enables create generation only when name is present", () => {
    const props = baseProps();
    render(<SettingsAgentsSection {...props} />);

    const improveButton = screen.getByRole("button", {
      name: "Generate fields for new agent",
    }) as HTMLButtonElement;
    expect(improveButton.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "researcher" } });
    expect(improveButton.disabled).toBe(false);
  });

  it("applies generated description to create textarea", async () => {
    const props = baseProps();
    const onGenerateCreateDescription = vi.fn(async () => ({
      description: "Stabilizes flaky test suites",
      developerInstructions:
        "Reproduce failures first.\nPrefer deterministic fixes.\nAdd targeted regression tests.",
    }));
    render(
      <SettingsAgentsSection
        {...props}
        onGenerateCreateDescription={onGenerateCreateDescription}
      />,
    );

    const createName = screen.getByLabelText("Name") as HTMLInputElement;
    const createDescription = screen.getByLabelText("Description") as HTMLTextAreaElement;
    const createDeveloperInstructions = screen.getByLabelText(
      "Developer instructions",
    ) as HTMLTextAreaElement;
    fireEvent.change(createName, { target: { value: "researcher" } });
    fireEvent.change(createDescription, { target: { value: "flaky tests" } });
    fireEvent.click(
      screen.getByRole("button", { name: "Generate fields for new agent" }),
    );

    await waitFor(() => {
      expect(onGenerateCreateDescription).toHaveBeenCalledWith({
        name: "researcher",
        description: "flaky tests",
        developerInstructions: "",
      });
    });
    await waitFor(() => {
      expect(createDescription.value).toBe("Stabilizes flaky test suites");
      expect(createDeveloperInstructions.value).toContain("Reproduce failures first.");
    });
  });

  it("does not send developerInstructions when unchanged during edit", async () => {
    const props = baseProps();
    const onUpdateAgent = vi.fn(
      async (_input: Parameters<SettingsAgentsSectionProps["onUpdateAgent"]>[0]) => true,
    );
    render(<SettingsAgentsSection {...props} onUpdateAgent={onUpdateAgent} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const nameInputs = screen.getAllByLabelText("Name") as HTMLInputElement[];
    fireEvent.change(nameInputs[1], { target: { value: "researcher-v2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(onUpdateAgent).toHaveBeenCalledTimes(1);
    });
    const payload = onUpdateAgent.mock.calls[0]?.[0];
    if (!payload) {
      throw new Error("Expected update payload");
    }
    expect(payload).toMatchObject({
      originalName: "researcher",
      name: "researcher-v2",
      description: "Research-focused role",
      renameManagedFile: true,
    });
    expect(payload).not.toHaveProperty("developerInstructions");
  });
});
