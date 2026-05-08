import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const SCOPES_DIR_NAME = 'scopes';
const SETUP_FILE_NAME = 'active-setup.json';

function normalizeScopeKey(scopeKey = '') {
  return `${scopeKey || ''}`
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
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

function createSetupPaths(rootDir, scopeKey = '') {
  const normalizedScopeKey = normalizeScopeKey(scopeKey);
  const scopeDir = normalizedScopeKey
    ? path.join(rootDir, SCOPES_DIR_NAME, normalizedScopeKey)
    : rootDir;

  return {
    scopeDir,
    setupPath: path.join(scopeDir, SETUP_FILE_NAME),
  };
}

function normalizeString(value) {
  return `${value || ''}`.trim();
}

export function createWorkspaceSetupStore({ rootDir } = {}) {
  if (!rootDir) {
    throw new Error('createWorkspaceSetupStore requires a rootDir.');
  }

  async function loadSetup({ scopeKey = '' } = {}) {
    const { setupPath } = createSetupPaths(rootDir, scopeKey);
    return readJson(setupPath, null);
  }

  async function saveSetup({
    scopeKey = '',
    activeModelId = '',
    activeModelLabel = '',
  } = {}) {
    const modelId = normalizeString(activeModelId);
    if (!modelId) {
      throw new Error('An active model id is required.');
    }

    const { scopeDir, setupPath } = createSetupPaths(rootDir, scopeKey);
    const existing = await loadSetup({ scopeKey });
    const now = new Date().toISOString();
    const next = {
      scopeKey: normalizeScopeKey(scopeKey),
      activeModelId: modelId,
      activeModelLabel: normalizeString(activeModelLabel),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    await ensureDir(scopeDir);
    await writeFile(setupPath, JSON.stringify(next, null, 2));
    return next;
  }

  return {
    loadSetup,
    saveSetup,
  };
}
