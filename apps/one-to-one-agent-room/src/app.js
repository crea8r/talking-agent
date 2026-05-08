import { createVoiceLayer } from '/vendor/voice-layer-browser/index.js';
import { createAvatarSpeechController } from '/vendor/avatar-speech-browser.js';
import { createProductionVoiceLayer } from '/vendor/production-voice/browser-layer.mjs';
import {
  BUNDLED_MODELS,
  DEFAULT_MODEL,
  EMOTES,
  GESTURES,
  STAGES,
  createAvatarLayer,
  getGesturePresets,
  resolveGesturePreset,
} from '/vendor/avatar-layer-browser.js';
import { formatError } from './lib/format.js';
import { dom } from './ui/dom.js';
import { createAvatarDock } from './ui/avatar-dock.js';
import { renderSelectOptions } from './ui/render.js';
import { createScreenNavigator } from './ui/screens.js';
import { createAppStore } from './lib/app/store.js';
import { fetchJson, fetchRuntimeConfig, postFormData, postJson } from './lib/app/http.js';
import { createLogger } from './lib/app/logger.js';
import { createPresenter } from './lib/app/presenter.js';
import { createAvatarController } from './lib/app/avatar-controller.js';
import { createSessionController } from './lib/app/session-controller.js';
import { createSetupPreviewController } from './lib/app/setup-preview.js';
import { bindAppEvents } from './lib/app/events.js';
import { resolveLaunchContext } from './lib/app/launch-context.js';

const STORAGE_KEY = 'one-to-one-agent-room.state';
const initialLaunchContext = resolveLaunchContext({
  locationHref: window.location.href,
});

const store = createAppStore({
  storageKey: STORAGE_KEY,
  bundledModels: BUNDLED_MODELS,
  defaultModel: DEFAULT_MODEL,
  stages: STAGES,
  emotes: EMOTES,
  getGesturePresets,
  resolveGesturePreset,
});
store.activateScope(initialLaunchContext.workspaceKey);

const { state, bundledModelMap, stageMap, emoteMap } = store;
state.launchContext = initialLaunchContext;
const avatarDock = createAvatarDock({
  setupHost: dom.setupAvatarHost,
  callHost: dom.callAvatarHost,
  previewShell: dom.avatarPreviewShell,
});
const screenNavigator = createScreenNavigator({
  tabs: dom.screenTabs,
  screens: dom.screens,
  onChange(screenId) {
    avatarDock.sync(screenId);
  },
});

const logger = createLogger({ state, dom });
let presenter;
let sessionController;
let setupPreviewController;

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
  onBundledModelChange() {},
});

const agentVoiceLayer = createProductionVoiceLayer({
  locale: 'en-US',
  initialConfig: {
    locale: 'en-US',
    speakReplies: true,
    defaultCharacterId: state.preferences.bundledModelId,
    ready: false,
  },
  synthesizeSpeech: async ({ text }) => {
    const scopeQuery = state.launchContext?.workspaceKey
      ? `?scope=${encodeURIComponent(state.launchContext.workspaceKey)}`
      : '';
    const payload = await postJson(`/api/production-voice/synthesize${scopeQuery}`, {
      text,
    });
    return payload;
  },
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
  collectFormState: () => store.collectFormState(dom),
  humanVoiceLayer,
  agentVoiceLayer,
  avatarSpeech,
  avatarLayer: avatarController.avatarLayer,
});

sessionController = createSessionController({
  state,
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
  postFormData,
  addLog: logger.addLog,
  formatError,
  renderSessionSnapshot: presenter.renderSessionSnapshot,
  renderTranscriptList: presenter.renderTranscriptList,
  renderSubtitles: presenter.renderSubtitles,
  renderDebugSnapshot: presenter.renderDebugSnapshot,
  renderAgentStatus: presenter.renderAgentStatus,
  renderVoiceSampleState: presenter.renderVoiceSampleState,
  refreshActionButtons: presenter.refreshActionButtons,
  syncVoiceSampleProfile: store.syncVoiceSampleProfile,
  persistState: () => store.persistState(dom),
  updateRoomStatus: presenter.updateRoomStatus,
});

setupPreviewController = createSetupPreviewController({
  state,
  avatarLayer: avatarController.avatarLayer,
  avatarSpeech,
  addLog: logger.addLog,
  formatError,
  renderVoiceSampleState: presenter.renderVoiceSampleState,
  refreshActionButtons: presenter.refreshActionButtons,
});

