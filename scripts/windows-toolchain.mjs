import fs from "node:fs";
import path from "node:path";

function isDirectory(dirPath) {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

function isFile(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function normalizeForWindows(value) {
  return process.platform === "win32" ? value.toLowerCase() : value;
}

function dedupePaths(values) {
  const seen = new Set();
  const deduped = [];

  for (const value of values) {
    if (!value) continue;
    const normalized = normalizeForWindows(path.normalize(value));
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    deduped.push(value);
  }

  return deduped;
}

export function getWindowsToolchainBins(env = process.env) {
  if (process.platform !== "win32") {
    return [];
  }

  const candidates = [
    env.LIBCLANG_PATH,
    "C:\\Program Files\\CMake\\bin",
    "C:\\Program Files\\LLVM\\bin",
  ].filter(Boolean);

  return dedupePaths(candidates.filter(isDirectory));
}

function hasVisualCppToolchain(rootPath) {
  const msvcRoot = path.join(rootPath, "VC", "Tools", "MSVC");
  if (!isDirectory(msvcRoot)) {
    return false;
  }

  try {
    return fs.readdirSync(msvcRoot).length > 0;
  } catch {
    return false;
  }
}

export function detectWindowsCmakeGenerator() {
  if (process.platform !== "win32") {
    return null;
  }

  const candidates = [
    {
      generator: "Visual Studio 17 2022",
      rootPath: "C:\\Program Files\\Microsoft Visual Studio\\2022\\BuildTools",
    },
    {
      generator: "Visual Studio 17 2022",
      rootPath: "C:\\Program Files\\Microsoft Visual Studio\\2022\\Community",
    },
    {
      generator: "Visual Studio 16 2019",
      rootPath: "C:\\Program Files (x86)\\Microsoft Visual Studio\\2019\\BuildTools",
    },
    {
      generator: "Visual Studio 16 2019",
      rootPath: "C:\\Program Files (x86)\\Microsoft Visual Studio\\2019\\Community",
    },
  ];

  const match = candidates.find((candidate) => hasVisualCppToolchain(candidate.rootPath));
  return match?.generator ?? null;
}

export function getWindowsToolPath(command, env = process.env) {
  if (process.platform !== "win32") {
    return null;
  }

  const fileName = path.extname(command) ? command : `${command}.exe`;
  for (const dir of getWindowsToolchainBins(env)) {
    const candidate = path.join(dir, fileName);
    if (isFile(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function withWindowsToolchainEnv(baseEnv = process.env) {
  if (process.platform !== "win32") {
    return { ...baseEnv };
  }

  const env = { ...baseEnv };
  const bins = getWindowsToolchainBins(env);
  if (bins.length > 0) {
    const pathEntries = (env.PATH ?? "").split(path.delimiter).filter(Boolean);
    env.PATH = [...bins, ...pathEntries].join(path.delimiter);
  }

  if (!env.LIBCLANG_PATH) {
    const llvmBin = getWindowsToolPath("clang", env);
    if (llvmBin) {
      env.LIBCLANG_PATH = path.dirname(llvmBin);
    }
  }

  if (!env.CMAKE_GENERATOR) {
    const generator = detectWindowsCmakeGenerator();
    if (generator) {
      env.CMAKE_GENERATOR = generator;
    }
  }

  if (!env.CMAKE_GENERATOR_PLATFORM) {
    env.CMAKE_GENERATOR_PLATFORM = "x64";
  }

  return env;
}
