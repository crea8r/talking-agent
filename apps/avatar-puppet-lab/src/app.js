import { createVoiceLayer } from '/vendor/voice-layer-browser.js';
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

const STORAGE_KEY = 'avatar-puppet-lab.state';

const SCRIPT_PRESETS = [
  {
    id: 'warm-intro',
    label: 'Warm Intro',
    note: 'Short intro for the rig.',
    text: 'Hi, I am the avatar puppet lab. This pass is validating a real browser side VRM avatar with speech, gaze, and a small safe gesture vocabulary.',
  },
  {
    id: 'rendering-contract',
    label: 'Rendering Contract',
    note: 'Explains the architecture directly.',
    text: 'The old two dimensional portrait path is gone. The agent now drives a rigged model with expression presets, mouth shapes, eye focus, and controlled upper body motion.',
  },
  {
    id: 'product-bridge',
    label: 'Product Bridge',
    note: 'Frames the next product step.',
    text: 'If this bust up character reads well enough, we can carry the same canvas and VRM control layer forward into the mock video call before we harden the final stack.',
  },
];

const dom = {
  runtimeCard: document.querySelector('#runtime-card'),
  runtimeStatus: document.querySelector('#runtime-status'),
  runtimeDetail: document.querySelector('#runtime-detail'),
  voiceCard: document.querySelector('#voice-card'),
  voiceStatus: document.querySelector('#voice-status'),
  voiceDetail: document.querySelector('#voice-detail'),
  playbackCard: document.querySelector('#playback-card'),
  playbackStatus: document.querySelector('#playback-status'),
  playbackDetail: document.querySelector('#playback-detail'),
  scriptPresets: document.querySelector('#script-presets'),
  scriptInput: document.querySelector('#script-input'),
  stageOptions: document.querySelector('#stage-options'),
  emoteOptions: document.querySelector('#emote-options'),
  gestureOptions: document.querySelector('#gesture-options'),
  voiceSelect: document.querySelector('#voice-select'),
  speechRate: document.querySelector('#speech-rate'),
  speechRateValue: document.querySelector('#speech-rate-value'),
  speechPitch: document.querySelector('#speech-pitch'),
  speechPitchValue: document.querySelector('#speech-pitch-value'),
  speechEnergy: document.querySelector('#speech-energy'),
  speechEnergyValue: document.querySelector('#speech-energy-value'),
  playScript: document.querySelector('#play-script'),
  silentPreview: document.querySelector('#silent-preview'),
  stopScript: document.querySelector('#stop-script'),
  randomizeScene: document.querySelector('#randomize-scene'),
  recenterLook: document.querySelector('#recenter-look'),
  loadLocalModel: document.querySelector('#load-local-model'),
  useBundledModel: document.querySelector('#use-bundled-model'),
  bundledModelOptions: document.querySelector('#bundled-model-options'),
  localModelInput: document.querySelector('#local-model-input'),
  modelNote: document.querySelector('#model-note'),
  voiceStatePanel: document.querySelector('#voice-state-panel'),
  stageShell: document.querySelector('#stage-shell'),
  sceneNote: document.querySelector('#scene-note'),
  activeAvatar: document.querySelector('#active-avatar'),
  activeEmote: document.querySelector('#active-emote'),
  activeGesture: document.querySelector('#active-gesture'),
  speechMode: document.querySelector('#speech-mode'),
  estimatedDuration: document.querySelector('#estimated-duration'),
  activeViseme: document.querySelector('#active-viseme'),
  lookTarget: document.querySelector('#look-target'),
  logList: document.querySelector('#log-list'),
  canvas: document.querySelector('#avatar-canvas'),
};

const scriptPresetMap = new Map(SCRIPT_PRESETS.map((preset) => [preset.id, preset]));
const stageMap = new Map(STAGES.map((stage) => [stage.id, stage]));
const emoteMap = new Map(EMOTES.map((emote) => [emote.id, emote]));
const bundledModelMap = new Map(BUNDLED_MODELS.map((model) => [model.id, model]));

