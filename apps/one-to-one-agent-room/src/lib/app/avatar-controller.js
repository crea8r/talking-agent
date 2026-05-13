import { renderSelectOptions } from '../../ui/render.js';

const DEFAULT_CAMERA_DISTANCE = 1;

function normalizeCameraDistance(value) {
  const nextValue = Number(value);
  if (!Number.isFinite(nextValue)) {
    return DEFAULT_CAMERA_DISTANCE;
  }

  return Math.min(2, Math.max(0.85, nextValue));
}

function formatCameraDistanceValue(value) {
  return `${Math.round(normalizeCameraDistance(value) * 100)}%`;
}

export function createAvatarController({
  dom,
  state,
  createAvatarLayer,
  bundledModelMap,
  stageMap,
  emoteMap,
  getGesturePresets,
  resolveGesturePreset,
  defaultModel,
  getSelectedBundledModel,
  persistState,
  formatError,
  addLog,
  refreshActionButtons,
  onBundledModelChange = () => {},
}) {
  const earlyBootIssues = [];
  const avatarLayer = createSafeAvatarLayer();
  let queuedModelId = '';

  function createSafeAvatarLayer() {
    try {
      return createAvatarLayer({
        canvas: dom.agentCanvas,
        stageShell: dom.stageShell,
        initialStageId: state.preferences.stageId,
        initialEmoteId: state.preferences.emoteId,
        initialGestureId: state.preferences.gestureId,
        initialCameraDistance: state.preferences.cameraDistance,
        featureFlags: {
          smoothGestureTransitions: state.preferences.smoothGestureTransitions !== false,
        },
        onLog(level, message, details) {
          addLog(level, `[avatar] ${message}`, details);
        },
        onLookTargetChange(label) {
          if (dom.lookTarget) {
            dom.lookTarget.textContent = label;
          }
        },
      });
    } catch (error) {
      earlyBootIssues.push({
        scope: 'avatar',
        error: formatError(error),
      });

      return createFallbackAvatarLayer(error);
    }
  }

  function createFallbackAvatarLayer(error) {
    const fallbackState = {
      ready: false,
      loading: false,
      modelLabel: 'Avatar unavailable',
      stageId: state.preferences.stageId,
      emoteId: state.preferences.emoteId,
      gestureId: state.preferences.gestureId,
      mouthCue: 'rest',
      speaking: false,
      energy: 1,
      cameraDistance: normalizeCameraDistance(state.preferences.cameraDistance),
      lookTargetLabel: 'center',
      error: error instanceof Error ? error.message : 'Avatar renderer failed to start.',
    };

    return {
      getSnapshot() {
        return { ...fallbackState };
      },
      async loadModel() {
        throw new Error(fallbackState.error);
      },
      setStage(stageId) {
        fallbackState.stageId = stageId;
        return this.getSnapshot();
      },
      setEmote(emoteId) {
        fallbackState.emoteId = emoteId;
        return this.getSnapshot();
      },
      setGesture(gestureId) {
        fallbackState.gestureId = gestureId;
        return this.getSnapshot();
      },
      setMouthCue(mouthCue) {
        fallbackState.mouthCue = mouthCue;
        return this.getSnapshot();
      },
      setSpeaking(active) {
        fallbackState.speaking = Boolean(active);
        return this.getSnapshot();
      },
      setFeatureFlags() {
        return this.getSnapshot();
      },
      setCameraDistance(distance) {
        fallbackState.cameraDistance = normalizeCameraDistance(distance);
        return this.getSnapshot();
      },
      destroy() {},
    };
  }

  function flushEarlyBootIssues() {
    if (!earlyBootIssues.length) {
      return;
    }

    earlyBootIssues.forEach((issue) => {
      addLog('error', `${issue.scope} bootstrap failed.`, issue.error);
    });

    if (dom.sceneNote) {
      dom.sceneNote.textContent =
        'Avatar renderer failed to initialize. Voice session controls still work.';
    }
    if (dom.activeAvatar) {
      dom.activeAvatar.textContent = 'Avatar unavailable';
    }
  }

  async function loadModel() {
    const model = getSelectedBundledModel();
    state.modelLoading = true;
    refreshActionButtons();

    try {
      await avatarLayer.loadModel(model.path, { label: model.label, modelId: model.id });
      const snapshot = avatarLayer.getSnapshot();
      state.preferences.gestureId = snapshot.gestureId;
      syncGestureOptions(snapshot.modelId, snapshot.gestureId);
      if (dom.activeAvatar) {
        dom.activeAvatar.textContent = model.label;
      }
      refreshSceneNote();
    } catch (error) {
      addLog('error', 'Avatar model failed to load.', formatError(error));
      if (dom.activeAvatar) {
        dom.activeAvatar.textContent = 'Avatar unavailable';
      }
      if (dom.sceneNote) {
        dom.sceneNote.textContent = 'Avatar model could not load. Room controls still work.';
      }
    } finally {
      state.modelLoading = false;
      refreshActionButtons();

      if (queuedModelId && queuedModelId !== model.id) {
        queuedModelId = '';
        await loadModel();
      }
    }
  }

  async function selectBundledModel(modelId, { persist = true } = {}) {
    const model = bundledModelMap.get(modelId) || defaultModel;
    state.preferences.bundledModelId = model.id;
    dom.bundledModelSelect.value = model.id;
    state.preferences.gestureId =
      resolveGesturePreset(model.id, state.preferences.gestureId)?.id ||
      getGesturePresets(model.id)[0]?.id ||
      state.preferences.gestureId;
    syncGestureOptions(model.id, state.preferences.gestureId);

    if (persist) {
      persistState();
    }

    onBundledModelChange(model.id);

    if (state.modelLoading) {
      queuedModelId = model.id;
      return;
    }

    queuedModelId = '';
    await loadModel();
  }

  function selectStage(stageId, { persist = true } = {}) {
    state.preferences.stageId = stageId;
    avatarLayer.setStage(stageId);
    dom.stageSelect.value = stageId;
    refreshSceneNote();
    syncAvatarSnapshot();
    if (persist) {
      persistState();
    }
  }

  function selectEmote(emoteId, { persist = true } = {}) {
    state.preferences.emoteId = emoteId;
    avatarLayer.setEmote(emoteId);
    dom.emoteSelect.value = emoteId;
    refreshSceneNote();
    syncAvatarSnapshot();
    if (persist) {
      persistState();
    }
  }

  function selectGesture(gestureId, { persist = true } = {}) {
    const modelId = avatarLayer.getSnapshot().modelId || state.preferences.bundledModelId;
    const resolvedGesture = resolveGesturePreset(modelId, gestureId, {
      fallbackToFirst: false,
    });

    if (!resolvedGesture) {
      return null;
    }

    state.preferences.gestureId = resolvedGesture.id;
    avatarLayer.setGesture(resolvedGesture.id);
    dom.gestureSelect.value = resolvedGesture.id;
    refreshSceneNote();
    syncAvatarSnapshot();
    if (persist) {
      persistState();
    }

    return resolvedGesture;
  }

  function setSmoothGestureTransitions(enabled) {
    const nextEnabled = enabled !== false;
    state.preferences.smoothGestureTransitions = nextEnabled;
    if (dom.smoothGestureTransitionsToggle) {
      dom.smoothGestureTransitionsToggle.checked = nextEnabled;
    }
    avatarLayer.setFeatureFlags?.({
      smoothGestureTransitions: nextEnabled,
    });
    return nextEnabled;
  }

  function setCameraDistance(distance, { persist = false } = {}) {
    const nextDistance = normalizeCameraDistance(distance);
    state.preferences.cameraDistance = nextDistance;
    if (dom.cameraDistanceInput) {
      dom.cameraDistanceInput.value = nextDistance.toFixed(2);
    }
    if (dom.cameraDistanceValue) {
      dom.cameraDistanceValue.textContent = formatCameraDistanceValue(nextDistance);
    }
    avatarLayer.setCameraDistance?.(nextDistance);
    if (persist) {
      persistState();
    }
    return nextDistance;
  }

  function refreshSceneNote() {
    if (!dom.sceneNote) {
      return;
    }

    const stage = stageMap.get(state.preferences.stageId);
    const emote = emoteMap.get(state.preferences.emoteId);
    const modelId = avatarLayer.getSnapshot().modelId || state.preferences.bundledModelId;
    const gesture = resolveGesturePreset(modelId, state.preferences.gestureId);
    dom.sceneNote.textContent = `${stage?.note || ''} ${emote?.note || ''} ${gesture?.note || ''}`.trim();
  }

  function syncAvatarSnapshot() {
    const snapshot = avatarLayer.getSnapshot();
    const gesture = resolveGesturePreset(snapshot.modelId, snapshot.gestureId);
    if (dom.activeAvatar) {
      dom.activeAvatar.textContent = snapshot.modelLabel || defaultModel.label;
    }
    if (dom.activeEmote) {
      dom.activeEmote.textContent = emoteMap.get(snapshot.emoteId)?.label || 'Neutral';
    }
    if (dom.activeGesture) {
      dom.activeGesture.textContent = gesture?.label || 'None';
    }
    if (dom.activeMouth) {
      dom.activeMouth.textContent = snapshot.mouthCue || 'rest';
    }
    if (dom.lookTarget) {
      dom.lookTarget.textContent = snapshot.lookTargetLabel || 'center';
    }
  }

  function syncGestureOptions(modelId, activeGestureId) {
    renderSelectOptions(dom.gestureSelect, getGesturePresets(modelId), activeGestureId);
  }

  return {
    avatarLayer,
    flushEarlyBootIssues,
    loadModel,
    selectBundledModel,
    setCameraDistance,
    selectStage,
    selectEmote,
    selectGesture,
    setSmoothGestureTransitions,
    refreshSceneNote,
    syncGestureOptions,
    syncAvatarSnapshot,
  };
}
