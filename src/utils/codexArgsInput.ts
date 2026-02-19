const SMART_DOUBLE_QUOTES_PATTERN = /[\u201C\u201D\u201E\u201F]/g;
const SMART_SINGLE_QUOTES_PATTERN = /[\u2018\u2019\u201A\u201B]/g;
const DASH_LIKE_PATTERN = /[\u2010-\u2015\u2212]/g;
const DASH_LIKE_TOKEN_PREFIX_PATTERN = /(^|\s)[\u2010-\u2015\u2212]([^\s]+)/g;
const NBSP_PATTERN = /[\u00A0\u2007\u202F]/g;

function stripWrappingQuotes(value: string): string {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

export function normalizeCodexArgsInput(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw) {
    return null;
  }

  let normalized = raw
    .replace(NBSP_PATTERN, " ")
    .replace(SMART_DOUBLE_QUOTES_PATTERN, "\"")
    .replace(SMART_SINGLE_QUOTES_PATTERN, "'")
    .trim();

  normalized = stripWrappingQuotes(normalized).trim();

  normalized = normalized.replace(
    DASH_LIKE_TOKEN_PREFIX_PATTERN,
    (_match, prefix: string, token: string) => {
      const equalsIndex = token.indexOf("=");
      const flagToken = equalsIndex >= 0 ? token.slice(0, equalsIndex) : token;
      const suffix = equalsIndex >= 0 ? token.slice(equalsIndex) : "";

      if (/^[A-Za-z][A-Za-z0-9-]*$/.test(flagToken)) {
        return `${prefix}${flagToken.length === 1 ? "-" : "--"}${flagToken}${suffix}`;
      }
      return `${prefix}-${token}`;
    },
  );

  normalized = normalized.replace(DASH_LIKE_PATTERN, "-").trim();

  return normalized.length > 0 ? normalized : null;
}
