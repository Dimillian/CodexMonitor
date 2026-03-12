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

  it("keeps generic workspace routes as normal markdown links", () => {
    const onOpenFileLink = vi.fn();
    render(
      <Markdown
        value="See [overview](/workspace/reviews/overview)"
        className="markdown"
        workspacePath="/Users/sotiriskaniras/Documents/Development/Forks/CodexMonitor"
        onOpenFileLink={onOpenFileLink}
      />,
    );

    const link = screen.getByText("overview").closest("a");
    expect(link?.getAttribute("href")).toBe("/workspace/reviews/overview");

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
});
