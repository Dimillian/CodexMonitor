// @vitest-environment jsdom
import { cleanup, createEvent, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Markdown } from "./Markdown";

describe("Markdown file-like href behavior", () => {
  afterEach(() => {
    cleanup();
  });

  it("prevents file-like href navigation when no file opener is provided", () => {
    render(
      <Markdown
        value="See [setup](./docs/setup.md)"
        className="markdown"
      />,
    );

    const link = screen.getByText("setup").closest("a");
    expect(link?.getAttribute("href")).toBe("./docs/setup.md");

    const clickEvent = createEvent.click(link as Element, {
      bubbles: true,
      cancelable: true,
    });
    fireEvent(link as Element, clickEvent);
    expect(clickEvent.defaultPrevented).toBe(true);
  });

  it("intercepts file-like href clicks when a file opener is provided", () => {
    const onOpenFileLink = vi.fn();
    render(
      <Markdown
        value="See [setup](./docs/setup.md)"
        className="markdown"
        onOpenFileLink={onOpenFileLink}
      />,
    );

    const link = screen.getByText("setup").closest("a");
    expect(link?.getAttribute("href")).toBe("./docs/setup.md");

    const clickEvent = createEvent.click(link as Element, {
      bubbles: true,
      cancelable: true,
    });
    fireEvent(link as Element, clickEvent);
    expect(clickEvent.defaultPrevented).toBe(true);
    expect(onOpenFileLink).toHaveBeenCalledWith("./docs/setup.md");
  });

  it("prevents bare relative link navigation without treating it as a file", () => {
    const onOpenFileLink = vi.fn();
    render(
      <Markdown
        value="See [setup](docs/setup.md)"
        className="markdown"
        onOpenFileLink={onOpenFileLink}
      />,
    );

    const link = screen.getByText("setup").closest("a");
    expect(link?.getAttribute("href")).toBe("docs/setup.md");
    const clickEvent = createEvent.click(link as Element, {
      bubbles: true,
      cancelable: true,
    });
    fireEvent(link as Element, clickEvent);
    expect(clickEvent.defaultPrevented).toBe(true);
    expect(onOpenFileLink).not.toHaveBeenCalled();
  });

  it("still intercepts explicit workspace file hrefs when a file opener is provided", () => {
    const onOpenFileLink = vi.fn();
    render(
      <Markdown
        value="See [example](/workspace/src/example.ts)"
        className="markdown"
        onOpenFileLink={onOpenFileLink}
      />,
    );

    const link = screen.getByText("example").closest("a");
    expect(link?.getAttribute("href")).toBe("/workspace/src/example.ts");

    const clickEvent = createEvent.click(link as Element, {
      bubbles: true,
      cancelable: true,
    });
    fireEvent(link as Element, clickEvent);
    expect(clickEvent.defaultPrevented).toBe(true);
    expect(onOpenFileLink).toHaveBeenCalledWith("/workspace/src/example.ts");
  });

  it("still intercepts dotless workspace file hrefs when a file opener is provided", () => {
    const onOpenFileLink = vi.fn();
    render(
      <Markdown
        value="See [license](/workspace/CodexMonitor/LICENSE)"
        className="markdown"
        workspacePath="/Users/sotiriskaniras/Documents/Development/Forks/CodexMonitor"
        onOpenFileLink={onOpenFileLink}
      />,
    );

    const link = screen.getByText("license").closest("a");
    expect(link?.getAttribute("href")).toBe("/workspace/CodexMonitor/LICENSE");

    const clickEvent = createEvent.click(link as Element, {
      bubbles: true,
      cancelable: true,
    });
    fireEvent(link as Element, clickEvent);
    expect(clickEvent.defaultPrevented).toBe(true);
    expect(onOpenFileLink).toHaveBeenCalledWith("/workspace/CodexMonitor/LICENSE");
  });

  it("intercepts mounted workspace links outside the old root allowlist", () => {
    const onOpenFileLink = vi.fn();
    render(
      <Markdown
        value="See [workflows](/workspace/.github/workflows)"
        className="markdown"
        workspacePath="/Users/sotiriskaniras/Documents/Development/Forks/CodexMonitor"
        onOpenFileLink={onOpenFileLink}
      />,
    );

    const link = screen.getByText("workflows").closest("a");
    expect(link?.getAttribute("href")).toBe("/workspace/.github/workflows");

    const clickEvent = createEvent.click(link as Element, {
      bubbles: true,
      cancelable: true,
    });
    fireEvent(link as Element, clickEvent);
    expect(clickEvent.defaultPrevented).toBe(true);
    expect(onOpenFileLink).toHaveBeenCalledWith("/workspace/.github/workflows");
  });

  it("intercepts mounted workspace directory links that resolve relative to the workspace", () => {
    const onOpenFileLink = vi.fn();
    render(
      <Markdown
        value="See [assets](/workspace/dist/assets)"
        className="markdown"
        workspacePath="/Users/sotiriskaniras/Documents/Development/Forks/CodexMonitor"
        onOpenFileLink={onOpenFileLink}
      />,
    );

    const link = screen.getByText("assets").closest("a");
    expect(link?.getAttribute("href")).toBe("/workspace/dist/assets");

    const clickEvent = createEvent.click(link as Element, {
      bubbles: true,
      cancelable: true,
    });
    fireEvent(link as Element, clickEvent);
    expect(clickEvent.defaultPrevented).toBe(true);
    expect(onOpenFileLink).toHaveBeenCalledWith("/workspace/dist/assets");
  });

  it("keeps exact workspace routes as normal markdown links", () => {
    const onOpenFileLink = vi.fn();
    render(
      <Markdown
        value="See [reviews](/workspace/reviews)"
        className="markdown"
        workspacePath="/Users/sotiriskaniras/Documents/Development/Forks/CodexMonitor"
        onOpenFileLink={onOpenFileLink}
      />,
    );

    const link = screen.getByText("reviews").closest("a");
    expect(link?.getAttribute("href")).toBe("/workspace/reviews");

    const clickEvent = createEvent.click(link as Element, {
      bubbles: true,
      cancelable: true,
    });
    fireEvent(link as Element, clickEvent);
    expect(clickEvent.defaultPrevented).toBe(true);
    expect(onOpenFileLink).not.toHaveBeenCalled();
  });

  it("keeps nested workspaces routes as normal markdown links", () => {
    const onOpenFileLink = vi.fn();
    render(
      <Markdown
        value="See [overview](/workspaces/team/reviews/overview)"
        className="markdown"
        workspacePath="/Users/sotiriskaniras/Documents/Development/Forks/CodexMonitor"
        onOpenFileLink={onOpenFileLink}
      />,
    );

    const link = screen.getByText("overview").closest("a");
    expect(link?.getAttribute("href")).toBe("/workspaces/team/reviews/overview");

    const clickEvent = createEvent.click(link as Element, {
      bubbles: true,
      cancelable: true,
    });
    fireEvent(link as Element, clickEvent);
    expect(clickEvent.defaultPrevented).toBe(true);
    expect(onOpenFileLink).not.toHaveBeenCalled();
  });

  it("still intercepts nested workspace file hrefs when a file opener is provided", () => {
    const onOpenFileLink = vi.fn();
    render(
      <Markdown
        value="See [src](/workspaces/team/CodexMonitor/src)"
        className="markdown"
        workspacePath="/Users/sotiriskaniras/Documents/Development/Forks/CodexMonitor"
        onOpenFileLink={onOpenFileLink}
      />,
    );

    const link = screen.getByText("src").closest("a");
    expect(link?.getAttribute("href")).toBe("/workspaces/team/CodexMonitor/src");

    const clickEvent = createEvent.click(link as Element, {
      bubbles: true,
      cancelable: true,
    });
    fireEvent(link as Element, clickEvent);
    expect(clickEvent.defaultPrevented).toBe(true);
    expect(onOpenFileLink).toHaveBeenCalledWith("/workspaces/team/CodexMonitor/src");
  });

  it("intercepts file hrefs that use #L line anchors", () => {
    const onOpenFileLink = vi.fn();
    render(
      <Markdown
        value="See [markdown](./docs/setup.md#L12)"
        className="markdown"
        onOpenFileLink={onOpenFileLink}
      />,
    );

    const link = screen.getByText("markdown").closest("a");
    expect(link?.getAttribute("href")).toBe("./docs/setup.md#L12");

    const clickEvent = createEvent.click(link as Element, {
      bubbles: true,
      cancelable: true,
    });
    fireEvent(link as Element, clickEvent);
    expect(clickEvent.defaultPrevented).toBe(true);
    expect(onOpenFileLink).toHaveBeenCalledWith("./docs/setup.md:12");
  });

  it("intercepts Windows absolute file hrefs with #L anchors and preserves the tooltip", () => {
    const onOpenFileLink = vi.fn();
    const onOpenFileLinkMenu = vi.fn();
    const linkedPath =
      "I:\\gpt-projects\\CodexMonitor\\src\\features\\settings\\components\\sections\\SettingsDisplaySection.tsx#L422";
    render(
      <Markdown
        value={`See [SettingsDisplaySection.tsx](${linkedPath})`}
        className="markdown"
        onOpenFileLink={onOpenFileLink}
        onOpenFileLinkMenu={onOpenFileLinkMenu}
      />,
    );

    const link = screen.getByText("SettingsDisplaySection.tsx").closest("a");
    expect(link?.getAttribute("href")).toBe(
      "I:%5Cgpt-projects%5CCodexMonitor%5Csrc%5Cfeatures%5Csettings%5Ccomponents%5Csections%5CSettingsDisplaySection.tsx#L422",
    );
    expect(link?.getAttribute("title")).toBe(
      "I:\\gpt-projects\\CodexMonitor\\src\\features\\settings\\components\\sections\\SettingsDisplaySection.tsx:422",
    );

    const clickEvent = createEvent.click(link as Element, {
      bubbles: true,
      cancelable: true,
    });
    fireEvent(link as Element, clickEvent);
    expect(clickEvent.defaultPrevented).toBe(true);
    expect(onOpenFileLink).toHaveBeenCalledWith(
      "I:\\gpt-projects\\CodexMonitor\\src\\features\\settings\\components\\sections\\SettingsDisplaySection.tsx:422",
    );

    fireEvent.contextMenu(link as Element);
    expect(onOpenFileLinkMenu).toHaveBeenCalledWith(
      expect.anything(),
      "I:\\gpt-projects\\CodexMonitor\\src\\features\\settings\\components\\sections\\SettingsDisplaySection.tsx:422",
    );
  });

  it("prevents unsupported route fragments without treating them as file links", () => {
    const onOpenFileLink = vi.fn();
    render(
      <Markdown
        value="See [profile](/workspace/settings/profile#details)"
        className="markdown"
        onOpenFileLink={onOpenFileLink}
      />,
    );

    const link = screen.getByText("profile").closest("a");
    expect(link?.getAttribute("href")).toBe("/workspace/settings/profile#details");

    const clickEvent = createEvent.click(link as Element, {
      bubbles: true,
      cancelable: true,
    });
    fireEvent(link as Element, clickEvent);
    expect(clickEvent.defaultPrevented).toBe(true);
    expect(onOpenFileLink).not.toHaveBeenCalled();
  });

  it("keeps workspace settings #L anchors as local routes", () => {
    const onOpenFileLink = vi.fn();
    render(
      <Markdown
        value="See [settings](/workspace/settings#L12)"
        className="markdown"
        workspacePath="/Users/sotiriskaniras/Documents/Development/Forks/CodexMonitor"
        onOpenFileLink={onOpenFileLink}
      />,
    );

    const link = screen.getByText("settings").closest("a");
    expect(link?.getAttribute("href")).toBe("/workspace/settings#L12");

    const clickEvent = createEvent.click(link as Element, {
      bubbles: true,
      cancelable: true,
    });
    fireEvent(link as Element, clickEvent);
    expect(clickEvent.defaultPrevented).toBe(true);
    expect(onOpenFileLink).not.toHaveBeenCalled();
  });

  it("keeps workspace reviews #L anchors as local routes", () => {
    const onOpenFileLink = vi.fn();
    render(
      <Markdown
        value="See [reviews](/workspace/reviews#L9)"
        className="markdown"
        workspacePath="/Users/sotiriskaniras/Documents/Development/Forks/CodexMonitor"
        onOpenFileLink={onOpenFileLink}
      />,
    );

    const link = screen.getByText("reviews").closest("a");
    expect(link?.getAttribute("href")).toBe("/workspace/reviews#L9");

    const clickEvent = createEvent.click(link as Element, {
      bubbles: true,
      cancelable: true,
    });
    fireEvent(link as Element, clickEvent);
    expect(clickEvent.defaultPrevented).toBe(true);
    expect(onOpenFileLink).not.toHaveBeenCalled();
  });

  it("does not linkify workspace settings #L anchors in plain text", () => {
    const { container } = render(
      <Markdown
        value="See /workspace/settings#L12 for app settings."
        className="markdown"
        workspacePath="/Users/sotiriskaniras/Documents/Development/Forks/CodexMonitor"
      />,
    );

    expect(container.querySelector(".message-file-link")).toBeNull();
    expect(container.textContent).toContain("/workspace/settings#L12");
  });

  it("does not turn workspace review #L anchors in inline code into file links", () => {
    const { container } = render(
      <Markdown
        value="Use `/workspace/reviews#L9` to reference the reviews route."
        className="markdown"
        workspacePath="/Users/sotiriskaniras/Documents/Development/Forks/CodexMonitor"
      />,
    );

    expect(container.querySelector(".message-file-link")).toBeNull();
    expect(container.querySelector("code")?.textContent).toBe("/workspace/reviews#L9");
  });

  it("does not turn natural-language slash phrases into file links", () => {
    const { container } = render(
      <Markdown
        value="Keep the current app/daemon behavior and the existing Git/Plan experience."
        className="markdown"
      />,
    );

    expect(container.querySelector(".message-file-link")).toBeNull();
    expect(container.textContent).toContain("app/daemon");
    expect(container.textContent).toContain("Git/Plan");
  });

  it("does not turn longer slash phrases into file links", () => {
    const { container } = render(
      <Markdown
        value="This keeps Spec/Verification/Evidence in the note without turning it into a file link."
        className="markdown"
      />,
    );

    expect(container.querySelector(".message-file-link")).toBeNull();
    expect(container.textContent).toContain("Spec/Verification/Evidence");
  });

  it("still turns clear file paths in plain text into file links", () => {
    const { container } = render(
      <Markdown
        value="See docs/setup.md and /Users/example/project/src/index.ts for details."
        className="markdown"
      />,
    );

    const fileLinks = [...container.querySelectorAll(".message-file-link")];
    expect(fileLinks).toHaveLength(2);
    expect(fileLinks[0]?.textContent).toContain("setup.md");
    expect(fileLinks[1]?.textContent).toContain("index.ts");
  });

  it("turns Windows absolute paths in plain text into file links", () => {
    const { container } = render(
      <Markdown
        value="Open I:\\gpt-projects\\CodexMonitor\\src\\App.tsx:12 for details."
        className="markdown"
      />,
    );

    const fileLinks = [...container.querySelectorAll(".message-file-link")];
    expect(fileLinks).toHaveLength(1);
    expect(fileLinks[0]?.textContent).toContain("App.tsx");
    expect(fileLinks[0]?.getAttribute("title")).toBe(
      "I:\\gpt-projects\\CodexMonitor\\src\\App.tsx:12",
    );
  });

  it("normalizes plain-text Windows #L anchors before opening file links", () => {
    const onOpenFileLink = vi.fn();
    const { container } = render(
      <Markdown
        value="Open I:\\gpt-projects\\CodexMonitor\\src\\App.tsx#L12 for details."
        className="markdown"
        onOpenFileLink={onOpenFileLink}
      />,
    );

    const fileLinks = [...container.querySelectorAll(".message-file-link")];
    expect(fileLinks).toHaveLength(1);
    expect(fileLinks[0]?.getAttribute("title")).toBe(
      "I:\\gpt-projects\\CodexMonitor\\src\\App.tsx:12",
    );

    const clickEvent = createEvent.click(fileLinks[0] as Element, {
      bubbles: true,
      cancelable: true,
    });
    fireEvent(fileLinks[0] as Element, clickEvent);
    expect(clickEvent.defaultPrevented).toBe(true);
    expect(onOpenFileLink).toHaveBeenCalledWith(
      "I:\\gpt-projects\\CodexMonitor\\src\\App.tsx:12",
    );
  });

  it("does not linkify Windows paths embedded inside file URLs", () => {
    const { container } = render(
      <Markdown
        value="Download file:///C:/repo/src/App.tsx instead of opening a local file link."
        className="markdown"
      />,
    );

    expect(container.querySelector(".message-file-link")).toBeNull();
    expect(container.textContent).toContain("file:///C:/repo/src/App.tsx");
  });

  it("ignores non-line file URL fragments when opening file hrefs", () => {
    const onOpenFileLink = vi.fn();
    render(
      <Markdown
        value="See [report](file:///tmp/report.md#overview)"
        className="markdown"
        onOpenFileLink={onOpenFileLink}
      />,
    );

    const link = screen.getByText("report").closest("a");
    expect(link?.getAttribute("href")).toBe("file:///tmp/report.md#overview");

    const clickEvent = createEvent.click(link as Element, {
      bubbles: true,
      cancelable: true,
    });
    fireEvent(link as Element, clickEvent);
    expect(clickEvent.defaultPrevented).toBe(true);
    expect(onOpenFileLink).toHaveBeenCalledWith("/tmp/report.md");
  });

  it("keeps line anchors when opening file URLs", () => {
    const onOpenFileLink = vi.fn();
    render(
      <Markdown
        value="See [report](file:///tmp/report.md#L12)"
        className="markdown"
        onOpenFileLink={onOpenFileLink}
      />,
    );

    const link = screen.getByText("report").closest("a");
    expect(link?.getAttribute("href")).toBe("file:///tmp/report.md#L12");

    const clickEvent = createEvent.click(link as Element, {
      bubbles: true,
      cancelable: true,
    });
    fireEvent(link as Element, clickEvent);
    expect(clickEvent.defaultPrevented).toBe(true);
    expect(onOpenFileLink).toHaveBeenCalledWith("/tmp/report.md:12");
  });

  it("preserves Windows drive paths when file URL decoding encounters an unescaped percent", () => {
    const onOpenFileLink = vi.fn();
    render(
      <Markdown
        value="See [report](file:///C:/repo/100%.tsx#L12)"
        className="markdown"
        onOpenFileLink={onOpenFileLink}
      />,
    );

    const link = screen.getByText("report").closest("a");
    expect(link?.getAttribute("href")).toBe("file:///C:/repo/100%25.tsx#L12");

    const clickEvent = createEvent.click(link as Element, {
      bubbles: true,
      cancelable: true,
    });
    fireEvent(link as Element, clickEvent);
    expect(clickEvent.defaultPrevented).toBe(true);
    expect(onOpenFileLink).toHaveBeenCalledWith("C:/repo/100%.tsx:12");
  });

  it("preserves UNC host paths when file URL decoding encounters an unescaped percent", () => {
    const onOpenFileLink = vi.fn();
    render(
      <Markdown
        value="See [report](file://server/share/100%.tsx#L12)"
        className="markdown"
        onOpenFileLink={onOpenFileLink}
      />,
    );

    const link = screen.getByText("report").closest("a");
    expect(link?.getAttribute("href")).toBe("file://server/share/100%25.tsx#L12");

    const clickEvent = createEvent.click(link as Element, {
      bubbles: true,
      cancelable: true,
    });
    fireEvent(link as Element, clickEvent);
    expect(clickEvent.defaultPrevented).toBe(true);
    expect(onOpenFileLink).toHaveBeenCalledWith("//server/share/100%.tsx:12");
  });

  it("keeps encoded #L-like filenames intact when opening file URLs", () => {
    const onOpenFileLink = vi.fn();
    render(
      <Markdown
        value="See [report](file:///tmp/report%23L12.md)"
        className="markdown"
        onOpenFileLink={onOpenFileLink}
      />,
    );

    const link = screen.getByText("report").closest("a");
    expect(link?.getAttribute("href")).toBe("file:///tmp/report%23L12.md");

    const clickEvent = createEvent.click(link as Element, {
      bubbles: true,
      cancelable: true,
    });
    fireEvent(link as Element, clickEvent);
    expect(clickEvent.defaultPrevented).toBe(true);
    expect(onOpenFileLink).toHaveBeenCalledWith("/tmp/report#L12.md");
  });

  it("still opens mounted file links when the workspace basename is settings", () => {
    const onOpenFileLink = vi.fn();
    render(
      <Markdown
        value="See [app](/workspace/settings/src/App.tsx)"
        className="markdown"
        onOpenFileLink={onOpenFileLink}
      />,
    );

    const link = screen.getByText("app").closest("a");
    expect(link?.getAttribute("href")).toBe("/workspace/settings/src/App.tsx");

    const clickEvent = createEvent.click(link as Element, {
      bubbles: true,
      cancelable: true,
    });
    fireEvent(link as Element, clickEvent);
    expect(clickEvent.defaultPrevented).toBe(true);
    expect(onOpenFileLink).toHaveBeenCalledWith("/workspace/settings/src/App.tsx");
  });

  it("linkifies mounted file paths when the nested workspace basename is reviews", () => {
    const onOpenFileLink = vi.fn();
    const { container } = render(
      <Markdown
        value="See /workspaces/team/reviews/src/App.tsx for details."
        className="markdown"
        onOpenFileLink={onOpenFileLink}
      />,
    );

    const link = container.querySelector('a[href^="codex-file:"]');
    expect(link).not.toBeNull();

    const clickEvent = createEvent.click(link as Element, {
      bubbles: true,
      cancelable: true,
    });
    fireEvent(link as Element, clickEvent);
    expect(clickEvent.defaultPrevented).toBe(true);
    expect(onOpenFileLink).toHaveBeenCalledWith("/workspaces/team/reviews/src/App.tsx");
  });
});
