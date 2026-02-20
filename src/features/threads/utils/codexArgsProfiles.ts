import { normalizeCodexArgsInput } from "@/utils/codexArgsInput";

export type CodexArgsRecognizedSegment = {
  flag: string;
  canonicalFlag: string;
  value: string | null;
  label: string;
};

export type CodexArgsIgnoredFlag = {
  flag: string;
  canonicalFlag: string;
  value: string | null;
};

export type ParsedCodexArgsProfile = {
  originalArgs: string;
  recognizedSegments: CodexArgsRecognizedSegment[];
  ignoredFlags: CodexArgsIgnoredFlag[];
  effectiveArgs: string | null;
};

export type CodexArgsIgnoredFlagsMetadata = {
  hasIgnoredFlags: boolean;
  ignoredFlags: CodexArgsIgnoredFlag[];
  ignoredCanonicalFlags: string[];
};

export type CodexArgsOption = {
  value: string; // empty string means default
  codexArgs: string | null;
  label: string;
  effectiveCodexArgs?: string | null;
  recognizedSegments?: CodexArgsRecognizedSegment[];
  ignoredFlags?: CodexArgsIgnoredFlag[];
  hasIgnoredFlags?: boolean;
};

type FlagCategory = "recognized" | "ignored";
type ValueMode = "none" | "required" | "optional";

type FlagSpec = {
  canonicalFlag: string;
  category: FlagCategory;
  valueMode: ValueMode;
};

const FLAG_SPECS: Record<string, FlagSpec> = {};

function registerFlags(
  aliases: string[],
  spec: { canonicalFlag: string; category: FlagCategory; valueMode: ValueMode },
): void {
  for (const alias of aliases) {
    FLAG_SPECS[alias] = spec;
  }
}

registerFlags(["-c", "--config"], {
  canonicalFlag: "--config",
  category: "recognized",
  valueMode: "required",
});
registerFlags(["--enable"], {
  canonicalFlag: "--enable",
  category: "recognized",
  valueMode: "required",
});
registerFlags(["--disable"], {
  canonicalFlag: "--disable",
  category: "recognized",
  valueMode: "required",
});
registerFlags(["--auth-file"], {
  canonicalFlag: "--auth-file",
  category: "recognized",
  valueMode: "required",
});
registerFlags(["-i", "--image"], {
  canonicalFlag: "--image",
  category: "recognized",
  valueMode: "required",
});
registerFlags(["-p", "--profile"], {
  canonicalFlag: "--profile",
  category: "recognized",
  valueMode: "required",
});
registerFlags(["-C", "--cd"], {
  canonicalFlag: "--cd",
  category: "recognized",
  valueMode: "required",
});
registerFlags(["--search"], {
  canonicalFlag: "--search",
  category: "recognized",
  valueMode: "optional",
});
registerFlags(["--add-dir"], {
  canonicalFlag: "--add-dir",
  category: "recognized",
  valueMode: "required",
});

registerFlags(["-m", "--model"], {
  canonicalFlag: "--model",
  category: "ignored",
  valueMode: "required",
});
registerFlags(["-a", "--ask-for-approval"], {
  canonicalFlag: "--ask-for-approval",
  category: "ignored",
  valueMode: "required",
});
registerFlags(["-s", "--sandbox"], {
  canonicalFlag: "--sandbox",
  category: "ignored",
  valueMode: "required",
});
registerFlags(["--full-auto"], {
  canonicalFlag: "--full-auto",
  category: "ignored",
  valueMode: "none",
});
registerFlags(["--dangerously-bypass-approvals-and-sandbox"], {
  canonicalFlag: "--dangerously-bypass-approvals-and-sandbox",
  category: "ignored",
  valueMode: "none",
});
registerFlags(["--oss"], {
  canonicalFlag: "--oss",
  category: "ignored",
  valueMode: "none",
});
registerFlags(["--local-provider"], {
  canonicalFlag: "--local-provider",
  category: "ignored",
  valueMode: "required",
});
registerFlags(["--no-alt-screen"], {
  canonicalFlag: "--no-alt-screen",
  category: "ignored",
  valueMode: "none",
});

const FALLBACK_LABEL_MAX = 22;

function normalizeCodexArgs(value: string | null | undefined): string | null {
  return normalizeCodexArgsInput(value);
}

function stripWrappingQuotes(value: string): string {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function getTrailingPath(path: string, segments: number): string {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length === 0) {
    return path;
  }
  return parts.slice(-segments).join("/");
}

