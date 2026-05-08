import { buildDefaultCallForm } from './call-session.js';

const DEFAULT_SCOPE_KEY = 'default';

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
    },
    currentTurnId: null,
    playbackGeneration: 0,
    activeReplyAbortController: null,
    callHistoryCollapsed: false,
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
      stageId: stages[0].id,
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
    state.preferences.stageId = stageMap.has(storedState.stageId) ? storedState.stageId : stages[0].id;
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
