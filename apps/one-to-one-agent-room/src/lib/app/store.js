export function createAppStore({
  storageKey,
  bundledModels,
  defaultModel,
  stages,
  emotes,
  getGesturePresets,
  resolveGesturePreset,
  clampNumber,
}) {
  const storedState = readStoredState(storageKey);
  const bundledModelMap = new Map(bundledModels.map((model) => [model.id, model]));
  const stageMap = new Map(stages.map((stage) => [stage.id, stage]));
  const emoteMap = new Map(emotes.map((emote) => [emote.id, emote]));
  const defaultBundledModel = bundledModelMap.get(storedState.bundledModelId) ?? defaultModel;
  const defaultGestures = getGesturePresets(defaultBundledModel.id);
  const defaultGestureId =
    resolveGesturePreset(defaultBundledModel.id, storedState.gestureId)?.id ||
    defaultGestures[0]?.id ||
    'idle';

  const state = {
    runtimeConfig: null,
    room: null,
    session: null,
    sessionPollId: 0,
    logs: [],
    localVideoElement: null,
    transcriptPreview: 'none',
    processingReplies: false,
    modelLoading: false,
    avatarSpeechSnapshot: null,
    humanVoiceSnapshot: null,
    agentVoiceSnapshot: null,
    voiceOptions: [],
    preferences: {
      bundledModelId: defaultBundledModel.id,
      livekitUrl: storedState.livekitUrl || '',
      roomName: storedState.roomName || '',
      identity: storedState.identity || '',
      participantName: storedState.participantName || '',
      enableCamera: Boolean(storedState.enableCamera),
      enableMicrophone: Boolean(storedState.enableMicrophone),
      humanLocale: storedState.humanLocale || 'en-US',
      voiceName: storedState.voiceName || '',
      speechRate: clampNumber(storedState.speechRate, 0.75, 1.35, 1),
      speechPitch: clampNumber(storedState.speechPitch, 0.75, 1.4, 1),
      stageId: stageMap.has(storedState.stageId) ? storedState.stageId : stages[0].id,
      emoteId: emoteMap.has(storedState.emoteId) ? storedState.emoteId : emotes[0].id,
      gestureId: defaultGestureId,
    },
  };

  function persistState(dom) {
    const payload = {
      bundledModelId: state.preferences.bundledModelId,
      livekitUrl: dom.livekitUrl.value,
      roomName: dom.roomName.value,
      identity: dom.identity.value,
      participantName: dom.participantName.value,
      enableCamera: dom.enableCamera.checked,
      enableMicrophone: dom.enableMicrophone.checked,
      humanLocale: dom.humanLocale.value,
      voiceName: state.preferences.voiceName,
      speechRate: state.preferences.speechRate,
      speechPitch: state.preferences.speechPitch,
      stageId: state.preferences.stageId,
      emoteId: state.preferences.emoteId,
      gestureId: state.preferences.gestureId,
    };

    try {
      window.localStorage.setItem(storageKey, JSON.stringify(payload));
    } catch {
      // Ignore storage failures in the spike app.
    }
  }

  function getSelectedBundledModel() {
    return bundledModelMap.get(state.preferences.bundledModelId) || defaultModel;
  }

  function hydrateInputs(dom) {
    dom.livekitUrl.value = state.preferences.livekitUrl;
    dom.roomName.value = state.preferences.roomName;
    dom.identity.value = state.preferences.identity;
    dom.participantName.value = state.preferences.participantName;
    dom.enableCamera.checked = state.preferences.enableCamera;
    dom.enableMicrophone.checked = state.preferences.enableMicrophone;
    dom.humanLocale.value = state.preferences.humanLocale;
    dom.speechRate.value = String(state.preferences.speechRate);
    dom.speechPitch.value = String(state.preferences.speechPitch);
  }

  function ensureDefaults(dom) {
    if (!dom.livekitUrl.value.trim()) {
      dom.livekitUrl.value = state.runtimeConfig?.livekitUrl || 'ws://127.0.0.1:7880';
    }

    if (!dom.roomName.value.trim()) {
      dom.roomName.value = 'app4-one-to-one-room';
    }

    if (!dom.identity.value.trim()) {
      dom.identity.value = `human-${Math.random().toString(36).slice(2, 8)}`;
    }

    if (!dom.participantName.value.trim()) {
      dom.participantName.value = 'Human Caller';
    }

    dom.mcpCommand.value = state.runtimeConfig?.bridge?.mcpServerCommand || '';
    dom.stateFile.textContent = state.runtimeConfig?.bridge?.stateFilePath || 'none';
  }

  function collectFormState(dom) {
    return {
      livekitUrl: dom.livekitUrl.value.trim(),
      roomName: dom.roomName.value.trim(),
      identity: dom.identity.value.trim(),
      participantName: dom.participantName.value.trim(),
      enableCamera: dom.enableCamera.checked,
      enableMicrophone: dom.enableMicrophone.checked,
    };
  }

  return {
    state,
    bundledModelMap,
    stageMap,
    emoteMap,
    defaultBundledModel,
    persistState,
    getSelectedBundledModel,
    hydrateInputs,
    ensureDefaults,
    collectFormState,
  };
}

function readStoredState(storageKey) {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}