function formatLabelValue(value: string): string {
  const normalized = stripWrappingQuotes(value).trim();
  if (!normalized) {
    return normalized;
  }

  if (normalized.includes("://")) {
    if (normalized.length <= FALLBACK_LABEL_MAX) {
      return normalized;
    }
    return `${normalized.slice(0, FALLBACK_LABEL_MAX - 3)}…`;
  }

  if (normalized.includes("/") || normalized.includes("\\")) {
    return getTrailingPath(normalized, 2);
  }

  if (normalized.length <= FALLBACK_LABEL_MAX) {
    return normalized;
  }
  return `${normalized.slice(0, FALLBACK_LABEL_MAX - 3)}…`;
}

function fallbackLabel(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  if (trimmed.length <= FALLBACK_LABEL_MAX) {
    return trimmed;
  }
  return `${trimmed.slice(0, FALLBACK_LABEL_MAX - 3)}…`;
}

function isFlagToken(token: string): boolean {
  return token.startsWith("-") && token.length > 1;
}

function splitFlagToken(token: string): { flag: string; inlineValue: string | null } {
  if (!token.startsWith("-")) {
    return { flag: token, inlineValue: null };
  }

  const equalsIndex = token.indexOf("=");
  if (equalsIndex <= 1) {
    return { flag: token, inlineValue: null };
  }

  return {
    flag: token.slice(0, equalsIndex),
    inlineValue: token.slice(equalsIndex + 1),
  };
}

function quoteTokenIfNeeded(token: string): string {
  if (token.length === 0) {
    return '""';
  }

  if (/^[A-Za-z0-9_./:@%+,=~-]+$/.test(token)) {
    return token;
  }

  const escaped = token.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
  return `"${escaped}"`;
}

function joinTokens(tokens: string[]): string | null {
  if (tokens.length === 0) {
    return null;
  }

  const joined = tokens.map((token) => quoteTokenIfNeeded(token)).join(" ").trim();
  return joined.length > 0 ? joined : null;
}

