import test from 'node:test';
import assert from 'node:assert/strict';

import { createVoiceCastState } from './store.js';
import { buildViewModel, renderApp } from './render.js';

class FakeElement {
  constructor({ value = '' } = {}) {
    this.value = value;
    this.textContent = '';
    this.innerHTML = '';
    this.hidden = false;
    this.disabled = false;
    this.dataset = {};
  }

  setAttribute(name, value) {
    this[name] = value;
  }

  removeAttribute(name) {
    if (name === 'src') {
      this.src = '';
      return;
    }
    delete this[name];
  }

  replaceChildren() {
    this.options = [];
  }

  append(option) {
    this.options = this.options || [];
    this.options.push(option);
  }
}

class FakeAudioElement extends FakeElement {
  constructor() {
    super();
    this._src = '';
    this.assignments = 0;
  }

  get src() {
    return this._src;
  }

  set src(value) {
    this._src = value;
    this.assignments += 1;
  }
}

function createRenderDom() {
  return {
    castingTabButton: new FakeElement(),
    productionTabButton: new FakeElement(),
    castingPanel: new FakeElement(),
    productionPanel: new FakeElement(),
    castingModel: new FakeElement(),
    castingSpeed: new FakeElement(),
    castingInstructText: new FakeElement(),
    promptText: new FakeElement(),
    castingPresetSpeaker: new FakeElement(),
    generateCasting: new FakeElement(),
    castingBackendHealth: new FakeElement(),
    castingStatus: new FakeElement(),
    castingError: new FakeElement(),
    castingResult: new FakeElement(),
    savePromptAsset: new FakeElement(),
    castingTiming: new FakeElement(),
    castingSpokenText: new FakeElement(),
    castingVoiceDirection: new FakeElement(),
    castingAudio: new FakeAudioElement(),
    productionBaseSpeaker: new FakeElement(),
    productionSetupToggle: new FakeElement(),
    productionSetupPanel: new FakeElement(),
    productionSetupSummary: new FakeElement(),
    productionReferenceFileName: new FakeElement(),
    saveProductionProfile: new FakeElement(),
    startListening: new FakeElement(),
    replayLatestReply: new FakeElement(),
    productionBackendHealth: new FakeElement(),
    productionStatus: new FakeElement(),
    productionError: new FakeElement(),
    productionTranscript: new FakeElement(),
    productionReplyText: new FakeElement(),
    productionTiming: new FakeElement(),
    productionHistoryList: new FakeElement(),
    productionLatestAudio: new FakeAudioElement(),
  };
}

test('buildViewModel disables Start Listening and expands setup when no active production profile exists', () => {
  const state = createVoiceCastState();
  state.runtimeConfig = {
    backends: {
      textOnlyConfigured: true,
      productionConfigured: true,
    },
  };

  const viewModel = buildViewModel(state);
  assert.equal(viewModel.production.showSetupPanel, true);
  assert.equal(viewModel.production.listenerToggleDisabled, true);
  assert.equal(viewModel.production.listenerToggleLabel, 'Turn Listening On');
  assert.equal(viewModel.production.setupSummary, 'No active production profile saved.');
  assert.equal(viewModel.casting.backendHealth.label, 'Checking server…');
  assert.equal(viewModel.production.backendHealth.label, 'Checking server…');
});

test('buildViewModel exposes saved production profile summary and latest reply controls', () => {
  const state = createVoiceCastState();
  state.runtimeConfig = {
    backends: {
      textOnlyConfigured: true,
      productionConfigured: true,
    },
  };
  state.production.setupOpen = false;
  state.production.profile = {
    referenceOriginalFileName: 'fairy-reference.wav',
    meloBaseSpeakerId: 'EN-US',
  };
  state.production.listenerEnabled = true;
  state.production.latestTurn = {
    userTranscript: 'hello there',
    replyText: 'All set.',
    generationTimeMs: 1140,
    replyAudioUrl: '/api/production-test/replies/turn-1.wav',
  };
  state.production.history = [state.production.latestTurn];

  const viewModel = buildViewModel(state);
  assert.equal(viewModel.production.showSetupPanel, false);
  assert.equal(viewModel.production.listenerToggleDisabled, false);
  assert.equal(viewModel.production.listenerToggleLabel, 'Turn Listening Off');
  assert.match(viewModel.production.setupSummary, /fairy-reference\.wav/);
  assert.match(viewModel.production.setupSummary, /EN-US/);
  assert.equal(viewModel.production.latestTurnVisible, true);
  assert.equal(viewModel.production.replayLatestVisible, true);
  assert.equal(viewModel.production.timingLabel, '1.14s');
});

test('buildViewModel surfaces browser STT capability and backend errors cleanly', () => {
  const state = createVoiceCastState();
  state.runtimeConfig = {
    backends: {
      textOnlyConfigured: true,
      productionConfigured: false,
    },
  };
  state.production.sttSupported = false;

  const viewModel = buildViewModel(state);
  assert.equal(viewModel.production.listenerToggleDisabled, true);
  assert.equal(viewModel.production.statusText, 'Production backend not configured.');

  state.runtimeConfig.backends.productionConfigured = true;
  const unsupportedViewModel = buildViewModel(state);
  assert.equal(unsupportedViewModel.production.statusText, 'Browser speech recognition is not available.');
});

test('buildViewModel surfaces backend down states and disables both tabs', () => {
  const state = createVoiceCastState();
  state.runtimeConfig = {
    backends: {
      textOnlyConfigured: true,
      productionConfigured: true,
    },
  };
  state.casting.backendHealth.running = false;
  state.production.backendHealth.running = false;

  const viewModel = buildViewModel(state);
  assert.equal(viewModel.casting.backendHealth.label, 'Text-only server down');
  assert.equal(viewModel.casting.generateDisabled, true);
  assert.equal(viewModel.casting.statusText, 'Text-only server is down.');
  assert.equal(viewModel.production.backendHealth.label, 'Production pipeline down');
  assert.equal(viewModel.production.listenerToggleDisabled, true);
  assert.equal(viewModel.production.statusText, 'Production pipeline is down.');
});

test('renderApp does not reassign the latest reply audio on unrelated production renders', () => {
  const state = createVoiceCastState();
  state.runtimeConfig = {
    backends: {
      textOnlyConfigured: true,
      productionConfigured: true,
    },
  };
  state.production.profile = {
    referenceOriginalFileName: 'fairy-reference.wav',
    meloBaseSpeakerId: 'EN-US',
  };
  state.production.latestTurn = {
    userTranscript: 'hello there',
    replyText: 'Loop reply.',
    generationTimeMs: 875,
    replyAudioUrl: '/api/production-test/replies/turn-3.wav',
  };
  const dom = createRenderDom();
  const originalDocument = globalThis.document;
  globalThis.document = {
    createElement() {
      return { value: '', textContent: '' };
    },
  };

  try {
    renderApp({ dom, state });
    assert.equal(dom.productionLatestAudio.src, '/api/production-test/replies/turn-3.wav');
    assert.equal(dom.productionLatestAudio.assignments, 1);

    state.production.listening = true;
    renderApp({ dom, state });
    assert.equal(dom.productionLatestAudio.src, '/api/production-test/replies/turn-3.wav');
    assert.equal(dom.productionLatestAudio.assignments, 1);
  } finally {
    globalThis.document = originalDocument;
  }
});
