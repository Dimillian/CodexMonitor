import { vi } from "vitest";
import enTranslations from "../i18n/locales/en/translation.json";

// 设置默认语言为英文
Object.defineProperty(globalThis, "navigator", {
  value: {
    language: "en-US",
    languages: ["en-US", "en"],
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  },
  writable: true,
});

// 设置环境变量模拟
process.env.LC_ALL = "en_US.UTF-8";
process.env.LANG = "en_US.UTF-8";

// 简单的翻译函数 - 从嵌套对象中获取值
function getTranslation(obj: Record<string, any>, key: string, options?: Record<string, any>): string {
  const keys = key.split(".");
  let result = obj;
  for (const k of keys) {
    if (result && typeof result === "object" && k in result) {
      result = result[k];
    } else {
      return key;
    }
  }
  let translation = typeof result === "string" ? result : key;

  if (options && typeof translation === "string") {
    translation = translation.replace(/\{\{(\w+)\}\}/g, (match, variable) => {
      return options[variable] !== undefined ? String(options[variable]) : match;
    });
  }

  return translation;
}

// Mock i18next 以避免初始化问题
vi.mock("react-i18next", async () => {
  const actual = await vi.importActual("react-i18next");
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, options?: Record<string, any>) => getTranslation(enTranslations, key, options),
      i18n: {
        language: "en",
        changeLanguage: vi.fn(),
      },
    }),
  };
});

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

const hasLocalStorage = "localStorage" in globalThis;
const existingLocalStorage = hasLocalStorage
  ? (globalThis as { localStorage?: Storage }).localStorage
  : null;

if (!existingLocalStorage || typeof existingLocalStorage.clear !== "function") {
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
  Object.defineProperty(globalThis, "localStorage", {
    value: localStorage,
    writable: true,
    configurable: true,
  });
}
