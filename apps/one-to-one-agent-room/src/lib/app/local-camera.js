function buildInitialSnapshot(getUserMedia) {
  const supported = typeof getUserMedia === 'function';
  return {
    supported,
    enabled: true,
    active: false,
    activeCall: false,
    loading: false,
    permissionState: supported ? 'prompt' : 'unsupported',
    status: supported ? 'Camera ready' : 'Camera unavailable',
  };
}

function permissionStateFromError(error) {
  const errorName = `${error?.name || ''}`.trim();
  if (errorName === 'NotAllowedError' || errorName === 'SecurityError') {
    return 'denied';
  }
  if (errorName === 'NotFoundError' || errorName === 'DevicesNotFoundError') {
    return 'missing';
  }
  return 'error';
}

function statusFromError(error) {
  const permissionState = permissionStateFromError(error);
  if (permissionState === 'denied') {
    return 'Permission denied.';
  }
  if (permissionState === 'missing') {
    return 'No camera found.';
  }
  return error instanceof Error && error.message ? error.message : 'Camera unavailable.';
}

export function createLocalCameraController({
  videoElement,
  getUserMedia = globalThis.navigator?.mediaDevices?.getUserMedia?.bind(globalThis.navigator?.mediaDevices),
  onStateChange,
} = {}) {
  if (!videoElement) {
    throw new Error('createLocalCameraController requires a video element.');
  }

  const state = {
    ...buildInitialSnapshot(getUserMedia),
    stream: null,
  };

  function getSnapshot() {
    return {
      supported: state.supported,
      enabled: state.enabled,
      active: state.active,
      activeCall: state.activeCall,
      loading: state.loading,
      permissionState: state.permissionState,
      status: state.status,
    };
  }

  function emitStateChange() {
    onStateChange?.(getSnapshot());
  }

  function clearVideoPreview() {
    videoElement.srcObject = null;
  }

  function stopStream({ preserveEnabled = state.enabled } = {}) {
    if (state.stream?.getTracks) {
      for (const track of state.stream.getTracks()) {
        track.stop?.();
      }
    }
    state.stream = null;
    state.active = false;
    state.loading = false;
    clearVideoPreview();

    if (!state.supported) {
      state.status = 'Camera unavailable';
    } else if (!preserveEnabled) {
      state.status = 'Camera off';
    } else if (state.activeCall) {
      state.status = 'Camera ready';
    } else {
      state.status = 'Camera standby';
    }

    emitStateChange();
  }

  async function startStream() {
    if (!state.supported || state.loading || state.stream || !state.enabled || !state.activeCall) {
      emitStateChange();
      return getSnapshot();
    }

    state.loading = true;
    state.status = 'Starting camera';
    emitStateChange();

    try {
      const stream = await getUserMedia({
        video: true,
        audio: false,
      });

      if (!state.enabled || !state.activeCall) {
        for (const track of stream.getTracks?.() || []) {
          track.stop?.();
        }
        state.loading = false;
        state.status = state.activeCall ? 'Camera off' : 'Camera standby';
        emitStateChange();
        return getSnapshot();
      }

      state.stream = stream;
      videoElement.srcObject = stream;
      videoElement.muted = true;
      videoElement.autoplay = true;
      videoElement.playsInline = true;
      await videoElement.play?.().catch(() => {});

      state.loading = false;
      state.active = true;
      state.permissionState = 'granted';
      state.status = 'live';
      emitStateChange();
      return getSnapshot();
    } catch (error) {
      state.loading = false;
      state.active = false;
      state.permissionState = permissionStateFromError(error);
      state.status = statusFromError(error);
      clearVideoPreview();
      emitStateChange();
      return getSnapshot();
    }
  }

  async function syncCallState({ activeCall = false } = {}) {
    state.activeCall = Boolean(activeCall);
    if (state.activeCall && state.enabled) {
      return startStream();
    }
    stopStream({ preserveEnabled: state.enabled });
    return getSnapshot();
  }

  async function toggleEnabled() {
    state.enabled = !state.enabled;
    if (!state.enabled) {
      stopStream({ preserveEnabled: false });
      return getSnapshot();
    }

    state.status = state.activeCall ? 'Camera ready' : 'Camera standby';
    emitStateChange();
    if (state.activeCall) {
      return startStream();
    }
    return getSnapshot();
  }

  function destroy() {
    stopStream({ preserveEnabled: false });
  }

  emitStateChange();

  return {
    getSnapshot,
    syncCallState,
    toggleEnabled,
    destroy,
  };
}
