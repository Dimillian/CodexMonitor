// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MobileRemoteWorkspacePrompt } from "./MobileRemoteWorkspacePrompt";

afterEach(() => {
  cleanup();
});

describe("MobileRemoteWorkspacePrompt", () => {
  it("focuses paths textarea and moves caret to end after selecting a recent path", async () => {
    const recentPath = "/Users/vlad/dev/codex-monitor/cm";
    function PromptHarness() {
      const [value, setValue] = useState("");
      return (
        <MobileRemoteWorkspacePrompt
          value={value}
          error={null}
          recentPaths={[recentPath]}
          onChange={setValue}
          onRecentPathSelect={(path) => {
            setValue((prev) => (prev.length > 0 ? `${prev}\n${path}` : path));
          }}
          onCancel={vi.fn()}
          onConfirm={vi.fn()}
        />
      );
    }
    render(<PromptHarness />);

    const recentPathButton = screen.getByRole("button", { name: recentPath });
    fireEvent.click(recentPathButton);

    const textarea = screen.getByLabelText("Paths");
    await waitFor(() => {
      expect(document.activeElement).toBe(textarea);
      const expectedPosition = recentPath.length;
      expect((textarea as HTMLTextAreaElement).selectionStart).toBe(expectedPosition);
      expect((textarea as HTMLTextAreaElement).selectionEnd).toBe(expectedPosition);
    });
  });
});
