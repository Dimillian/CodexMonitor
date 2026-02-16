// @vitest-environment jsdom
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ModalShell } from "./ModalShell";

describe("ModalShell", () => {
  it("renders root and card classes and handles backdrop click", () => {
    const onBackdropClick = vi.fn();
    const { container } = render(
      <ModalShell
        className="custom-modal"
        cardClassName="custom-card"
        onBackdropClick={onBackdropClick}
        ariaLabel="My dialog"
      >
        <div>Modal content</div>
      </ModalShell>,
    );

    const modal = container.querySelector(".ds-modal.custom-modal");
    const card = container.querySelector(".ds-modal-card.custom-card");
    const backdrop = container.querySelector(".ds-modal-backdrop");
    expect(modal).not.toBeNull();
    expect(card).not.toBeNull();
    expect(backdrop).not.toBeNull();
    if (!backdrop) {
      throw new Error("Expected modal backdrop");
    }
    expect(modal?.getAttribute("aria-label")).toBe("My dialog");
    fireEvent.click(backdrop);
    expect(onBackdropClick).toHaveBeenCalledTimes(1);
  });

  it("supports aria-labelledby and aria-describedby", () => {
    const { container } = render(
      <ModalShell ariaLabelledBy="dialog-title" ariaDescribedBy="dialog-description">
        <h2 id="dialog-title">Dialog title</h2>
        <p id="dialog-description">Dialog description</p>
      </ModalShell>,
    );

    const modal = container.querySelector(".ds-modal");
    expect(modal?.getAttribute("aria-labelledby")).toBe("dialog-title");
    expect(modal?.getAttribute("aria-describedby")).toBe("dialog-description");
  });
});
