import { BUNDLED_MODELS, createAvatarLayer } from '/vendor/avatar-layer-browser.js';

const SCREEN_PRESETS = [
  { id: 'desktop-1440', label: 'Desktop 1440 x 900', width: 1440, height: 900 },
  { id: 'desktop-1920', label: 'Desktop 1920 x 1080', width: 1920, height: 1080 },
  { id: 'laptop-1280', label: 'Laptop 1280 x 800', width: 1280, height: 800 },
  { id: 'tablet-1024', label: 'Tablet 1024 x 1366', width: 1024, height: 1366 },
  { id: 'phone-390', label: 'Phone 390 x 844', width: 390, height: 844 },
];

const DEFAULT_MODEL = BUNDLED_MODELS.find((model) => model.id === 'bhf-1-2') || BUNDLED_MODELS[0];
const DEFAULT_PRESET = SCREEN_PRESETS[0];
const DEFAULT_STAGE_ID = 'neon-loft';
const DEFAULT_EMOTE_ID = 'playful';
const DEFAULT_GESTURE_ID = 'Pose';
const DEFAULT_ENERGY = 1.08;
const DIRECTOR_COUNTDOWN_START = 3;
const DIRECTOR_COUNTDOWN_STEP_MS = 1000;
const PAGE_PARAMS = new URLSearchParams(window.location.search);

const dom = {
  captureShell: document.querySelector('#capture-shell'),
  captureFrame: document.querySelector('#capture-frame'),
  poseAvatar: document.querySelector('#pose-avatar'),
  captureFlash: document.querySelector('#capture-flash'),
  directorOverlay: document.querySelector('#director-overlay'),
  directorCountdown: document.querySelector('#director-countdown'),
  avatarLoaderPoster: document.querySelector('#avatar-loader-poster'),
  avatarLoadingLabel: document.querySelector('#avatar-loading-label'),
  controlCard: document.querySelector('#control-card'),
  screenPreset: document.querySelector('#screen-preset'),
  screenWidth: document.querySelector('#screen-width'),
  screenHeight: document.querySelector('#screen-height'),
  modelSelect: document.querySelector('#model-select'),
  actionSelect: document.querySelector('#action-select'),
  playButton: document.querySelector('#transport-play'),
  pauseButton: document.querySelector('#transport-pause'),
  restartButton: document.querySelector('#transport-restart'),
  stopButton: document.querySelector('#transport-stop'),
  actButton: document.querySelector('#transport-act'),
  panelMinimize: document.querySelector('#panel-minimize'),
  statusLine: document.querySelector('#status-line'),
  panelNote: document.querySelector('.panel-note'),
  prepareCapture: document.querySelector('#prepare-capture'),
};

const state = {
  heroLayer: null,
  isReady: false,
  isLoadingModel: false,
  isCapturing: false,
  isCaptureMode: PAGE_PARAMS.get('capture') === '1',
  isGesturePaused: false,
  isPanelMinimized: false,
  act: {
    active: false,
    mode: '',
    sequenceId: '',
    prompt: '',
    modelId: '',
    sequence: [],
    index: -1,
    currentGestureId: '',
    remainingMs: 0,
    stepEndsAt: 0,
    timerId: 0,
  },
  director: {
    pollTimerId: 0,
    polling: false,
    lastSequenceId: '',
    phase: 'idle',
    countdownValue: 0,
    countdownTimerId: 0,
    pendingSequence: null,
  },
  captureWidth: readIntParam('width', DEFAULT_PRESET.width, 240, 4096),
  captureHeight: readIntParam('height', DEFAULT_PRESET.height, 240, 4096),
  selectedModelId: resolveRequestedModelId(PAGE_PARAMS.get('model')),
  selectedGestureId: PAGE_PARAMS.get('action') || DEFAULT_GESTURE_ID,
  availableGestures: [],
  queuedModelId: null,
  loadToken: 0,
  flashTimeout: 0,
  captureAudioContext: null,
  viewportSyncHandler: null,
  resizeRaf: 0,
};

initialize().catch((error) => {
  console.error('pose-studio failed to initialize', error);
  setAvatarState('error', 'Pose studio failed to start.');
});

function readIntParam(name, fallback, min, max) {
  const rawValue = Number.parseInt(PAGE_PARAMS.get(name) || '', 10);
  if (!Number.isFinite(rawValue)) {
    return fallback;
  }
  return clampInt(rawValue, min, max, fallback);
}

function resolveRequestedModelId(requestedModelId) {
  return BUNDLED_MODELS.some((model) => model.id === requestedModelId) ? requestedModelId : DEFAULT_MODEL.id;
}

async function initialize() {
  document.body.dataset.captureMode = String(state.isCaptureMode);
  document.body.dataset.directorMode = 'false';
  document.body.dataset.directorCountdown = 'false';
  bindViewportSizing();
  primeLoaderPoster();
  populatePresetOptions();
  populateModelOptions();
  renderControls();
  bindControls();
  applyAspectRatio();
  await mountAvatar();
  startDirectorPolling();

  if (state.isCaptureMode && state.isReady) {
    pauseGesture({ updateStatus: false });
  }
}

function primeLoaderPoster() {
  const poster = dom.avatarLoaderPoster;
  const fullSrc = poster?.dataset.fullSrc;

  if (!poster || !fullSrc) {
    return;
  }

  const fullImage = new Image();
  fullImage.decoding = 'async';
  fullImage.onload = () => {
    poster.src = fullSrc;
  };
  fullImage.src = fullSrc;
}

function bindViewportSizing() {
  const syncViewportSizing = () => {
    const nextHeight =
      window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight || 0;

    if (!nextHeight) {
      return;
    }

    document.documentElement.style.setProperty('--viewport-height', `${Math.round(nextHeight)}px`);
  };

  state.viewportSyncHandler = syncViewportSizing;
  syncViewportSizing();
  window.addEventListener('resize', syncViewportSizing, { passive: true });
  window.addEventListener('orientationchange', syncViewportSizing);
  window.visualViewport?.addEventListener('resize', syncViewportSizing);
  window.visualViewport?.addEventListener('scroll', syncViewportSizing);
}

