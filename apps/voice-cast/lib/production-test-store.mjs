import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';

const PROFILE_DIR_NAME = 'profile';
const REPLIES_DIR_NAME = 'replies';
const ACTIVE_PROFILE_FILE_NAME = 'active-profile.json';
const HISTORY_FILE_NAME = 'history.json';

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

async function removeIfExists(filePath) {
  try {
    await rm(filePath, { force: true });
  } catch {}
}

function createProfilePaths(rootDir) {
  const profileDir = path.join(rootDir, PROFILE_DIR_NAME);
  return {
    profileDir,
    activeProfilePath: path.join(profileDir, ACTIVE_PROFILE_FILE_NAME),
    referenceStoredPath: path.join(profileDir, 'reference.wav'),
  };
}

function createHistoryPaths(rootDir) {
  return {
    repliesDir: path.join(rootDir, REPLIES_DIR_NAME),
    historyPath: path.join(rootDir, HISTORY_FILE_NAME),
  };
}

function toStoredHistoryItem(item = {}) {
  return {
    id: item.id,
    createdAt: item.createdAt,
    profileId: item.profileId,
    userTranscript: item.userTranscript,
    replyText: item.replyText,
    generationTimeMs: item.generationTimeMs,
    replyAudioPath: item.replyAudioPath,
    replyAudioMimeType: item.replyAudioMimeType || 'audio/wav',
    pipeline: item.pipeline || 'browser-stt -> melotts -> openvoice-v2',
  };
}

export function createProductionTestStore({ rootDir, maxHistory = 20 } = {}) {
  if (!rootDir) {
    throw new Error('createProductionTestStore requires a rootDir.');
  }

  const profilePaths = createProfilePaths(rootDir);
  const historyPaths = createHistoryPaths(rootDir);

  async function loadProfile() {
    return readJson(profilePaths.activeProfilePath, null);
  }

  async function loadHistory() {
    return readJson(historyPaths.historyPath, []);
  }

  async function loadState() {
    const [profile, history] = await Promise.all([loadProfile(), loadHistory()]);
    return { profile, history };
  }

  async function saveProfile({
    referenceOriginalFileName = '',
    referenceMimeType = 'audio/wav',
    referenceBuffer = null,
    meloBaseSpeakerId = '',
    meloBaseSpeakerLabel = '',
  } = {}) {
    if (!meloBaseSpeakerId) {
      throw new Error('A MeloTTS English base speaker is required.');
    }

    const existingProfile = await loadProfile();
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
        referenceOriginalFileName || existingProfile?.referenceOriginalFileName || 'reference.wav',
      referenceStoredFileName: path.basename(profilePaths.referenceStoredPath),
      referenceStoredPath: profilePaths.referenceStoredPath,
      referenceMimeType: referenceMimeType || existingProfile?.referenceMimeType || 'audio/wav',
      referenceSizeBytes:
        nextReferenceBuffer?.byteLength || existingProfile?.referenceSizeBytes || 0,
      meloBaseSpeakerId,
      meloBaseSpeakerLabel: meloBaseSpeakerLabel || meloBaseSpeakerId,
      createdAt: existingProfile?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await writeFile(profilePaths.activeProfilePath, JSON.stringify(profile, null, 2));
    return profile;
  }

  async function appendTurn({
    userTranscript = '',
    replyText = '',
    generationTimeMs = 0,
    replyAudioBuffer = null,
    replyAudioMimeType = 'audio/wav',
  } = {}) {
    const profile = await loadProfile();
    if (!profile) {
      throw new Error('An active production profile is required.');
    }
    if (!replyAudioBuffer) {
      throw new Error('A reply audio buffer is required.');
    }

    await ensureDir(historyPaths.repliesDir);
    const id = `turn-${randomUUID()}`;
    const replyAudioPath = path.join(historyPaths.repliesDir, `${id}.wav`);
    await writeFile(replyAudioPath, replyAudioBuffer);

    const turn = toStoredHistoryItem({
      id,
      createdAt: new Date().toISOString(),
      profileId: profile.id,
      userTranscript,
      replyText,
      generationTimeMs,
      replyAudioPath,
      replyAudioMimeType,
    });

    const previousHistory = await loadHistory();
    const nextHistory = [turn, ...previousHistory];
    const prunedTurns = nextHistory.slice(maxHistory);
    const keptHistory = nextHistory.slice(0, maxHistory);

    await Promise.all(prunedTurns.map((entry) => removeIfExists(entry.replyAudioPath)));
    await writeFile(historyPaths.historyPath, JSON.stringify(keptHistory, null, 2));

    return {
      turn,
      history: keptHistory,
    };
  }

  async function clearAll() {
    const history = await loadHistory();
    await Promise.all(history.map((entry) => removeIfExists(entry.replyAudioPath)));
    await removeIfExists(historyPaths.historyPath);
    await removeIfExists(profilePaths.activeProfilePath);
    await unlink(profilePaths.referenceStoredPath).catch(() => {});
  }

  return {
    appendTurn,
    clearAll,
    loadHistory,
    loadProfile,
    loadState,
    resolveReplyAudioPath(fileName = '') {
      const safeName = path.basename(`${fileName || ''}`);
      if (!safeName) {
        return null;
      }
      return path.join(historyPaths.repliesDir, safeName);
    },
    saveProfile,
  };
}
