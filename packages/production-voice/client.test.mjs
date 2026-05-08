import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createProductionVoiceClient,
  createProductionVoicePlaybackArtifact,
} from './client.mjs';

test('production voice health check hits the backend health endpoint', async () => {
  const fetchCalls = [];
  const client = createProductionVoiceClient({
    baseUrl: 'http://production.local',
    fetchImpl: async (url) => {
      fetchCalls.push(url);
      return new Response(JSON.stringify({ ok: true, app: 'production-voice' }), {
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    },
  });

  const health = await client.checkHealth();

  assert.equal(health.app, 'production-voice');
  assert.deepEqual(fetchCalls, ['http://production.local/healthz']);
});

test('listSpeakers normalizes string and object responses', async () => {
  const client = createProductionVoiceClient({
    baseUrl: 'http://production.local',
    fetchImpl: async () => new Response(JSON.stringify({
      speakers: [
        'EN-Default',
        { id: 'EN-US', label: 'EN-US' },
        { name: 'EN-BR' },
      ],
    }), {
      headers: { 'content-type': 'application/json; charset=utf-8' },
    }),
  });

  const speakers = await client.listSpeakers();
  assert.deepEqual(speakers, ['EN-Default', 'EN-US', 'EN-BR']);
});

test('synthesize sends text plus setup and normalizes a raw audio response', async () => {
  let capturedBody = null;
  const client = createProductionVoiceClient({
    baseUrl: 'http://production.local',
    fetchImpl: async (_url, init) => {
      capturedBody = JSON.parse(init.body);
      return new Response(Uint8Array.from([82, 73, 70, 70]), {
        headers: { 'content-type': 'audio/wav' },
      });
    },
  });

  const result = await client.synthesize({
    text: 'There you are.',
    setup: {
      meloBaseSpeakerId: 'EN-US',
      referenceWavPath: '/tmp/reference.wav',
    },
  });

  assert.deepEqual(capturedBody, {
    replyText: 'There you are.',
    meloBaseSpeakerId: 'EN-US',
    referenceWavPath: '/tmp/reference.wav',
  });
  assert.equal(result.mimeType, 'audio/wav');
  assert.equal(result.audioBase64, Buffer.from([82, 73, 70, 70]).toString('base64'));
});

test('createProductionVoicePlaybackArtifact returns a blob and object url', () => {
  const fakeUrlApi = {
    createObjectURL(blob) {
      assert.equal(blob.type, 'audio/wav');
      return 'blob:voice-cast-test';
    },
  };

  const artifact = createProductionVoicePlaybackArtifact({
    audioBase64: Buffer.from([82, 73, 70, 70]).toString('base64'),
    mimeType: 'audio/wav',
  }, {
    urlApi: fakeUrlApi,
  });

  assert.equal(artifact.objectUrl, 'blob:voice-cast-test');
  assert.equal(artifact.blob.type, 'audio/wav');
});

test('client raises a clear error when the backend base url is missing', async () => {
  const client = createProductionVoiceClient({
    baseUrl: '',
    fetchImpl: async () => {
      throw new Error('should not be called');
    },
  });

  await assert.rejects(
    client.synthesize({
      text: 'hello',
      setup: {
        meloBaseSpeakerId: 'EN-US',
        referenceWavPath: '/tmp/reference.wav',
      },
    }),
    /VOICE_CAST_PRODUCTION_BASE_URL/,
  );
});