function populatePresetOptions() {
  if (!dom.screenPreset) {
    return;
  }

  const options = SCREEN_PRESETS.map((preset) => {
    const option = document.createElement('option');
    option.value = preset.id;
    option.textContent = preset.label;
    return option;
  });

  const customOption = document.createElement('option');
  customOption.value = 'custom';
  customOption.textContent = 'Custom';
  dom.screenPreset.replaceChildren(...options, customOption);
}

function populateModelOptions() {
  if (!dom.modelSelect) {
    return;
  }

  const options = BUNDLED_MODELS.map((model) => {
    const option = document.createElement('option');
    option.value = model.id;
    option.textContent = model.label;
    return option;
  });

  dom.modelSelect.replaceChildren(...options);
}

function populateActionOptions() {
  if (!dom.actionSelect) {
    return;
  }

  const options = state.availableGestures.map((gesture) => {
    const option = document.createElement('option');
    option.value = gesture.id;
    option.textContent = gesture.label;
    return option;
  });

  dom.actionSelect.replaceChildren(...options);

  if (!state.availableGestures.some((gesture) => gesture.id === state.selectedGestureId)) {
    state.selectedGestureId = state.availableGestures[0]?.id || DEFAULT_GESTURE_ID;
  }
}

function isDirectorMode() {
  return state.director.phase === 'countdown' || isDirectorPlaybackMode();
}

function isDirectorPlaybackMode() {
  return state.act.active && state.act.mode === 'director';
}

function isDirectorCountdownMode() {
  return state.director.phase === 'countdown';
}

function createSequenceId(prefix = 'local') {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload?.ok === false) {
    const error = new Error(payload?.error?.message || `Request failed: ${response.status}`);
    error.code = payload?.error?.code || 'REQUEST_FAILED';
    error.data = payload?.error?.data;
    throw error;
  }

  return payload;
}

async function postJson(url, body = {}) {
  return fetchJson(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
  });
}

function bindControls() {
  dom.screenPreset?.addEventListener('change', handlePresetChange);
  dom.screenWidth?.addEventListener('change', handleDimensionChange);
  dom.screenHeight?.addEventListener('change', handleDimensionChange);
  dom.modelSelect?.addEventListener('change', async () => {
    if (state.act.active) {
      renderControls();
      return;
    }

    const nextModelId = dom.modelSelect.value;
    if (!nextModelId || nextModelId === state.selectedModelId) {
      return;
    }

    state.selectedModelId = nextModelId;
    renderControls();

    if (state.isLoadingModel) {
      state.queuedModelId = nextModelId;
      setStatus(`Queued ${getSelectedModel().label}.`);
      return;
    }

    await loadSelectedModel();
  });

  dom.actionSelect?.addEventListener('change', () => {
    if (state.act.active) {
      renderControls();
      return;
    }

    state.selectedGestureId = dom.actionSelect.value || DEFAULT_GESTURE_ID;
    restartGesture();
  });

  dom.playButton?.addEventListener('click', () => {
    playGesture();
  });

  dom.pauseButton?.addEventListener('click', () => {
    pauseGesture();
  });

  dom.restartButton?.addEventListener('click', () => {
    if (isDirectorPlaybackMode()) {
      replayDirectorSequence();
      return;
    }

    restartGesture();
  });

  dom.stopButton?.addEventListener('click', () => {
    if (!isDirectorMode()) {
      return;
    }

    void stopDirectedSequenceFromUi();
  });

  dom.actButton?.addEventListener('click', () => {
    if (!state.isReady || state.isLoadingModel || state.isCapturing) {
      return;
    }

    if (state.act.active && state.act.mode === 'random') {
      stopActSequence();
      return;
    }

    startActSequence();
  });

  dom.panelMinimize?.addEventListener('click', () => {
    state.isPanelMinimized = !state.isPanelMinimized;
    renderControls();
  });

  dom.prepareCapture?.addEventListener('click', () => {
    if (!state.isReady || state.isLoadingModel || state.isCapturing) {
      return;
    }

    void captureScreenshot();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !state.isCaptureMode) {
      return;
    }

    event.preventDefault();
    restoreControls();
  });
}

function handlePresetChange() {
  const preset = SCREEN_PRESETS.find((item) => item.id === dom.screenPreset.value);
  if (!preset) {
    return;
  }

  state.captureWidth = preset.width;
  state.captureHeight = preset.height;
  renderControls();
  applyAspectRatio();
}

function handleDimensionChange() {
  state.captureWidth = clampInt(Number.parseInt(dom.screenWidth.value, 10), 240, 4096, state.captureWidth);
  state.captureHeight = clampInt(Number.parseInt(dom.screenHeight.value, 10), 240, 4096, state.captureHeight);
  renderControls();
  applyAspectRatio();
}

