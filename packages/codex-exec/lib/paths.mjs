import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { normalizeString } from './strings.mjs';

export function createSessionPaths(rootDir, sessionId) {
  const sessionDir = path.join(rootDir, normalizeString(sessionId));
  return {
    sessionDir,
    codexHomeDir: path.join(sessionDir, 'codex-home'),
    codexWorkdir: path.join(sessionDir, 'workdir'),
    sessionReadyPath: path.join(sessionDir, 'session-ready.json'),
    outputFilePath: path.join(sessionDir, `reply-${randomUUID()}.txt`),
  };
}

export function createLaunchPaths(rootDir, launchId) {
  const cleanedLaunchId = normalizeString(launchId);
  const launchDir = path.join(rootDir, cleanedLaunchId);
  return {
    launchDir,
    codexHomeDir: path.join(launchDir, 'codex-home'),
    workdir: path.join(launchDir, 'workdir'),
    outputFilePath: path.join(launchDir, `reply-${randomUUID()}.txt`),
  };
}

export function createForkedSessionFilePath(codexHomeDir, callSessionId) {
  const now = new Date();
  const year = `${now.getUTCFullYear()}`;
  const month = `${now.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${now.getUTCDate()}`.padStart(2, '0');
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  const fileName = `rollout-${timestamp}-${callSessionId}.jsonl`;
  return path.join(codexHomeDir, 'sessions', year, month, day, fileName);
}

export function resolveExecutionWorkdir(defaultWorkdir, workspaceRoot = '') {
  return normalizeString(workspaceRoot) || defaultWorkdir;
}
