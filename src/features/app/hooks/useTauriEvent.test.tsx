// @vitest-environment jsdom
import { act } from "react";
import type { ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { useTauriEvent } from "./useTauriEvent";

type Subscribe = (handler: (payload: string) => void) => () => void;

function Harness({
  subscribe,
  handler,
  enabled,
}: {
  subscribe: Subscribe;
  handler: (payload: string) => void;
  enabled?: boolean;
}) {
  useTauriEvent(subscribe, handler, { enabled });
  return null;
}

async function mountHarness(props: ComponentProps<typeof Harness>) {
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => {
    root.render(<Harness {...props} />);
  });
  return { root };
}

describe("useTauriEvent", () => {
  it("subscribes once and routes to the latest handler", async () => {
    let emit: (payload: string) => void = () => {};
    const unlisten = vi.fn();
    const subscribe = vi.fn((handler: (payload: string) => void) => {
      emit = handler;
      return unlisten;
    });
    const handlerA = vi.fn();
    const handlerB = vi.fn();

    const { root } = await mountHarness({ subscribe, handler: handlerA });

    act(() => {
      emit("first");
    });
    expect(handlerA).toHaveBeenCalledWith("first");

    await act(async () => {
      root.render(<Harness subscribe={subscribe} handler={handlerB} />);
    });
    expect(subscribe).toHaveBeenCalledTimes(1);

    act(() => {
      emit("second");
    });
    expect(handlerB).toHaveBeenCalledWith("second");
    expect(handlerA).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.unmount();
    });
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("waits until enabled before subscribing", async () => {
    const unlisten = vi.fn();
    const subscribe = vi.fn(() => unlisten);
    const handler = vi.fn();

    const { root } = await mountHarness({
      subscribe,
      handler,
      enabled: false,
    });
    expect(subscribe).not.toHaveBeenCalled();

    await act(async () => {
      root.render(<Harness subscribe={subscribe} handler={handler} enabled />);
    });
    expect(subscribe).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.unmount();
    });
    expect(unlisten).toHaveBeenCalledTimes(1);
  });
});
