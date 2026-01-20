export type ShortcutDefinition = {
  key: string;
  meta: boolean;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
};

const MODIFIER_ORDER = ["cmd", "ctrl", "alt", "shift"] as const;
const MODIFIER_LABELS: Record<string, string> = {
  cmd: "⌘",
  ctrl: "⌃",
  alt: "⌥",
  shift: "⇧",
};

const KEY_LABELS: Record<string, string> = {
  " ": "Space",
  space: "Space",
  escape: "Esc",
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
};

const MODIFIER_KEYS = new Set(["shift", "control", "alt", "meta"]);

function normalizeKey(key: string) {
  const normalized = key.toLowerCase();
  if (MODIFIER_KEYS.has(normalized)) {
    return null;
  }
  if (normalized === " ") {
    return "space";
  }
  return normalized;
}

export function parseShortcut(value: string | null | undefined): ShortcutDefinition | null {
  if (!value) {
    return null;
  }
  const parts = value
    .split("+")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  if (parts.length === 0) {
    return null;
  }
  const key = parts[parts.length - 1] ?? "";
  if (!key || MODIFIER_KEYS.has(key)) {
    return null;
  }
  return {
    key,
    meta: parts.includes("cmd") || parts.includes("meta"),
    ctrl: parts.includes("ctrl") || parts.includes("control"),
    alt: parts.includes("alt") || parts.includes("option"),
    shift: parts.includes("shift"),
  };
}

export function formatShortcut(value: string | null | undefined): string {
  if (!value) {
    return "Not set";
  }
  const parsed = parseShortcut(value);
  if (!parsed) {
    return value;
  }
  const modifiers = MODIFIER_ORDER.flatMap((modifier) => {
    if (modifier === "cmd" && parsed.meta) {
      return MODIFIER_LABELS.cmd;
    }
    if (modifier === "ctrl" && parsed.ctrl) {
      return MODIFIER_LABELS.ctrl;
    }
    if (modifier === "alt" && parsed.alt) {
      return MODIFIER_LABELS.alt;
    }
    if (modifier === "shift" && parsed.shift) {
      return MODIFIER_LABELS.shift;
    }
    return [];
  });
  const keyLabel =
    KEY_LABELS[parsed.key] ??
    (parsed.key.length === 1 ? parsed.key.toUpperCase() : parsed.key);
  return [...modifiers, keyLabel].join("");
}

export function buildShortcutValue(event: KeyboardEvent): string | null {
  const key = normalizeKey(event.key);
  if (!key) {
    return null;
  }
  const hasPrimaryModifier = event.metaKey || event.ctrlKey || event.altKey;
  if (!hasPrimaryModifier) {
    return null;
  }
  const modifiers = [];
  if (event.metaKey) {
    modifiers.push("cmd");
  }
  if (event.ctrlKey) {
    modifiers.push("ctrl");
  }
  if (event.altKey) {
    modifiers.push("alt");
  }
  if (event.shiftKey) {
    modifiers.push("shift");
  }
  return [...modifiers, key].join("+");
}

export function matchesShortcut(event: KeyboardEvent, value: string | null | undefined): boolean {
  const parsed = parseShortcut(value);
  if (!parsed) {
    return false;
  }
  const key = normalizeKey(event.key);
  if (!key || key !== parsed.key) {
    return false;
  }
  return (
    parsed.meta === event.metaKey &&
    parsed.ctrl === event.ctrlKey &&
    parsed.alt === event.altKey &&
    parsed.shift === event.shiftKey
  );
}
