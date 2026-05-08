import test from 'node:test';
import assert from 'node:assert/strict';

import { createProductionVoiceLayer } from './browser-layer.mjs';

test('runTextTurn waits for audio playback start before firing hooks and resolves after the audio ends', async () => {
  let startPlayback = null;
  let activeAudio = null;
  let revokedUrl = '';
  const hookOrder = [];

  class FakeAudio {
    constructor(src) {
      this.src = src;
      this.listeners = new Map();
      this.paused = true;
      activeAudio = this;
    }

    addEventListener(type, handler) {
      const handlers = this.listeners.get(type) || [];
      handlers.push(handler);
      this.listeners.set(type, handlers);
    }

    removeEventListener(type, handler) {
      const handlers = this.listeners.get(type) || [];
      this.listeners.set(
        type,
        handlers.filter((entry) => entry !== handler),
      );
    }

    async play() {
      return new Promise((resolve) => {
        startPlayback = () => {
          this.paused = false;
          this.dispatch('playing');
          resolve();
        };
      });
    }

    pause() {
      this.paused = true;
    }

    dispatch(type) {
      for (const handler of this.listeners.get(type) || []) {
        handler();
      }
    }
  }

  const layer = createProductionVoiceLayer({
    synthesizeSpeech: async ({ text }) => ({
      audioBase64: Buffer.from(`audio:${text}`).toString('base64'),
      mimeType: 'audio/wav',
    }),
    AudioImpl: FakeAudio,
    urlApi: {
      createObjectURL() {
        return 'blob:production-voice';
      },
      revokeObjectURL(url) {
        revokedUrl = url;
      },
    },
  });

  const turnPromise = layer.runTextTurn(
    'Hello from production voice.',
    'bridge-action:test',
    {
      onSpeechStart() {
        hookOrder.push('start');
      },
      onSpeechEnd() {
        hookOrder.push('end');
      },
    },
    {
      characterId: 'bhf-1-2',
    },
  );

  while (!startPlayback) {
    await Promise.resolve();
  }
  assert.deepEqual(hookOrder, []);

  startPlayback();
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
  assert.equal(hookOrder.join(','), 'start');
  assert.equal(layer.getSnapshot().speaking, true);

  activeAudio.dispatch('ended');
  await turnPromise;

  assert.equal(hookOrder.join(','), 'start,end');
  assert.equal(layer.getSnapshot().speaking, false);
  assert.equal(revokedUrl, 'blob:production-voice');
});
