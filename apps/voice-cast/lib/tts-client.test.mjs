import test from 'node:test';
import assert from 'node:assert/strict';

import { createTtsClient } from './tts-client.mjs';

test('listTextOnlySpeakers normalizes string and object responses', async () => {
  const fetchCalls = [];
  const client = createTtsClient({
    textOnlyBaseUrl: 'http://text-only.local',
    productionBaseUrl: 'http://production.local',
    fetchImpl: async (url) => {
      fetchCalls.push(url);
      return new Response(JSON.stringify({
        speakers: [
          '中文女',
          { id: 'english_female', label: 'English-speaking woman' },
          { name: '中文男' },
        ],
      }), {
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    },
  });

  const speakers = await client.listTextOnlySpeakers();
  assert.deepEqual(speakers, ['中文女', 'English-speaking woman', '中文男']);
  assert.equal(fetchCalls[0], 'http://text-only.local/speakers');
});

test('generateTextOnly normalizes a json audioBase64 response', async () => {
  const client = createTtsClient({
    textOnlyBaseUrl: 'http://text-only.local',
    productionBaseUrl: 'http://production.local',
    fetchImpl: async () =>
      new Response(JSON.stringify({
        audioBase64: 'UklGRg==',
        mimeType: 'audio/wav',
        timing: { durationMs: 812 },
        meta: {
          model: 'CosyVoice-300M-Instruct',
          spokenText: 'I found it.',
          voiceDirection: 'young female voice',
        },
      }), {
        headers: { 'content-type': 'application/json' },
      }),
  });

  const result = await client.generateTextOnly({
    model: 'CosyVoice-300M-Instruct',
    presetSpeaker: 'English-speaking woman',
    speed: 1,
    characterPrompt: 'young female voice',
    instructText: 'young female voice',
    promptText: 'I found it.',
  });

  assert.equal(result.audioBase64, 'UklGRg==');
  assert.equal(result.mimeType, 'audio/wav');
  assert.equal(result.timing.durationMs, 812);
  assert.equal(result.meta.model, 'CosyVoice-300M-Instruct');
  assert.equal(result.meta.spokenText, 'I found it.');
  assert.equal(result.meta.voiceDirection, 'young female voice');
});

test('listProductionSpeakers normalizes string and object responses', async () => {
  const fetchCalls = [];
  const client = createTtsClient({
    textOnlyBaseUrl: 'http://text-only.local',
    productionBaseUrl: 'http://production.local',
    fetchImpl: async (url) => {
      fetchCalls.push(url);
      return new Response(JSON.stringify({
        speakers: [
          'EN-Default',
          { id: 'EN-US', label: 'EN-US' },
          { name: 'EN-BR' },
        ],
      }), {
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    },
  });

  const speakers = await client.listProductionSpeakers();
  assert.deepEqual(speakers, ['EN-Default', 'EN-US', 'EN-BR']);
  assert.equal(fetchCalls[0], 'http://production.local/speakers');
});

test('generateProductionTurn normalizes a raw audio response', async () => {
  const client = createTtsClient({
    textOnlyBaseUrl: 'http://text-only.local',
    productionBaseUrl: 'http://production.local',
    fetchImpl: async () =>
      new Response(Uint8Array.from([82, 73, 70, 70]), {
        headers: { 'content-type': 'audio/wav' },
      }),
  });

  const result = await client.generateProductionTurn({
    replyText: 'There you are.',
    meloBaseSpeakerId: 'EN-US',
    referenceWavPath: '/tmp/reference.wav',
  });

  assert.equal(result.mimeType, 'audio/wav');
  assert.equal(result.audioBase64, Buffer.from([82, 73, 70, 70]).toString('base64'));
});

test('client raises a clear error when a backend base url is missing', async () => {
  const client = createTtsClient({
    textOnlyBaseUrl: '',
    productionBaseUrl: '',
    fetchImpl: async () => {
      throw new Error('should not be called');
    },
  });

  await assert.rejects(
    client.listTextOnlySpeakers(),
    /VOICE_CAST_TEXT_ONLY_BASE_URL/,
  );

  await assert.rejects(
    client.generateProductionTurn({
      replyText: 'hello',
      meloBaseSpeakerId: 'EN-US',
      referenceWavPath: '/tmp/reference.wav',
    }),
    /VOICE_CAST_PRODUCTION_BASE_URL/,
  );
});