function tokenizeArgs(rawArgs: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  for (let index = 0; index < rawArgs.length; index += 1) {
    const char = rawArgs[index] ?? "";

    if (quote) {
      if (char === "\\") {
        const nextChar = rawArgs[index + 1] ?? "";
        if (nextChar === quote || nextChar === "\\") {
          current += nextChar;
          index += 1;
          continue;
        }
        current += char;
        continue;
      }
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}

function readFlagValue(
  spec: FlagSpec,
  inlineValue: string | null,
  nextToken: string | undefined,
): { value: string | null; consumeNext: boolean; isValid: boolean } {
  if (spec.valueMode === "none") {
    return { value: null, consumeNext: false, isValid: true };
  }

  if (inlineValue != null) {
    const normalized = inlineValue.trim();
    const hasValue = normalized.length > 0;
    if (!hasValue && spec.valueMode === "required") {
      return { value: null, consumeNext: false, isValid: false };
    }
    return {
      value: hasValue ? normalized : null,
      consumeNext: false,
      isValid: spec.valueMode === "optional" || hasValue,
    };
  }

  if (
    typeof nextToken === "string" &&
    nextToken.trim().length > 0 &&
    !nextToken.trim().startsWith("-")
  ) {
    return { value: nextToken.trim(), consumeNext: true, isValid: true };
  }

  if (spec.valueMode === "optional") {
    return { value: null, consumeNext: false, isValid: true };
  }

  return { value: null, consumeNext: false, isValid: false };
}

function canonicalFlagLabel(canonicalFlag: string): string {
  return canonicalFlag.replace(/^--/, "");
}

function makeRecognizedLabel(canonicalFlag: string, value: string | null): string {
  const label = canonicalFlagLabel(canonicalFlag);
  if (!value) {
    return label;
  }
  return `${label}:${formatLabelValue(value)}`;
}

export function parseCodexArgsProfile(args: string | null | undefined): ParsedCodexArgsProfile {
  const originalArgs = normalizeCodexArgsInput(args) ?? "";
  if (!originalArgs) {
    return {
      originalArgs: "",
      recognizedSegments: [],
      ignoredFlags: [],
      effectiveArgs: null,
    };
  }

  const tokens = tokenizeArgs(originalArgs);
  const recognizedSegments: CodexArgsRecognizedSegment[] = [];
  const ignoredFlags: CodexArgsIgnoredFlag[] = [];
  const effectiveTokens: string[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index] ?? "";
    if (!token) {
      continue;
    }

    if (!isFlagToken(token)) {
      effectiveTokens.push(token);
      continue;
    }

    const { flag, inlineValue } = splitFlagToken(token);
    const spec = FLAG_SPECS[flag];

    if (!spec) {
      effectiveTokens.push(token);
      continue;
    }

    const { value, consumeNext, isValid } = readFlagValue(spec, inlineValue, tokens[index + 1]);

    if (consumeNext) {
      index += 1;
    }

    if (spec.category === "ignored") {
      ignoredFlags.push({
        flag,
        canonicalFlag: spec.canonicalFlag,
        value,
      });
      continue;
    }

    if (!isValid) {
      continue;
    }

    recognizedSegments.push({
      flag,
      canonicalFlag: spec.canonicalFlag,
      value,
      label: makeRecognizedLabel(spec.canonicalFlag, value),
    });

    if (spec.valueMode === "none") {
      effectiveTokens.push(flag);
      continue;
    }

    if (inlineValue != null) {
      if (value != null) {
        if (/\s/.test(value)) {
          effectiveTokens.push(flag);
          effectiveTokens.push(value);
        } else {
          effectiveTokens.push(`${flag}=${value}`);
        }
      } else {
        effectiveTokens.push(flag);
      }
      continue;
    }

    effectiveTokens.push(flag);
    if (value != null) {
      effectiveTokens.push(value);
    }
  }

  return {
    originalArgs,
    recognizedSegments,
    ignoredFlags,
    effectiveArgs: joinTokens(effectiveTokens),
  };
}

export function sanitizeRuntimeCodexArgs(args: string | null | undefined): string | null {
  return parseCodexArgsProfile(args).effectiveArgs;
}

export function getIgnoredCodexArgsFlagsMetadata(
  argsOrParsed: string | ParsedCodexArgsProfile | null | undefined,
): CodexArgsIgnoredFlagsMetadata {
  const parsed =
    typeof argsOrParsed === "string" || argsOrParsed == null
      ? parseCodexArgsProfile(argsOrParsed)
      : argsOrParsed;

  const ignoredCanonicalFlags = Array.from(
    new Set(parsed.ignoredFlags.map((flag) => flag.canonicalFlag)),
  );

  return {
    hasIgnoredFlags: parsed.ignoredFlags.length > 0,
    ignoredFlags: parsed.ignoredFlags,
    ignoredCanonicalFlags,
  };
}

function fallbackLabelFromParsed(parsed: ParsedCodexArgsProfile): string {
  return fallbackLabel(parsed.effectiveArgs ?? parsed.originalArgs);
}

function buildOptionLabelFromParsed(parsed: ParsedCodexArgsProfile): string {
  if (parsed.recognizedSegments.length > 0) {
    const firstTwo = parsed.recognizedSegments.slice(0, 2).map((segment) => segment.label);
    const extraCount = parsed.recognizedSegments.length - firstTwo.length;
    return `${firstTwo.join(" • ")}${extraCount > 0 ? ` +${extraCount}` : ""}`;
  }

  return fallbackLabelFromParsed(parsed);
}

export function buildCodexArgsOptionLabel(args: string): string {
  return buildOptionLabelFromParsed(parseCodexArgsProfile(args));
}

export function buildCodexArgsBadgeLabel(args: string): string {
  const parsed = parseCodexArgsProfile(args);
  const firstRecognized = parsed.recognizedSegments[0];
  if (firstRecognized) {
    return firstRecognized.label;
  }

  return fallbackLabelFromParsed(parsed);
}

export function labelForCodexArgs(args: string): string {
  return buildCodexArgsBadgeLabel(args);
}

export function buildEffectiveCodexArgsBadgeLabel(
  args: string | null | undefined,
): string | null {
  const sanitizedArgs = sanitizeRuntimeCodexArgs(args);
  if (!sanitizedArgs) {
    return null;
  }
  const label = buildCodexArgsBadgeLabel(sanitizedArgs).trim();
  return label.length > 0 ? label : null;
}

export function buildCodexArgsOptions(input: {
  appCodexArgs: string | null;
  workspaceCodexArgs: Array<string | null | undefined>;
  additionalCodexArgs?: Array<string | null | undefined>;
}): CodexArgsOption[] {
  const seen = new Set<string>();
  const options: CodexArgsOption[] = [
    { value: "", codexArgs: null, label: "Default" },
  ];

  const candidates = [
    normalizeCodexArgs(input.appCodexArgs),
    ...input.workspaceCodexArgs.map(normalizeCodexArgs),
    ...(input.additionalCodexArgs ?? []).map(normalizeCodexArgs),
  ].filter((value): value is string => typeof value === "string" && value.length > 0);

  for (const args of candidates) {
    if (seen.has(args)) {
      continue;
    }

    seen.add(args);
    const parsed = parseCodexArgsProfile(args);

    options.push({
      value: args,
      codexArgs: args,
      label: buildOptionLabelFromParsed(parsed),
    });
  }

  // Stable ordering: Default first, then label asc, then args asc.
  const [defaultOption, ...rest] = options;
  rest.sort((a, b) => a.label.localeCompare(b.label) || a.value.localeCompare(b.value));
  return [defaultOption, ...rest];
}