const storedState = readStoredState();
const defaultScriptPreset = scriptPresetMap.get(storedState.scriptPresetId) ?? SCRIPT_PRESETS[0];
const defaultBundledModel = bundledModelMap.get(storedState.bundledModelId) ?? DEFAULT_MODEL;
const defaultGestureId =
  resolveGesturePreset(defaultBundledModel.id, storedState.gestureId)?.id ||
  getGesturePresets(defaultBundledModel.id)[0]?.id ||
  GESTURES[0].id;

const state = {
  runtimeConfig: null,
  logs: [],
  modelLoading: false,
  voiceSnapshot: null,
  voiceOptions: [],
  preferences: {
    bundledModelId: defaultBundledModel.id,
    scriptPresetId: defaultScriptPreset.id,
    scriptText: storedState.scriptText || defaultScriptPreset.text,
    stageId: stageMap.has(storedState.stageId) ? storedState.stageId : STAGES[0].id,
    emoteId: emoteMap.has(storedState.emoteId) ? storedState.emoteId : EMOTES[0].id,
    gestureId: defaultGestureId,
    voiceName: storedState.voiceName || '',
    speechRate: clampNumber(storedState.speechRate, 0.7, 1.35, 1),
    speechPitch: clampNumber(storedState.speechPitch, 0.75, 1.4, 1),
    speechEnergy: clampNumber(storedState.speechEnergy, 0.65, 1.5, 1),
  },
  playback: {
    active: false,
    sessionId: 0,
    mode: 'idle',
    startedAt: 0,
    durationMs: 0,
    frames: [],
    currentMouth: 'rest',
    rafId: 0,
  },
  scene: {
    currentLookLabel: 'center',
  },
};

const avatarLayer = createAvatarLayer({
  canvas: dom.canvas,
  stageShell: dom.stageShell,
  initialStageId: state.preferences.stageId,
  initialEmoteId: state.preferences.emoteId,
  initialGestureId: state.preferences.gestureId,
  initialEnergy: state.preferences.speechEnergy,
  onLog(level, message, details) {
    addLog(level, `[avatar] ${message}`, details);
  },
  onLookTargetChange(label) {
    state.scene.currentLookLabel = label;
    dom.lookTarget.textContent = label;
  },
});

const voiceLayer = createVoiceLayer({
  locale: 'en-US',
  autoRestart: false,
  speakReplies: true,
  preferredVoiceName: state.preferences.voiceName,
  speechRate: state.preferences.speechRate,
  speechPitch: state.preferences.speechPitch,
  getReply: async (transcript) => transcript,
});

voiceLayer.setHandlers({
  onStateChange(snapshot) {
    state.voiceSnapshot = snapshot;
    refreshVoicePanel();
  },
  onLog(entry) {
    addLog(entry.level, `[voice] ${entry.message}`, entry.details);
  },
  onTurn(turn) {
    addLog('info', `[voice] Turn completed for ${turn.source}.`, turn.metrics);
  },
  onVoices(voices) {
    state.voiceOptions = voices;
    const availableNames = new Set(voices.map((voice) => voice.name));
    const selectedVoice = voiceLayer.getSnapshot().selectedVoice;

    if (selectedVoice && !availableNames.has(state.preferences.voiceName)) {
      state.preferences.voiceName = selectedVoice;
      persistState();
    }

    renderVoiceOptions();
    refreshVoicePanel();
  },
});

initialize();

function initialize() {
  dom.scriptInput.value = state.preferences.scriptText;
  dom.speechRate.value = String(state.preferences.speechRate);
  dom.speechPitch.value = String(state.preferences.speechPitch);
  dom.speechEnergy.value = String(state.preferences.speechEnergy);

  updateRangeLabels();
  renderScriptPresetButtons();
  renderChoiceButtons(
    dom.bundledModelOptions,
    BUNDLED_MODELS,
    state.preferences.bundledModelId,
    queueBundledModelSelection,
  );
  renderChoiceButtons(dom.stageOptions, STAGES, state.preferences.stageId, selectStage);
  renderChoiceButtons(dom.emoteOptions, EMOTES, state.preferences.emoteId, selectEmote);
  syncGestureButtons(state.preferences.bundledModelId, state.preferences.gestureId);
  bindEvents();
  syncAvatarSnapshot();
  renderVoiceOptions();
  refreshVoicePanel();
  refreshSceneNote();
  updateDurationEstimate();
  updateRuntimePanel('loading', 'Loading runtime config…', 'Preparing the local VRM stack.');
  updatePlaybackPanel('idle', 'Idle', 'Nothing is speaking right now.');
  addLog('info', 'App booting.');

  syncVoiceLayerConfig();
  void fetchRuntimeConfig();
  void loadBundledModel();
}

