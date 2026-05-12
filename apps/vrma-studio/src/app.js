import {
  BUNDLED_MODELS,
  DEFAULT_MODEL,
  createAvatarLayer,
} from '/vendor/avatar-layer-browser/index.js';
import {
  createEmptyVrmaDocument,
  parseVrmaDocument,
  serializeVrmaDocument,
} from '/vendor/vrma-core.js';
import { openFilePicker } from './lib/file-picker.js';
import { createRuntimeController } from './lib/runtime.js';
import { createEditorStore } from './lib/store.js';

function buildDefaultSkeleton() {
  return {
    hips: { translation: [0, 0.9, 0], children: ['spine', 'leftUpperLeg', 'rightUpperLeg'] },
    spine: { translation: [0, 0.1, 0], children: ['chest'] },
    chest: { translation: [0, 0.1, 0], children: ['neck', 'leftUpperArm', 'rightUpperArm'] },
    neck: { translation: [0, 0.12, 0], children: ['head'] },
    head: { translation: [0, 0.08, 0], children: [] },
    leftUpperArm: { translation: [0.08, 0.02, 0], children: ['leftLowerArm'] },
    leftLowerArm: { translation: [0.2, 0, 0], children: ['leftHand'] },
    leftHand: { translation: [0.18, 0, 0], children: [] },
    rightUpperArm: { translation: [-0.08, 0.02, 0], children: ['rightLowerArm'] },
    rightLowerArm: { translation: [-0.2, 0, 0], children: ['rightHand'] },
    rightHand: { translation: [-0.18, 0, 0], children: [] },
    leftUpperLeg: { translation: [0.08, -0.05, 0], children: ['leftLowerLeg'] },
    leftLowerLeg: { translation: [0, -0.38, 0], children: ['leftFoot'] },
    leftFoot: { translation: [0, -0.37, 0.03], children: [] },
    rightUpperLeg: { translation: [-0.08, -0.05, 0], children: ['rightLowerLeg'] },
    rightLowerLeg: { translation: [0, -0.38, 0], children: ['rightFoot'] },
    rightFoot: { translation: [0, -0.37, 0.03], children: [] },
  };
}

