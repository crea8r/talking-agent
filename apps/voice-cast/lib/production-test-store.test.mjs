import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, access } from 'node:fs/promises';

import { createProductionTestStore } from './production-test-store.mjs';

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

test('production test store loads empty state before any profile is saved', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'voice-cast-production-store-'));
  const store = createProductionTestStore({ rootDir });

  const state = await store.loadState();
  assert.equal(state.profile, null);
  assert.deepEqual(state.history, []);
});

test('production test store copies the uploaded reference wav and saves active profile metadata', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'voice-cast-production-store-'));
  const store = createProductionTestStore({ rootDir });

  const profile = await store.saveProfile({
    referenceOriginalFileName: 'reference.wav',
    referenceMimeType: 'audio/wav',
    referenceBuffer: Buffer.from([1, 2, 3, 4]),
    meloBaseSpeakerId: 'EN-US',
    meloBaseSpeakerLabel: 'EN-US',
  });

  assert.equal(profile.meloBaseSpeakerId, 'EN-US');
  assert.equal(profile.referenceOriginalFileName, 'reference.wav');
  assert.equal(await pathExists(profile.referenceStoredPath), true);

  const reloaded = await store.loadProfile();
  assert.equal(reloaded.referenceStoredPath, profile.referenceStoredPath);
  assert.equal(reloaded.meloBaseSpeakerId, 'EN-US');
});

test('production test store appends turns, persists replay files, and prunes beyond 20 items', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'voice-cast-production-store-'));
  const store = createProductionTestStore({ rootDir, maxHistory: 20 });

  await store.saveProfile({
    referenceOriginalFileName: 'reference.wav',
    referenceMimeType: 'audio/wav',
    referenceBuffer: Buffer.from([1, 2, 3, 4]),
    meloBaseSpeakerId: 'EN-US',
    meloBaseSpeakerLabel: 'EN-US',
  });

  const firstTurn = await store.appendTurn({
    userTranscript: 'turn 0',
    replyText: 'reply 0',
    generationTimeMs: 101,
    replyAudioBuffer: Buffer.from([82, 73, 70, 70]),
    replyAudioMimeType: 'audio/wav',
  });

  assert.equal(firstTurn.turn.userTranscript, 'turn 0');
  assert.equal(await pathExists(firstTurn.turn.replyAudioPath), true);

  for (let index = 1; index <= 20; index += 1) {
    await store.appendTurn({
      userTranscript: `turn ${index}`,
      replyText: `reply ${index}`,
      generationTimeMs: 100 + index,
      replyAudioBuffer: Buffer.from([82, 73, 70, 70, index]),
      replyAudioMimeType: 'audio/wav',
    });
  }

  const history = await store.loadHistory();
  assert.equal(history.length, 20);
  assert.equal(history[0].userTranscript, 'turn 20');
  assert.equal(history.at(-1).userTranscript, 'turn 1');
  assert.equal(await pathExists(firstTurn.turn.replyAudioPath), false);
});
