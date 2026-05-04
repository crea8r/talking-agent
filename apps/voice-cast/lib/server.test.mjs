import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';

import { createPromptAssetStore } from './prompt-assets.mjs';
import { createProductionTestStore } from './production-test-store.mjs';
import { createVoiceCastRequestHandler } from './server.mjs';

async function createTestHarness(overrides = {}) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'voice-cast-server-'));
  const srcDir = path.join(tempDir, 'src');
  await mkdir(path.join(srcDir, 'lib'), { recursive: true });
  await writeFile(path.join(srcDir, 'index.html'), '<!doctype html><html><body>voice cast</body></html>');
  await writeFile(path.join(srcDir, 'app.js'), 'console.log("voice cast");');
  await writeFile(path.join(srcDir, 'styles.css'), 'body { color: white; }');
  await writeFile(path.join(srcDir, 'lib', 'noop.js'), 'export default null;');

  const promptAssetRoot = path.join(tempDir, 'prompt-assets');
  const promptAssetStore = createPromptAssetStore({ rootDir: promptAssetRoot });
  const productionTestRoot = path.join(tempDir, 'production-test');
  const productionTestStore = createProductionTestStore({ rootDir: productionTestRoot });
  const calls = [];
  const ttsClient = {
    async listTextOnlySpeakers() {
      calls.push({ method: 'listTextOnlySpeakers' });
      return ['English-speaking woman', '中文女'];
    },
    async generateTextOnly(payload) {
      calls.push({ method: 'generateTextOnly', payload });
      return {
        audioBase64: 'UklGRg==',
        mimeType: 'audio/wav',
        timing: { durationMs: 111 },
        meta: {
          model: payload.model,
          spokenText: payload.promptText,
          voiceDirection: payload.instructText,
        },
      };
    },
    async listProductionSpeakers() {
      calls.push({ method: 'listProductionSpeakers' });
      return ['EN-Default', 'EN-US', 'EN-BR'];
    },
    async generateProductionTurn(payload) {
      calls.push({ method: 'generateProductionTurn', payload });
      return {
        audioBase64: Buffer.from([82, 73, 70, 70]).toString('base64'),
        mimeType: 'audio/wav',
        timing: { durationMs: 222 },
        meta: { baseSpeakerId: payload.meloBaseSpeakerId },
      };
    },
  };

  const handleRequest = createVoiceCastRequestHandler({
    srcDir,
    promptAssetStore,
    productionTestStore,
    ttsClient,
    pickProductionReply: overrides.pickProductionReply || (() => 'Fixed production reply.'),
    sleepImpl: overrides.sleepImpl || (() => Promise.resolve()),
    ...overrides,
  });

  return {
    calls,
    handleRequest,
    promptAssetStore,
    productionTestStore,
  };
}

test('runtime config and speaker routes return normalized data', async (t) => {
  const harness = await createTestHarness();

  const runtimeResponse = await harness.handleRequest(new Request('http://voice-cast.local/api/runtime-config'));
  const runtimePayload = await runtimeResponse.json();
  assert.equal(runtimePayload.appName, 'Voice Cast');
  assert.equal(runtimePayload.tabs.length, 2);

  const speakersResponse = await harness.handleRequest(new Request('http://voice-cast.local/api/casting/speakers'));
  const speakersPayload = await speakersResponse.json();
  assert.deepEqual(speakersPayload.speakers, ['English-speaking woman', '中文女']);
  assert.equal(harness.calls[0].method, 'listTextOnlySpeakers');
});

test('prompt asset save endpoint writes the wav and sidecar', async (t) => {
  const harness = await createTestHarness();

  const response = await harness.handleRequest(new Request('http://voice-cast.local/api/prompt-assets/save', {
    method: 'POST',
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      fileNameStem: 'red-fairy-v1',
      audioBase64: Buffer.from([1, 2, 3]).toString('base64'),
      promptText: 'I found it.',
      characterPrompt: 'young female voice, bright, playful',
      instructText: 'Young female, bright, playful.',
      presetSpeaker: 'English-speaking woman',
      model: 'CosyVoice-300M-Instruct',
      speed: 1,
    }),
  }));

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.match(payload.wavPath, /red-fairy-v1\.wav$/);
  assert.match(payload.metaPath, /red-fairy-v1\.json$/);
});

test('production test state returns speakers plus empty profile and history before setup', async () => {
  const harness = await createTestHarness();

  const response = await harness.handleRequest(new Request('http://voice-cast.local/api/production-test/state'));

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload.profile, null);
  assert.deepEqual(payload.history, []);
  assert.deepEqual(payload.speakers, ['EN-Default', 'EN-US', 'EN-BR']);
});

test('production test profile route stores the copied wav and speaker choice', async () => {
  const harness = await createTestHarness();

  const formData = new FormData();
  formData.set('meloBaseSpeakerId', 'EN-US');
  formData.set('meloBaseSpeakerLabel', 'EN-US');
  formData.set(
    'referenceWav',
    new File([Uint8Array.from([1, 2, 3])], 'reference.wav', { type: 'audio/wav' }),
  );

  const response = await harness.handleRequest(new Request('http://voice-cast.local/api/production-test/profile', {
    method: 'POST',
    body: formData,
  }));

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.profile.meloBaseSpeakerId, 'EN-US');
  assert.match(payload.profile.referenceStoredPath, /reference\.wav$/);
});

test('production test turn route uses the active profile, persists history, and serves replay audio', async () => {
  const harness = await createTestHarness();

  const setupFormData = new FormData();
  setupFormData.set('meloBaseSpeakerId', 'EN-BR');
  setupFormData.set('meloBaseSpeakerLabel', 'EN-BR');
  setupFormData.set(
    'referenceWav',
    new File([Uint8Array.from([1, 2, 3])], 'reference.wav', { type: 'audio/wav' }),
  );

  await harness.handleRequest(new Request('http://voice-cast.local/api/production-test/profile', {
    method: 'POST',
    body: setupFormData,
  }));

  const response = await harness.handleRequest(new Request('http://voice-cast.local/api/production-test/turn', {
    method: 'POST',
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      transcript: 'hello there',
    }),
  }));

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.turn.userTranscript, 'hello there');
  assert.equal(payload.turn.replyText, 'Fixed production reply.');
  assert.equal(payload.history.length, 1);
  assert.match(payload.turn.replyAudioUrl, /\/api\/production-test\/replies\//);

  const productionCall = harness.calls.find((entry) => entry.method === 'generateProductionTurn');
  assert.equal(productionCall.payload.replyText, 'Fixed production reply.');
  assert.equal(productionCall.payload.meloBaseSpeakerId, 'EN-BR');
  assert.match(productionCall.payload.referenceWavPath, /reference\.wav$/);

  const replayResponse = await harness.handleRequest(new Request(`http://voice-cast.local${payload.turn.replyAudioUrl}`));
  assert.equal(replayResponse.status, 200);
  assert.equal(replayResponse.headers.get('content-type'), 'audio/wav');
});