function renderControls() {
  const directorMode = isDirectorMode();
  const directorPlaybackMode = isDirectorPlaybackMode();
  const directorCountdownMode = isDirectorCountdownMode();

  document.body.dataset.directorMode = String(directorMode);
  document.body.dataset.directorCountdown = String(directorCountdownMode);

  if (dom.directorOverlay) {
    dom.directorOverlay.setAttribute('aria-hidden', String(!directorCountdownMode));
  }

  if (dom.directorCountdown) {
    dom.directorCountdown.textContent = directorCountdownMode && state.director.countdownValue
      ? String(state.director.countdownValue)
      : '';
  }

  if (dom.controlCard) {
    dom.controlCard.classList.toggle('is-minimized', state.isPanelMinimized);
  }

  if (dom.screenWidth) {
    dom.screenWidth.value = String(state.captureWidth);
    dom.screenWidth.disabled = state.isLoadingModel;
  }

  if (dom.screenHeight) {
    dom.screenHeight.value = String(state.captureHeight);
    dom.screenHeight.disabled = state.isLoadingModel;
  }

  if (dom.modelSelect) {
    dom.modelSelect.value = state.selectedModelId;
    dom.modelSelect.disabled = state.isLoadingModel || state.isCapturing || state.act.active;
  }

  if (dom.actionSelect) {
    dom.actionSelect.value = state.selectedGestureId;
    dom.actionSelect.disabled = state.isLoadingModel || !state.availableGestures.length || state.act.active;
  }

  if (dom.screenPreset) {
    const matchingPreset = SCREEN_PRESETS.find(
      (preset) => preset.width === state.captureWidth && preset.height === state.captureHeight,
    );
    dom.screenPreset.value = matchingPreset?.id || 'custom';
    dom.screenPreset.disabled = state.isLoadingModel || state.isCapturing;
  }

  const transportDisabled =
    state.isLoadingModel || state.isCapturing || !state.isReady || !state.availableGestures.length;

  if (dom.playButton) {
    dom.playButton.disabled = transportDisabled || (directorMode && !directorPlaybackMode);
    dom.playButton.classList.toggle(
      'is-active',
      !state.isGesturePaused && state.isReady && (!directorMode || directorPlaybackMode),
    );
    dom.playButton.setAttribute(
      'aria-pressed',
      String(!state.isGesturePaused && state.isReady && (!directorMode || directorPlaybackMode)),
    );
  }

  if (dom.pauseButton) {
    dom.pauseButton.disabled = transportDisabled || (directorMode && !directorPlaybackMode);
    dom.pauseButton.classList.toggle(
      'is-active',
      state.isGesturePaused && state.isReady && (!directorMode || directorPlaybackMode),
    );
    dom.pauseButton.setAttribute(
      'aria-pressed',
      String(state.isGesturePaused && state.isReady && (!directorMode || directorPlaybackMode)),
    );
  }

  if (dom.restartButton) {
    dom.restartButton.disabled =
      transportDisabled ||
      (state.act.active && !directorPlaybackMode) ||
      (directorMode && !directorPlaybackMode);
    dom.restartButton.setAttribute('aria-label', directorPlaybackMode ? 'Replay sequence' : 'Restart animation');
    dom.restartButton.setAttribute('title', directorPlaybackMode ? 'Replay' : 'Restart');
  }

  if (dom.stopButton) {
    dom.stopButton.disabled = !directorMode || state.isLoadingModel || state.isCapturing;
  }

  if (dom.actButton) {
    dom.actButton.disabled =
      state.isLoadingModel || state.isCapturing || !state.isReady || !state.availableGestures.length || directorMode;
    dom.actButton.classList.toggle('is-active', state.act.active && state.act.mode === 'random');
    dom.actButton.setAttribute('aria-pressed', String(state.act.active && state.act.mode === 'random'));
    dom.actButton.setAttribute('aria-label', state.act.active && state.act.mode === 'random' ? 'Stop act' : 'Act');
    dom.actButton.setAttribute('title', state.act.active && state.act.mode === 'random' ? 'Stop act' : 'Act');
  }

  if (dom.panelMinimize) {
    dom.panelMinimize.disabled = state.isCapturing;
    dom.panelMinimize.setAttribute('aria-pressed', String(state.isPanelMinimized));
    dom.panelMinimize.setAttribute('aria-label', state.isPanelMinimized ? 'Expand panel' : 'Minimize panel');
    dom.panelMinimize.setAttribute('title', state.isPanelMinimized ? 'Expand panel' : 'Minimize panel');
  }

  if (dom.prepareCapture) {
    dom.prepareCapture.disabled = !state.isReady || state.isLoadingModel || state.isCapturing || directorMode;
  }

  if (dom.panelNote) {
    dom.panelNote.textContent = directorMode
      ? 'Codex is directing the stage. Play, pause, replay, or stop.'
      : 'Pause on the frame you want, then click Screenshot. Press Escape to edit again.';
  }
}

function applyAspectRatio() {
  const aspectRatio = state.captureWidth / Math.max(state.captureHeight, 1);
  document.documentElement.style.setProperty('--capture-aspect', String(aspectRatio));
  queueSceneResize();
}

async function mountAvatar() {
  if (!dom.poseAvatar || !dom.captureFrame) {
    return;
  }

  dom.captureShell.dataset.hasLiveModel = 'false';
  setAvatarState('loading', 'Loading default pose…');

  state.heroLayer = createAvatarLayer({
    canvas: dom.poseAvatar,
    stageShell: dom.captureFrame,
    initialStageId: DEFAULT_STAGE_ID,
    initialEmoteId: DEFAULT_EMOTE_ID,
    initialGestureId: DEFAULT_GESTURE_ID,
    initialEnergy: DEFAULT_ENERGY,
    pointerMode: 'rotate',
    preserveDrawingBuffer: true,
    onLog(level, message, details) {
      if (level === 'error') {
        console.error(`[pose-studio avatar] ${message}`, details);
      }
    },
  });

  await loadSelectedModel();
}

