import {
  LogLevel,
  Room,
  RoomEvent,
  Track,
  VideoPresets,
  setLogExtension,
} from '/vendor/livekit-client.mjs';
import { createRoomLayerClient } from '/vendor/room-layer-client.mjs';
import { createVoiceLayer } from '/vendor/voice-layer-browser.js';
import { createAvatarSpeechController } from '/vendor/avatar-speech-browser.js';
import {
  BUNDLED_MODELS,
  DEFAULT_MODEL,
  EMOTES,
  GESTURES,
  STAGES,
  createAvatarLayer,
  getGesturePresets,
  pickVoiceForModel,
  resolveGesturePreset,
} from '/vendor/avatar-layer-browser.js';
import { clampNumber, formatError } from './lib/format.js';
import { dom } from './ui/dom.js';
import { renderSelectOptions } from './ui/render.js';
import { createScreenNavigator } from './ui/screens.js';
import { createAppStore } from './lib/app/store.js';
import { fetchJson, fetchRuntimeConfig, postJson } from './lib/app/http.js';
import { createLogger } from './lib/app/logger.js';
import { createPresenter } from './lib/app/presenter.js';
import { createAvatarController } from './lib/app/avatar-controller.js';
import { createSessionController } from './lib/app/session-controller.js';
import { bindAppEvents } from './lib/app/events.js';

const STORAGE_KEY = 'one-to-one-agent-room.state';

const roomLayer = createRoomLayerClient({
  sdk: {
    LogLevel,
    Room,
    RoomEvent,
    setLogExtension,
  },
});

const store = createAppStore({
  storageKey: STORAGE_KEY,
  bundledModels: BUNDLED_MODELS,
  defaultModel: DEFAULT_MODEL,
  stages: STAGES,
  emotes: EMOTES,
  getGesturePresets,
  resolveGesturePreset,
  clampNumber,
});

const { state, bundledModelMap, stageMap, emoteMap } = store;

const screenNavigator = createScreenNavigator({
  tabs: dom.screenTabs,
  screens: dom.screens,
});

const logger = createLogger({ state, dom });
let presenter;
let sessionController;

const avatarController = createAvatarController({
  dom,
  state,
  createAvatarLayer,
  bundledModelMap,
  stageMap,
  emoteMap,
  getGesturePresets,
  resolveGesturePreset,
  defaultModel: DEFAULT_MODEL,
  getSelectedBundledModel: store.getSelectedBundledModel,
  persistState: () => store.persistState(dom),
  formatError,
  addLog: logger.addLog,
  refreshActionButtons: () => presenter?.refreshActionButtons?.(),
  onBundledModelChange(modelId) {
    syncRecommendedVoiceForModel(modelId, { force: true });
  },
});

const agentVoiceLayer = createVoiceLayer({
  locale: 'en-US',
  autoRestart: false,
  speakReplies: true,
  preferredVoiceName: state.preferences.voiceName,
  speechRate: state.preferences.speechRate,
  speechPitch: state.preferences.speechPitch,
  getReply: async (transcript) => transcript,
});

const humanVoiceLayer = createVoiceLayer({
  locale: state.preferences.humanLocale,
  autoRestart: true,
  speakReplies: false,
  getReply: async (transcript) => {
    await sessionController.enqueueHumanTurn(transcript, 'voice');
    return 'Queued for Codex agent.';
  },
});

const avatarSpeech = createAvatarSpeechController({
  avatarLayer: avatarController.avatarLayer,
  voiceLayer: agentVoiceLayer,
  onLog(level, message, details) {
    logger.addLog(level, `[agent] ${message}`, details);
  },
  onStateChange(snapshot) {
    state.avatarSpeechSnapshot = snapshot;
    presenter.renderAgentStatus();
    avatarController.syncAvatarSnapshot();
  },
});

presenter = createPresenter({
  dom,
  state,
  trackSource: Track.Source,
  collectFormState: () => store.collectFormState(dom),
  humanVoiceLayer,
  agentVoiceLayer,
  avatarSpeech,
  avatarLayer: avatarController.avatarLayer,
});

sessionController = createSessionController({
  state,
  roomLayer,
  roomClass: Room,
  videoPresets: VideoPresets,
  logLevel: LogLevel.info,
  screenNavigator,
  humanVoiceLayer,
  agentVoiceLayer,
  avatarSpeech,
  avatarLayer: avatarController.avatarLayer,
  dom,
  stageMap,
  emoteMap,
  selectStage: avatarController.selectStage,
  selectEmote: avatarController.selectEmote,
  selectGesture: avatarController.selectGesture,
  collectFormState: () => store.collectFormState(dom),
  fetchJson,
  postJson,
  addLog: logger.addLog,
  formatError,
  renderLocalStage: presenter.renderLocalStage,
  renderRoomSnapshot: presenter.renderRoomSnapshot,
  renderBridgeSnapshot: presenter.renderBridgeSnapshot,
  renderTranscriptList: presenter.renderTranscriptList,
  renderDebugSnapshot: presenter.renderDebugSnapshot,
  renderAgentStatus: presenter.renderAgentStatus,
  refreshActionButtons: presenter.refreshActionButtons,
  updateRoomStatus: presenter.updateRoomStatus,
});

