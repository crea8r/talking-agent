import test from 'node:test';
import assert from 'node:assert/strict';

import { createVoiceCastState } from './store.js';
import { buildViewModel } from './render.js';

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
  assert.equal(viewModel.production.canStartListening, false);
  assert.equal(viewModel.production.setupSummary, 'No active production profile saved.');
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
  state.production.latestTurn = {
    userTranscript: 'hello there',
    replyText: 'All set.',
    generationTimeMs: 1140,
    replyAudioUrl: '/api/production-test/replies/turn-1.wav',
  };
  state.production.history = [state.production.latestTurn];

  const viewModel = buildViewModel(state);
  assert.equal(viewModel.production.showSetupPanel, false);
  assert.equal(viewModel.production.canStartListening, true);
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
  assert.equal(viewModel.production.canStartListening, false);
  assert.equal(viewModel.production.statusText, 'Production backend not configured.');

  state.runtimeConfig.backends.productionConfigured = true;
  const unsupportedViewModel = buildViewModel(state);
  assert.equal(unsupportedViewModel.production.statusText, 'Browser speech recognition is not available.');
});