humanVoiceLayer.setHandlers({
  onStateChange(snapshot) {
    state.humanVoiceSnapshot = snapshot;
    if (!state.activeCall || state.humanMicMuted || state.startupGreetingActive || !snapshot.listening) {
      state.humanMicLevel = 0;
    }
    presenter.renderHumanStatus();
    presenter.renderCallSnapshot();
    presenter.refreshActionButtons();
    presenter.renderDebugSnapshot();
  },
  onLevel(level) {
    state.humanMicLevel =
      state.activeCall &&
      !state.humanMicMuted &&
      !state.startupGreetingActive &&
      !state.agentThinkingActive
        ? Number(level) || 0
        : 0;
    presenter.renderCallSnapshot();
  },
  onTranscript({ text, isFinal }) {
    state.transcriptPreview = text || '';
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
  onLog(entry) {
    logger.addLog(entry.level, `[voice] ${entry.message}`, entry.details);
  },
});

initialize();

function initialize() {
  avatarController.flushEarlyBootIssues();
  applyLaunchContext(state.launchContext);
  store.hydrateInputs(dom);
  renderSetupControls();
  avatarController.refreshSceneNote();
  avatarController.syncAvatarSnapshot();
  presenter.renderVoiceSampleState();
  presenter.renderTranscriptList();
  presenter.renderHumanStatus();
  presenter.renderSubtitles();
  presenter.renderAgentStatus();
  presenter.renderCallSnapshot();
  bindAppEvents({
    dom,
    state,
    screenNavigator,
    humanVoiceLayer,
    avatarController,
    sessionController,
    setupPreviewController,
    presenter,
    persistState: () => store.persistState(dom),
    addLog: logger.addLog,
    formatError,
  });
  sessionController.installSdkLogging();
  logger.addLog('info', 'App booting.');
  void boot();
}

function renderSetupControls() {
  renderSelectOptions(dom.bundledModelSelect, BUNDLED_MODELS, state.preferences.bundledModelId);
  renderSelectOptions(dom.stageSelect, STAGES, state.preferences.stageId);
  renderSelectOptions(dom.emoteSelect, EMOTES, state.preferences.emoteId);
  renderSelectOptions(
    dom.gestureSelect,
    getGesturePresets(state.preferences.bundledModelId),
    resolveGesturePreset(state.preferences.bundledModelId, state.preferences.gestureId)?.id ||
      GESTURES[0].id,
  );
}

function applyLaunchContext(launchContext) {
  state.launchContext = launchContext;
  dom.shell.dataset.launchMode = launchContext.mode;
  document.body.dataset.launchMode = launchContext.mode;
  screenNavigator.show(launchContext.initialScreen, {
    updateHash: !window.location.hash || !['#setup', '#call'].includes(window.location.hash),
  });
  presenter.renderLaunchContext();
}

async function boot() {
  presenter.updateRoomStatus('loading', 'Loading…', 'Preparing runtime config.');

  try {
    state.runtimeConfig = await fetchRuntimeConfig();
    state.launchContext = resolveLaunchContext({
      locationHref: window.location.href,
      runtimeConfig: state.runtimeConfig,
    });
    const resolvedLaunchContext = await sessionController.resolveLinkedLaunch();
    state.runtimeConfig.launch = resolvedLaunchContext;
    store.activateScope(resolvedLaunchContext.workspaceKey);
    applyLaunchContext(resolvedLaunchContext);
    store.ensureDefaults();
    store.hydrateInputs(dom);
    await sessionController.loadWorkspaceSetup();
    renderSetupControls();
    store.persistState(dom);

    if (resolvedLaunchContext.callStatus === 'ended' || resolvedLaunchContext.callStatus === 'retry-needed') {
      await avatarController.loadModel();
      presenter.updateRoomStatus(
        resolvedLaunchContext.callStatus === 'retry-needed' ? 'warn' : 'idle',
        'Call ended',
        resolvedLaunchContext.callStatus === 'retry-needed'
          ? 'This call ended but summary write-back needs retry.'
          : 'This call has already finished.',
      );
      state.subtitles.human = {
        mode: 'idle',
        text: 'Call ended.',
      };
      state.subtitles.agent = {
        mode: resolvedLaunchContext.callStatus === 'retry-needed' ? 'warn' : 'ended',
        text: resolvedLaunchContext.endedSummary || 'No summary saved for this call.',
      };
      presenter.renderSessionSnapshot();
      presenter.renderCallSnapshot();
      presenter.renderSubtitles();
      presenter.refreshActionButtons();
      presenter.renderDebugSnapshot();
      logger.addLog('info', 'Opened an ended linked call.', {
        launchId: resolvedLaunchContext.launchId,
        status: resolvedLaunchContext.callStatus,
      });
      return;
    }

    await Promise.all([
      avatarController.loadModel(),
      sessionController.loadProductionVoiceState(),
      sessionController.loadCodexState(),
    ]);
    presenter.renderSessionSnapshot();
    presenter.renderCallSnapshot();
    presenter.refreshActionButtons();
    presenter.renderDebugSnapshot();
    presenter.renderLaunchContext();
    logger.addLog('info', 'Runtime ready.', {
      appName: state.runtimeConfig.appName,
      appMode: state.runtimeConfig.appMode,
    });
    await sessionController.maybeStartLaunchCall();
  } catch (error) {
    presenter.updateRoomStatus(
      'error',
      'Bootstrap failed',
      error instanceof Error ? error.message : 'Unable to prepare the call.',
    );
    logger.addLog('error', 'Bootstrap failed.', formatError(error));
  }
}