humanVoiceLayer.setHandlers({
  onStateChange(snapshot) {
    state.humanVoiceSnapshot = snapshot;
    presenter.renderHumanStatus();
    presenter.refreshActionButtons();
    presenter.renderDebugSnapshot();
  },
  onTranscript({ text, isFinal }) {
    state.transcriptPreview = text || 'none';
    if (!isFinal) {
      void sessionController.syncInterimTranscript(text);
    }
    presenter.renderHumanStatus();
  },
  onLog(entry) {
    logger.addLog(entry.level, `[human] ${entry.message}`, entry.details);
  },
});

agentVoiceLayer.setHandlers({
  onStateChange(snapshot) {
    state.agentVoiceSnapshot = snapshot;
    presenter.renderAgentStatus();
    presenter.renderDebugSnapshot();
  },
  onVoices(voices) {
    state.voiceOptions = voices;
    syncRecommendedVoiceForModel(state.preferences.bundledModelId, {
      force:
        !state.preferences.voiceName ||
        !voices.some((voice) => voice.name === state.preferences.voiceName),
    });
    presenter.renderVoiceOptions();
  },
  onLog(entry) {
    logger.addLog(entry.level, `[voice] ${entry.message}`, entry.details);
  },
});

initialize();

function initialize() {
  avatarController.flushEarlyBootIssues();
  store.hydrateInputs(dom);
  presenter.updateRateLabels();
  renderSelectOptions(dom.bundledModelSelect, BUNDLED_MODELS, state.preferences.bundledModelId);
  renderSelectOptions(dom.stageSelect, STAGES, state.preferences.stageId);
  renderSelectOptions(dom.emoteSelect, EMOTES, state.preferences.emoteId);
  renderSelectOptions(
    dom.gestureSelect,
    getGesturePresets(state.preferences.bundledModelId),
    resolveGesturePreset(state.preferences.bundledModelId, state.preferences.gestureId)?.id ||
      GESTURES[0].id,
  );
  avatarController.refreshSceneNote();
  avatarController.syncAvatarSnapshot();
  presenter.renderVoiceOptions();
  presenter.renderTranscriptList();
  presenter.renderHumanStatus();
  presenter.renderAgentStatus();
  presenter.renderCallSnapshot();
  bindAppEvents({
    dom,
    state,
    humanVoiceLayer,
    avatarController,
    sessionController,
    presenter,
    persistState: () => store.persistState(dom),
    syncAgentVoiceConfig,
    addLog: logger.addLog,
    formatError,
  });
  sessionController.installSdkLogging();
  logger.addLog('info', 'App booting.');
  syncAgentVoiceConfig();
  void boot();
}

async function boot() {
  presenter.updateRoomStatus('loading', 'Loading…', 'Preparing runtime config.');
  dom.localStage.innerHTML = '<div class="empty-state">Loading runtime config…</div>';

  try {
    state.runtimeConfig = await fetchRuntimeConfig();
    store.ensureDefaults(dom);
    store.persistState(dom);
    await Promise.all([
      avatarController.loadModel(),
      sessionController.prepareLobbySession({ force: true }),
    ]);
    presenter.renderRoomSnapshot();
    presenter.renderBridgeSnapshot();
    presenter.renderCallSnapshot();
    presenter.refreshActionButtons();
    presenter.renderDebugSnapshot();
    logger.addLog('info', 'Runtime ready.', {
      appName: state.runtimeConfig.appName,
      appMode: state.runtimeConfig.appMode,
    });
  } catch (error) {
    presenter.updateRoomStatus(
      'error',
      'Bootstrap failed',
      error instanceof Error ? error.message : 'Unable to prepare the room.',
    );
    logger.addLog('error', 'Bootstrap failed.', formatError(error));
  }
}

function syncAgentVoiceConfig() {
  const voiceCharacters = Object.fromEntries(
    BUNDLED_MODELS.map((model) => [
      model.id,
      {
        voiceName: pickVoiceForModel(model.id, state.voiceOptions) || state.preferences.voiceName,
        baseRate: state.preferences.speechRate,
        basePitch: state.preferences.speechPitch,
      },
    ]),
  );

  agentVoiceLayer.updateConfig({
    locale: 'en-US',
    autoRestart: false,
    preferredVoiceName: state.preferences.voiceName,
    speechRate: state.preferences.speechRate,
    speechPitch: state.preferences.speechPitch,
    defaultCharacterId: 'default',
    voiceCharacters: {
      default: {
        voiceName: state.preferences.voiceName,
        baseRate: state.preferences.speechRate,
        basePitch: state.preferences.speechPitch,
      },
      ...voiceCharacters,
    },
    speakReplies: true,
    getReply: async (transcript) => transcript,
  });
}

function syncRecommendedVoiceForModel(modelId, { force = false } = {}) {
  const recommendedVoice = pickVoiceForModel(modelId, state.voiceOptions);
  if (!recommendedVoice) {
    return;
  }

  const voiceStillAvailable = state.voiceOptions.some(
    (voice) => voice.name === state.preferences.voiceName,
  );
  if (!force && state.preferences.voiceName && voiceStillAvailable) {
    return;
  }

  if (state.preferences.voiceName === recommendedVoice) {
    return;
  }

  state.preferences.voiceName = recommendedVoice;
  syncAgentVoiceConfig();
  presenter?.renderVoiceOptions?.();
  store.persistState(dom);
}
