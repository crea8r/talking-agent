import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open as openFile, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { BUNDLED_MODELS, getGesturePresets } from '../avatar-layer-browser/index.js';

const CAPABILITIES_VERSION = '2026-05-04';
const MAX_SEQUENCE_DURATION_MS = 60_000;
const DEFAULT_GESTURE_DURATION_MS = 2_400;
const LOCK_RETRY_MS = 25;
const LOCK_TIMEOUT_MS = 5_000;

export function resolveDefaultPoseStudioBridgeStatePath({
  cwd = process.cwd(),
  env = process.env,
} = {}) {
  return env.POSE_STUDIO_BRIDGE_STATE_PATH || path.join(cwd, 'output', 'pose-studio-bridge-state.json');
}

function createTypedError(code, message, data = undefined) {
  const error = new Error(message);
  error.code = code;
  if (data) {
    error.data = data;
  }
  return error;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function createEmptyState() {
  return {
    version: 1,
    updatedAt: null,
    runtime: {
      activeModelId: BUNDLED_MODELS[0]?.id || '',
      activeModelLabel: BUNDLED_MODELS[0]?.label || '',
      catalogVersion: '',
      updatedAt: null,
      gestures: [],
    },
    director: {
      revision: 0,
      activeSequence: null,
      lastSequence: null,
      lastError: null,
      playback: {
        status: 'idle',
        sequenceId: '',
        source: '',
        currentStepIndex: -1,
        currentGestureId: '',
        updatedAt: null,
      },
    },
  };
}

function normalizeString(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function normalizeDurationMs(value, fallback = DEFAULT_GESTURE_DURATION_MS) {
  const parsed = Number.parseInt(`${value ?? ''}`, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function supportsSpeechForGesture(description = '') {
  return !/no talking/i.test(`${description || ''}`);
}

function buildStaticGestureCatalog(modelId = '') {
  return getGesturePresets(modelId || BUNDLED_MODELS[0]?.id || '').map((gesture) => ({
    id: gesture.id,
    label: gesture.label || gesture.id,
    intent: gesture.intent || gesture.id,
    description: gesture.description || gesture.note || '',
    bestFor: Array.isArray(gesture.bestFor) ? [...gesture.bestFor] : [],
    durationMs: DEFAULT_GESTURE_DURATION_MS,
    supportsSpeech: supportsSpeechForGesture(gesture.description || gesture.note || ''),
  }));
}

function normalizeGestureCatalogEntry(entry = {}, staticCatalogById) {
  const id = normalizeString(entry.id);
  const staticEntry = staticCatalogById.get(id);
  if (!id || !staticEntry) {
    return null;
  }

  const description = normalizeString(entry.description, staticEntry.description);
  return {
    id,
    label: normalizeString(entry.label, staticEntry.label),
    intent: normalizeString(entry.intent, staticEntry.intent),
    description,
    bestFor: Array.isArray(entry.bestFor) && entry.bestFor.length ? [...entry.bestFor] : [...staticEntry.bestFor],
    durationMs: normalizeDurationMs(entry.durationMs, staticEntry.durationMs),
    supportsSpeech:
      typeof entry.supportsSpeech === 'boolean'
        ? entry.supportsSpeech
        : supportsSpeechForGesture(description || staticEntry.description),
  };
}

function buildCatalogVersion(modelId, gestures) {
  const payload = JSON.stringify({
    modelId,
    gestures: gestures.map((gesture) => ({
      id: gesture.id,
      durationMs: gesture.durationMs,
      supportsSpeech: gesture.supportsSpeech,
      bestFor: gesture.bestFor,
    })),
  });

  return createHash('sha1').update(payload).digest('hex').slice(0, 12);
}

function normalizeSequenceStep(step = {}, gestureById) {
  const gestureId = normalizeString(step.gestureId);
  const gesture = gestureById.get(gestureId);
  if (!gesture) {
    throw createTypedError('UNKNOWN_GESTURE', `Unknown gestureId: ${gestureId}`, {
      gestureId,
      allowedGestureIds: [...gestureById.keys()],
    });
  }

  return {
    gestureId: gesture.id,
    label: gesture.label,
    durationMs: gesture.durationMs,
    supportsSpeech: gesture.supportsSpeech,
    description: gesture.description,
  };
}

function trimStepsToDurationLimit(steps, limitMs) {
  let totalDurationMs = 0;
  const acceptedSteps = [];
  let trimmed = false;

  for (const step of steps) {
    if (totalDurationMs + step.durationMs > limitMs) {
      trimmed = true;
      break;
    }

    acceptedSteps.push(step);
    totalDurationMs += step.durationMs;
  }

  return {
    acceptedSteps,
    totalDurationMs,
    trimmed,
  };
}

function normalizePlaybackStatus(status = '') {
  return ['idle', 'queued', 'playing', 'paused', 'completed', 'stopped', 'error'].includes(status)
    ? status
    : 'idle';
}

function normalizeState(state = {}) {
  const normalized = createEmptyState();
  normalized.updatedAt = typeof state.updatedAt === 'string' ? state.updatedAt : null;

  const runtime = state.runtime || {};
  normalized.runtime.activeModelId =
    BUNDLED_MODELS.some((model) => model.id === runtime.activeModelId)
      ? runtime.activeModelId
      : normalized.runtime.activeModelId;
  normalized.runtime.activeModelLabel = normalizeString(
    runtime.activeModelLabel,
    BUNDLED_MODELS.find((model) => model.id === normalized.runtime.activeModelId)?.label || normalized.runtime.activeModelLabel,
  );
  normalized.runtime.updatedAt = typeof runtime.updatedAt === 'string' ? runtime.updatedAt : null;
  normalized.runtime.gestures = Array.isArray(runtime.gestures)
    ? runtime.gestures.filter(Boolean).map((gesture) => gesture)
    : [];
  normalized.runtime.catalogVersion = normalizeString(runtime.catalogVersion);

  const director = state.director || {};
  normalized.director.revision = Number.isFinite(director.revision) ? Number(director.revision) : 0;
  normalized.director.activeSequence = director.activeSequence ? cloneJson(director.activeSequence) : null;
  normalized.director.lastSequence = director.lastSequence ? cloneJson(director.lastSequence) : null;
  normalized.director.lastError = director.lastError ? cloneJson(director.lastError) : null;
  normalized.director.playback = {
    status: normalizePlaybackStatus(director.playback?.status),
    sequenceId: normalizeString(director.playback?.sequenceId),
    source: normalizeString(director.playback?.source),
    currentStepIndex: Number.isFinite(director.playback?.currentStepIndex) ? Number(director.playback.currentStepIndex) : -1,
    currentGestureId: normalizeString(director.playback?.currentGestureId),
    updatedAt: typeof director.playback?.updatedAt === 'string' ? director.playback.updatedAt : null,
  };

  return normalized;
}

async function ensureStateFile(stateFilePath) {
  await mkdir(path.dirname(stateFilePath), { recursive: true });

  try {
    await readFile(stateFilePath, 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }

    await writeFile(stateFilePath, JSON.stringify(createEmptyState(), null, 2));
  }
}

async function withFileLock(stateFilePath, task) {
  const lockFilePath = `${stateFilePath}.lock`;
  const startedAt = Date.now();

  while (true) {
    try {
      const handle = await openFile(lockFilePath, 'wx');
      try {
        return await task();
      } finally {
        await handle.close();
        await unlink(lockFilePath).catch(() => {});
      }
    } catch (error) {
      if (error?.code !== 'EEXIST') {
        throw error;
      }

      if (Date.now() - startedAt >= LOCK_TIMEOUT_MS) {
        throw createTypedError('LOCK_TIMEOUT', `Timed out waiting for pose-studio bridge lock: ${stateFilePath}`);
      }

      await new Promise((resolve) => {
        setTimeout(resolve, LOCK_RETRY_MS);
      });
    }
  }
}

async function readState(stateFilePath) {
  await ensureStateFile(stateFilePath);
  const raw = await readFile(stateFilePath, 'utf8');
  return normalizeState(JSON.parse(raw));
}

async function writeState(stateFilePath, state) {
  state.updatedAt = new Date().toISOString();
  await writeFile(stateFilePath, JSON.stringify(state, null, 2));
}

function createModelsPayload() {
  return BUNDLED_MODELS.map((model) => ({
    id: model.id,
    label: model.label,
    technicalLabel: model.technicalLabel,
    note: model.note,
  }));
}

function buildCatalogForState(state, requestedModelId = '') {
  const modelId =
    BUNDLED_MODELS.find((model) => model.id === requestedModelId)?.id ||
    state.runtime.activeModelId ||
    BUNDLED_MODELS[0]?.id ||
    '';

  const staticCatalog = buildStaticGestureCatalog(modelId);
  const staticCatalogById = new Map(staticCatalog.map((gesture) => [gesture.id, gesture]));

  const runtimeGestures =
    requestedModelId && requestedModelId !== state.runtime.activeModelId
      ? staticCatalog
      : Array.isArray(state.runtime.gestures) && state.runtime.gestures.length
        ? state.runtime.gestures
            .map((gesture) => normalizeGestureCatalogEntry(gesture, staticCatalogById))
            .filter(Boolean)
        : staticCatalog;

  return {
    modelId,
    modelLabel: BUNDLED_MODELS.find((model) => model.id === modelId)?.label || modelId,
    catalogVersion: runtimeGestures.length
      ? buildCatalogVersion(modelId, runtimeGestures)
      : buildCatalogVersion(modelId, staticCatalog),
    gestures: runtimeGestures.length ? runtimeGestures : staticCatalog,
  };
}

export function createPoseStudioBridgeStore({
  stateFilePath = resolveDefaultPoseStudioBridgeStatePath(),
} = {}) {
  async function getState() {
    return withFileLock(stateFilePath, async () => readState(stateFilePath));
  }

  async function syncRuntime({
    modelId = '',
    modelLabel = '',
    availableGestures = [],
  } = {}) {
    return withFileLock(stateFilePath, async () => {
      const state = await readState(stateFilePath);
      const catalog = buildCatalogForState(state, modelId);
      const staticCatalogById = new Map(catalog.gestures.map((gesture) => [gesture.id, gesture]));
      const normalizedGestures = Array.isArray(availableGestures) && availableGestures.length
        ? availableGestures
            .map((gesture) => normalizeGestureCatalogEntry(gesture, staticCatalogById))
            .filter(Boolean)
        : catalog.gestures;

      state.runtime.activeModelId = catalog.modelId;
      state.runtime.activeModelLabel = normalizeString(modelLabel, catalog.modelLabel);
      state.runtime.updatedAt = new Date().toISOString();
      state.runtime.gestures = normalizedGestures;
      state.runtime.catalogVersion = buildCatalogVersion(catalog.modelId, normalizedGestures);
      await writeState(stateFilePath, state);
      return cloneJson(state.runtime);
    });
  }

  async function stageSequence({
    modelId = '',
    prompt = '',
    steps = [],
  } = {}) {
    return withFileLock(stateFilePath, async () => {
      const state = await readState(stateFilePath);
      const catalog = buildCatalogForState(state, modelId);
      const gestureById = new Map(catalog.gestures.map((gesture) => [gesture.id, gesture]));
      const normalizedSteps = Array.isArray(steps)
        ? steps.map((step) => normalizeSequenceStep(step, gestureById))
        : [];

      if (!normalizedSteps.length) {
        throw createTypedError('EMPTY_SEQUENCE', 'Pose sequence requires at least one valid gesture step.');
      }

      const { acceptedSteps, totalDurationMs, trimmed } = trimStepsToDurationLimit(normalizedSteps, MAX_SEQUENCE_DURATION_MS);
      if (!acceptedSteps.length) {
        throw createTypedError('SEQUENCE_TOO_LONG', 'Pose sequence could not fit within the 60 second limit.');
      }

      const now = new Date().toISOString();
      const sequenceId = randomUUID();
      const nextRevision = state.director.revision + 1;
      const sequence = {
        sequenceId,
        revision: nextRevision,
        source: 'mcp',
        prompt: normalizeString(prompt),
        modelId: catalog.modelId,
        modelLabel: catalog.modelLabel,
        totalDurationMs,
        trimmed,
        createdAt: now,
        steps: acceptedSteps,
      };

      state.director.revision = nextRevision;
      state.director.activeSequence = sequence;
      state.director.lastSequence = {
        ...sequence,
        status: 'queued',
      };
      state.director.lastError = null;
      state.director.playback = {
        status: 'queued',
        sequenceId,
        source: 'mcp',
        currentStepIndex: 0,
        currentGestureId: acceptedSteps[0]?.gestureId || '',
        updatedAt: now,
      };
      await writeState(stateFilePath, state);

      return {
        sequenceId,
        revision: nextRevision,
        modelId: catalog.modelId,
        modelLabel: catalog.modelLabel,
        totalDurationMs,
        trimmed,
        steps: acceptedSteps,
      };
    });
  }

  async function updatePlayback({
    sequenceId = '',
    status = 'idle',
    currentStepIndex = -1,
    currentGestureId = '',
  } = {}) {
    return withFileLock(stateFilePath, async () => {
      const state = await readState(stateFilePath);
      const activeSequence = state.director.activeSequence;
      if (!activeSequence || activeSequence.sequenceId !== sequenceId) {
        return cloneJson(state.director.playback);
      }

      const normalizedStatus = normalizePlaybackStatus(status);
      const now = new Date().toISOString();
      state.director.playback = {
        status: normalizedStatus,
        sequenceId,
        source: activeSequence.source || 'mcp',
        currentStepIndex: Number.isFinite(currentStepIndex) ? Number(currentStepIndex) : -1,
        currentGestureId: normalizeString(currentGestureId),
        updatedAt: now,
      };

      state.director.lastSequence = {
        ...(state.director.lastSequence || activeSequence),
        status: normalizedStatus,
        updatedAt: now,
      };

      if (normalizedStatus === 'completed' || normalizedStatus === 'stopped') {
        state.director.activeSequence = null;
        state.director.revision += 1;
        state.director.playback = {
          status: 'idle',
          sequenceId: '',
          source: '',
          currentStepIndex: -1,
          currentGestureId: '',
          updatedAt: now,
        };
      }

      await writeState(stateFilePath, state);
      return cloneJson(state.director.playback);
    });
  }

  async function stopSequence({ sequenceId = '' } = {}) {
    return withFileLock(stateFilePath, async () => {
      const state = await readState(stateFilePath);
      const activeSequence = state.director.activeSequence;
      if (!activeSequence || (sequenceId && activeSequence.sequenceId !== sequenceId)) {
        return cloneJson(state.director.playback);
      }

      const now = new Date().toISOString();
      state.director.lastSequence = {
        ...(state.director.lastSequence || activeSequence),
        status: 'stopped',
        updatedAt: now,
      };
      state.director.activeSequence = null;
      state.director.revision += 1;
      state.director.playback = {
        status: 'idle',
        sequenceId: '',
        source: '',
        currentStepIndex: -1,
        currentGestureId: '',
        updatedAt: now,
      };
      await writeState(stateFilePath, state);
      return cloneJson(state.director.playback);
    });
  }

  async function reportError({
    modelId = '',
    prompt = '',
    message = '',
  } = {}) {
    return withFileLock(stateFilePath, async () => {
      const normalizedMessage = normalizeString(message);
      if (!normalizedMessage) {
        throw createTypedError('EMPTY_ERROR_MESSAGE', 'Pose error report requires a non-empty message.');
      }

      const state = await readState(stateFilePath);
      const catalog = buildCatalogForState(state, modelId);
      const now = new Date().toISOString();
      const nextRevision = state.director.revision + 1;

      state.director.revision = nextRevision;
      state.director.activeSequence = null;
      state.director.lastError = {
        revision: nextRevision,
        source: 'mcp',
        prompt: normalizeString(prompt),
        modelId: catalog.modelId,
        modelLabel: catalog.modelLabel,
        message: normalizedMessage,
        createdAt: now,
      };
      state.director.playback = {
        status: 'idle',
        sequenceId: '',
        source: '',
        currentStepIndex: -1,
        currentGestureId: '',
        updatedAt: now,
      };
      await writeState(stateFilePath, state);

      return cloneJson(state.director.lastError);
    });
  }

  async function getCatalog({ modelId = '' } = {}) {
    return withFileLock(stateFilePath, async () => {
      const state = await readState(stateFilePath);
      const catalog = buildCatalogForState(state, modelId);
      return {
        activeModelId: state.runtime.activeModelId,
        activeModelLabel: state.runtime.activeModelLabel,
        requestedModelId: catalog.modelId,
        catalogVersion: catalog.catalogVersion,
        maxSequenceDurationMs: MAX_SEQUENCE_DURATION_MS,
        models: createModelsPayload(),
        gestures: catalog.gestures,
      };
    });
  }

  return {
    CAPABILITIES_VERSION,
    MAX_SEQUENCE_DURATION_MS,
    stateFilePath,
    getCatalog,
    getState,
    reportError,
    stageSequence,
    stopSequence,
    syncRuntime,
    updatePlayback,
  };
}

export {
  CAPABILITIES_VERSION,
  MAX_SEQUENCE_DURATION_MS,
};
