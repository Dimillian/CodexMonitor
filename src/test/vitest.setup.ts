import { vi } from "vitest";

if (!("IS_REACT_ACT_ENVIRONMENT" in globalThis)) {
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
    value: true,
    writable: true,
  });
} else {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
}

if (!("matchMedia" in globalThis)) {
  Object.defineProperty(globalThis, "matchMedia", {
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    }),
  });
}

if (!("ResizeObserver" in globalThis)) {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, "ResizeObserver", { value: ResizeObserverMock });
}

if (!("IntersectionObserver" in globalThis)) {
  class IntersectionObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  Object.defineProperty(globalThis, "IntersectionObserver", {
    value: IntersectionObserverMock,
  });
}

if (!("requestAnimationFrame" in globalThis)) {
  Object.defineProperty(globalThis, "requestAnimationFrame", {
    value: (callback: FrameRequestCallback) =>
      setTimeout(() => callback(Date.now()), 0),
  });
  Object.defineProperty(globalThis, "cancelAnimationFrame", {
    value: (id: number) => clearTimeout(id),
  });
}

if (!("localStorage" in globalThis)) {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => (store.has(key) ? store.get(key) ?? null : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(globalThis, "localStorage", { value: localStorage });
}