async function loadSelectedModel() {
  if (!state.heroLayer) {
    return;
  }

  const selectedModel = getSelectedModel();
  const requestToken = ++state.loadToken;
  state.isLoadingModel = true;
  state.isGesturePaused = false;
  state.queuedModelId = null;
  renderControls();
  setAvatarState('loading', `Loading ${selectedModel.label}…`);

  try {
    const snapshot = await state.heroLayer.loadModel(selectedModel.path, {
      label: selectedModel.label,
      modelId: selectedModel.id,
    });

    if (requestToken !== state.loadToken) {
      return;
    }

    dom.captureShell.dataset.hasLiveModel = 'true';
    state.availableGestures = snapshot.availableGestures || [];
    populateActionOptions();
    await syncDirectorRuntime();
    state.heroLayer.setStage(DEFAULT_STAGE_ID);
    state.heroLayer.setEmote(DEFAULT_EMOTE_ID);
    state.heroLayer.setEnergy(DEFAULT_ENERGY);
    state.heroLayer.setSpeaking(false);
    state.heroLayer.setMouthCue('rest');
    state.heroLayer.recenterGaze?.();
    state.isReady = true;
    state.isLoadingModel = false;
    dom.captureShell.dataset.avatarState = 'ready';
    renderControls();

    if (state.isCaptureMode) {
      pauseGesture({ updateStatus: false });
    } else if (!state.act.active) {
      restartGesture();
    }

    queueSceneResize();
  } catch (error) {
    console.error('Failed to load pose-studio avatar', error);
    state.isReady = false;
    state.isLoadingModel = false;
    renderControls();
    setAvatarState('error', 'Avatar load failed. Refresh to retry.');
  } finally {
    if (requestToken === state.loadToken && state.queuedModelId && state.queuedModelId !== selectedModel.id) {
      state.selectedModelId = state.queuedModelId;
      state.queuedModelId = null;
      renderControls();
      await loadSelectedModel();
    }
  }
}

async function syncDirectorRuntime() {
  if (!state.availableGestures.length) {
    return;
  }

  try {
    await postJson('/api/director/runtime', {
      modelId: state.selectedModelId,
      modelLabel: getSelectedModel().label,
      availableGestures: state.availableGestures,
    });
  } catch (error) {
    console.warn('Failed to sync pose-studio runtime to director bridge', error);
  }
}

function startDirectorPolling() {
  scheduleDirectorPoll(250);
}

function scheduleDirectorPoll(delayMs = 650) {
  window.clearTimeout(state.director.pollTimerId);
  state.director.pollTimerId = window.setTimeout(() => {
    void pollDirectorState();
  }, delayMs);
}

async function pollDirectorState() {
  if (state.director.polling) {
    return;
  }

  state.director.polling = true;

  try {
    const payload = await fetchJson('/api/director/state');
    const activeSequence = payload?.state?.director?.activeSequence || null;

    if (activeSequence?.sequenceId && activeSequence.sequenceId !== state.director.lastSequenceId) {
      await startDirectorSequence(activeSequence);
      state.director.lastSequenceId = activeSequence.sequenceId;
    } else if (!activeSequence && isDirectorMode()) {
      if (isDirectorPlaybackMode()) {
        stopActSequence({ keepStatus: true, skipDirectorStop: true });
      } else {
        clearDirectorTakeoverState();
      }
      resetToWaitingPose({
        statusLabel: 'Director mode finished. Waiting on Pose.',
      });
    }
  } catch (error) {
    console.warn('Failed to poll pose-studio director state', error);
  } finally {
    state.director.polling = false;
    scheduleDirectorPoll();
  }
}

function playGesture() {
  if (!state.heroLayer || !state.isReady) {
    return;
  }

  state.heroLayer.setPoseSampleTime(null);
  state.heroLayer.setGesturePaused(false);
  state.isGesturePaused = false;

  if (state.act.active) {
    resumeSequence();
    return;
  }

  renderControls();
  setStatus(buildPlayingStatus());
}

function pauseGesture({ updateStatus = true } = {}) {
  if (!state.heroLayer || !state.isReady) {
    return;
  }

  state.heroLayer.setPoseSampleTime(null);
  state.heroLayer.setGesturePaused(true);
  state.isGesturePaused = true;

  if (state.act.active) {
    pauseSequence();
  }

  renderControls();
  if (updateStatus) {
    setStatus(state.act.active ? buildSequencePausedStatus() : buildPausedStatus());
  }
}

function restartGesture() {
  if (state.act.active) {
    return;
  }

  if (!state.heroLayer || !state.isReady) {
    return;
  }

  state.heroLayer.setPoseSampleTime(null);
  state.heroLayer.setGesture(state.selectedGestureId, { restart: true });
  state.heroLayer.setGesturePaused(false);
  state.isGesturePaused = false;
  renderControls();
  setStatus(buildRestartedStatus());
}

async function captureScreenshot() {
  if (!state.isReady || !dom.poseAvatar) {
    return;
  }

  const shouldResumeAfterCapture = !state.isGesturePaused;
  state.isCapturing = true;
  renderControls();
  state.isCaptureMode = true;
  document.body.dataset.captureMode = 'true';
  pauseGesture({ updateStatus: false });
  queueSceneResize();
  triggerCaptureFlash();
  void playCaptureSound();

  try {
    const exportCanvas = buildCaptureCanvas();
    downloadCapture(exportCanvas, buildCaptureFilename());
    await waitMs(270);
    restoreControls();
    if (shouldResumeAfterCapture) {
      playGesture();
    } else {
      setStatus(`Downloaded ${getSelectedModel().label} ${getSelectedGesture()?.label || state.selectedGestureId}.`);
    }
  } catch (error) {
    console.error('Failed to capture pose-studio screenshot', error);
    setStatus('Capture failed. Try again.');
    restoreControls();
  } finally {
    state.isCapturing = false;
    renderControls();
  }
}

function restoreControls({ statusLabel = '' } = {}) {
  state.isCaptureMode = false;
  document.body.dataset.captureMode = 'false';
  renderControls();
  setStatus(statusLabel || (state.isGesturePaused ? buildPausedStatus() : buildPlayingStatus()));
  queueSceneResize();
}

function triggerCaptureFlash() {
  if (!dom.captureFlash) {
    return;
  }

  window.clearTimeout(state.flashTimeout);
  dom.captureFlash.classList.remove('is-active');
  void dom.captureFlash.offsetWidth;
  dom.captureFlash.classList.add('is-active');
  state.flashTimeout = window.setTimeout(() => {
    dom.captureFlash?.classList.remove('is-active');
  }, 420);
}

