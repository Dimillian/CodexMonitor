// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  ToastActions,
  ToastBody,
  ToastCard,
  ToastError,
  ToastHeader,
  ToastTitle,
  ToastViewport,
} from "./ToastPrimitives";

describe("ToastPrimitives", () => {
  it("renders viewport role and aria-live semantics", () => {
    render(
      <ToastViewport className="custom-toast" role="region" ariaLive="assertive">
        <div>Toast content</div>
      </ToastViewport>,
    );

    const region = screen.getByRole("region");
    expect(region.className).toContain("ds-toast-viewport");
    expect(region.className).toContain("custom-toast");
    expect(region.getAttribute("aria-live")).toBe("assertive");
  });

  it("renders card, text, and section primitive classes", () => {
    const { container } = render(
      <ToastCard className="custom-card" role="alert">
        <ToastHeader className="custom-header">
          <ToastTitle className="custom-title">Title</ToastTitle>
        </ToastHeader>
        <ToastBody className="custom-body">Body</ToastBody>
        <ToastError className="custom-error">Failure</ToastError>
        <ToastActions className="custom-actions">
          <button type="button">Action</button>
        </ToastActions>
      </ToastCard>,
    );

    const card = screen.getByRole("alert");
    expect(card.className).toContain("ds-toast-card");
    expect(card.className).toContain("custom-card");
    expect(container.querySelector(".ds-toast-header.custom-header")).not.toBeNull();
    expect(container.querySelector(".ds-toast-title.custom-title")).not.toBeNull();
    expect(container.querySelector(".ds-toast-body.custom-body")).not.toBeNull();
    expect(container.querySelector(".ds-toast-error.custom-error")).not.toBeNull();
    expect(container.querySelector(".ds-toast-actions.custom-actions")).not.toBeNull();
  });
});
