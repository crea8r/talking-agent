import test from 'node:test';
import assert from 'node:assert/strict';

import { bindAppEvents } from './events.js';
import { createVoiceCastState } from './store.js';

class FakeElement extends EventTarget {
  constructor({ value = '', checked = false, files = [] } = {}) {
    super();
    this.value = value;
    this.checked = checked;
    this.files = files;
    this.disabled = false;
    this.hidden = false;
    this.textContent = '';
    this.innerHTML = '';
    this.dataset = {};
  }

  setAttribute(name, value) {
    this[name] = value;
  }

  removeAttribute(name) {
    delete this[name];
  }
}

class FakeRecognition {
  constructor() {
    this.onstart = null;
    this.onresult = null;
    this.onspeechend = null;
    this.onerror = null;
    this.onend = null;
    this.started = false;
    this.stopped = false;
  }

  start() {
    this.started = true;
    this.onstart?.();
  }

  stop() {
    this.stopped = true;
  }

  emitResult(transcript) {
    this.onresult?.({
      resultIndex: 0,
      results: [
        {
          0: { transcript },
          isFinal: true,
          length: 1,
        },
      ],
    });
  }

  emitSpeechEnd() {
    this.onspeechend?.();
  }

  emitEnd() {
    this.onend?.();
  }
}

function flush() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function createDom() {
  return {
    castingTabButton: new FakeElement(),
    productionTabButton: new FakeElement(),
    castingPresetSpeaker: new FakeElement({ value: 'English-speaking woman' }),
    castingSpeed: new FakeElement({ value: '1.0' }),
    castingInstructText: new FakeElement({ value: 'Speak brightly, warmly, and playfully.' }),
    promptText: new FakeElement({ value: 'I found it.' }),
    refreshCastingLine: new FakeElement(),
    generateCasting: new FakeElement(),
    savePromptAsset: new FakeElement(),
    productionSetupToggle: new FakeElement(),
    productionReferenceWavInput: new FakeElement({
      files: [new File([Uint8Array.from([1, 2, 3])], 'reference.wav', { type: 'audio/wav' })],
    }),
    productionBaseSpeaker: new FakeElement({ value: 'EN-US' }),
    saveProductionProfile: new FakeElement(),
    startListening: new FakeElement(),
    replayLatestReply: new FakeElement(),
    productionHistoryList: new FakeElement(),
    productionLatestAudio: new FakeElement(),
  };
}

test('bindAppEvents switches tabs and toggles the production setup section', () => {
  const dom = createDom();
  const state = createVoiceCastState();
  let renderCount = 0;

  bindAppEvents({
    dom,
    state,
    httpClient: {},
    renderApp() {
      renderCount += 1;
    },
  });

  dom.productionTabButton.dispatchEvent(new Event('click'));
  assert.equal(state.activeTab, 'production');

  dom.productionSetupToggle.dispatchEvent(new Event('click'));
  assert.equal(state.production.setupOpen, false);
  assert.equal(renderCount >= 2, true);
});

test('save production profile posts the selected wav and melo speaker then updates local state', async () => {
  const dom = createDom();
  const state = createVoiceCastState();
  let receivedFormData = null;

  bindAppEvents({
    dom,
    state,
    httpClient: {
      async saveProductionProfile(formData) {
        receivedFormData = formData;
        return {
          profile: {
            referenceOriginalFileName: 'reference.wav',
            referenceStoredPath: '/tmp/reference.wav',
            meloBaseSpeakerId: 'EN-US',
          },
        };
      },
    },
    renderApp() {},
  });

  dom.saveProductionProfile.dispatchEvent(new Event('click'));
  await flush();

  assert.ok(receivedFormData instanceof FormData);
  assert.equal(receivedFormData.get('meloBaseSpeakerId'), 'EN-US');
  assert.equal(receivedFormData.get('referenceWav').name, 'reference.wav');
  assert.equal(state.production.profile.meloBaseSpeakerId, 'EN-US');
  assert.equal(state.production.setupOpen, false);
});

test('start listening reports an error when browser speech recognition is unavailable', () => {
  const dom = createDom();
  const state = createVoiceCastState();
  state.production.profile = {
    referenceOriginalFileName: 'reference.wav',
    meloBaseSpeakerId: 'EN-US',
  };

  bindAppEvents({
    dom,
    state,
    httpClient: {},
    renderApp() {},
    createSpeechRecognition() {
      return null;
    },
  });

  dom.startListening.dispatchEvent(new Event('click'));
  assert.match(state.production.error, /speech recognition/i);
  assert.equal(state.production.listening, false);
});

test('speech recognition result submits a production turn and stores the latest reply', async () => {
  const dom = createDom();
  const state = createVoiceCastState();
  state.production.profile = {
    referenceOriginalFileName: 'reference.wav',
    referenceStoredPath: '/tmp/reference.wav',
    meloBaseSpeakerId: 'EN-US',
  };
  const recognition = new FakeRecognition();
  let playedUrl = '';

  bindAppEvents({
    dom,
    state,
    httpClient: {
      async submitProductionTurn(payload) {
        return {
          turn: {
            userTranscript: payload.transcript,
            replyText: 'Fixed production reply.',
            generationTimeMs: 1175,
            replyAudioUrl: '/api/production-test/replies/turn-1.wav',
          },
          history: [
            {
              userTranscript: payload.transcript,
              replyText: 'Fixed production reply.',
              generationTimeMs: 1175,
              replyAudioUrl: '/api/production-test/replies/turn-1.wav',
            },
          ],
        };
      },
    },
    renderApp() {},
    createSpeechRecognition() {
      return recognition;
    },
    playAudioUrl(_, url) {
      playedUrl = url;
      return Promise.resolve();
    },
  });

  dom.startListening.dispatchEvent(new Event('click'));
  recognition.emitResult('hello there');
  recognition.emitSpeechEnd();
  recognition.emitEnd();
  await flush();

  assert.equal(state.production.transcript, 'hello there');
  assert.equal(state.production.latestTurn.replyText, 'Fixed production reply.');
  assert.equal(state.production.history.length, 1);
  assert.equal(playedUrl, '/api/production-test/replies/turn-1.wav');
});