async function playCaptureSound() {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) {
    return;
  }

  try {
    if (!state.captureAudioContext) {
      state.captureAudioContext = new AudioContextCtor();
    }

    if (state.captureAudioContext.state === 'suspended') {
      await state.captureAudioContext.resume();
    }

    const context = state.captureAudioContext;
    const startAt = context.currentTime;
    const noiseBuffer = getCaptureNoiseBuffer(context);

    const createNoiseClick = (offset, attack, release, gainValue, filterFrequency, qValue, filterType = 'bandpass') => {
      const source = context.createBufferSource();
      source.buffer = noiseBuffer;

      const filter = context.createBiquadFilter();
      filter.type = filterType;
      filter.frequency.setValueAtTime(filterFrequency, startAt + offset);
      filter.Q.setValueAtTime(qValue, startAt + offset);

      const gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, startAt + offset);
      gain.gain.exponentialRampToValueAtTime(gainValue, startAt + offset + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + offset + release);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(context.destination);
      source.start(startAt + offset);
      source.stop(startAt + offset + release + 0.02);
    };

    createNoiseClick(0, 0.0015, 0.022, 0.42, 2600, 1.8, 'highpass');
    createNoiseClick(0.038, 0.0012, 0.018, 0.31, 2100, 1.4, 'highpass');

    const shutterThunkGain = context.createGain();
    shutterThunkGain.gain.setValueAtTime(0.0001, startAt);
    shutterThunkGain.gain.exponentialRampToValueAtTime(0.09, startAt + 0.004);
    shutterThunkGain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.05);
    shutterThunkGain.connect(context.destination);

    const shutterThunk = context.createOscillator();
    shutterThunk.type = 'triangle';
    shutterThunk.frequency.setValueAtTime(280, startAt);
    shutterThunk.frequency.exponentialRampToValueAtTime(130, startAt + 0.042);
    shutterThunk.connect(shutterThunkGain);
    shutterThunk.start(startAt);
    shutterThunk.stop(startAt + 0.055);
  } catch (error) {
    console.warn('Capture sound unavailable', error);
  }
}

function startActSequence() {
  if (!state.heroLayer || !state.isReady || !state.availableGestures.length) {
    return;
  }

  const sequence = buildActSequence(10);
  if (!sequence.length) {
    return;
  }

  activateSequence({
    mode: 'random',
    sequenceId: createSequenceId('act'),
    prompt: '',
    modelId: state.selectedModelId,
    steps: sequence,
  });
}

function buildActSequence(count = 10) {
  const pool = state.availableGestures.map((gesture) => gesture.id).filter(Boolean);
  if (!pool.length) {
    return [];
  }

  const sequence = [];
  let previousGestureId = state.selectedGestureId;

  for (let index = 0; index < count; index += 1) {
    let nextGestureId = pool[Math.floor(Math.random() * pool.length)];

    if (pool.length > 1) {
      let attempts = 0;
      while (nextGestureId === previousGestureId && attempts < 8) {
        nextGestureId = pool[Math.floor(Math.random() * pool.length)];
        attempts += 1;
      }
    }

    sequence.push({
      gestureId: nextGestureId,
      durationMs: getGestureDurationMs(nextGestureId),
    });
    previousGestureId = nextGestureId;
  }

  return sequence;
}

async function startDirectorSequence(sequence) {
  if (!sequence?.sequenceId || !Array.isArray(sequence.steps) || !sequence.steps.length) {
    return;
  }

  if (state.act.active) {
    stopActSequence({ keepStatus: true, skipDirectorStop: true });
  } else if (isDirectorCountdownMode()) {
    clearDirectorTakeoverState();
  }

  const targetModelId = resolveRequestedModelId(sequence.modelId);
  if (targetModelId && targetModelId !== state.selectedModelId) {
    state.selectedModelId = targetModelId;
    renderControls();
    await loadSelectedModel();
  }

  beginDirectorSequenceWithCountdown({
    mode: 'director',
    sequenceId: sequence.sequenceId,
    prompt: sequence.prompt || '',
    modelId: targetModelId || state.selectedModelId,
    steps: sequence.steps.map((step) => ({
      gestureId: step.gestureId,
      durationMs: Number(step.durationMs) || getGestureDurationMs(step.gestureId),
    })),
  });
}

function beginDirectorSequenceWithCountdown(sequence) {
  if (!sequence?.sequenceId || !Array.isArray(sequence.steps) || !sequence.steps.length) {
    return;
  }

  clearDirectorTakeoverState();
  state.director.phase = 'countdown';
  state.director.pendingSequence = sequence;
  state.director.countdownValue = DIRECTOR_COUNTDOWN_START;
  renderControls();
  setStatus(`Director mode starts in ${state.director.countdownValue}.`);
  scheduleDirectorCountdownTick();
}

function scheduleDirectorCountdownTick() {
  clearDirectorCountdownTimer();
  state.director.countdownTimerId = window.setTimeout(() => {
    advanceDirectorCountdown();
  }, DIRECTOR_COUNTDOWN_STEP_MS);
}

function advanceDirectorCountdown() {
  if (!isDirectorCountdownMode() || !state.director.pendingSequence) {
    return;
  }

  if (state.director.countdownValue > 1) {
    state.director.countdownValue -= 1;
    renderControls();
    setStatus(`Director mode starts in ${state.director.countdownValue}.`);
    scheduleDirectorCountdownTick();
    return;
  }

  const pendingSequence = state.director.pendingSequence;
  clearDirectorCountdownTimer();
  state.director.countdownValue = 0;
  state.director.phase = 'playing';
  renderControls();
  activateSequence(pendingSequence);
}

