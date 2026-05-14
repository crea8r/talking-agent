import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

function normalizeSessionId(payload = {}) {
  return `${payload?.session?.id || ''}`.trim();
}

function buildSessionReportPath(rootDir, sessionId) {
  const sessionDir = path.join(rootDir, sessionId);
  return {
    sessionDir,
    finalPath: path.join(sessionDir, 'session-report.json'),
    tempPath: path.join(
      sessionDir,
      `session-report.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`,
    ),
  };
}

export async function persistSessionPayload({ rootDir, payload }) {
  const sessionId = normalizeSessionId(payload);
  if (!sessionId) {
    return;
  }

  const { sessionDir, finalPath, tempPath } = buildSessionReportPath(rootDir, sessionId);
  await mkdir(sessionDir, { recursive: true });
  await writeFile(tempPath, JSON.stringify(payload, null, 2), 'utf8');
  await rename(tempPath, finalPath);
}

export async function persistCurrentSessionSnapshot({
  sessionRuntime,
  rootDir,
  sessionId,
}) {
  const payload = await sessionRuntime.getSession(sessionId);
  await persistSessionPayload({
    rootDir,
    payload,
  });
  return payload;
}
