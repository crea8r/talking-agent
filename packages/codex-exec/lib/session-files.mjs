import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

import { listFilesRecursive } from './fs-utils.mjs';
import { normalizeString } from './strings.mjs';

export async function readSessionIndexEntries(codexHomeDir) {
  const sessionIndexPath = path.join(codexHomeDir, 'session_index.jsonl');
  const raw = await readFile(sessionIndexPath, 'utf8').catch(() => '');
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export async function appendSessionIndexEntry(codexHomeDir, entry) {
  const sessionIndexPath = path.join(codexHomeDir, 'session_index.jsonl');
  await writeFile(sessionIndexPath, `${JSON.stringify(entry)}\n`, { flag: 'a' });
}

export async function findSessionFileById(codexHomeDir, sessionId) {
  const sessionsDir = path.join(codexHomeDir, 'sessions');
  const files = await listFilesRecursive(sessionsDir);

  for (const filePath of files) {
    if (!filePath.endsWith('.jsonl')) {
      continue;
    }
    const raw = await readFile(filePath, 'utf8').catch(() => '');
    const firstLine = raw.split('\n').find((line) => line.trim());
    if (!firstLine) {
      continue;
    }
    try {
      const parsed = JSON.parse(firstLine);
      if (parsed?.type === 'session_meta' && parsed?.payload?.id === sessionId) {
        return filePath;
      }
    } catch {}
  }

  return '';
}

export async function cloneSessionFile({
  sourceFilePath,
  targetFilePath,
  originalSessionId,
  callSessionId,
  workspaceRoot = '',
} = {}) {
  const raw = await readFile(sourceFilePath, 'utf8');
  const now = new Date().toISOString();
  const lines = raw
    .split('\n')
    .map((line, index) => {
      const trimmed = line.trim();
      if (!trimmed || index !== 0) {
        return line;
      }

      try {
        const parsed = JSON.parse(line);
        if (parsed?.type !== 'session_meta' || !parsed?.payload) {
          return line;
        }
        return JSON.stringify({
          ...parsed,
          timestamp: now,
          payload: {
            ...parsed.payload,
            id: callSessionId,
            forked_from_id: originalSessionId,
            timestamp: now,
            cwd: normalizeString(workspaceRoot) || parsed.payload.cwd,
          },
        });
      } catch {
        return line;
      }
    })
    .join('\n');

  await mkdir(path.dirname(targetFilePath), { recursive: true });
  await writeFile(targetFilePath, lines);
}
