import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

export const DEFAULT_MODE = 'standard';
export const DEFAULT_PROFILE = Object.freeze({
  name: '',
  pronouns: '',
  personality: '',
  interests: '',
  selfPrompt: '',
});
export const DEFAULT_PROJECT_TURN_RANGE = Object.freeze({
  min: 50,
  max: 100,
});

export function normalizeString(value) {
  return `${value || ''}`.trim();
}

export function clampNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function safeSegment(value, fallback = 'default') {
  const cleaned = normalizeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || fallback;
}

export function safeFileExtension(value, fallback = 'txt') {
  const cleaned = normalizeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
  return cleaned || fallback;
}

export function pickTimestamp(now = () => new Date()) {
  return now().toISOString();
}

export async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

export async function readJson(filePath, fallbackValue) {
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallbackValue;
  }
}

export async function writeJson(filePath, payload) {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, JSON.stringify(payload, null, 2));
}

export function normalizeProfile(profile = {}) {
  return {
    name: normalizeString(profile.name),
    pronouns: normalizeString(profile.pronouns),
    personality: normalizeString(profile.personality),
    interests: normalizeString(profile.interests),
    selfPrompt: normalizeString(profile.selfPrompt),
  };
}

export function normalizeSettings(settings = {}) {
  const nextMode = normalizeString(settings.agentMode).toLowerCase();
  return {
    agentMode: nextMode === 'continuity' ? 'continuity' : DEFAULT_MODE,
    selfProfile: normalizeProfile(settings.selfProfile),
  };
}

export function mergeSettings(current = {}, patch = {}) {
  return normalizeSettings({
    agentMode: patch.agentMode ?? current.agentMode,
    selfProfile: {
      ...(current.selfProfile || DEFAULT_PROFILE),
      ...(patch.selfProfile || {}),
    },
  });
}
