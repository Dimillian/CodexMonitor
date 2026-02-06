import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(scriptDir, "..");
const sourceDir = join(
  projectRoot,
  "node_modules",
  "vscode-material-icons",
  "generated",
  "icons",
);
const targetDir = join(projectRoot, "public", "assets", "material-icons");

if (!existsSync(sourceDir)) {
  console.warn("[sync:material-icons] source icons directory not found:", sourceDir);
  process.exit(0);
}

mkdirSync(dirname(targetDir), { recursive: true });
rmSync(targetDir, { recursive: true, force: true });
cpSync(sourceDir, targetDir, { recursive: true });
console.log("[sync:material-icons] synced icons to", targetDir);
