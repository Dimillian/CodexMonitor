type CommandInfo = {
  tokens: string[];
  preview: string;
};

const COMMAND_KEYS = [
  "argv",
  "args",
  "command",
  "cmd",
  "exec",
  "shellCommand",
  "script",
  "proposedExecPolicyAmendment",
  "proposed_exec_policy_amendment",
];

export function getApprovalCommandInfo(
  params: Record<string, unknown>,
): CommandInfo | null {
  const tokens = extractTokens(params);
  if (!tokens || tokens.length === 0) {
    return null;
  }
  const normalized = normalizeCommandTokens(tokens);
  if (!normalized.length) {
    return null;
  }
  const preview = tokens
    .map((token) => (token.includes(" ") ? JSON.stringify(token) : token))
    .join(" ");
  return { tokens: normalized, preview };
}

function extractTokens(value: unknown): string[] | null {
  if (!value) {
    return null;
  }
  if (Array.isArray(value)) {
    if (value.every((entry) => typeof entry === "string")) {
      return value.map((entry) => entry.trim()).filter(Boolean);
    }
    return null;
  }
  if (typeof value === "string") {
    const tokens = splitCommandLine(value);
    return tokens.length ? tokens : null;
  }
  if (typeof value !== "object") {
    return null;
  }

  const objectValue = value as Record<string, unknown>;
  for (const key of COMMAND_KEYS) {
    const tokens = extractTokens(objectValue[key]);
    if (tokens?.length) {
      return tokens;
    }
  }

  for (const [key, nested] of Object.entries(objectValue)) {
    const normalized = key.toLowerCase();
    if (normalized.includes("execpolicy") || normalized.includes("exec_policy")) {
      const tokens = extractTokens(nested);
      if (tokens?.length) {
        return tokens;
      }
    }
  }

  return null;
}

function splitCommandLine(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: "\"" | "'" | null = null;
  let escaped = false;

  for (const char of input) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

export function normalizeCommandTokens(tokens: string[]): string[] {
  return tokens.map((token) => token.trim()).filter(Boolean);
}

export function matchesCommandPrefix(
  command: string[],
  allowlist: string[][],
): boolean {
  const normalized = normalizeCommandTokens(command);
  if (!normalized.length) {
    return false;
  }
  return allowlist.some((prefix) => {
    if (!prefix.length || prefix.length > normalized.length) {
      return false;
    }
    for (let i = 0; i < prefix.length; i += 1) {
      if (prefix[i] !== normalized[i]) {
        return false;
      }
    }
    return true;
  });
}
