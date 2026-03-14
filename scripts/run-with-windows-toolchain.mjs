import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withWindowsToolchainEnv } from "./windows-toolchain.mjs";

function isExecutableFile(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

function commandSearchEntries(env) {
  const localBinDir = path.join(process.cwd(), "node_modules", ".bin");
  const localBins = fs.existsSync(localBinDir) ? [localBinDir] : [];
  const pathEntries = (env.PATH ?? "").split(path.delimiter).filter(Boolean);
  return [...localBins, ...pathEntries];
}

function resolveCommand(command, env) {
  if (process.platform !== "win32") {
    return command;
  }

  if (command.includes("\\") || command.includes("/") || path.isAbsolute(command)) {
    return command;
  }

  const pathEntries = commandSearchEntries(env);
  const pathext = (env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";").filter(Boolean);
  const hasExtension = path.extname(command) !== "";

  for (const dir of pathEntries) {
    if (hasExtension) {
      const candidate = path.join(dir, command);
      if (isExecutableFile(candidate)) {
        return candidate;
      }
      continue;
    }

    for (const ext of pathext) {
      const candidate = path.join(dir, `${command}${ext}`);
      if (isExecutableFile(candidate)) {
        return candidate;
      }
    }
  }

  return command;
}

function runProcess(command, args, env) {
  const resolvedCommand = resolveCommand(command, env);
  const resolvedExt = path.extname(resolvedCommand).toLowerCase();
  const useShell = process.platform === "win32" && (resolvedExt === ".cmd" || resolvedExt === ".bat");

  return new Promise((resolve, reject) => {
    const child = spawn(resolvedCommand, args, {
      stdio: "inherit",
      env,
      shell: useShell,
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${resolvedCommand} terminated with signal ${signal}`));
        return;
      }
      resolve(code ?? 0);
    });
  });
}

function prepareTauriArgs(command, args, env) {
  if (process.platform !== "win32" || env.TAURI_SIGNING_PRIVATE_KEY) {
    return { args, cleanup: null };
  }

  const commandName = path.basename(command).toLowerCase();
  const isTauriCommand = commandName === "tauri" || commandName === "tauri.cmd" || commandName === "tauri.exe";
  const isBuildCommand = args.includes("build");
  const configIndex = args.indexOf("--config");
  if (!isTauriCommand || !isBuildCommand || configIndex === -1 || !args[configIndex + 1]) {
    return { args, cleanup: null };
  }

  const configPath = path.resolve(process.cwd(), args[configIndex + 1]);
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  config.bundle = {
    ...(config.bundle ?? {}),
    createUpdaterArtifacts: false,
  };

  const tempConfigPath = path.join(os.tmpdir(), `codex-monitor-tauri-local-${process.pid}.json`);
  fs.writeFileSync(tempConfigPath, `${JSON.stringify(config, null, 2)}\n`);

  const nextArgs = [...args];
  nextArgs[configIndex + 1] = tempConfigPath;
  console.log(
    `[windows-toolchain] TAURI_SIGNING_PRIVATE_KEY is not set; using local unsigned build config at ${tempConfigPath}`,
  );

  return {
    args: nextArgs,
    cleanup: () => {
      try {
        fs.unlinkSync(tempConfigPath);
      } catch {
        // Best effort cleanup for temporary config file.
      }
    },
  };
}

const args = process.argv.slice(2);
const runDoctor = args[0] === "--doctor";
const commandArgs = runDoctor ? args.slice(1) : args;

if (commandArgs.length === 0) {
  console.error("Usage: node scripts/run-with-windows-toolchain.mjs [--doctor] <command> [args...]");
  process.exit(1);
}

const env = withWindowsToolchainEnv(process.env);

if (runDoctor) {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const doctorPath = path.join(scriptDir, "doctor.mjs");
  const doctorExitCode = await runProcess(process.execPath, [doctorPath, "--strict"], env);
  if (doctorExitCode !== 0) {
    process.exit(doctorExitCode);
  }
}

const [command, ...commandTail] = commandArgs;
const prepared = prepareTauriArgs(command, commandTail, env);
const exitCode = await runProcess(command, prepared.args, env);
prepared.cleanup?.();
process.exit(exitCode);
