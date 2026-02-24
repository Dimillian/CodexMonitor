#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const srcTauriDir = join(repoRoot, "src-tauri");
const binariesDir = join(srcTauriDir, "binaries");

const explicitTarget = Boolean(process.env.TARGET || process.env.CARGO_BUILD_TARGET);
let buildTarget = process.env.TARGET || process.env.CARGO_BUILD_TARGET || "";

if (!buildTarget) {
  const rustcVersion = run("rustc", ["-vV"], { captureOutput: true });
  const hostLine = rustcVersion.stdout
    .split(/\r?\n/)
    .find((line) => line.startsWith("host: "));
  if (!hostLine) {
    console.error("Failed to resolve Rust target triple");
    process.exit(1);
  }
  buildTarget = hostLine.replace("host: ", "").trim();
}

if (!buildTarget) {
  console.error("Failed to resolve Rust target triple");
  process.exit(1);
}

const isWindowsTarget = buildTarget.includes("windows");
const binExt = isWindowsTarget ? ".exe" : "";
const releaseDir = explicitTarget
  ? join(srcTauriDir, "target", buildTarget, "release")
  : join(srcTauriDir, "target", "release");

mkdirSync(binariesDir, { recursive: true });

const daemonSidecarPath = join(
  binariesDir,
  `codex_monitor_daemon-${buildTarget}${binExt}`,
);
const daemonctlSidecarPath = join(
  binariesDir,
  `codex_monitor_daemonctl-${buildTarget}${binExt}`,
);

bootstrapSidecarPath(daemonSidecarPath, isWindowsTarget);
bootstrapSidecarPath(daemonctlSidecarPath, isWindowsTarget);

const cargoArgs = ["build", "--release"];
if (explicitTarget) {
  cargoArgs.push("--target", buildTarget);
}
cargoArgs.push("--bin", "codex_monitor_daemon", "--bin", "codex_monitor_daemonctl");

run("cargo", cargoArgs, { cwd: srcTauriDir });

copyFileSync(
  join(releaseDir, `codex_monitor_daemon${binExt}`),
  daemonSidecarPath,
);
copyFileSync(
  join(releaseDir, `codex_monitor_daemonctl${binExt}`),
  daemonctlSidecarPath,
);

if (!isWindowsTarget) {
  chmodSync(daemonSidecarPath, 0o755);
  chmodSync(daemonctlSidecarPath, 0o755);
}

console.log(`Prepared sidecars for ${buildTarget} in ${binariesDir}`);

function bootstrapSidecarPath(path, isWindows) {
  if (!existsSync(path)) {
    writeFileSync(path, "");
  }
  if (!isWindows) {
    chmodSync(path, 0o755);
  }
}

function run(command, args, options = {}) {
  const { captureOutput = false, ...spawnOptions } = options;
  const result = spawnSync(command, args, {
    encoding: captureOutput ? "utf8" : undefined,
    stdio: captureOutput ? ["ignore", "pipe", "pipe"] : "inherit",
    ...spawnOptions,
  });

  if (result.status !== 0) {
    if (captureOutput && result.stdout) {
      process.stdout.write(result.stdout);
    }
    if (captureOutput && result.stderr) {
      process.stderr.write(result.stderr);
    }
    process.exit(result.status ?? 1);
  }

  return result;
}