function readStoredState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed ? parsed : {};
  } catch {
    return {};
  }
}

function persistState() {
  const payload = {
    bundledModelId: state.preferences.bundledModelId,
    scriptPresetId: state.preferences.scriptPresetId,
    scriptText: state.preferences.scriptText,
    stageId: state.preferences.stageId,
    emoteId: state.preferences.emoteId,
    gestureId: state.preferences.gestureId,
    voiceName: state.preferences.voiceName,
    speechRate: state.preferences.speechRate,
    speechPitch: state.preferences.speechPitch,
    speechEnergy: state.preferences.speechEnergy,
  };

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage failures in the spike app.
  }
}

function bindEvents() {
  dom.scriptInput.addEventListener('input', () => {
    state.preferences.scriptText = dom.scriptInput.value.trimStart();
    state.preferences.scriptPresetId = findMatchingScriptPresetId(state.preferences.scriptText);
    syncScriptPresetButtons();
    updateDurationEstimate();
    refreshActionButtons();
    persistState();
  });

  dom.voiceSelect.addEventListener('change', () => {
    state.preferences.voiceName = dom.voiceSelect.value;
    syncVoiceLayerConfig();
    refreshVoicePanel();
    persistState();
  });

  dom.speechRate.addEventListener('input', () => {
    state.preferences.speechRate = Number.parseFloat(dom.speechRate.value);
    updateRangeLabels();
    updateDurationEstimate();
    syncVoiceLayerConfig();
    persistState();
  });

  dom.speechPitch.addEventListener('input', () => {
    state.preferences.speechPitch = Number.parseFloat(dom.speechPitch.value);
    updateRangeLabels();
    syncVoiceLayerConfig();
    persistState();
  });

  dom.speechEnergy.addEventListener('input', () => {
    state.preferences.speechEnergy = Number.parseFloat(dom.speechEnergy.value);
    updateRangeLabels();
    avatarLayer.setEnergy(state.preferences.speechEnergy);
    persistState();
  });

  dom.playScript.addEventListener('click', () => {
    void startPlayback({ withVoice: true });
  });

  dom.silentPreview.addEventListener('click', () => {
    void startPlayback({ withVoice: false });
  });

  dom.stopScript.addEventListener('click', () => {
    stopPlayback({ cancelVoice: true, logMessage: 'Playback stopped.' });
  });

  dom.randomizeScene.addEventListener('click', () => {
    const gesturePresets = getGesturePresets(avatarLayer.getSnapshot().modelId || state.preferences.bundledModelId);
    state.preferences.scriptPresetId = SCRIPT_PRESETS[Math.floor(Math.random() * SCRIPT_PRESETS.length)].id;
    state.preferences.scriptText = scriptPresetMap.get(state.preferences.scriptPresetId).text;
    dom.scriptInput.value = state.preferences.scriptText;
    selectStage(STAGES[Math.floor(Math.random() * STAGES.length)].id);
    selectEmote(EMOTES[Math.floor(Math.random() * EMOTES.length)].id);
    selectGesture(gesturePresets[Math.floor(Math.random() * gesturePresets.length)].id);
    syncScriptPresetButtons();
    updateDurationEstimate();
    persistState();
    addLog('info', 'Randomized stage, emote, gesture, and script.');
  });

  dom.recenterLook.addEventListener('click', () => {
    avatarLayer.recenterGaze();
    addLog('info', 'Recentered gaze.');
  });

  dom.loadLocalModel.addEventListener('click', () => {
    dom.localModelInput.click();
  });

  dom.localModelInput.addEventListener('change', async () => {
    const [file] = dom.localModelInput.files || [];

    if (!file) {
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    try {
      await loadModel(objectUrl, prettifyFileLabel(file.name), `Loaded local model ${file.name}.`);
    } finally {
      URL.revokeObjectURL(objectUrl);
      dom.localModelInput.value = '';
    }
  });

  dom.useBundledModel.addEventListener('click', async () => {
    await loadBundledModel();
  });

  window.addEventListener('beforeunload', () => {
    stopPlayback({ cancelVoice: true, logMessage: '' });
    voiceLayer.destroy();
    avatarLayer.destroy();
  });
}

async function fetchRuntimeConfig() {
  try {
    const response = await fetch('/api/runtime-config', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Runtime config request failed with ${response.status}`);
    }

    state.runtimeConfig = await response.json();
    updateRuntimePanel(
      'ready',
      `${state.runtimeConfig.renderer} ready`,
      `Mode ${state.runtimeConfig.appMode}. Mouth presets ${state.runtimeConfig.mouthPresets.join(', ')}.`,
    );
    addLog('info', 'Runtime config fetched successfully.');
  } catch (error) {
    updateRuntimePanel(
      'error',
      'Runtime config unavailable',
      error instanceof Error ? error.message : 'Unknown runtime configuration failure.',
    );
    addLog('error', 'Runtime config failed to load.', formatError(error));
  }
}

async function loadModel(url, label, successNote, modelId = null) {
  setModelNote('loading', `Loading ${label}…`);
  state.modelLoading = true;
  refreshActionButtons();

  try {
    await avatarLayer.loadModel(url, { label, modelId: modelId || undefined });
    const snapshot = avatarLayer.getSnapshot();
    state.preferences.gestureId = snapshot.gestureId;
    syncGestureButtons(snapshot.modelId || state.preferences.bundledModelId, snapshot.gestureId);
    syncAvatarSnapshot();
    setModelNote('ready', successNote);
    addLog('info', `Model ready: ${label}.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown VRM loading failure.';
    setModelNote('error', message);
    addLog('error', `Model load failed: ${message}`, formatError(error));
  } finally {
    state.modelLoading = false;
    refreshActionButtons();
  }
}

function getSelectedBundledModel() {
  return bundledModelMap.get(state.preferences.bundledModelId) || DEFAULT_MODEL;
}

function queueBundledModelSelection(modelId) {
  void selectBundledModel(modelId);
}

async function selectBundledModel(modelId, { persist = true } = {}) {
  const model = bundledModelMap.get(modelId) || DEFAULT_MODEL;
  state.preferences.bundledModelId = model.id;
  state.preferences.gestureId =
    resolveGesturePreset(model.id, state.preferences.gestureId)?.id ||
    getGesturePresets(model.id)[0]?.id ||
    state.preferences.gestureId;
  syncChoiceButtons(dom.bundledModelOptions, model.id);
  syncGestureButtons(model.id, state.preferences.gestureId);

  if (persist) {
    persistState();
  }

  if (state.modelLoading) {
    return;
  }

  await loadBundledModel(model);
}

async function loadBundledModel(model = getSelectedBundledModel()) {
  await loadModel(model.path, model.label, model.note, model.id);
}

async function startPlayback({ withVoice }) {
  const avatarSnapshot = avatarLayer.getSnapshot();
  const text = state.preferences.scriptText.trim();

  if (!avatarSnapshot.ready) {
    setModelNote('empty', 'Load a model before starting playback.');
    addLog('warn', 'Playback blocked because no model is active.');
    return;
  }

  if (!text) {
    updatePlaybackPanel('empty', 'Missing script', 'Add a line of English text before running the avatar.');
    addLog('warn', 'Playback blocked because the script is empty.');
    return;
  }

  if (withVoice && !voiceLayer.getSnapshot().speechSynthesisSupported) {
    updatePlaybackPanel(
      'error',
      'Speech synthesis unavailable',
      'This browser cannot speak the script. Silent preview remains available.',
    );
    addLog('error', 'Voice playback blocked because speech synthesis is unavailable.');
    return;
  }

  stopPlayback({ cancelVoice: true, logMessage: '' });

  const timeline = buildMouthTimeline(text, state.preferences.speechRate);
  state.playback.active = true;
  state.playback.sessionId += 1;
  state.playback.mode = withVoice ? 'voice' : 'silent';
  state.playback.startedAt = performance.now();
  state.playback.durationMs = timeline.durationMs;
  state.playback.frames = timeline.frames;
  state.playback.currentMouth = 'rest';

  avatarLayer.setSpeaking(true);
  avatarLayer.setMouthCue('rest');
  dom.stageShell.classList.add('is-speaking');
  dom.speechMode.textContent = withVoice ? 'voice' : 'silent preview';
  dom.activeViseme.textContent = 'rest';
  updatePlaybackPanel(
    'active',
    withVoice ? 'Speaking with voice' : 'Running silent preview',
    `${timeline.frames.length} mouth frames across ${formatDurationMs(timeline.durationMs)}.`,
  );
  refreshActionButtons();
  addLog('info', withVoice ? 'Voice playback started.' : 'Silent preview started.');
  tickPlayback();

  if (!withVoice) {
    return;
  }

  syncVoiceLayerConfig();
  const sessionId = state.playback.sessionId;

  try {
    await voiceLayer.runTextTurn(text, 'script-preview');

    if (state.playback.active && sessionId === state.playback.sessionId) {
      stopPlayback({ cancelVoice: false, logMessage: 'Voice playback finished.' });
    }
  } catch (error) {
    if (state.playback.active && sessionId === state.playback.sessionId) {
      updatePlaybackPanel(
        'error',
        'Speech playback failed',
        error instanceof Error ? error.message : 'Silent preview is still available for the avatar rig.',
      );
      stopPlayback({
        cancelVoice: false,
        logMessage: 'Speech playback failed during playback.',
        keepErrorState: true,
      });
      addLog('error', 'Voice playback failed.', formatError(error));
    }
  }
}

function stopPlayback({ cancelVoice, logMessage, keepErrorState = false }) {
  if (cancelVoice && state.playback.mode === 'voice') {
    voiceLayer.cancelSpeech();
  }

  if (state.playback.rafId) {
    cancelAnimationFrame(state.playback.rafId);
  }

  state.playback.active = false;
  state.playback.mode = 'idle';
  state.playback.durationMs = 0;
  state.playback.frames = [];
  state.playback.currentMouth = 'rest';
  state.playback.rafId = 0;
  avatarLayer.setSpeaking(false);
  avatarLayer.setMouthCue('rest');
  dom.stageShell.classList.remove('is-speaking');
  dom.speechMode.textContent = 'idle';
  dom.activeViseme.textContent = 'rest';
  refreshActionButtons();

  if (logMessage) {
    addLog('info', logMessage);
  }

  if (!keepErrorState) {
    updatePlaybackPanel('idle', 'Idle', 'Nothing is speaking right now.');
  }
}

function tickPlayback() {
  if (!state.playback.active) {
    return;
  }

  const elapsed = performance.now() - state.playback.startedAt;
  const frame =
    state.playback.frames.find((item) => elapsed >= item.startMs && elapsed < item.endMs) ||
    null;

  const nextMouth =
    frame?.mouth ||
    (state.playback.mode === 'silent' && elapsed < state.playback.durationMs ? 'rest' : 'rest');

  if (nextMouth !== state.playback.currentMouth) {
    state.playback.currentMouth = nextMouth;
    avatarLayer.setMouthCue(nextMouth);
    dom.activeViseme.textContent = nextMouth;
  }

  if (state.playback.mode === 'silent' && elapsed >= state.playback.durationMs) {
    stopPlayback({ cancelVoice: false, logMessage: 'Silent preview finished.' });
    return;
  }

  if (state.playback.mode === 'voice' && elapsed >= state.playback.durationMs && state.playback.currentMouth !== 'rest') {
    state.playback.currentMouth = 'rest';
    avatarLayer.setMouthCue('rest');
    dom.activeViseme.textContent = 'rest';
  }

  state.playback.rafId = requestAnimationFrame(tickPlayback);
}

function syncAvatarSnapshot() {
  const snapshot = avatarLayer.getSnapshot();
  const gesture =
    resolveGesturePreset(snapshot.modelId || state.preferences.bundledModelId, snapshot.gestureId) ||
    null;
  dom.activeAvatar.textContent = snapshot.modelLabel;
  dom.activeEmote.textContent = emoteMap.get(snapshot.emoteId)?.label || 'Neutral';
  dom.activeGesture.textContent = gesture?.label || 'None';
  dom.lookTarget.textContent = state.scene.currentLookLabel;
}

function syncVoiceLayerConfig() {
  voiceLayer.updateConfig({
    locale: 'en-US',
    autoRestart: false,
    speakReplies: true,
    preferredVoiceName: state.preferences.voiceName,
    speechRate: state.preferences.speechRate,
    speechPitch: state.preferences.speechPitch,
    getReply: async (transcript) => transcript,
  });
}

function renderVoiceOptions() {
  const snapshot = voiceLayer.getSnapshot();
  const selectedVoice = snapshot.selectedVoice || state.preferences.voiceName;
  const voices = state.voiceOptions;
  dom.voiceSelect.replaceChildren();

  if (!voices.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = snapshot.speechSynthesisSupported
      ? 'Browser default voice'
      : 'Speech synthesis unavailable';
    dom.voiceSelect.append(option);
    dom.voiceSelect.disabled = !snapshot.speechSynthesisSupported;
    return;
  }

  voices.forEach((voice) => {
    const option = document.createElement('option');
    option.value = voice.name;
    option.textContent = `${voice.name} · ${voice.lang}${voice.default ? ' · default' : ''}`;
    dom.voiceSelect.append(option);
  });

  if (selectedVoice && voices.some((voice) => voice.name === selectedVoice)) {
    dom.voiceSelect.value = selectedVoice;
    state.preferences.voiceName = selectedVoice;
  } else if (snapshot.selectedVoice && voices.some((voice) => voice.name === snapshot.selectedVoice)) {
    dom.voiceSelect.value = snapshot.selectedVoice;
    state.preferences.voiceName = snapshot.selectedVoice;
  } else {
    dom.voiceSelect.value = voices[0].name;
    state.preferences.voiceName = voices[0].name;
  }

  dom.voiceSelect.disabled = false;
}

function refreshVoicePanel() {
  const snapshot = state.voiceSnapshot || voiceLayer.getSnapshot();
  const selectedVoiceName = snapshot.selectedVoice || state.preferences.voiceName;

  if (!snapshot.speechSynthesisSupported) {
    updateVoicePanel(
      'error',
      'Speech synthesis unavailable',
      'Silent preview remains usable in this browser.',
    );
    dom.voiceStatePanel.dataset.state = 'error';
    dom.voiceStatePanel.textContent =
      'System speech is not available in this browser. Silent preview still exercises the avatar rig.';
    refreshActionButtons();
    return;
  }

  if (!state.voiceOptions.length) {
    updateVoicePanel(
      'empty',
      'Using browser default voice',
      'No local voice list is exposed yet. Playback may still use the browser default voice.',
    );
    dom.voiceStatePanel.dataset.state = 'empty';
    dom.voiceStatePanel.textContent =
      'The browser did not expose a system voice list. Voice playback may still work with its default voice, and silent preview remains available.';
    refreshActionButtons();
    return;
  }

  updateVoicePanel(
    'ready',
    `${state.voiceOptions.length} voice${state.voiceOptions.length === 1 ? '' : 's'} loaded`,
    `Selected voice: ${selectedVoiceName}.`,
  );
  dom.voiceStatePanel.dataset.state = 'ready';
  dom.voiceStatePanel.textContent = `Voice playback is available. Using ${selectedVoiceName} for English speech preview.`;
  refreshActionButtons();
}

function updateRuntimePanel(cardState, title, detail) {
  dom.runtimeCard.dataset.state = cardState;
  dom.runtimeStatus.textContent = title;
  dom.runtimeDetail.textContent = detail;
}

function updateVoicePanel(cardState, title, detail) {
  dom.voiceCard.dataset.state = cardState;
  dom.voiceStatus.textContent = title;
  dom.voiceDetail.textContent = detail;
}

function updatePlaybackPanel(cardState, title, detail) {
  dom.playbackCard.dataset.state = cardState;
  dom.playbackStatus.textContent = title;
  dom.playbackDetail.textContent = detail;
}

function setModelNote(cardState, message) {
  dom.modelNote.dataset.state = cardState;
  dom.modelNote.textContent = message;
}

function renderScriptPresetButtons() {
  dom.scriptPresets.replaceChildren();

  SCRIPT_PRESETS.forEach((preset) => {
    const button = createChoiceButton(
      preset.label,
      preset.note,
      state.preferences.scriptPresetId === preset.id,
      () => {
        state.preferences.scriptPresetId = preset.id;
        state.preferences.scriptText = preset.text;
        dom.scriptInput.value = preset.text;
        syncScriptPresetButtons();
        updateDurationEstimate();
        refreshActionButtons();
        persistState();
      },
    );
    dom.scriptPresets.append(button);
  });
}

function renderChoiceButtons(container, items, activeId, onSelect) {
  container.replaceChildren();

  items.forEach((item) => {
    const button = createChoiceButton(item.label, item.note, item.id === activeId, () => onSelect(item.id));
    button.dataset.choiceId = item.id;
    container.append(button);
  });
}

function createChoiceButton(label, note, active, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `choice-chip${active ? ' is-active' : ''}`;
  button.setAttribute('aria-pressed', active ? 'true' : 'false');
  button.innerHTML = `<span>${label}</span><small>${note}</small>`;
  button.addEventListener('click', onClick);
  return button;
}

function syncChoiceButtons(container, activeId) {
  container.querySelectorAll('.choice-chip').forEach((button) => {
    const isActive = button.dataset.choiceId === activeId;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

function syncScriptPresetButtons() {
  dom.scriptPresets.querySelectorAll('.choice-chip').forEach((button, index) => {
    const preset = SCRIPT_PRESETS[index];
    const isActive = preset.id === state.preferences.scriptPresetId;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

function selectStage(stageId) {
  state.preferences.stageId = stageId;
  avatarLayer.setStage(stageId);
  syncChoiceButtons(dom.stageOptions, stageId);
  refreshSceneNote();
  persistState();
}

function selectEmote(emoteId) {
  state.preferences.emoteId = emoteId;
  avatarLayer.setEmote(emoteId);
  syncChoiceButtons(dom.emoteOptions, emoteId);
  syncAvatarSnapshot();
  refreshSceneNote();
  persistState();
}

function selectGesture(gestureId) {
  const modelId = avatarLayer.getSnapshot().modelId || state.preferences.bundledModelId;
  const gesture = resolveGesturePreset(modelId, gestureId, {
    fallbackToFirst: false,
  });

  if (!gesture) {
    return null;
  }

  state.preferences.gestureId = gesture.id;
  avatarLayer.setGesture(gesture.id);
  syncGestureButtons(modelId, gesture.id);
  syncAvatarSnapshot();
  refreshSceneNote();
  persistState();

  return gesture;
}

function refreshSceneNote() {
  const stage = stageMap.get(state.preferences.stageId);
  const emote = emoteMap.get(state.preferences.emoteId);
  const modelId = avatarLayer.getSnapshot().modelId || state.preferences.bundledModelId;
  const gesture =
    resolveGesturePreset(modelId, state.preferences.gestureId) || null;
  dom.sceneNote.textContent = `${stage?.note || ''} ${emote?.note || ''} ${gesture?.note || ''}`.trim();
}

function syncGestureButtons(modelId, activeGestureId) {
  renderChoiceButtons(
    dom.gestureOptions,
    getGesturePresets(modelId),
    activeGestureId,
    selectGesture,
  );
}

function updateRangeLabels() {
  dom.speechRateValue.textContent = `${state.preferences.speechRate.toFixed(2)}x`;
  dom.speechPitchValue.textContent = `${state.preferences.speechPitch.toFixed(2)}x`;
  dom.speechEnergyValue.textContent = `${state.preferences.speechEnergy.toFixed(2)}x`;
  dom.stageShell.style.setProperty('--energy-multiplier', state.preferences.speechEnergy.toFixed(2));
}

function updateDurationEstimate() {
  const timeline = buildMouthTimeline(state.preferences.scriptText, state.preferences.speechRate);
  dom.estimatedDuration.textContent = formatDurationMs(timeline.durationMs);
}

function refreshActionButtons() {
  const avatarSnapshot = avatarLayer.getSnapshot();
  const hasScript = state.preferences.scriptText.trim().length > 0;
  const speechSupported = voiceLayer.getSnapshot().speechSynthesisSupported;
  const busy = state.modelLoading || avatarSnapshot.loading;

  dom.playScript.disabled = busy || !avatarSnapshot.ready || !hasScript || !speechSupported;
  dom.silentPreview.disabled = busy || !avatarSnapshot.ready || !hasScript;
  dom.stopScript.disabled = !state.playback.active;
  dom.loadLocalModel.disabled = busy;
  dom.useBundledModel.disabled = busy;
}

function addLog(level, message, details = null) {
  const entry = {
    at: new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
    level,
    message,
    details,
  };

  state.logs = [entry, ...state.logs].slice(0, 16);
  renderLogs();
}

function renderLogs() {
  dom.logList.innerHTML = '';

  state.logs.forEach((entry) => {
    const item = document.createElement('li');
    item.className = 'log-line';

    const summary = document.createElement('div');
    summary.textContent = `[${entry.at}] ${entry.level.toUpperCase()} · ${entry.message}`;
    item.append(summary);

    if (entry.details) {
      const details = document.createElement('pre');
      details.className = 'debug-output compact';
      details.textContent = safeStringify(entry.details);
      item.append(details);
    }

    dom.logList.append(item);
  });
}

function buildMouthTimeline(text, rate) {
  const tokens = text
    .toLowerCase()
    .match(/[a-z']+|[.,!?;:]/g)
    ?.filter(Boolean) || [];

  const frames = [];
  let cursor = 0;

  if (!tokens.length) {
    return {
      frames: [{ mouth: 'rest', startMs: 0, endMs: 640 }],
      durationMs: 640,
    };
  }

  tokens.forEach((token) => {
    if (/^[a-z']+$/.test(token)) {
      const groups = token.match(/[aeiouy]+|[^aeiouy]+/g) || [token];

      groups.forEach((group) => {
        const mouth = mapGroupToMouth(group);
        const duration = Math.max(52, (74 + Math.min(group.length, 4) * 18) / rate);
        pushFrame(frames, mouth, cursor, cursor + duration);
        cursor += duration;
      });

      const tailPause = (token.length <= 3 ? 34 : 42) / rate;
      pushFrame(frames, 'rest', cursor, cursor + tailPause);
      cursor += tailPause;
      return;
    }

    const punctuationPause = token === ',' || token === ';' || token === ':' ? 130 / rate : 210 / rate;
    pushFrame(frames, 'rest', cursor, cursor + punctuationPause);
    cursor += punctuationPause;
  });

  const landing = 120 / rate;
  pushFrame(frames, 'rest', cursor, cursor + landing);

  return {
    frames,
    durationMs: cursor + landing,
  };
}

function pushFrame(frames, mouth, startMs, endMs) {
  const previous = frames.at(-1);
  if (previous && previous.mouth === mouth) {
    previous.endMs = endMs;
    return;
  }

  frames.push({ mouth, startMs, endMs });
}

function mapGroupToMouth(group) {
  if (!group) {
    return 'rest';
  }

  if (!/[aeiouy]/.test(group)) {
    if (/[mbp]/.test(group)) {
      return 'rest';
    }

    if (/[fv]/.test(group)) {
      return 'ee';
    }

    if (/[rl]/.test(group)) {
      return 'ih';
    }

    if (/[wq]/.test(group)) {
      return 'ou';
    }

    return 'aa';
  }

  if (group.includes('ou') || group.includes('oo') || group.includes('u') || group.includes('w')) {
    return 'ou';
  }

  if (group.includes('ee') || group.includes('ea') || /^[iy]+$/.test(group) || group.includes('ei')) {
    return 'ee';
  }

  if (group.includes('i') || group.includes('y')) {
    return 'ih';
  }

  if (group.includes('o')) {
    return 'oh';
  }

  if (group.includes('e')) {
    return 'ee';
  }

  return 'aa';
}

function findMatchingScriptPresetId(text) {
  return SCRIPT_PRESETS.find((preset) => preset.text === text)?.id || '';
}

function safeStringify(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatError(error) {
  if (!error) {
    return null;
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return { value: error };
}

function prettifyFileLabel(fileName) {
  return fileName.replace(/\.vrm$/i, '').replace(/[_-]+/g, ' ').trim() || 'Local VRM';
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number.parseFloat(value);
  if (Number.isFinite(parsed)) {
    return Math.min(max, Math.max(min, parsed));
  }

  return fallback;
}

function formatDurationMs(durationMs) {
  return `${(durationMs / 1000).toFixed(1)}s`;
}
