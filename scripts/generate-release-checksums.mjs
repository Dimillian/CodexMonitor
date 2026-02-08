#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const releaseDirArg = process.argv[2] ?? 'release-artifacts';
const releaseDir = path.resolve(releaseDirArg);
const outputPath = path.join(releaseDir, 'SHA256SUMS.txt');

const includeExtensions = [
  '.appimage',
  '.dmg',
  '.exe',
  '.msi',
  '.rpm',
  '.sig',
  '.tar.gz',
  '.zip',
];

const shouldIncludeFile = (fileName) => {
  const lower = fileName.toLowerCase();
  return includeExtensions.some((ext) => lower.endsWith(ext));
};

const walkFiles = async (dir) => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(absolutePath)));
      continue;
    }
    if (entry.isFile()) {
      files.push(absolutePath);
    }
  }
  return files;
};

const sha256ForFile = async (filePath) => {
  const fileBytes = await fs.readFile(filePath);
  return createHash('sha256').update(fileBytes).digest('hex');
};

const main = async () => {
  const allFiles = await walkFiles(releaseDir);
  const artifacts = allFiles
    .map((absolutePath) => ({
      absolutePath,
      relativePath: path.relative(releaseDir, absolutePath).split(path.sep).join('/'),
      baseName: path.basename(absolutePath),
    }))
    .filter(({ relativePath, baseName }) => shouldIncludeFile(baseName) && relativePath !== 'SHA256SUMS.txt')
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  if (artifacts.length === 0) {
    throw new Error(`No release artifacts found in ${releaseDir}`);
  }

  const lines = [];
  for (const artifact of artifacts) {
    const hash = await sha256ForFile(artifact.absolutePath);
    lines.push(`${hash}  ${artifact.baseName}`);
  }

  await fs.writeFile(outputPath, `${lines.join('\n')}\n`, 'utf8');
  console.log(`Wrote ${artifacts.length} checksums to ${outputPath}`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
