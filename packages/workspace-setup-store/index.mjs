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

function normalizePluginIds(values = []) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => normalizeString(value))
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right));
}

function normalizeSetupPayload(payload = {}) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const activeModelId = normalizeString(payload.activeModelId);
  if (!activeModelId) {
    return null;
  }

  return {
    scopeKey: normalizeScopeKey(payload.scopeKey),
    activeModelId,
    activeModelLabel: normalizeString(payload.activeModelLabel),
    enabledPluginIds: normalizePluginIds(payload.enabledPluginIds),
    enableControlComputer: payload.enableControlComputer === true,
    enableComplexTasks: payload.enableComplexTasks === true,
    createdAt: normalizeString(payload.createdAt),
    updatedAt: normalizeString(payload.updatedAt),
  };
}

export function createWorkspaceSetupStore({ rootDir } = {}) {
  if (!rootDir) {
    throw new Error('createWorkspaceSetupStore requires a rootDir.');
  }

  async function loadSetupFromScope({ scopeKey = '' } = {}) {
    const { setupPath } = createSetupPaths(rootDir, scopeKey);
    return normalizeSetupPayload(await readJson(setupPath, null));
  }

  async function loadSetup({ scopeKey = '' } = {}) {
    const scopedSetup = await loadSetupFromScope({ scopeKey });
    if (scopedSetup || !normalizeScopeKey(scopeKey)) {
      return scopedSetup;
    }
    return loadSetupFromScope();
  }

  async function saveSetup({
    scopeKey = '',
    activeModelId = '',
    activeModelLabel = '',
    enabledPluginIds = [],
    enableControlComputer = false,
    enableComplexTasks = false,
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
      enabledPluginIds: normalizePluginIds(enabledPluginIds),
      enableControlComputer: enableControlComputer === true,
      enableComplexTasks: enableComplexTasks === true,
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