function activateSequence({
  mode = 'random',
  sequenceId = '',
  prompt = '',
  modelId = '',
  steps = [],
} = {}) {
  if (!state.heroLayer || !state.isReady || !Array.isArray(steps) || !steps.length) {
    return;
  }

  clearActTimer();
  state.act.active = true;
  state.act.mode = mode;
  state.act.sequenceId = sequenceId || createSequenceId(mode);
  state.act.prompt = prompt;
  state.act.modelId = modelId || state.selectedModelId;
  state.act.sequence = steps;
  state.act.index = -1;
  state.act.currentGestureId = '';
  state.act.remainingMs = 0;
  state.isGesturePaused = false;

  if (mode === 'director') {
    clearDirectorCountdownTimer();
    state.director.phase = 'playing';
    state.director.countdownValue = 0;
    state.director.pendingSequence = null;
    renderControls();
  }

  playSequenceStep(0);
}

function playSequenceStep(index) {
  if (!state.heroLayer || !state.act.active) {
    return;
  }

  const step = state.act.sequence[index];
  const gestureId = step?.gestureId;
  if (!gestureId) {
    finishSequence();
    return;
  }

  state.act.index = index;
  state.act.currentGestureId = gestureId;
  state.selectedGestureId = gestureId;
  state.heroLayer.setPoseSampleTime(null);
  state.heroLayer.setGesture(gestureId, { restart: true });
  state.heroLayer.setGesturePaused(false);
  state.isGesturePaused = false;
  scheduleSequenceAdvance(getSequenceStepDuration(step));
  renderControls();
  setStatus(buildSequencePlayingStatus());

  if (isDirectorMode()) {
    void reportDirectorPlayback('playing');
  }
}

function scheduleSequenceAdvance(durationMs) {
  clearActTimer();
  state.act.remainingMs = durationMs;
  state.act.stepEndsAt = performance.now() + durationMs;
  state.act.timerId = window.setTimeout(() => {
    if (!state.act.active || state.isGesturePaused) {
      return;
    }

    const nextIndex = state.act.index + 1;
    if (nextIndex >= state.act.sequence.length) {
      finishSequence();
      return;
    }

    playSequenceStep(nextIndex);
  }, durationMs);
}

function pauseSequence() {
  if (!state.act.active) {
    return;
  }

  state.act.remainingMs = Math.max(120, state.act.stepEndsAt - performance.now());
  clearActTimer({ keepRemaining: true });

  if (isDirectorMode()) {
    void reportDirectorPlayback('paused');
  }
}

function resumeSequence() {
  if (!state.act.active) {
    renderControls();
    setStatus(buildPlayingStatus());
    return;
  }

  const step = state.act.sequence[state.act.index] || null;
  const remainingMs = Math.max(120, state.act.remainingMs || getSequenceStepDuration(step));
  scheduleSequenceAdvance(remainingMs);
  renderControls();
  setStatus(buildSequencePlayingStatus());

  if (isDirectorMode()) {
    void reportDirectorPlayback('playing');
  }
}

function finishSequence() {
  const wasDirector = isDirectorPlaybackMode();
  const completedSequenceId = state.act.sequenceId;
  clearActTimer();
  state.act.active = false;
  state.act.mode = '';
  state.act.sequenceId = '';
  state.act.prompt = '';
  state.act.modelId = '';
  state.act.sequence = [];
  state.act.index = -1;
  state.act.currentGestureId = '';
  state.act.remainingMs = 0;
  if (wasDirector) {
    clearDirectorTakeoverState();
    if (completedSequenceId) {
      state.director.lastSequenceId = completedSequenceId;
      void reportDirectorPlayback('completed', completedSequenceId);
    }
    resetToWaitingPose({
      statusLabel: 'Directed sequence complete. Waiting on Pose.',
    });
    return;
  }

  renderControls();
  setStatus(buildActCompleteStatus());
}

function stopActSequence({ keepStatus = false, skipDirectorStop = false } = {}) {
  const hadActiveAct = state.act.active;
  const previousMode = state.act.mode;
  const previousSequenceId = state.act.sequenceId;
  clearActTimer();
  state.act.active = false;
  state.act.mode = '';
  state.act.sequenceId = '';
  state.act.prompt = '';
  state.act.modelId = '';
  state.act.sequence = [];
  state.act.index = -1;
  state.act.currentGestureId = '';
  state.act.remainingMs = 0;

  if (previousMode === 'director' && !skipDirectorStop && previousSequenceId) {
    state.director.lastSequenceId = previousSequenceId;
    void reportDirectorStop(previousSequenceId);
  }

  if (previousMode === 'director') {
    clearDirectorTakeoverState();
    if (!keepStatus) {
      resetToWaitingPose({
        statusLabel: 'Director mode stopped. Waiting on Pose.',
      });
    } else {
      renderControls();
    }
    return;
  }

  renderControls();

  if (hadActiveAct && !keepStatus) {
    setStatus(buildActStoppedStatus());
  }
}

function clearActTimer({ keepRemaining = false } = {}) {
  if (state.act.timerId) {
    window.clearTimeout(state.act.timerId);
    state.act.timerId = 0;
  }

  state.act.stepEndsAt = 0;
  if (!keepRemaining) {
    state.act.remainingMs = 0;
  }
}

function clearDirectorCountdownTimer() {
  if (state.director.countdownTimerId) {
    window.clearTimeout(state.director.countdownTimerId);
    state.director.countdownTimerId = 0;
  }
}

function clearDirectorTakeoverState() {
  clearDirectorCountdownTimer();
  state.director.phase = 'idle';
  state.director.countdownValue = 0;
  state.director.pendingSequence = null;
}

function getSequenceStepDuration(step) {
  return Math.max(Number(step?.durationMs) || getGestureDurationMs(step?.gestureId), 900);
}

