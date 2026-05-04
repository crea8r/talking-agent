import { createHttpClient } from './lib/http.js';
import { createVoiceCastState } from './lib/store.js';
import { renderApp } from './lib/render.js';
import { bindAppEvents } from './lib/events.js';

const dom = {
  castingTabButton: document.querySelector('#tab-casting'),
  productionTabButton: document.querySelector('#tab-production'),
  castingPanel: document.querySelector('#panel-casting'),
  productionPanel: document.querySelector('#panel-production'),
  castingModel: document.querySelector('#casting-model'),
  castingPresetSpeaker: document.querySelector('#casting-preset-speaker'),
  castingSpeed: document.querySelector('#casting-speed'),
  castingInstructText: document.querySelector('#casting-instruct-text'),
  promptText: document.querySelector('#prompt-text'),
  refreshCastingLine: document.querySelector('#refresh-casting-line'),
  generateCasting: document.querySelector('#generate-casting'),
  castingStatus: document.querySelector('#casting-status'),
  castingError: document.querySelector('#casting-error'),
  castingResult: document.querySelector('#casting-result'),
  castingAudio: document.querySelector('#casting-audio'),
  castingTiming: document.querySelector('#casting-timing'),
  castingSpokenText: document.querySelector('#casting-spoken-text'),
  castingVoiceDirection: document.querySelector('#casting-voice-direction'),
  savePromptAsset: document.querySelector('#save-prompt-asset'),
  productionSetupToggle: document.querySelector('#production-setup-toggle'),
  productionSetupPanel: document.querySelector('#production-setup-panel'),
  productionSetupSummary: document.querySelector('#production-setup-summary'),
  productionReferenceWavInput: document.querySelector('#production-reference-wav-input'),
  productionReferenceFileName: document.querySelector('#production-reference-file-name'),
  productionBaseSpeaker: document.querySelector('#production-base-speaker'),
  saveProductionProfile: document.querySelector('#save-production-profile'),
  startListening: document.querySelector('#start-listening'),
  productionStatus: document.querySelector('#production-status'),
  productionError: document.querySelector('#production-error'),
  productionTranscript: document.querySelector('#production-transcript'),
  productionReplyText: document.querySelector('#production-reply-text'),
  productionTiming: document.querySelector('#production-timing'),
  replayLatestReply: document.querySelector('#replay-latest-reply'),
  productionLatestAudio: document.querySelector('#production-latest-audio'),
  productionHistoryList: document.querySelector('#production-history-list'),
};

const state = createVoiceCastState();
state.production.sttSupported = Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

const httpClient = createHttpClient();

bindAppEvents({
  dom,
  state,
  httpClient,
  renderApp,
});

async function boot() {
  renderApp({ dom, state });

  try {
    state.runtimeConfig = await httpClient.fetchRuntimeConfig();
  } catch (error) {
    state.casting.speakersLoading = false;
    state.production.speakersLoading = false;
    const message = error instanceof Error ? error.message : 'Unable to load runtime config.';
    state.casting.error = message;
    state.production.error = message;
    renderApp({ dom, state });
    return;
  }

  try {
    if (state.runtimeConfig?.backends?.textOnlyConfigured) {
      const speakersPayload = await httpClient.fetchCastingSpeakers();
      state.casting.speakers = speakersPayload.speakers || [];
      state.casting.presetSpeaker = state.casting.speakers[0] || '';
    }
  } catch (error) {
    state.casting.error = error instanceof Error ? error.message : 'Unable to load speakers.';
  } finally {
    state.casting.speakersLoading = false;
  }

  try {
    if (state.runtimeConfig?.backends?.productionConfigured) {
      const payload = await httpClient.fetchProductionTestState();
      state.production.speakers = payload.speakers || [];
      state.production.profile = payload.profile || null;
      state.production.history = payload.history || [];
      state.production.latestTurn = state.production.history[0] || null;
      state.production.selectedSpeakerId =
        state.production.profile?.meloBaseSpeakerId || state.production.speakers[0] || '';
      state.production.setupOpen = !state.production.profile;
    }
  } catch (error) {
    state.production.error =
      error instanceof Error ? error.message : 'Unable to load production test state.';
  } finally {
    state.production.speakersLoading = false;
  }

  renderApp({ dom, state });
}

void boot();
