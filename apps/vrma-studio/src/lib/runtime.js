import * as THREE from 'three';

export function createRuntimeController({
  avatarLayerFactory = null,
  canvas = null,
  stageShell = null,
  defaultModel = null,
  onStatus = null,
} = {}) {
  const state = {
    displayMode: 'mesh',
    cameraSnap: false,
    ikTargets: new Map(),
    poleTargets: new Map(),
    ready: false,
  };

  let avatarLayer = null;

  function notifyStatus(message) {
    if (typeof onStatus === 'function') {
      onStatus(message);
    }
  }

  async function initialize() {
    if (!avatarLayerFactory || !canvas) {
      return;
    }

    avatarLayer = avatarLayerFactory({
      canvas,
      stageShell,
      pointerMode: 'rotate',
      preserveDrawingBuffer: true,
    });

    if (defaultModel?.path) {
      await avatarLayer.loadModel(defaultModel.path, {
        label: defaultModel.label,
        modelId: defaultModel.id,
      });
      state.ready = true;
      avatarLayer.setDisplayMode?.(state.displayMode);
      avatarLayer.setOrbitSnapDegrees?.(state.cameraSnap ? 15 : 0);
      notifyStatus(`Loaded preview model: ${defaultModel.label}.`);
    }
  }

  async function loadModel(url, { label, modelId } = {}) {
    if (!avatarLayer) {
      throw new Error('Runtime has not been initialized yet.');
    }

    await avatarLayer.loadModel(url, {
      label,
      modelId,
    });
    state.ready = true;
    avatarLayer.setDisplayMode?.(state.displayMode);
    avatarLayer.setOrbitSnapDegrees?.(state.cameraSnap ? 15 : 0);
    notifyStatus(`Loaded model: ${label || modelId || 'custom VRM'}.`);
  }

  function buildPreviewClip(clip) {
    return new THREE.AnimationClip(clip.name, clip.duration, []);
  }

  function setDisplayMode(mode) {
    state.displayMode = mode;
    avatarLayer?.setDisplayMode?.(mode);
  }

  function setCameraSnap(enabled) {
    state.cameraSnap = Boolean(enabled);
    avatarLayer?.setOrbitSnapDegrees?.(state.cameraSnap ? 15 : 0);
  }

  function setIkTarget(id, position) {
    state.ikTargets.set(id, position);
  }

  function setPoleTarget(id, position) {
    state.poleTargets.set(id, position);
  }

  function getState() {
    return state;
  }

  function captureHumanoidSkeleton() {
    return avatarLayer?.captureHumanoidSkeleton?.() || null;
  }

  function playClip(clip, options = {}) {
    avatarLayer?.playPreviewClip?.(clip, options);
  }

  function pauseClip() {
    avatarLayer?.pausePreviewClip?.();
  }

  function resumeClip() {
    avatarLayer?.resumePreviewClip?.();
  }

  function getPlaybackState() {
    return (
      avatarLayer?.getPreviewPlaybackState?.() || {
        active: false,
        paused: false,
        timeSeconds: 0,
        durationSeconds: 0,
      }
    );
  }

  function stopClip() {
    avatarLayer?.stopPreviewClip?.();
  }

  function destroy() {
    avatarLayer?.destroy?.();
    avatarLayer = null;
    state.ready = false;
  }

  return {
    initialize,
    loadModel,
    buildPreviewClip,
    destroy,
    captureHumanoidSkeleton,
    getState,
    setCameraSnap,
    setDisplayMode,
    setIkTarget,
    setPoleTarget,
    getPlaybackState,
    pauseClip,
    playClip,
    resumeClip,
    stopClip,
  };
}
