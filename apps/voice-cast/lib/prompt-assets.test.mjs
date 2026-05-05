import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile } from 'node:fs/promises';

import { createPromptAssetStore } from './prompt-assets.mjs';

test('savePromptAsset writes a wav file and json sidecar', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'voice-cast-prompt-assets-'));
  const store = createPromptAssetStore({ rootDir });

  const result = await store.savePromptAsset({
    fileNameStem: 'red fairy v1',
    audioBuffer: Buffer.from([1, 2, 3, 4]),
    promptText: 'I found it.',
    characterPrompt: 'young female voice, bright, playful',
    instructText: 'Young female, bright, playful.',
    presetSpeaker: 'English-speaking woman',
    model: 'CosyVoice-300M-Instruct',
    speed: 1,
  });

  assert.match(result.wavPath, /red-fairy-v1\.wav$/);
  assert.match(result.metaPath, /red-fairy-v1\.json$/);

  const wavBuffer = await readFile(result.wavPath);
  assert.deepEqual(wavBuffer, Buffer.from([1, 2, 3, 4]));

  const meta = JSON.parse(await readFile(result.metaPath, 'utf8'));
  assert.equal(meta.promptText, 'I found it.');
  assert.equal(meta.characterPrompt, 'young female voice, bright, playful');
  assert.equal(meta.instructText, 'Young female, bright, playful.');
  assert.equal(meta.presetSpeaker, 'English-speaking woman');
  assert.equal(meta.model, 'CosyVoice-300M-Instruct');
  assert.equal(meta.speed, 1);
  assert.ok(meta.createdAt);
});

test('findAssetMetadataByFileName returns sidecar metadata for a wav name', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'voice-cast-prompt-assets-'));
  const store = createPromptAssetStore({ rootDir });

  await store.savePromptAsset({
    fileNameStem: 'green-fairy-v2',
    audioBuffer: Buffer.from([9, 8, 7]),
    promptText: 'There you are.',
    characterPrompt: 'young female voice, soft, warm',
    instructText: 'Young female, soft, warm.',
    presetSpeaker: 'English-speaking woman',
    model: 'CosyVoice-300M-Instruct',
    speed: 1,
  });

  const found = await store.findAssetMetadataByFileName('green-fairy-v2.wav');
  assert.equal(found.promptText, 'There you are.');
  assert.equal(found.characterPrompt, 'young female voice, soft, warm');

  const missing = await store.findAssetMetadataByFileName('missing.wav');
  assert.equal(missing, null);
});
