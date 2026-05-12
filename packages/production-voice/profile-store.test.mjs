import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';

import { createProductionVoiceProfileStore } from './profile-store.mjs';

test('saveProfile persists the active reference wav and speaker metadata', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'production-voice-profile-'));
  const store = createProductionVoiceProfileStore({ rootDir });

  const saved = await store.saveProfile({
    referenceOriginalFileName: 'reference.wav',
    referenceMimeType: 'audio/wav',
    referenceBuffer: Buffer.from([1, 2, 3, 4]),
    meloBaseSpeakerId: 'EN-US',
    meloBaseSpeakerLabel: 'EN-US',
  });

  const summary = await store.getProfileSummary();

  assert.equal(saved.referenceOriginalFileName, 'reference.wav');
  assert.equal(saved.meloBaseSpeakerId, 'EN-US');
  assert.match(saved.referenceStoredPath, /reference\.wav$/);
  assert.equal(summary.referenceStoredFileName, 'reference.wav');
  assert.equal(summary.referenceAvailable, true);
});

test('clearProfile removes the persisted sample and active metadata', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'production-voice-profile-'));
  const store = createProductionVoiceProfileStore({ rootDir });

  await store.saveProfile({
    referenceOriginalFileName: 'reference.wav',
    referenceMimeType: 'audio/wav',
    referenceBuffer: Buffer.from([1, 2, 3, 4]),
    meloBaseSpeakerId: 'EN-US',
    meloBaseSpeakerLabel: 'EN-US',
  });

  await store.clearProfile();

  assert.equal(await store.loadProfile(), null);
  assert.equal(await store.getProfileSummary(), null);
});

test('profile store keeps separate active samples per workspace scope', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'production-voice-profile-'));
  const store = createProductionVoiceProfileStore({ rootDir });

  await store.saveProfile({
    scopeKey: 'workspace-alpha',
    referenceOriginalFileName: 'alpha.wav',
    referenceMimeType: 'audio/wav',
    referenceBuffer: Buffer.from([1, 2, 3, 4]),
    meloBaseSpeakerId: 'EN-US',
    meloBaseSpeakerLabel: 'EN-US',
  });

  await store.saveProfile({
    scopeKey: 'workspace-beta',
    referenceOriginalFileName: 'beta.wav',
    referenceMimeType: 'audio/wav',
    referenceBuffer: Buffer.from([5, 6, 7, 8]),
    meloBaseSpeakerId: 'EN-US',
    meloBaseSpeakerLabel: 'EN-US',
  });

  const alpha = await store.getProfileSummary({ scopeKey: 'workspace-alpha' });
  const beta = await store.getProfileSummary({ scopeKey: 'workspace-beta' });

  assert.equal(alpha.referenceOriginalFileName, 'alpha.wav');
  assert.equal(beta.referenceOriginalFileName, 'beta.wav');
  assert.notEqual(alpha.id, beta.id);
});

test('profile store falls back to the default profile for new scopes', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'production-voice-profile-'));
  const store = createProductionVoiceProfileStore({ rootDir });

  await store.saveProfile({
    referenceOriginalFileName: 'default.wav',
    referenceMimeType: 'audio/wav',
    referenceBuffer: Buffer.from([1, 2, 3, 4]),
    meloBaseSpeakerId: 'EN-US',
    meloBaseSpeakerLabel: 'EN-US',
  });

  const summary = await store.getProfileSummary({ scopeKey: 'brand-new-workspace' });

  assert.equal(summary.referenceOriginalFileName, 'default.wav');
  assert.equal(summary.referenceAvailable, true);
});
