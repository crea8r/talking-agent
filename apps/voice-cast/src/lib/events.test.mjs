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

class FakeAudioElement extends FakeElement {
  constructor() {
    super();
    this.src = '';
    this.autoplay = false;
    this.preload = '';
    this.muted = false;
    this.currentTime = 0;
    this.playCount = 0;
    this.pauseCount = 0;
    this.loadCount = 0;
  }

  play() {
    this.playCount += 1;
    return Promise.resolve();
  }

  pause() {
    this.pauseCount += 1;
  }

  load() {
    this.loadCount += 1;
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
    productionLatestAudio: new FakeAudioElement(),
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
  assert.equal(state.production.listenerEnabled, false);
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
      return Promise.resolve(true);
    },
  });

  dom.startListening.dispatchEvent(new Event('click'));
  recognition.emitResult('hello there');
  recognition.emitSpeechEnd();
  recognition.emitEnd();
  await flush();

  assert.equal(state.production.transcript, 'hello there');
  assert.equal(state.production.listenerEnabled, true);
  assert.equal(state.production.latestTurn.replyText, 'Fixed production reply.');
  assert.equal(state.production.history.length, 1);
  assert.equal(playedUrl, '/api/production-test/replies/turn-1.wav');
});

test('listening toggle turns the loop off and discards unfinished speech', async () => {
  const dom = createDom();
  const state = createVoiceCastState();
  state.production.profile = {
    referenceOriginalFileName: 'reference.wav',
    referenceStoredPath: '/tmp/reference.wav',
    meloBaseSpeakerId: 'EN-US',
  };
  const recognition = new FakeRecognition();
  let submitCalls = 0;

  bindAppEvents({
    dom,
    state,
    httpClient: {
      async submitProductionTurn() {
        submitCalls += 1;
        return {
          turn: null,
          history: [],
        };
      },
    },
    renderApp() {},
    createSpeechRecognition() {
      return recognition;
    },
  });

  dom.startListening.dispatchEvent(new Event('click'));
  recognition.emitResult('do not send this');
  dom.startListening.dispatchEvent(new Event('click'));
  recognition.emitEnd();
  await flush();

  assert.equal(state.production.listenerEnabled, false);
  assert.equal(state.production.listening, false);
  assert.equal(recognition.stopped, true);
  assert.equal(submitCalls, 0);
});

test('speech recognition primes and auto-plays the reply as soon as the turn completes', async () => {
  const dom = createDom();
  const state = createVoiceCastState();
  state.production.profile = {
    referenceOriginalFileName: 'reference.wav',
    referenceStoredPath: '/tmp/reference.wav',
    meloBaseSpeakerId: 'EN-US',
  };
  const recognition = new FakeRecognition();

  bindAppEvents({
    dom,
    state,
    httpClient: {
      async submitProductionTurn(payload) {
        return {
          turn: {
            userTranscript: payload.transcript,
            replyText: 'Auto-play check.',
            generationTimeMs: 950,
            replyAudioUrl: '/api/production-test/replies/turn-2.wav',
          },
          history: [
            {
              userTranscript: payload.transcript,
              replyText: 'Auto-play check.',
              generationTimeMs: 950,
              replyAudioUrl: '/api/production-test/replies/turn-2.wav',
            },
          ],
        };
      },
    },
    renderApp() {},
    createSpeechRecognition() {
      return recognition;
    },
  });

  dom.startListening.dispatchEvent(new Event('click'));
  recognition.emitResult('play it now');
  recognition.emitSpeechEnd();
  recognition.emitEnd();
  await flush();
  await flush();

  assert.equal(dom.productionLatestAudio.autoplay, true);
  assert.equal(dom.productionLatestAudio.preload, 'auto');
  assert.equal(dom.productionLatestAudio.hidden, false);
  assert.equal(dom.productionLatestAudio.src, '/api/production-test/replies/turn-2.wav');
  assert.equal(dom.productionLatestAudio.playCount >= 2, true);
  assert.equal(dom.productionLatestAudio.loadCount >= 1, true);
});

test('listening toggle re-arms recognition after reply playback ends', async () => {
  const dom = createDom();
  const state = createVoiceCastState();
  state.production.profile = {
    referenceOriginalFileName: 'reference.wav',
    referenceStoredPath: '/tmp/reference.wav',
    meloBaseSpeakerId: 'EN-US',
  };
  const recognitions = [new FakeRecognition(), new FakeRecognition()];
  let recognitionIndex = 0;

  bindAppEvents({
    dom,
    state,
    httpClient: {
      async submitProductionTurn(payload) {
        return {
          turn: {
            userTranscript: payload.transcript,
            replyText: 'Loop reply.',
            generationTimeMs: 875,
            replyAudioUrl: '/api/production-test/replies/turn-3.wav',
          },
          history: [
            {
              userTranscript: payload.transcript,
              replyText: 'Loop reply.',
              generationTimeMs: 875,
              replyAudioUrl: '/api/production-test/replies/turn-3.wav',
            },
          ],
        };
      },
    },
    renderApp() {},
    createSpeechRecognition() {
      return recognitions[recognitionIndex++];
    },
  });

  dom.startListening.dispatchEvent(new Event('click'));
  recognitions[0].emitResult('keep going');
  recognitions[0].emitSpeechEnd();
  recognitions[0].emitEnd();
  await flush();
  await flush();

  assert.equal(state.production.replyPlaying, true);
  dom.productionLatestAudio.dispatchEvent(new Event('ended'));

  assert.equal(state.production.replyPlaying, false);
  assert.equal(state.production.listenerEnabled, true);
  assert.equal(recognitions[1].started, true);
  assert.equal(state.production.listening, true);
});
