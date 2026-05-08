import test from 'node:test';
import assert from 'node:assert/strict';

function createWindowStub(FakeRecognition) {
  return {
    SpeechRecognition: FakeRecognition,
    webkitSpeechRecognition: undefined,
    speechSynthesis: {
      cancel() {},
      getVoices() {
        return [];
      },
    },
    requestAnimationFrame() {
      return 1;
    },
    cancelAnimationFrame() {},
    setTimeout,
    clearTimeout,
  };
}

async function loadCreateVoiceLayer() {
  const mod = await import(`./index.js?test=${Date.now()}-${Math.random()}`);
  return mod.createVoiceLayer;
}

test('voice layer auto-restarts recognition when the browser ends an idle listening session', async () => {
  class FakeRecognition {
    static instances = [];

    constructor() {
      this.startCount = 0;
      FakeRecognition.instances.push(this);
    }

    start() {
      this.startCount += 1;
      this.onstart?.();
    }

    stop() {
      this.onend?.();
    }
  }

  globalThis.window = createWindowStub(FakeRecognition);
  const createVoiceLayer = await loadCreateVoiceLayer();
  const voiceLayer = createVoiceLayer({
    autoRestart: true,
  });

  await voiceLayer.startListening({ restart: true });
  const recognition = FakeRecognition.instances[0];
  recognition.onend?.();
  await new Promise((resolve) => setTimeout(resolve, 220));

  assert.equal(recognition.startCount, 2);
  assert.equal(voiceLayer.getSnapshot().listening, true);
});

test('voice layer does not auto-restart after microphone permission is denied', async () => {
  class FakeRecognition {
    static instances = [];

    constructor() {
      this.startCount = 0;
      FakeRecognition.instances.push(this);
    }

    start() {
      this.startCount += 1;
      this.onstart?.();
    }

    stop() {
      this.onend?.();
    }
  }

  globalThis.window = createWindowStub(FakeRecognition);
  const createVoiceLayer = await loadCreateVoiceLayer();
  const voiceLayer = createVoiceLayer({
    autoRestart: true,
  });

  await voiceLayer.startListening({ restart: true });
  const recognition = FakeRecognition.instances[0];
  recognition.onerror?.({ error: 'not-allowed' });
  recognition.onend?.();
  await new Promise((resolve) => setTimeout(resolve, 220));

  assert.equal(recognition.startCount, 1);
  assert.equal(voiceLayer.getSnapshot().status, 'microphone permission denied');
});