function downloadBytes(bytes, filename) {
  const blob = new Blob([bytes], { type: 'model/gltf-binary' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function trackRows(state) {
  if (!state.document) {
    return [];
  }

  const rows = [];

  state.document.clip.translationTracks.forEach((track, boneName) => {
    rows.push({ label: `${boneName} position`, track });
  });

  state.document.clip.rotationTracks.forEach((track, boneName) => {
    rows.push({ label: `${boneName} rotation`, track });
  });

  return rows;
}

function getTimelineDuration(state) {
  return Math.max(state.document?.clip.duration || 0, 0.001);
}

function timeToPercent(time, duration) {
  if (!Number.isFinite(time) || !Number.isFinite(duration) || duration <= 0) {
    return 0;
  }

  return Math.min(100, Math.max(0, (time / duration) * 100));
}

export function createVrmaStudioApp() {
  const dom = {
    statusPrimary: document.querySelector('#status-primary'),
    selectionLabel: document.querySelector('#inspector-selection'),
    clipLabel: document.querySelector('#inspector-clip'),
    trackDetail: document.querySelector('#track-detail-value'),
    trackList: document.querySelector('#timeline-track-list'),
    timelineGrid: document.querySelector('#timeline-grid'),
    playhead: document.querySelector('#timeline-playhead'),
    autoKeyToggle: document.querySelector('#auto-key-toggle'),
    actionNew: document.querySelector('#action-new'),
    actionOpenVrm: document.querySelector('#action-open-vrm'),
    actionOpenVrma: document.querySelector('#action-open-vrma'),
    actionSave: document.querySelector('#action-save'),
    actionSaveAs: document.querySelector('#action-save-as'),
    actionAddKey: document.querySelector('#action-add-key'),
    actionPlay: document.querySelector('#action-play'),
    actionPause: document.querySelector('#action-pause'),
    actionStop: document.querySelector('#action-stop'),
    vrmFileInput: document.querySelector('#vrm-file-input'),
    vrmaFileInput: document.querySelector('#vrma-file-input'),
    viewportCanvas: document.querySelector('#viewport-canvas'),
    viewportStage: document.querySelector('.viewport-stage'),
    displayMesh: document.querySelector('#display-mesh'),
    displaySkeleton: document.querySelector('#display-skeleton'),
    displayBones: document.querySelector('#display-bones'),
    cameraSnap: document.querySelector('#camera-snap'),
  };

  let loadedVrmFileName = DEFAULT_MODEL.path.split('/').pop() || 'avatar.vrm';
  let loadedVrmaFileName = 'animation.vrma';
  let playbackFrameId = 0;

  const store = createEditorStore({ createEmptyDocument: createEmptyVrmaDocument });
  const runtime = createRuntimeController({
    avatarLayerFactory: createAvatarLayer,
    canvas: dom.viewportCanvas,
    stageShell: dom.viewportStage,
    defaultModel: DEFAULT_MODEL,
    onStatus: (message) => setStatus(message),
  });

  function setStatus(message) {
    if (dom.statusPrimary) {
      dom.statusPrimary.textContent = message;
    }
  }

  function renderTimeline() {
    if (!dom.trackList || !dom.timelineGrid || !dom.playhead) {
      return;
    }

    const state = store.getState();
    const rows = trackRows(state);
    const duration = getTimelineDuration(state);

    dom.trackList.innerHTML = '';
    dom.timelineGrid.innerHTML = '<div class="timeline-ruler" id="timeline-ruler"></div>';
    dom.timelineGrid.append(dom.playhead);
    dom.playhead.style.left = `${timeToPercent(state.timeline.currentTime, duration)}%`;

    if (rows.length === 0) {
      const emptyTrack = document.createElement('div');
      emptyTrack.className = 'timeline-track';
      emptyTrack.textContent = 'No tracks loaded';
      dom.trackList.append(emptyTrack);
      return;
    }

    rows.forEach((row) => {
      const trackLabel = document.createElement('div');
      trackLabel.className = 'timeline-track';
      trackLabel.textContent = row.label;
      dom.trackList.append(trackLabel);

      const trackRow = document.createElement('div');
      trackRow.className = 'timeline-row';
      row.track.times.forEach((time) => {
        const key = document.createElement('span');
        key.className = 'key-dot';
        key.style.left = `${timeToPercent(time, duration)}%`;
        trackRow.append(key);
      });
      dom.timelineGrid.append(trackRow);
    });
  }

  function renderInspector() {
    const state = store.getState();
    const playback = runtime.getPlaybackState();
    const playbackLabel = playback.active ? (playback.paused ? 'paused' : 'playing') : 'stopped';
    if (dom.selectionLabel) {
      dom.selectionLabel.textContent = state.selection ? `${state.selection.type}: ${state.selection.id}` : 'No control selected';
    }
    if (dom.clipLabel) {
      dom.clipLabel.textContent = state.document
        ? `${state.document.clip.name} · ${trackRows(state).length} tracks`
        : 'No animation loaded';
    }
    if (dom.trackDetail) {
      dom.trackDetail.textContent = state.document
        ? `Playhead ${state.timeline.currentTime.toFixed(2)}s · Auto-key ${state.autoKey ? 'on' : 'off'} · ${playbackLabel}`
        : 'Timeline detail will follow selection and playhead state.';
    }
  }

  function render() {
    renderInspector();
    renderTimeline();
  }

  function stopPlaybackTracking() {
    if (playbackFrameId) {
      cancelAnimationFrame(playbackFrameId);
      playbackFrameId = 0;
    }
  }

  function syncPlaybackToTimeline() {
    const playback = runtime.getPlaybackState();

    if (!playback.active) {
      playbackFrameId = 0;
      render();
      return;
    }

    const previousTime = store.getState().timeline.currentTime;
    const nextTime = Number.isFinite(playback.timeSeconds) ? playback.timeSeconds : 0;

    if (Math.abs(previousTime - nextTime) > 0.001) {
      store.setCurrentTime(nextTime);
      render();
    }

    if (playback.paused) {
      playbackFrameId = 0;
      render();
      return;
    }

    playbackFrameId = requestAnimationFrame(syncPlaybackToTimeline);
  }

  function startPlaybackTracking() {
    stopPlaybackTracking();
    syncPlaybackToTimeline();
  }

  function createNewClip() {
    runtime.stopClip();
    stopPlaybackTracking();
    store.setCurrentTime(0);
    store.createEmptyClip({
      clipName: 'Clip',
      humanoidSkeleton: runtime.captureHumanoidSkeleton() || buildDefaultSkeleton(),
    });
    loadedVrmaFileName = 'animation.vrma';
    setStatus(`Created a new empty clip for ${loadedVrmFileName}.`);
    render();
  }

  async function handleVrmOpen(file) {
    if (!file) {
      return;
    }

    const blobUrl = URL.createObjectURL(file);
    loadedVrmFileName = file.name;

    try {
      runtime.stopClip();
      stopPlaybackTracking();
      store.setCurrentTime(0);
      await runtime.loadModel(blobUrl, {
        label: file.name,
        modelId: BUNDLED_MODELS[0]?.id || DEFAULT_MODEL.id,
      });
      setStatus(`Loaded VRM: ${file.name}.`);
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  }

  async function handleVrmaOpen(file) {
    if (!file) {
      return;
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const documentModel = parseVrmaDocument(bytes);
    loadedVrmaFileName = file.name;
    store.loadDocument(documentModel);
    runtime.playClip(documentModel.clip, { paused: false });
    startPlaybackTracking();
    setStatus(`Loaded VRMA: ${file.name}.`);
    render();
  }

  function saveDocument(filename = loadedVrmaFileName) {
    const { document: documentModel } = store.getState();
    if (!documentModel) {
      setStatus('Nothing to save. Create or load a clip first.');
      return;
    }

    const bytes = serializeVrmaDocument(documentModel);
    downloadBytes(bytes, filename);
    setStatus(`Saved ${filename}.`);
  }

  function addKeyAtPlayhead() {
    if (!store.getState().document) {
      setStatus('Create or load a clip before adding keys.');
      return;
    }

    store.setAutoKey(true);
    store.selectControl({ type: 'bone', id: 'hips' });
    store.applyPoseAtTime({
      time: store.getState().timeline.currentTime,
      scope: 'selected-control',
      rotations: {
        hips: [0, 0, 0, 1],
      },
    });
    if (dom.autoKeyToggle) {
      dom.autoKeyToggle.checked = true;
    }
    setStatus(`Added a key at ${store.getState().timeline.currentTime.toFixed(2)}s.`);
    render();
  }

  function playCurrentClip() {
    const { document: documentModel } = store.getState();
    if (!documentModel) {
      setStatus('Load or create a clip before previewing.');
      return;
    }

    const playback = runtime.getPlaybackState();
    if (playback.active && playback.paused) {
      runtime.resumeClip();
      startPlaybackTracking();
      setStatus(`Resumed ${documentModel.clip.name}.`);
      render();
      return;
    }

    runtime.playClip(documentModel.clip, {
      paused: false,
      timeSeconds: store.getState().timeline.currentTime,
    });
    startPlaybackTracking();
    setStatus(`Playing ${documentModel.clip.name}.`);
    render();
  }

  function pauseCurrentClip() {
    const { document: documentModel } = store.getState();
    const playback = runtime.getPlaybackState();

    if (!documentModel || !playback.active) {
      setStatus('Nothing is playing to pause.');
      return;
    }

    runtime.pauseClip();
    stopPlaybackTracking();
    syncPlaybackToTimeline();
    setStatus(`Paused ${documentModel.clip.name}.`);
  }

  function stopCurrentClip() {
    runtime.stopClip();
    stopPlaybackTracking();
    store.setCurrentTime(0);
    setStatus('Preview stopped.');
    render();
  }

  function selectDisplayMode(mode) {
    runtime.setDisplayMode(mode);
    setStatus(`Display mode: ${mode}.`);
  }

  function bindEvents() {
    dom.actionNew?.addEventListener('click', createNewClip);
    dom.actionOpenVrm?.addEventListener('click', () => openFilePicker(dom.vrmFileInput));
    dom.actionOpenVrma?.addEventListener('click', () => openFilePicker(dom.vrmaFileInput));
    dom.actionSave?.addEventListener('click', () => saveDocument(loadedVrmaFileName));
    dom.actionSaveAs?.addEventListener('click', () => saveDocument(`copy-${loadedVrmaFileName}`));
    dom.actionAddKey?.addEventListener('click', addKeyAtPlayhead);
    dom.actionPlay?.addEventListener('click', playCurrentClip);
    dom.actionPause?.addEventListener('click', pauseCurrentClip);
    dom.actionStop?.addEventListener('click', stopCurrentClip);
    dom.autoKeyToggle?.addEventListener('change', () => {
      store.setAutoKey(dom.autoKeyToggle.checked);
      render();
    });
    dom.displayMesh?.addEventListener('click', () => selectDisplayMode('mesh'));
    dom.displaySkeleton?.addEventListener('click', () => selectDisplayMode('skeleton'));
    dom.displayBones?.addEventListener('click', () => selectDisplayMode('bones'));
    dom.cameraSnap?.addEventListener('click', () => {
      const nextState = !runtime.getState().cameraSnap;
      runtime.setCameraSnap(nextState);
      setStatus(`Camera snap ${nextState ? 'enabled' : 'disabled'}.`);
    });
    dom.vrmFileInput?.addEventListener('change', async () => {
      await handleVrmOpen(dom.vrmFileInput.files?.[0] || null);
      dom.vrmFileInput.value = '';
    });
    dom.vrmaFileInput?.addEventListener('change', async () => {
      await handleVrmaOpen(dom.vrmaFileInput.files?.[0] || null);
      dom.vrmaFileInput.value = '';
    });
  }

  async function bootstrap() {
    setStatus('Starting viewport runtime…');
    render();
    bindEvents();
    await runtime.initialize();
    render();
  }

  return {
    bootstrap,
    setStatus,
  };
}

const app = createVrmaStudioApp();
void app.bootstrap();
