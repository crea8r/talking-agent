import { constants as fsConstants } from 'node:fs';
import { access, readdir } from 'node:fs/promises';
import path from 'node:path';

export async function exists(filePath) {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function listFilesRecursive(rootDir) {
  const entries = await readdir(rootDir, { withFileTypes: true }).catch(() => []);
  const files = [];

  for (const entry of entries) {
    const filePath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(filePath)));
      continue;
    }
    files.push(filePath);
  }

  return files;
}