async function reportDirectorPlayback(status, sequenceId = state.act.sequenceId) {
  if (!sequenceId) {
    return;
  }

  try {
    await postJson('/api/director/playback', {
      sequenceId,
      status,
      currentStepIndex: state.act.index,
      currentGestureId: state.act.currentGestureId,
    });
  } catch (error) {
    console.warn('Failed to report pose-studio director playback', error);
  }
}

async function reportDirectorStop(sequenceId = state.act.sequenceId) {
  if (!sequenceId) {
    return;
  }

  try {
    await postJson('/api/director/stop', {
      sequenceId,
    });
  } catch (error) {
    console.warn('Failed to stop pose-studio director sequence', error);
  }
}

function replayDirectorSequence() {
  if (!isDirectorPlaybackMode()) {
    return;
  }

  activateSequence({
    mode: 'director',
    sequenceId: state.act.sequenceId,
    prompt: state.act.prompt,
    modelId: state.act.modelId,
    steps: state.act.sequence,
  });
}

async function stopDirectedSequenceFromUi() {
  if (!isDirectorMode()) {
    return;
  }

  const sequenceId = state.act.sequenceId || state.director.pendingSequence?.sequenceId || '';
  if (sequenceId) {
    state.director.lastSequenceId = sequenceId;
    await reportDirectorStop(sequenceId);
  }

  if (isDirectorPlaybackMode()) {
    stopActSequence({ keepStatus: true, skipDirectorStop: true });
  } else {
    clearDirectorTakeoverState();
  }

  resetToWaitingPose({
    statusLabel: 'Director mode stopped. Waiting on Pose.',
  });
}

function resetToWaitingPose({ statusLabel = 'Waiting on Pose.' } = {}) {
  state.selectedGestureId = DEFAULT_GESTURE_ID;

  if (state.heroLayer && state.isReady) {
    state.heroLayer.setPoseSampleTime(null);
    state.heroLayer.setGesture(DEFAULT_GESTURE_ID, { restart: true });
    state.heroLayer.setGesturePaused(false);
  }

  state.isGesturePaused = false;
  populateActionOptions();
  renderControls();
  setStatus(statusLabel);
}

function getGestureDurationMs(gestureId) {
  const gesture = state.availableGestures.find((item) => item.id === gestureId);
  const durationMs = Number(gesture?.durationMs) || 0;
  return Math.max(durationMs || 2200, 900);
}

function getCaptureNoiseBuffer(context) {
  if (state.captureNoiseBuffer?.sampleRate === context.sampleRate) {
    return state.captureNoiseBuffer;
  }

  const noiseDurationSeconds = 0.25;
  const frameCount = Math.max(1, Math.floor(context.sampleRate * noiseDurationSeconds));
  const noiseBuffer = context.createBuffer(1, frameCount, context.sampleRate);
  const channelData = noiseBuffer.getChannelData(0);

  for (let index = 0; index < channelData.length; index += 1) {
    channelData[index] = (Math.random() * 2 - 1) * 0.9;
  }

  state.captureNoiseBuffer = noiseBuffer;
  return noiseBuffer;
}

