#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const configPath = resolve(process.cwd(), "codex-parity.config.json");

function runGit(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function normalizeList(value, label) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`Invalid ${label}; expected string[]`);
  }
  return value;
}

function isAllowedPath(path, allowList) {
  return allowList.some((allowedPath) => {
    if (path === allowedPath) {
      return true;
    }
    const prefix = allowedPath.endsWith("/") ? allowedPath : `${allowedPath}/`;
    return path.startsWith(prefix);
  });
}

function main() {
  const rawConfig = readFileSync(configPath, "utf8");
  const config = JSON.parse(rawConfig);
  const upstreamRepo = config.upstreamRepo;
  const upstreamRef = config.upstreamRef;
  const pathSpecs = normalizeList(config.pathSpecs, "pathSpecs");
  const allowDiffPaths = normalizeList(config.allowDiffPaths ?? [], "allowDiffPaths");

  if (typeof upstreamRepo !== "string" || upstreamRepo.length === 0) {
    throw new Error("Invalid upstreamRepo; expected non-empty string");
  }
  if (typeof upstreamRef !== "string" || upstreamRef.length === 0) {
    throw new Error("Invalid upstreamRef; expected non-empty string");
  }
  if (pathSpecs.length === 0) {
    throw new Error("Invalid pathSpecs; expected at least one path");
  }

  runGit(["fetch", "--depth", "1", upstreamRepo, upstreamRef]);
  const diffArgs = ["diff", "--name-only", "FETCH_HEAD", "HEAD", "--", ...pathSpecs];
  const changed = runGit(diffArgs)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const disallowed = changed.filter((path) => !isAllowedPath(path, allowDiffPaths));

  if (disallowed.length > 0) {
    console.error("Codex upstream parity check failed.");
    console.error("The following tracked paths differ from upstream:");
    for (const path of disallowed) {
      console.error(`- ${path}`);
    }
    process.exit(1);
  }

  console.log("Codex upstream parity check passed.");
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Codex upstream parity check error: ${message}`);
  process.exit(1);
}
