#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

const rootDir = process.cwd();
const coverageRootDir = path.join(rootDir, ".runtime-cache", "coverage", "vitest-gate");
const reportDir = path.join(rootDir, ".runtime-cache", "test_output", "coverage-gate");
const thresholdEnvConfig = {
  statements: { env: "COVERAGE_MIN_STATEMENTS", defaultValue: 43 },
  lines: { env: "COVERAGE_MIN_LINES", defaultValue: 43 },
  functions: { env: "COVERAGE_MIN_FUNCTIONS", defaultValue: 53 },
  branches: { env: "COVERAGE_MIN_BRANCHES", defaultValue: 63 },
};
const criticalScopeConfig = [
  {
    name: "threads",
    prefix: "src/features/threads/",
    thresholds: { statements: 60, lines: 60, functions: 70, branches: 60 },
  },
  {
    name: "services",
    prefix: "src/services/",
    thresholds: { statements: 30, lines: 30, functions: 30, branches: 70 },
  },
];

function buildRunId() {
  const random = Math.random().toString(36).slice(2, 8);
  return `${Date.now()}-${process.pid}-${random}`;
}

function parseThresholdValue(metric, envKey, defaultValue) {
  const raw = process.env[envKey];
  if (raw === undefined || raw.trim() === "") {
    return { value: defaultValue, source: "default" };
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${envKey} value: "${raw}" is not a finite number`);
  }
  if (parsed < 0 || parsed > 100) {
    throw new Error(`Invalid ${envKey} value: "${raw}" must be between 0 and 100`);
  }
  return { value: parsed, source: "env" };
}

function resolveThresholds() {
  const thresholds = {};
  const thresholdSources = {};
  for (const [metric, config] of Object.entries(thresholdEnvConfig)) {
    const { value, source } = parseThresholdValue(metric, config.env, config.defaultValue);
    thresholds[metric] = value;
    thresholdSources[metric] = { env: config.env, source };
  }
  return { thresholds, thresholdSources };
}

function runVitestCoverage(coverageDir) {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const args = [
    "exec",
    "--",
    "vitest",
    "run",
    "--coverage",
    "--coverage.provider=v8",
    "--coverage.reporter=text-summary",
    "--coverage.reporter=json-summary",
    `--coverage.reportsDirectory=${coverageDir}`,
    "--coverage.include=src/**/*.{ts,tsx}",
    "--coverage.exclude=src/**/*.test.ts",
    "--coverage.exclude=src/**/*.test.tsx",
    "--coverage.exclude=src/test/**",
    "--coverage.exclude=src/main.tsx",
    "--testTimeout=15000",
    "--hookTimeout=15000",
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(npmCommand, args, {
      stdio: "inherit",
      env: process.env,
      cwd: rootDir,
    });

    child.on("error", reject);
    child.on("close", (code) => {
      resolve(code ?? 1);
    });
  });
}

function readPct(total, metric) {
  const value = total?.[metric]?.pct;
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`coverage-summary missing metric: ${metric}`);
  }
  return Number(value.toFixed(2));
}

function normalizePath(value) {
  return String(value).replaceAll("\\", "/");
}

function aggregateScopeCoverage(summary, prefix) {
  const normalizedPrefix = normalizePath(prefix);
  const metricTotals = {
    statements: { covered: 0, total: 0 },
    lines: { covered: 0, total: 0 },
    functions: { covered: 0, total: 0 },
    branches: { covered: 0, total: 0 },
  };

  let fileCount = 0;
  for (const [filePath, metrics] of Object.entries(summary)) {
    if (filePath === "total") {
      continue;
    }
    const normalizedPath = normalizePath(filePath);
    if (
      !normalizedPath.startsWith(normalizedPrefix) &&
      !normalizedPath.includes(`/${normalizedPrefix}`)
    ) {
      continue;
    }
    fileCount += 1;
    for (const metric of Object.keys(metricTotals)) {
      metricTotals[metric].covered += metrics?.[metric]?.covered ?? 0;
      metricTotals[metric].total += metrics?.[metric]?.total ?? 0;
    }
  }

  const coverage = {};
  for (const metric of Object.keys(metricTotals)) {
    const totals = metricTotals[metric];
    coverage[metric] = totals.total > 0
      ? Number(((totals.covered / totals.total) * 100).toFixed(2))
      : 0;
  }

  return {
    fileCount,
    coverage,
  };
}

function collectGlobalFailures(thresholds, actualValues) {
  const failures = [];
  for (const [metric, minValue] of Object.entries(thresholds)) {
    const actual = actualValues[metric];
    if (actual < minValue) {
      failures.push({ metric, min: minValue, actual });
    }
  }
  return failures;
}

function collectCriticalScopeFailures(criticalScopes) {
  const failures = [];
  for (const scope of criticalScopes) {
    if (scope.fileCount === 0) {
      failures.push({
        scope: scope.name,
        prefix: scope.prefix,
        metric: "files",
        min: 1,
        actual: 0,
      });
      continue;
    }
    for (const [metric, minValue] of Object.entries(scope.thresholds)) {
      const actual = scope.coverage[metric];
      if (actual < minValue) {
        failures.push({
          scope: scope.name,
          prefix: scope.prefix,
          metric,
          min: minValue,
          actual,
        });
      }
    }
  }
  return failures;
}

async function main() {
  await mkdir(reportDir, { recursive: true });
  const runId = buildRunId();
  const coverageDir = path.join(coverageRootDir, runId);
  const summaryPath = path.join(coverageDir, "coverage-summary.json");

  let thresholds;
  let thresholdSources;
  try {
    const resolved = resolveThresholds();
    thresholds = resolved.thresholds;
    thresholdSources = resolved.thresholdSources;
  } catch (error) {
    console.error("❌ Invalid coverage threshold configuration");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }

  const testExitCode = await runVitestCoverage(coverageDir);
  if (testExitCode !== 0) {
    console.error(`❌ Coverage run failed before threshold check (exit=${testExitCode})`);
    process.exit(testExitCode);
  }

  let summaryRaw;
  try {
    summaryRaw = await readFile(summaryPath, "utf-8");
  } catch (error) {
    console.error(`❌ Missing coverage summary: ${summaryPath}`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }

  const summary = JSON.parse(summaryRaw);
  const total = summary?.total;
  const actualValues = {
    statements: readPct(total, "statements"),
    lines: readPct(total, "lines"),
    functions: readPct(total, "functions"),
    branches: readPct(total, "branches"),
  };
  const globalFailures = collectGlobalFailures(thresholds, actualValues);
  const criticalScopes = criticalScopeConfig.map((scopeConfig) => {
    const { fileCount, coverage } = aggregateScopeCoverage(summary, scopeConfig.prefix);
    return {
      ...scopeConfig,
      fileCount,
      coverage,
    };
  });
  const criticalFailures = collectCriticalScopeFailures(criticalScopes);
  const failures = [...globalFailures, ...criticalFailures];

  const report = {
    runId,
    timestampPst: new Date().toLocaleString("sv-SE", {
      timeZone: "America/Los_Angeles",
      hour12: false,
    }),
    thresholds,
    thresholdSources,
    coverage: actualValues,
    criticalScopes,
    pass: failures.length === 0,
    failures,
    summaryPath,
    coverageDir,
  };

  const latestPath = path.join(reportDir, "latest.json");
  await writeFile(latestPath, `${JSON.stringify(report, null, 2)}\n`, "utf-8");

  console.log("\n[Coverage Gate]");
  console.log(`- run: ${runId}`);
  console.log(`- coverageDir: ${coverageDir}`);
  console.log(`- statements: ${actualValues.statements}% (min ${thresholds.statements}%)`);
  console.log(`- lines: ${actualValues.lines}% (min ${thresholds.lines}%)`);
  console.log(`- functions: ${actualValues.functions}% (min ${thresholds.functions}%)`);
  console.log(`- branches: ${actualValues.branches}% (min ${thresholds.branches}%)`);
  for (const scope of criticalScopes) {
    console.log(`- scope:${scope.name} files=${scope.fileCount} prefix=${scope.prefix}`);
    console.log(
      `  statements ${scope.coverage.statements}% (min ${scope.thresholds.statements}%)`,
    );
    console.log(
      `  lines ${scope.coverage.lines}% (min ${scope.thresholds.lines}%)`,
    );
    console.log(
      `  functions ${scope.coverage.functions}% (min ${scope.thresholds.functions}%)`,
    );
    console.log(
      `  branches ${scope.coverage.branches}% (min ${scope.thresholds.branches}%)`,
    );
  }
  console.log(`- report: ${latestPath}`);

  if (failures.length > 0) {
    console.error("❌ Coverage gate failed");
    failures.forEach((failure) => {
      if (failure.scope) {
        console.error(
          `  - scope:${failure.scope} (${failure.prefix}) ${failure.metric}: actual ${failure.actual}% < required ${failure.min}%`,
        );
        return;
      }
      console.error(
        `  - global ${failure.metric}: actual ${failure.actual}% < required ${failure.min}%`,
      );
    });
    process.exit(3);
  }

  console.log("✅ Coverage gate passed");
}

main().catch((error) => {
  console.error("❌ Coverage gate crashed");
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(4);
});