function waitMs(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function buildCaptureCanvas() {
  if (!dom.poseAvatar || !dom.poseAvatar.width || !dom.poseAvatar.height) {
    throw new Error('Avatar canvas is not ready for capture.');
  }

  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = state.captureWidth;
  exportCanvas.height = state.captureHeight;

  const context = exportCanvas.getContext('2d');
  if (!context) {
    throw new Error('Failed to create a capture context.');
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';

  drawCaptureBackground(context, exportCanvas.width, exportCanvas.height);
  drawCaptureStage(context, exportCanvas.width, exportCanvas.height);
  context.drawImage(dom.poseAvatar, 0, 0, exportCanvas.width, exportCanvas.height);

  return exportCanvas;
}

function drawCaptureBackground(context, width, height) {
  const baseGradient = context.createLinearGradient(0, 0, 0, height);
  baseGradient.addColorStop(0, '#fdfeff');
  baseGradient.addColorStop(0.48, '#f4f7ff');
  baseGradient.addColorStop(1, '#f8fbff');
  context.fillStyle = baseGradient;
  context.fillRect(0, 0, width, height);

  drawGlow(context, width * 0.14, height * 0.18, Math.min(width, height) * 0.32, 'rgba(47, 168, 255, 0.16)');
  drawGlow(context, width * 0.84, height * 0.12, Math.min(width, height) * 0.34, 'rgba(124, 92, 255, 0.18)');
  drawGlow(context, width * 0.78, height * 0.74, Math.min(width, height) * 0.22, 'rgba(200, 255, 71, 0.11)');
  drawGlow(context, width * 0.52, height * 0.34, Math.min(width, height) * 0.32, 'rgba(47, 168, 255, 0.2)');
  drawGlow(context, width * 0.43, height * 0.74, Math.min(width, height) * 0.4, 'rgba(124, 92, 255, 0.18)');
  drawGlow(context, width * 0.58, height * 0.88, Math.min(width, height) * 0.28, 'rgba(200, 255, 71, 0.11)');
  drawGlow(context, width * 0.48, height * 0.32, Math.min(width, height) * 0.26, 'rgba(47, 168, 255, 0.1)');
  drawGlow(context, width * 0.62, height * 0.82, Math.min(width, height) * 0.3, 'rgba(124, 92, 255, 0.14)');
}

function drawCaptureStage(context, width, height) {
  const outerWidth = Math.min(width * 0.74, 680);
  const outerHeight = height * 0.155;
  const outerCenterY = height - 26 - outerHeight / 2;

  drawGlow(context, width / 2, outerCenterY + outerHeight * 0.16, outerWidth * 0.52, 'rgba(47, 168, 255, 0.08)');

  context.save();
  context.beginPath();
  context.ellipse(width / 2, outerCenterY, outerWidth / 2, outerHeight / 2, 0, 0, Math.PI * 2);
  const outerFill = context.createRadialGradient(width / 2, outerCenterY, outerWidth * 0.08, width / 2, outerCenterY, outerWidth * 0.52);
  outerFill.addColorStop(0, 'rgba(92, 171, 255, 0.12)');
  outerFill.addColorStop(1, 'rgba(92, 171, 255, 0)');
  context.fillStyle = outerFill;
  context.fill();
  context.lineWidth = 1;
  context.strokeStyle = 'rgba(92, 171, 255, 0.22)';
  context.stroke();
  context.restore();

  const innerWidth = Math.min(width * 0.43, 360);
  const innerHeight = height * 0.085;
  const innerCenterY = height - 42 - innerHeight / 2;
  context.save();
  context.beginPath();
  context.ellipse(width / 2, innerCenterY, innerWidth / 2, innerHeight / 2, 0, 0, Math.PI * 2);
  const innerFill = context.createRadialGradient(width / 2, innerCenterY, innerWidth * 0.05, width / 2, innerCenterY, innerWidth * 0.5);
  innerFill.addColorStop(0, 'rgba(200, 255, 71, 0.08)');
  innerFill.addColorStop(1, 'rgba(200, 255, 71, 0)');
  context.fillStyle = innerFill;
  context.fill();
  context.lineWidth = 1;
  context.strokeStyle = 'rgba(200, 255, 71, 0.2)';
  context.stroke();
  context.restore();

  const floorLeft = width * 0.18;
  const floorRight = width * 0.82;
  const floorTop = height - 36;
  const floorHeight = 22;
  const floorGradient = context.createLinearGradient(0, floorTop, 0, floorTop + floorHeight);
  floorGradient.addColorStop(0, 'rgba(255, 255, 255, 0.26)');
  floorGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  context.fillStyle = floorGradient;
  context.fillRect(floorLeft, floorTop, floorRight - floorLeft, floorHeight);

  drawGlow(context, width / 2, floorTop + 5, (floorRight - floorLeft) * 0.34, 'rgba(79, 182, 255, 0.14)');

  context.strokeStyle = 'rgba(101, 160, 255, 0.46)';
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(floorLeft, floorTop);
  context.lineTo(floorRight, floorTop);
  context.stroke();
}

function drawGlow(context, centerX, centerY, radius, color) {
  const gradient = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.fill();
}

function buildCaptureFilename() {
  const model = slugifyCapturePart(getSelectedModel().label);
  const gesture = slugifyCapturePart(getSelectedGesture()?.label || state.selectedGestureId);
  return `pose-studio-${model}-${gesture}-${state.captureWidth}x${state.captureHeight}.png`;
}

function slugifyCapturePart(value) {
  return String(value || 'capture')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'capture';
}

function downloadCapture(canvas, filename) {
  const downloadLink = document.createElement('a');
  downloadLink.href = canvas.toDataURL('image/png');
  downloadLink.download = filename;
  downloadLink.rel = 'noopener';
  document.body.append(downloadLink);
  downloadLink.click();
  downloadLink.remove();
}

function getSelectedGesture() {
  return state.availableGestures.find((gesture) => gesture.id === state.selectedGestureId) || null;
}

function getSelectedModel() {
  return BUNDLED_MODELS.find((model) => model.id === state.selectedModelId) || DEFAULT_MODEL;
}

function buildPlayingStatus() {
  const selectedModel = getSelectedModel();
  const selectedGesture = getSelectedGesture();
  return `${selectedModel.label} is playing ${selectedGesture?.label || state.selectedGestureId}.`;
}

function buildPausedStatus() {
  const selectedModel = getSelectedModel();
  const selectedGesture = getSelectedGesture();
  return `${selectedModel.label} is paused on ${selectedGesture?.label || state.selectedGestureId}.`;
}

function buildRestartedStatus() {
  const selectedModel = getSelectedModel();
  const selectedGesture = getSelectedGesture();
  return `${selectedModel.label} restarted ${selectedGesture?.label || state.selectedGestureId}.`;
}

function buildSequencePlayingStatus() {
  const selectedModel = getSelectedModel();
  const currentGestureId = state.act.currentGestureId || state.selectedGestureId;
  const currentGesture =
    state.availableGestures.find((gesture) => gesture.id === currentGestureId)?.label || currentGestureId;
  if (isDirectorMode()) {
    return `${selectedModel.label} is performing directed sequence ${state.act.index + 1} of ${state.act.sequence.length}: ${currentGesture}.`;
  }

  return `${selectedModel.label} is acting ${state.act.index + 1} of ${state.act.sequence.length}: ${currentGesture}.`;
}

function buildSequencePausedStatus() {
  const selectedModel = getSelectedModel();
  if (isDirectorMode()) {
    return `${selectedModel.label} paused the directed sequence on step ${Math.max(state.act.index + 1, 1)} of ${state.act.sequence.length}.`;
  }

  return `${selectedModel.label} paused the act on step ${Math.max(state.act.index + 1, 1)} of ${state.act.sequence.length}.`;
}

function buildActCompleteStatus() {
  const selectedModel = getSelectedModel();
  return `${selectedModel.label} finished the 10-step act.`;
}

function buildActStoppedStatus() {
  const selectedModel = getSelectedModel();
  return `${selectedModel.label} stopped the act.`;
}

function queueSceneResize() {
  window.cancelAnimationFrame(state.resizeRaf);
  state.resizeRaf = window.requestAnimationFrame(() => {
    window.dispatchEvent(new Event('resize'));
  });
}

function setAvatarState(nextState, label) {
  if (dom.captureShell) {
    dom.captureShell.dataset.avatarState = nextState;
  }

  setStatus(label);

  if (dom.avatarLoadingLabel && label) {
    dom.avatarLoadingLabel.textContent = label;
  }
}

function setStatus(label) {
  if (dom.statusLine && label) {
    dom.statusLine.textContent = label;
  }
}

function clampInt(value, min, max, fallback) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(value)));
}
