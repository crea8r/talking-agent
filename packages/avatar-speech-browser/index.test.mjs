import test from 'node:test';
import assert from 'node:assert/strict';

import { createAvatarSpeechController } from './index.js';

test('voice playback waits for the real speech start before animating the avatar', async () => {
  let nowMs = 0;
  const scheduledFrames = [];
  const avatarCalls = [];
  let speechHooks = null;
  let resolveSpeech = null;

  globalThis.performance = {
    now() {
      return nowMs;
    },
  };

  globalThis.requestAnimationFrame = (callback) => {
    scheduledFrames.push(callback);
    return scheduledFrames.length;
  };

  globalThis.cancelAnimationFrame = () => {};

  const voiceLayer = {
    cancelSpeech() {},
    updateConfig() {},
    async runTextTurn(text, source, hooks) {
      speechHooks = hooks;
      await new Promise((resolve) => {
        resolveSpeech = resolve;
      });
      return { text, source };
    },
  };

  const avatarLayer = {
    setSpeaking(active) {
      avatarCalls.push({ type: 'speaking', active });
    },
    setMouthCue(mouth) {
      avatarCalls.push({ type: 'mouth', mouth });
    },
  };

  const controller = createAvatarSpeechController({
    avatarLayer,
    voiceLayer,
  });

  const speakPromise = controller.speakText('Hello there.', {
    withVoice: true,
    source: 'test',
  });

  await Promise.resolve();

  assert.equal(typeof speechHooks?.onSpeechStart, 'function');
  assert.equal(
    avatarCalls.some((call) => call.type === 'speaking' && call.active === true),
    false,
  );

  speechHooks.onSpeechStart();
  nowMs += 16;

  assert.equal(
    avatarCalls.some((call) => call.type === 'speaking' && call.active === true),
    true,
  );

  speechHooks.onSpeechEnd();
  resolveSpeech();
  await speakPromise;
});
