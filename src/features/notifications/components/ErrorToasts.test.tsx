// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ErrorToasts } from "./ErrorToasts";

describe("ErrorToasts", () => {
  it("renders assertive live region and dismisses items", () => {
    const onDismiss = vi.fn();
    render(
      <ErrorToasts
        toasts={[
          { id: "toast-1", title: "Error title", message: "Something failed" },
        ]}
        onDismiss={onDismiss}
      />,
    );

    const region = screen.getByRole("region");
    expect(region.getAttribute("aria-live")).toBe("assertive");
    expect(screen.getByRole("alert")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Close error" }));
    expect(onDismiss).toHaveBeenCalledWith("toast-1");
  });
});
