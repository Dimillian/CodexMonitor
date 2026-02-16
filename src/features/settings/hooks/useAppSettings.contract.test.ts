// @vitest-environment node

import { describe, expect, it } from "vitest";

declare const require: (id: string) => any;
declare const process: { cwd: () => string };

const { readFileSync } = require("fs");
const { resolve } = require("path");

function extractBlockBody(source: string, marker: string): string {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) {
    throw new Error(`Marker not found: ${marker}`);
  }
  const openBraceIndex = source.indexOf("{", markerIndex);
  if (openBraceIndex < 0) {
    throw new Error(`Missing opening brace for marker: ${marker}`);
  }

  let depth = 0;
  for (let index = openBraceIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(openBraceIndex + 1, index);
      }
    }
  }
  throw new Error(`Missing closing brace for marker: ${marker}`);
}

function snakeToCamel(input: string): string {
  return input.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
}

function extractTsAppSettingsKeys(source: string): Set<string> {
  const body = extractBlockBody(source, "export type AppSettings =");
  const matches = body.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\??\s*:/gm);
  const keys = new Set<string>();
  for (const match of matches) {
    keys.add(match[1]);
  }
  return keys;
}

function extractRustAppSettingsKeys(source: string): Set<string> {
  const body = extractBlockBody(source, "pub(crate) struct AppSettings");
  const keys = new Set<string>();
  let pendingRename: string | null = null;

  for (const line of body.split("\n")) {
    const renameMatch = line.match(/rename\s*=\s*"([^"]+)"/);
    if (renameMatch) {
      pendingRename = renameMatch[1];
    }
    const fieldMatch = line.match(/pub\(crate\)\s+([A-Za-z_][A-Za-z0-9_]*)\s*:/);
    if (!fieldMatch) {
      continue;
    }

    const fieldName = fieldMatch[1];
    keys.add(pendingRename ?? snakeToCamel(fieldName));
    pendingRename = null;
  }

  return keys;
}

describe("AppSettings contract", () => {
  it("keeps Rust and TypeScript AppSettings keys aligned", () => {
    const tsSource = readFileSync(resolve(process.cwd(), "src/types.ts"), "utf8");
    const rustSource = readFileSync(
      resolve(process.cwd(), "src-tauri/src/types.rs"),
      "utf8",
    );

    const tsKeys = extractTsAppSettingsKeys(tsSource);
    const rustKeys = extractRustAppSettingsKeys(rustSource);

    const missingInTs = [...rustKeys].filter((key) => !tsKeys.has(key)).sort();
    const missingInRust = [...tsKeys].filter((key) => !rustKeys.has(key)).sort();

    expect(missingInTs, `Missing in src/types.ts: ${missingInTs.join(", ")}`).toEqual([]);
    expect(
      missingInRust,
      `Missing in src-tauri/src/types.rs: ${missingInRust.join(", ")}`,
    ).toEqual([]);
  });
});
