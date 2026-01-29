/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FilePreviewPopover } from "./FilePreviewPopover";

vi.mock("../../app/components/OpenAppMenu", () => ({
  OpenAppMenu: () => <div data-testid="open-app-menu" />,
}));

afterEach(() => {
  cleanup();
});

describe("FilePreviewPopover", () => {
  it("renders selection hints for text previews", () => {
    render(
      <FilePreviewPopover
        path="src/example.ts"
        absolutePath="/workspace/src/example.ts"
        content={"one\ntwo"}
        truncated={false}
        previewKind="text"
        imageSrc={null}
        openTargets={[]}
        openAppIconById={{}}
        selectedOpenAppId=""
        onSelectOpenAppId={vi.fn()}
        selection={{ start: 0, end: 0 }}
        onSelectLine={vi.fn()}
        onClearSelection={vi.fn()}
        onAddSelection={vi.fn()}
        onClose={vi.fn()}
        selectionHints={["Shift + click or drag + click", "for multi-line selection"]}
      />,
    );

    expect(screen.getByText("Shift + click or drag + click")).toBeTruthy();
    expect(screen.getByText("for multi-line selection")).toBeTruthy();
  });

  it("wires drag selection mouse events to line handlers", () => {
    const onSelectLine = vi.fn();
    const onLineMouseDown = vi.fn();
    const onLineMouseEnter = vi.fn();
    const onLineMouseUp = vi.fn();

    render(
      <FilePreviewPopover
        path="src/example.ts"
        absolutePath="/workspace/src/example.ts"
        content={"one\ntwo"}
        truncated={false}
        previewKind="text"
        imageSrc={null}
        openTargets={[]}
        openAppIconById={{}}
        selectedOpenAppId=""
        onSelectOpenAppId={vi.fn()}
        selection={{ start: 0, end: 0 }}
        onSelectLine={onSelectLine}
        onLineMouseDown={onLineMouseDown}
        onLineMouseEnter={onLineMouseEnter}
        onLineMouseUp={onLineMouseUp}
        onClearSelection={vi.fn()}
        onAddSelection={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const firstLine = screen.getByText("one").closest("button");
    const secondLine = screen.getByText("two").closest("button");
    expect(firstLine).not.toBeNull();
    expect(secondLine).not.toBeNull();

    fireEvent.mouseDown(firstLine as HTMLButtonElement);
    fireEvent.mouseEnter(secondLine as HTMLButtonElement);
    fireEvent.mouseUp(secondLine as HTMLButtonElement);
    fireEvent.click(secondLine as HTMLButtonElement);

    expect(onLineMouseDown).toHaveBeenCalledWith(0, expect.any(Object));
    expect(onLineMouseEnter).toHaveBeenCalledWith(1, expect.any(Object));
    expect(onLineMouseUp).toHaveBeenCalledWith(1, expect.any(Object));
    expect(onSelectLine).toHaveBeenCalledWith(1, expect.any(Object));
  });
});
