import { renderSelectOptions } from '../../ui/render.js';

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
}) {
  const earlyBootIssues = [];
  const avatarLayer = createSafeAvatarLayer();

  function createSafeAvatarLayer() {
    try {
      return createAvatarLayer({
        canvas: dom.agentCanvas,
        stageShell: dom.stageShell,
        initialStageId: state.preferences.stageId,
        initialEmoteId: state.preferences.emoteId,
        initialGestureId: state.preferences.gestureId,
        onLog(level, message, details) {
          addLog(level, `[avatar] ${message}`, details);
        },
        onLookTargetChange(label) {
          dom.lookTarget.textContent = label;
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

    dom.sceneNote.textContent =
      'Avatar renderer failed to initialize. Room and bridge controls still work.';
    dom.activeAvatar.textContent = 'Avatar unavailable';
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
      dom.activeAvatar.textContent = model.label;
      refreshSceneNote();
    } catch (error) {
      addLog('error', 'Avatar model failed to load.', formatError(error));
      dom.activeAvatar.textContent = 'Avatar unavailable';
      dom.sceneNote.textContent = 'Avatar model could not load. Room controls still work.';
    } finally {
      state.modelLoading = false;
      refreshActionButtons();
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

    if (state.modelLoading) {
      return;
    }

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

  function refreshSceneNote() {
    const stage = stageMap.get(state.preferences.stageId);
    const emote = emoteMap.get(state.preferences.emoteId);
    const modelId = avatarLayer.getSnapshot().modelId || state.preferences.bundledModelId;
    const gesture = resolveGesturePreset(modelId, state.preferences.gestureId);
    dom.sceneNote.textContent = `${stage?.note || ''} ${emote?.note || ''} ${gesture?.note || ''}`.trim();
  }

  function syncAvatarSnapshot() {
    const snapshot = avatarLayer.getSnapshot();
    const gesture = resolveGesturePreset(snapshot.modelId, snapshot.gestureId);
    dom.activeAvatar.textContent = snapshot.modelLabel || defaultModel.label;
    dom.activeEmote.textContent = emoteMap.get(snapshot.emoteId)?.label || 'Neutral';
    dom.activeGesture.textContent = gesture?.label || 'None';
    dom.activeMouth.textContent = snapshot.mouthCue || 'rest';
    dom.lookTarget.textContent = snapshot.lookTargetLabel || 'center';
  }

  function syncGestureOptions(modelId, activeGestureId) {
    renderSelectOptions(dom.gestureSelect, getGesturePresets(modelId), activeGestureId);
  }

  return {
    avatarLayer,
    flushEarlyBootIssues,
    loadModel,
    selectBundledModel,
    selectStage,
    selectEmote,
    selectGesture,
    refreshSceneNote,
    syncGestureOptions,
    syncAvatarSnapshot,
  };
}
