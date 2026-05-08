import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const RECORDS_DIR_NAME = 'records';

function normalizeString(value) {
  return `${value || ''}`.trim();
}

async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

async function readJson(filePath, fallbackValue) {
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallbackValue;
  }
}

function normalizeLaunchId(launchId = '') {
  return normalizeString(launchId)
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function createRecordPaths(rootDir, launchId = '') {
  const normalizedLaunchId = normalizeLaunchId(launchId);
  return {
    recordsDir: path.join(rootDir, RECORDS_DIR_NAME),
    recordPath: path.join(rootDir, RECORDS_DIR_NAME, `${normalizedLaunchId}.json`),
    normalizedLaunchId,
  };
}

export function createCallRecordStore({ rootDir } = {}) {
  if (!rootDir) {
    throw new Error('createCallRecordStore requires a rootDir.');
  }

  async function loadRecord({ launchId = '' } = {}) {
    const { recordPath } = createRecordPaths(rootDir, launchId);
    return readJson(recordPath, null);
  }

  async function createRecord({
    launchId = '',
    originalSessionId = '',
    callSessionId = '',
    workspaceRoot = '',
    displayTitle = '',
    status = 'ready',
    ...rest
  } = {}) {
    const { recordsDir, recordPath, normalizedLaunchId } = createRecordPaths(rootDir, launchId);
    if (!normalizedLaunchId) {
      throw new Error('A launch id is required.');
    }
    if (!normalizeString(originalSessionId)) {
      throw new Error('An original session id is required.');
    }
    if (!normalizeString(callSessionId)) {
      throw new Error('A call session id is required.');
    }

    const now = new Date().toISOString();
    const record = {
      launchId: normalizedLaunchId,
      originalSessionId: normalizeString(originalSessionId),
      callSessionId: normalizeString(callSessionId),
      workspaceRoot: normalizeString(workspaceRoot),
      displayTitle: normalizeString(displayTitle),
      status: normalizeString(status) || 'ready',
      summary: '',
      failureReason: '',
      createdAt: now,
      updatedAt: now,
      endedAt: '',
      ...rest,
    };

    await ensureDir(recordsDir);
    await writeFile(recordPath, JSON.stringify(record, null, 2));
    return record;
  }

  async function updateRecord({ launchId = '', patch = {} } = {}) {
    const existing = await loadRecord({ launchId });
    if (!existing) {
      throw new Error(`Unknown call record: ${launchId}`);
    }

    const next = {
      ...existing,
      ...patch,
      launchId: existing.launchId,
      originalSessionId: normalizeString(patch.originalSessionId || existing.originalSessionId),
      callSessionId: normalizeString(patch.callSessionId || existing.callSessionId),
      workspaceRoot: normalizeString(patch.workspaceRoot || existing.workspaceRoot),
      displayTitle: normalizeString(patch.displayTitle || existing.displayTitle),
      status: normalizeString(patch.status || existing.status),
      summary: normalizeString(patch.summary ?? existing.summary),
      failureReason: normalizeString(patch.failureReason ?? existing.failureReason),
      endedAt: normalizeString(patch.endedAt ?? existing.endedAt),
      updatedAt: new Date().toISOString(),
    };

    const { recordsDir, recordPath } = createRecordPaths(rootDir, launchId);
    await ensureDir(recordsDir);
    await writeFile(recordPath, JSON.stringify(next, null, 2));
    return next;
  }

  return {
    createRecord,
    loadRecord,
    updateRecord,
  };
}
