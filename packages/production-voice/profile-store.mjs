import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';

const PROFILE_DIR_NAME = 'profile';
const ACTIVE_PROFILE_FILE_NAME = 'active-profile.json';
const REFERENCE_FILE_NAME = 'reference.wav';
const SCOPES_DIR_NAME = 'scopes';

async function readJson(filePath, fallbackValue) {
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallbackValue;
  }
}

async function ensureDir(filePath) {
  await mkdir(filePath, { recursive: true });
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function normalizeScopeKey(scopeKey = '') {
  return `${scopeKey || ''}`
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function createProfilePaths(rootDir, scopeKey = '') {
  const normalizedScopeKey = normalizeScopeKey(scopeKey);
  const profileRoot = normalizedScopeKey
    ? path.join(rootDir, SCOPES_DIR_NAME, normalizedScopeKey)
    : rootDir;
  const profileDir = path.join(profileRoot, PROFILE_DIR_NAME);
  return {
    profileDir,
    activeProfilePath: path.join(profileDir, ACTIVE_PROFILE_FILE_NAME),
    referenceStoredPath: path.join(profileDir, REFERENCE_FILE_NAME),
  };
}

function toPublicProfile(profile) {
  if (!profile) {
    return null;
  }

  return {
    id: profile.id,
    referenceOriginalFileName: profile.referenceOriginalFileName,
    referenceStoredFileName: profile.referenceStoredFileName,
    referenceMimeType: profile.referenceMimeType || 'audio/wav',
    referenceSizeBytes: profile.referenceSizeBytes || 0,
    meloBaseSpeakerId: profile.meloBaseSpeakerId,
    meloBaseSpeakerLabel: profile.meloBaseSpeakerLabel || profile.meloBaseSpeakerId,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

export function createProductionVoiceProfileStore({ rootDir } = {}) {
  if (!rootDir) {
    throw new Error('createProductionVoiceProfileStore requires a rootDir.');
  }

  function getProfilePaths(scopeKey = '') {
    return createProfilePaths(rootDir, scopeKey);
  }

  async function loadProfile({ scopeKey = '' } = {}) {
    const profilePaths = getProfilePaths(scopeKey);
    return readJson(profilePaths.activeProfilePath, null);
  }

  async function getProfileSummary({ scopeKey = '' } = {}) {
    const profilePaths = getProfilePaths(scopeKey);
    const profile = await loadProfile({ scopeKey });
    if (!profile) {
      return null;
    }

    return {
      ...toPublicProfile(profile),
      referenceAvailable: await fileExists(profile.referenceStoredPath),
    };
  }

  async function saveProfile({
    scopeKey = '',
    referenceOriginalFileName = '',
    referenceMimeType = 'audio/wav',
    referenceBuffer = null,
    meloBaseSpeakerId = '',
    meloBaseSpeakerLabel = '',
  } = {}) {
    const profilePaths = getProfilePaths(scopeKey);
    const speakerId = `${meloBaseSpeakerId || ''}`.trim();
    if (!speakerId) {
      throw new Error('A MeloTTS base speaker is required.');
    }

    const existingProfile = await loadProfile({ scopeKey });
    const nextReferenceBuffer = referenceBuffer || null;
    if (!existingProfile && !nextReferenceBuffer) {
      throw new Error('A reference WAV is required to create the active profile.');
    }

    await ensureDir(profilePaths.profileDir);
    if (nextReferenceBuffer) {
      await writeFile(profilePaths.referenceStoredPath, nextReferenceBuffer);
    }

    const profile = {
      id: existingProfile?.id || `profile-${randomUUID()}`,
      referenceOriginalFileName:
        referenceOriginalFileName || existingProfile?.referenceOriginalFileName || REFERENCE_FILE_NAME,
      referenceStoredFileName: path.basename(profilePaths.referenceStoredPath),
      referenceStoredPath: profilePaths.referenceStoredPath,
      referenceMimeType: referenceMimeType || existingProfile?.referenceMimeType || 'audio/wav',
      referenceSizeBytes:
        nextReferenceBuffer?.byteLength || existingProfile?.referenceSizeBytes || 0,
      meloBaseSpeakerId: speakerId,
      meloBaseSpeakerLabel: `${meloBaseSpeakerLabel || speakerId}`.trim() || speakerId,
      createdAt: existingProfile?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await writeFile(profilePaths.activeProfilePath, JSON.stringify(profile, null, 2));
    return profile;
  }

  async function clearProfile() {
    const profilePaths = getProfilePaths();
    await rm(profilePaths.activeProfilePath, { force: true });
    await rm(profilePaths.referenceStoredPath, { force: true });
  }

  return {
    clearProfile,
    getProfileSummary,
    loadProfile,
    saveProfile,
  };
}
