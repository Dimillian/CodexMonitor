import type { AppMention } from "../../../types";

export type AppMentionBinding = {
  slug: string;
  mention: AppMention;
};

const MENTION_NAME_CHAR = /[A-Za-z0-9_-]/;

export function connectorMentionSlug(name: string): string {
  let normalized = "";
  for (const character of name) {
    if (/[A-Za-z0-9]/.test(character)) {
      normalized += character.toLowerCase();
    } else {
      normalized += "-";
    }
  }
  const trimmed = normalized.replace(/^-+|-+$/g, "");
  return trimmed || "app";
}

export function collectMentionNames(text: string): Set<string> {
  const names = new Set<string>();
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== "$") {
      continue;
    }
    const prev = index > 0 ? text[index - 1] : "";
    if (prev && MENTION_NAME_CHAR.test(prev)) {
      continue;
    }
    let end = index + 1;
    while (end < text.length && MENTION_NAME_CHAR.test(text[end])) {
      end += 1;
    }
    if (end === index + 1) {
      continue;
    }
    names.add(text.slice(index + 1, end).toLowerCase());
    index = end - 1;
  }
  return names;
}

export function resolveBoundAppMentions(
  text: string,
  bindings: AppMentionBinding[],
): AppMention[] {
  if (!text || bindings.length === 0) {
    return [];
  }
  const names = collectMentionNames(text);
  if (names.size === 0) {
    return [];
  }

  const seenPaths = new Set<string>();
  const mentions: AppMention[] = [];
  for (const binding of bindings) {
    if (!names.has(binding.slug)) {
      continue;
    }
    if (seenPaths.has(binding.mention.path)) {
      continue;
    }
    seenPaths.add(binding.mention.path);
    mentions.push(binding.mention);
  }
  return mentions;
}
