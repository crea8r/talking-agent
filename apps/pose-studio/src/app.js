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
const PAGE_PARAMS = new URLSearchParams(window.location.search);

const dom = {
  captureShell: document.querySelector('#capture-shell'),
  captureFrame: document.querySelector('#capture-frame'),
  poseAvatar: document.querySelector('#pose-avatar'),
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
  panelMinimize: document.querySelector('#panel-minimize'),
  statusLine: document.querySelector('#status-line'),
  prepareCapture: document.querySelector('#prepare-capture'),
};

const state = {
  heroLayer: null,
  isReady: false,
  isLoadingModel: false,
  isCaptureMode: PAGE_PARAMS.get('capture') === '1',
  isGesturePaused: false,
  isPanelMinimized: false,
  captureWidth: readIntParam('width', DEFAULT_PRESET.width, 240, 4096),
  captureHeight: readIntParam('height', DEFAULT_PRESET.height, 240, 4096),
  selectedModelId: resolveRequestedModelId(PAGE_PARAMS.get('model')),
  selectedGestureId: PAGE_PARAMS.get('action') || DEFAULT_GESTURE_ID,
  availableGestures: [],
  queuedModelId: null,
  loadToken: 0,
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
  bindViewportSizing();
  primeLoaderPoster();
  populatePresetOptions();
  populateModelOptions();
  renderControls();
  bindControls();
  applyAspectRatio();
  await mountAvatar();

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

function bindControls() {
  dom.screenPreset?.addEventListener('change', handlePresetChange);
  dom.screenWidth?.addEventListener('change', handleDimensionChange);
  dom.screenHeight?.addEventListener('change', handleDimensionChange);
  dom.modelSelect?.addEventListener('change', async () => {
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
    restartGesture();
  });

  dom.panelMinimize?.addEventListener('click', () => {
    state.isPanelMinimized = !state.isPanelMinimized;
    renderControls();
  });

  dom.prepareCapture?.addEventListener('click', () => {
    if (!state.isReady || state.isLoadingModel) {
      return;
    }

    state.isCaptureMode = true;
    document.body.dataset.captureMode = 'true';
    pauseGesture({ updateStatus: false });
    queueSceneResize();
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
  }

  if (dom.actionSelect) {
    dom.actionSelect.value = state.selectedGestureId;
    dom.actionSelect.disabled = state.isLoadingModel || !state.availableGestures.length;
  }

  if (dom.screenPreset) {
    const matchingPreset = SCREEN_PRESETS.find(
      (preset) => preset.width === state.captureWidth && preset.height === state.captureHeight,
    );
    dom.screenPreset.value = matchingPreset?.id || 'custom';
    dom.screenPreset.disabled = state.isLoadingModel;
  }

  const transportDisabled = state.isLoadingModel || !state.isReady || !state.availableGestures.length;

  if (dom.playButton) {
    dom.playButton.disabled = transportDisabled;
    dom.playButton.classList.toggle('is-active', !state.isGesturePaused && state.isReady);
    dom.playButton.setAttribute('aria-pressed', String(!state.isGesturePaused && state.isReady));
  }

  if (dom.pauseButton) {
    dom.pauseButton.disabled = transportDisabled;
    dom.pauseButton.classList.toggle('is-active', state.isGesturePaused && state.isReady);
    dom.pauseButton.setAttribute('aria-pressed', String(state.isGesturePaused && state.isReady));
  }

  if (dom.restartButton) {
    dom.restartButton.disabled = transportDisabled;
  }

  if (dom.panelMinimize) {
    dom.panelMinimize.setAttribute('aria-pressed', String(state.isPanelMinimized));
    dom.panelMinimize.setAttribute('aria-label', state.isPanelMinimized ? 'Expand panel' : 'Minimize panel');
    dom.panelMinimize.setAttribute('title', state.isPanelMinimized ? 'Expand panel' : 'Minimize panel');
  }

  if (dom.prepareCapture) {
    dom.prepareCapture.disabled = !state.isReady || state.isLoadingModel;
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
    } else {
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

function playGesture() {
  if (!state.heroLayer || !state.isReady) {
    return;
  }

  state.heroLayer.setPoseSampleTime(null);
  state.heroLayer.setGesturePaused(false);
  state.isGesturePaused = false;
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
  renderControls();
  if (updateStatus) {
    setStatus(buildPausedStatus());
  }
}

function restartGesture() {
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

function restoreControls() {
  state.isCaptureMode = false;
  document.body.dataset.captureMode = 'false';
  renderControls();
  setStatus(state.isGesturePaused ? buildPausedStatus() : buildPlayingStatus());
  queueSceneResize();
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
