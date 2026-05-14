import { buildDefaultCallForm } from './call-session.js';

const DEFAULT_SCOPE_KEY = 'default';
const DEFAULT_CAMERA_DISTANCE = 1;
const DEFAULT_STAGE_IDS = ['portrait-studio', 'sunset-studio'];

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

function resolveDefaultStageId(stages = []) {
  return DEFAULT_STAGE_IDS.find((stageId) => stages.some((stage) => stage?.id === stageId)) || stages[0]?.id || '';
}

function normalizeStageId(stageId, stageMap, stages) {
  const defaultStageId = resolveDefaultStageId(stages);
  const nextStageId = `${stageId || ''}`.trim();
  if (!nextStageId) {
    return defaultStageId;
  }
  if (nextStageId === 'neon-loft' && stageMap.has(defaultStageId)) {
    return defaultStageId;
  }
  return stageMap.has(nextStageId) ? nextStageId : defaultStageId;
}

export function createAppStore({
  storageKey,
  bundledModels,
  defaultModel,
  stages,
  emotes,
  getGesturePresets,
  resolveGesturePreset,
}) {
  const bootstrapDefaults = buildDefaultCallForm();
  const bundledModelMap = new Map(bundledModels.map((model) => [model.id, model]));
  const stageMap = new Map(stages.map((stage) => [stage.id, stage]));
  const emoteMap = new Map(emotes.map((emote) => [emote.id, emote]));
  const defaultBundledModel = bundledModelMap.get(defaultModel.id) ?? defaultModel;
  const defaultGestures = getGesturePresets(defaultBundledModel.id);
  const defaultStageId = resolveDefaultStageId(stages);
  let activeScopeKey = DEFAULT_SCOPE_KEY;

  const state = {
    runtimeConfig: null,
    session: null,
    sessionKey: '',
    sessionPreparing: false,
    activeCall: false,
    endingCall: false,
    callEndingDimmed: false,
    startupGreetingActive: false,
    humanMicMuted: false,
    humanMicLevel: 0,
    logs: [],
    transcriptPreview: '',
    activeUtteranceId: null,
    activeUtteranceText: '',
    inspectorSnapshot: null,
    processingReplies: false,
    agentThinkingActive: false,
    agentThinkingElapsedTenths: 0,
    modelLoading: false,
    loadingUi: {
      boot: {
        active: false,
        phase: '',
        detail: '',
      },
      call: {
        active: false,
        phase: '',
        detail: '',
      },
      avatar: {
        active: false,
        phase: '',
        detail: '',
        percent: null,
      },
    },
    avatarSpeechSnapshot: null,
    humanVoiceSnapshot: null,
    agentVoiceSnapshot: null,
    productionVoice: {
      loading: false,
      uploading: false,
      backendConfigured: false,
      backendRunning: false,
      backendApp: '',
      backendDetail: '',
      defaultSpeakerId: '',
      defaultSpeakerLabel: '',
      validationMessage: '',
      profile: null,
    },
    codex: {
      loading: false,
      backendConfigured: false,
      backendRunning: false,
      backendApp: '',
      backendDetail: '',
      model: '',
      reasoningEffort: '',
      sessionRoot: '',
      command: '',
      availablePlugins: [],
      pluginInventoryLoading: false,
    },
    currentTurnId: null,
    playbackGeneration: 0,
    activeReplyAbortController: null,
    callHistoryCollapsed: true,
    subtitles: {
      human: {
        mode: 'idle',
        text: 'Waiting for you to start the call.',
      },
      agent: {
        mode: 'idle',
        text: 'Agent is offline.',
      },
    },
    preferences: {
      bundledModelId: defaultBundledModel.id,
      humanIdentity: bootstrapDefaults.humanIdentity,
      participantName: bootstrapDefaults.participantName,
      humanLocale: bootstrapDefaults.humanLocale,
      voiceSampleFileName: '',
      voiceSampleProfileId: '',
      voiceSampleStatus: bootstrapDefaults.voiceSampleStatus,
      voiceSampleSpeakerId: '',
      voiceSampleSpeakerLabel: '',
      enabledPluginIds: [],
      enableControlComputer: false,
      enableComplexTasks: false,
      smoothGestureTransitions: true,
      cameraDistance: DEFAULT_CAMERA_DISTANCE,
      stageId: defaultStageId,
      emoteId: emotes[0].id,
      gestureId: defaultGestures[0]?.id || 'Pose',
    },
  };

  function buildScopedStorageKey(scopeKey = DEFAULT_SCOPE_KEY) {
    const cleanedScopeKey = `${scopeKey || ''}`.trim() || DEFAULT_SCOPE_KEY;
    return cleanedScopeKey === DEFAULT_SCOPE_KEY
      ? storageKey
      : `${storageKey}::${cleanedScopeKey}`;
  }

  function readScopedState(scopeKey = DEFAULT_SCOPE_KEY) {
    return readStoredState(buildScopedStorageKey(scopeKey));
  }

  function applyStoredState(storedState = {}) {
    const preferredBundledModel =
      bundledModelMap.get(storedState.bundledModelId) ?? defaultBundledModel;
    const preferredGestures = getGesturePresets(preferredBundledModel.id);
    const preferredGestureId =
      resolveGesturePreset(preferredBundledModel.id, storedState.gestureId)?.id ||
      preferredGestures[0]?.id ||
      'Pose';

    state.preferences.bundledModelId = preferredBundledModel.id;
    state.preferences.humanIdentity =
      `${storedState.humanIdentity || ''}`.trim() || bootstrapDefaults.humanIdentity;
    state.preferences.participantName =
      `${storedState.participantName || ''}`.trim() || bootstrapDefaults.participantName;
    state.preferences.humanLocale = storedState.humanLocale || bootstrapDefaults.humanLocale;
    state.preferences.voiceSampleFileName = storedState.voiceSampleFileName || '';
    state.preferences.voiceSampleProfileId = storedState.voiceSampleProfileId || '';
    state.preferences.voiceSampleStatus =
      storedState.voiceSampleStatus || bootstrapDefaults.voiceSampleStatus;
    state.preferences.voiceSampleSpeakerId = storedState.voiceSampleSpeakerId || '';
    state.preferences.voiceSampleSpeakerLabel = storedState.voiceSampleSpeakerLabel || '';
    state.preferences.enabledPluginIds = Array.from(
      new Set(
        (Array.isArray(storedState.enabledPluginIds) ? storedState.enabledPluginIds : [])
          .map((value) => `${value || ''}`.trim())
          .filter(Boolean),
      ),
    ).sort((left, right) => left.localeCompare(right));
    state.preferences.enableControlComputer = storedState.enableControlComputer === true;
    state.preferences.enableComplexTasks = storedState.enableComplexTasks === true;
    state.preferences.smoothGestureTransitions = storedState.smoothGestureTransitions !== false;
    state.preferences.cameraDistance = normalizeCameraDistance(storedState.cameraDistance);
    state.preferences.stageId = normalizeStageId(storedState.stageId, stageMap, stages);
    state.preferences.emoteId = emoteMap.has(storedState.emoteId) ? storedState.emoteId : emotes[0].id;
    state.preferences.gestureId = preferredGestureId;
    state.productionVoice.profile = null;
    state.productionVoice.validationMessage = '';
    state.productionVoice.defaultSpeakerId = storedState.voiceSampleSpeakerId || '';
    state.productionVoice.defaultSpeakerLabel = storedState.voiceSampleSpeakerLabel || '';
  }

  function persistState(dom) {
    const payload = {
      bundledModelId: state.preferences.bundledModelId,
      humanIdentity: state.preferences.humanIdentity,
      participantName: state.preferences.participantName,
      humanLocale: state.preferences.humanLocale,
      voiceSampleFileName:
        state.preferences.voiceSampleFileName || dom?.voiceSampleFileName?.textContent || '',
      voiceSampleProfileId: state.preferences.voiceSampleProfileId,
      voiceSampleStatus: state.preferences.voiceSampleStatus,
      voiceSampleSpeakerId: state.preferences.voiceSampleSpeakerId,
      voiceSampleSpeakerLabel: state.preferences.voiceSampleSpeakerLabel,
      enabledPluginIds: state.preferences.enabledPluginIds,
      enableControlComputer: state.preferences.enableControlComputer,
      enableComplexTasks: state.preferences.enableComplexTasks,
      smoothGestureTransitions: state.preferences.smoothGestureTransitions,
      cameraDistance: normalizeCameraDistance(state.preferences.cameraDistance),
      stageId: state.preferences.stageId,
      emoteId: state.preferences.emoteId,
      gestureId: state.preferences.gestureId,
    };

    try {
      window.localStorage.setItem(buildScopedStorageKey(activeScopeKey), JSON.stringify(payload));
    } catch {
      // Ignore storage failures in the spike app.
    }
  }

  function activateScope(scopeKey = DEFAULT_SCOPE_KEY) {
    activeScopeKey = `${scopeKey || ''}`.trim() || DEFAULT_SCOPE_KEY;
    applyStoredState(readScopedState(activeScopeKey));
    return activeScopeKey;
  }

  function getSelectedBundledModel() {
    return bundledModelMap.get(state.preferences.bundledModelId) || defaultModel;
  }

  function syncVoiceSampleProfile(profile) {
    state.productionVoice.profile = profile;
    state.preferences.voiceSampleFileName = `${profile?.referenceOriginalFileName || ''}`.trim();
    state.preferences.voiceSampleProfileId = `${profile?.id || ''}`.trim();
    state.preferences.voiceSampleStatus = profile?.referenceAvailable ? 'ready' : 'missing';
    state.preferences.voiceSampleSpeakerId = `${profile?.meloBaseSpeakerId || ''}`.trim();
    state.preferences.voiceSampleSpeakerLabel = `${profile?.meloBaseSpeakerLabel || ''}`.trim();
  }

  function hydrateInputs(dom) {
    dom.voiceSampleFile.value = '';
    dom.voiceSampleFileName.textContent = state.preferences.voiceSampleFileName || 'Choose WAV';
    dom.voiceSampleStatus.textContent =
      state.preferences.voiceSampleStatus === 'ready'
        ? 'Ready'
        : 'missing voice reference, a 3+s wav file';
    dom.voiceSampleStatus.dataset.tone =
      state.preferences.voiceSampleStatus === 'ready' ? 'muted' : 'danger';
    if (dom.smoothGestureTransitionsToggle) {
      dom.smoothGestureTransitionsToggle.checked = state.preferences.smoothGestureTransitions !== false;
    }
    if (dom.cameraDistanceInput) {
      dom.cameraDistanceInput.value = normalizeCameraDistance(state.preferences.cameraDistance).toFixed(2);
    }
    if (dom.cameraDistanceValue) {
      dom.cameraDistanceValue.textContent = formatCameraDistanceValue(state.preferences.cameraDistance);
    }
  }

  function ensureDefaults() {
    state.preferences.humanIdentity ||= bootstrapDefaults.humanIdentity;
    state.preferences.participantName ||= bootstrapDefaults.participantName;
  }

  function collectFormState(dom) {
    return {
      humanIdentity: state.preferences.humanIdentity,
      participantName: state.preferences.participantName,
      bundledModelId: state.preferences.bundledModelId,
      humanLocale: state.preferences.humanLocale,
      voiceSampleFileName:
        state.preferences.voiceSampleFileName || dom?.voiceSampleFileName?.textContent || '',
      voiceSampleProfileId: state.preferences.voiceSampleProfileId,
      voiceSampleStatus: state.preferences.voiceSampleStatus,
      voiceSampleSpeakerId: state.preferences.voiceSampleSpeakerId,
      voiceSampleSpeakerLabel: state.preferences.voiceSampleSpeakerLabel,
      enabledPluginIds: state.preferences.enabledPluginIds,
      enableControlComputer: state.preferences.enableControlComputer,
      enableComplexTasks: state.preferences.enableComplexTasks,
      smoothGestureTransitions: state.preferences.smoothGestureTransitions,
    };
  }

  applyStoredState(readScopedState(activeScopeKey));

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
    syncVoiceSampleProfile,
    activateScope,
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
