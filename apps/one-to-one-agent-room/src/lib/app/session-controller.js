import {
  buildCallSessionKey,
  buildCallSessionPayload,
  getCallPrimaryAction,
  normalizeSessionForUi,
} from './call-session.js';
import {
  pickDramaticGoodbyeGesture,
  pickRandomGoodbyePhrase,
} from './goodbye-sequence.js';
import {
  pickGreetingHelloGesture,
  pickRandomHelloPhrase,
} from './hello-sequence.js';

const AMBIENT_KEYWORDS = {
  idle: ['idle', 'between replies', 'resting', 'neutral speaking', 'waiting', 'calm'],
  listening: ['listen', 'listening', 'observing', 'ambient attention', 'waiting'],
  thinking: ['thinking', 'hesitation', 'problem solving', 'reflection'],
};

export function createSessionController({
  state,
  humanVoiceLayer,
  agentVoiceLayer,
  avatarSpeech,
  avatarLayer,
  dom,
  stageMap,
  emoteMap,
  selectStage,
  selectEmote,
  selectGesture,
  collectFormState,
  fetchJson,
  postJson,
  postFormData,
  addLog,
  formatError,
  renderSessionSnapshot,
  renderTranscriptList,
  renderSubtitles,
  renderDebugSnapshot,
  renderAgentStatus,
  renderVoiceSampleState,
  refreshActionButtons,
  syncVoiceSampleProfile,
  persistState,
  updateRoomStatus,
  timers = globalThis,
  random = Math.random,
}) {
  let prepareDebounceId = 0;
  let ambientTimerId = 0;
  let speechBeatTimerIds = [];
  let interruptionIssuedForUtterance = false;
  let thinkingTimerId = 0;
  let thinkingStartedAt = 0;
  let activeEndCallPromise = null;
  let pendingLocalHelloTimerId = 0;
  let localHelloToken = 0;

  function getLaunchContext() {
    return state.launchContext && typeof state.launchContext === 'object'
      ? state.launchContext
      : {
          mode: 'manual',
          autoStart: false,
          workspaceRoot: '',
          workspaceKey: 'default',
        };
  }

  function buildVoiceScopeQuery() {
    const workspaceKey = `${getLaunchContext().workspaceKey || ''}`.trim();
    return workspaceKey ? `?scope=${encodeURIComponent(workspaceKey)}` : '';
  }

  function buildWorkspaceSetupScopeQuery() {
    return buildVoiceScopeQuery();
  }

  function getProductionVoiceState() {
    if (!state.productionVoice) {
      state.productionVoice = {
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
      };
    }

    return state.productionVoice;
  }

  function getCodexState() {
    if (!state.codex) {
      state.codex = {
        loading: false,
        backendConfigured: false,
        backendRunning: false,
        backendApp: '',
        backendDetail: '',
        model: '',
        reasoningEffort: '',
        sessionRoot: '',
        command: '',
      };
    }

    return state.codex;
  }

  function createUtteranceId() {
    return globalThis.crypto?.randomUUID?.()
      ? globalThis.crypto.randomUUID()
      : `utt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function setSubtitle(role, text, mode) {
    state.subtitles[role] = {
      mode,
      text,
    };
    renderSubtitles();
  }

  function clearThinkingTimer() {
    if (thinkingTimerId) {
      timers.clearInterval?.(thinkingTimerId);
      thinkingTimerId = 0;
    }
  }

  function renderThinkingTimer() {
    renderSessionSnapshot();
    renderAgentStatus();
  }

  function stopAgentThinkingTimer() {
    clearThinkingTimer();
    thinkingStartedAt = 0;
    state.agentThinkingActive = false;
    state.agentThinkingElapsedTenths = 0;
    renderThinkingTimer();
  }

  function tickAgentThinkingTimer() {
    if (!state.agentThinkingActive || !thinkingStartedAt) {
      return;
    }

    const nextTenths = Math.max(0, Math.floor((Date.now() - thinkingStartedAt) / 100));
    if (nextTenths === state.agentThinkingElapsedTenths) {
      return;
    }

    state.agentThinkingElapsedTenths = nextTenths;
    renderThinkingTimer();
  }

  function startAgentThinkingTimer() {
    clearThinkingTimer();
    thinkingStartedAt = Date.now();
    state.agentThinkingActive = true;
    state.agentThinkingElapsedTenths = 0;
    renderThinkingTimer();
    thinkingTimerId = timers.setInterval?.(() => {
      tickAgentThinkingTimer();
    }, 100) || 0;
  }

  function applySessionPayload(payload) {
    if (payload?.session) {
      state.session = normalizeSessionForUi(payload.session);
    }

    if (payload?.inspector) {
      state.inspectorSnapshot = payload.inspector;
    }
  }

  function applyProductionVoicePayload(payload) {
    const productionVoice = getProductionVoiceState();
    const backend = payload?.backend || {};

    productionVoice.backendConfigured = backend.configured !== false;
    productionVoice.backendRunning = backend.running === true;
    productionVoice.backendApp = `${backend.app || ''}`.trim();
    productionVoice.backendDetail = `${backend.detail || ''}`.trim();
    productionVoice.defaultSpeakerId = `${backend.defaultSpeakerId || ''}`.trim();
    productionVoice.defaultSpeakerLabel = `${backend.defaultSpeakerLabel || ''}`.trim();
    productionVoice.validationMessage = '';
    syncVoiceSampleProfile(payload?.profile || null);
    productionVoice.profile = payload?.profile || null;

    agentVoiceLayer.updateConfig?.({
      ready: Boolean(state.productionVoice.backendRunning && state.productionVoice.profile?.referenceAvailable),
      defaultCharacterId: resolveActiveCharacterId(),
      locale: state.preferences.humanLocale || 'en-US',
    });

    persistState();
    renderVoiceSampleState();
    renderAgentStatus();
    refreshActionButtons();
    renderDebugSnapshot();
  }

  function applyCodexPayload(payload) {
    const codex = getCodexState();
    const backend = payload?.backend || {};

    codex.backendConfigured = backend.configured !== false;
    codex.backendRunning = backend.running === true;
    codex.backendApp = `${backend.app || ''}`.trim();
    codex.backendDetail = `${backend.detail || ''}`.trim();
    codex.model = `${backend.model || ''}`.trim();
    codex.reasoningEffort = `${backend.reasoningEffort || ''}`.trim();
    codex.sessionRoot = `${backend.sessionRoot || ''}`.trim();
    codex.command = `${backend.command || ''}`.trim();
    renderSessionSnapshot();
    renderAgentStatus();
    refreshActionButtons();
    renderDebugSnapshot();
  }

  function applyWorkspaceSetupPayload(payload) {
    const setup = payload?.setup || null;
    if (!setup?.activeModelId) {
      return;
    }

    state.preferences.bundledModelId = `${setup.activeModelId}`.trim() || state.preferences.bundledModelId;
  }

  function resolveActiveCharacterId() {
    return (
      `${state.session?.avatar?.activeModelId || ''}`.trim() ||
      `${collectFormState().bundledModelId || ''}`.trim() ||
      `${state.preferences?.bundledModelId || ''}`.trim()
    );
  }

  function resolveCurrentGestureCatalog() {
    const modelId = resolveActiveCharacterId();
    return state.runtimeConfig?.avatar?.gestureCatalogByModel?.[modelId] || [];
  }

  function clearAmbientLoop() {
    if (ambientTimerId) {
      clearTimeout(ambientTimerId);
      ambientTimerId = 0;
    }
  }

  function clearSpeechBeats() {
    speechBeatTimerIds.forEach((timerId) => clearTimeout(timerId));
    speechBeatTimerIds = [];
  }

  function setStartupGreetingActive(active) {
    state.startupGreetingActive = Boolean(active);
    renderSessionSnapshot();
    renderTranscriptList();
    renderDebugSnapshot();
    renderAgentStatus();
    refreshActionButtons();
  }

  function clearScheduledLocalHello({ releaseLock = false } = {}) {
    if (pendingLocalHelloTimerId) {
      timers.clearTimeout?.(pendingLocalHelloTimerId);
      pendingLocalHelloTimerId = 0;
    }
    localHelloToken += 1;
    if (releaseLock) {
      state.startupGreetingActive = false;
      state.humanMicLevel = 0;
      renderSessionSnapshot();
      renderTranscriptList();
      renderDebugSnapshot();
      renderAgentStatus();
      refreshActionButtons();
    }
  }

  function canPlayLocalHello(expectedToken) {
    return (
      expectedToken === localHelloToken &&
      state.activeCall &&
      !state.endingCall &&
      state.startupGreetingActive &&
      !state.callEndingDimmed &&
      !state.processingReplies &&
      !state.currentTurnId &&
      !state.activeReplyAbortController &&
      !state.activeUtteranceId &&
      !state.activeUtteranceText &&
      !state.transcriptPreview &&
      !avatarSpeech.getSnapshot().active
    );
  }

  async function enableListeningAfterLocalHello(expectedToken) {
    if (
      expectedToken !== localHelloToken ||
      !state.activeCall ||
      state.endingCall ||
      state.callEndingDimmed
    ) {
      return;
    }

    humanVoiceLayer.updateConfig?.({ autoRestart: true });

    try {
      await humanVoiceLayer.startListening({ restart: true });
    } catch (error) {
      setStartupGreetingActive(false);
      await endCall({ reason: 'speech recognition failed to start after local hello' });
      updateRoomStatus(
        'error',
        'Speech recognition failed',
        error instanceof Error ? error.message : 'Unable to start browser speech recognition.',
      );
      throw error;
    }

    setStartupGreetingActive(false);
    state.humanMicLevel = 0;
    updateRoomStatus('ready', 'Call live', 'Listening for your voice.');
    setSubtitle('human', 'Listening…', 'listening');
    setSubtitle('agent', 'Waiting for your first line.', 'ready');
  }

  async function playLocalHello(expectedToken) {
    if (!canPlayLocalHello(expectedToken)) {
      return;
    }

    const avatarSnapshot = avatarLayer.getSnapshot();
    const currentGestureId = avatarSnapshot.gestureId || '';
    const selectedGesture = pickGreetingHelloGesture(
      avatarSnapshot.availableGestures,
      currentGestureId,
      random,
    );
    const helloText = pickRandomHelloPhrase(random);
    const helloMood =
      selectedGesture?.id === 'Cheer' || selectedGesture?.id === 'Peace'
        ? 'playful'
        : 'warm';

    if (selectedGesture?.id) {
      selectGesture(selectedGesture.id, { persist: false });
    }
    selectEmote(helloMood, { persist: false });

    renderAgentStatus();
    syncAmbientMotion();

    await avatarSpeech
      .speakText(helloText, {
        withVoice: agentVoiceLayer.getSnapshot().speechSynthesisSupported,
        source: 'local-hello',
        locale: collectFormState().humanLocale || 'en-US',
        characterId: resolveActiveCharacterId(),
        mood: helloMood,
        onPlaybackStart: () => {
          setSubtitle('agent', helloText, 'speaking');
          renderAgentStatus();
          syncAmbientMotion();
        },
        onPlaybackEnd: () => {
          void enableListeningAfterLocalHello(expectedToken);
        },
      })
      .catch((error) => {
        addLog('error', 'Local hello playback failed.', formatError(error));
        if (canPlayLocalHello(expectedToken)) {
          void enableListeningAfterLocalHello(expectedToken);
        }
      })
      .finally(() => {
        if (state.activeCall && !state.endingCall && !state.processingReplies && !state.currentTurnId) {
          renderAgentStatus();
          syncAmbientMotion();
        }
      });
  }

  function scheduleLocalHello() {
    clearScheduledLocalHello();
    const nextToken = localHelloToken;
    const delayMs = 1000 + Math.round(random() * 2000);
    pendingLocalHelloTimerId = timers.setTimeout?.(() => {
      pendingLocalHelloTimerId = 0;
      void playLocalHello(nextToken);
    }, delayMs) || 0;
  }

  function pickAmbientGesture(mode) {
    const gestures = resolveCurrentGestureCatalog();
    const keywords = AMBIENT_KEYWORDS[mode] || [];
    const currentGesture = avatarLayer.getSnapshot().gestureId;
    const matches = gestures.filter((gesture) =>
      keywords.some(
        (keyword) =>
          gesture.intent === keyword ||
          gesture.id === keyword ||
          gesture.bestFor?.includes(keyword),
      ),
    );
    const pool = matches.length ? matches : gestures;
    const filteredPool = pool.filter((gesture) => gesture.id !== currentGesture);
    const finalPool = filteredPool.length ? filteredPool : pool;
    if (!finalPool.length) {
      return '';
    }

    const index = Math.floor(Math.random() * finalPool.length);
    return finalPool[index]?.id || '';
  }

  function syncAmbientMotion() {
    clearAmbientLoop();

    if (!state.activeCall) {
      return;
    }

    if (avatarSpeech.getSnapshot().active || state.currentTurnId) {
      return;
    }

    const humanSnapshot = state.humanVoiceSnapshot || humanVoiceLayer.getSnapshot();
    const nextMode = state.processingReplies
      ? 'thinking'
      : humanSnapshot.listening
        ? 'listening'
        : 'idle';
    const gestureId = pickAmbientGesture(nextMode);
    if (gestureId) {
      selectGesture(gestureId, { persist: false });
    }

    ambientTimerId = window.setTimeout(() => {
      syncAmbientMotion();
    }, nextMode === 'thinking' ? 2600 : 4200 + Math.round(Math.random() * 1800));
  }

  function buildSpeechBeatTimers(reply, durationMs) {
    const beats = Array.isArray(reply.animationSequence) ? reply.animationSequence : [];
    if (!beats.length) {
      return () => {};
    }

    return () => {
      clearSpeechBeats();
      beats.forEach((beat) => {
        const timerId = window.setTimeout(() => {
          if (beat.stageId && stageMap.has(beat.stageId)) {
            selectStage(beat.stageId, { persist: false });
          }
          if (beat.emoteId && emoteMap.has(beat.emoteId)) {
            selectEmote(beat.emoteId, { persist: false });
          }
          if (beat.gestureId) {
            selectGesture(beat.gestureId, { persist: false });
          }
        }, Math.max(0, Math.round((beat.atRatio || 0) * durationMs)));
        speechBeatTimerIds.push(timerId);
      });
    };
  }

  function applySpeechScene(reply) {
    if (reply.stageId && stageMap.has(reply.stageId)) {
      selectStage(reply.stageId, { persist: false });
    }

    if (reply.emoteId && emoteMap.has(reply.emoteId)) {
      selectEmote(reply.emoteId, { persist: false });
    }

    if (reply.gestureId) {
      selectGesture(reply.gestureId, { persist: false });
    }

    if (reply.text && dom.lastAgentReply) {
      dom.lastAgentReply.textContent = reply.text;
      setSubtitle('agent', reply.subtitle || reply.text, 'speaking');
      return;
    }

    if (reply.text) {
      setSubtitle('agent', reply.subtitle || reply.text, 'speaking');
    }
  }

  async function syncSessionSetup() {
    if (!state.session?.id || !state.runtimeConfig) {
      return;
    }

    agentVoiceLayer.updateConfig?.({
      defaultCharacterId: resolveActiveCharacterId(),
    });

    const payload = buildCallSessionPayload(collectFormState(), state.runtimeConfig);
    const merged = await postJson(
      `/api/call/sessions/${encodeURIComponent(state.session.id)}/setup`,
      {
        metadata: payload.metadata,
      },
    );
    applySessionPayload(merged);
    renderSessionSnapshot();
    renderDebugSnapshot();
  }

  async function loadWorkspaceSetup() {
    const payload = await fetchJson(`/api/workspace-setup${buildWorkspaceSetupScopeQuery()}`);
    applyWorkspaceSetupPayload(payload);
    renderDebugSnapshot();
    return payload;
  }

  async function syncWorkspaceSetup({
    activeModelId = resolveActiveCharacterId(),
    activeModelLabel = '',
  } = {}) {
    const payload = await postJson(`/api/workspace-setup${buildWorkspaceSetupScopeQuery()}`, {
      activeModelId,
      activeModelLabel,
    });
    applyWorkspaceSetupPayload(payload);
    renderDebugSnapshot();
    return payload;
  }

  async function resolveLinkedLaunch() {
    const launch = getLaunchContext();
    if (launch.mode !== 'linked-call' || !launch.launchId) {
      return launch;
    }

    const payload = await fetchJson(`/api/launch/${encodeURIComponent(launch.launchId)}`);
    const resolvedLaunch = {
      ...launch,
      ...(payload?.launch || {}),
      mode: 'linked-call',
      autoStart: launch.autoStart,
      initialScreen: launch.initialScreen,
    };
    state.launchContext = resolvedLaunch;
    renderDebugSnapshot();
    return resolvedLaunch;
  }

  async function loadProductionVoiceState() {
    const productionVoice = getProductionVoiceState();
    productionVoice.loading = true;
    renderVoiceSampleState();
    refreshActionButtons();

    try {
      const payload = await fetchJson(`/api/production-voice/state${buildVoiceScopeQuery()}`);
      applyProductionVoicePayload(payload);
      if (state.session?.id) {
        await syncSessionSetup();
      }
      return payload;
    } catch (error) {
      productionVoice.backendRunning = false;
      productionVoice.backendDetail =
        error instanceof Error ? error.message : 'Unable to load production voice state.';
      renderVoiceSampleState();
      renderAgentStatus();
      refreshActionButtons();
      throw error;
    } finally {
      productionVoice.loading = false;
      renderVoiceSampleState();
      renderDebugSnapshot();
    }
  }

  async function loadCodexState() {
    const codex = getCodexState();
    codex.loading = true;
    renderSessionSnapshot();
    refreshActionButtons();

    try {
      const payload = await fetchJson('/api/codex/state');
      applyCodexPayload(payload);
      return payload;
    } catch (error) {
      codex.backendRunning = false;
      codex.backendDetail =
        error instanceof Error ? error.message : 'Unable to verify codex exec.';
      renderSessionSnapshot();
      renderAgentStatus();
      refreshActionButtons();
      throw error;
    } finally {
      codex.loading = false;
      renderSessionSnapshot();
      renderDebugSnapshot();
    }
  }

  async function uploadVoiceSample(file) {
    const productionVoice = getProductionVoiceState();
    productionVoice.uploading = true;
    productionVoice.validationMessage = '';
    state.preferences.voiceSampleFileName = `${file?.name || ''}`.trim();
    renderVoiceSampleState();
    refreshActionButtons();

    try {
      const formData = new FormData();
      formData.set('referenceWav', file);
      const speakerId =
        productionVoice.defaultSpeakerId || state.preferences.voiceSampleSpeakerId;
      const speakerLabel =
        productionVoice.defaultSpeakerLabel || state.preferences.voiceSampleSpeakerLabel;
      if (speakerId) {
        formData.set('meloBaseSpeakerId', speakerId);
        formData.set('meloBaseSpeakerLabel', speakerLabel || speakerId);
      }

      const payload = await postFormData(
        `/api/production-voice/profile${buildVoiceScopeQuery()}`,
        formData,
      );
      applyProductionVoicePayload(payload);
      if (state.session?.id) {
        await syncSessionSetup();
      }
      addLog('info', 'Saved production voice sample.', {
        fileName: file?.name || '',
        speakerId: payload?.profile?.meloBaseSpeakerId || speakerId || '',
      });
      return payload;
    } finally {
      productionVoice.uploading = false;
      renderVoiceSampleState();
      refreshActionButtons();
      renderDebugSnapshot();
    }
  }

  function setVoiceSampleValidationMessage(message = '') {
    const productionVoice = getProductionVoiceState();
    productionVoice.validationMessage = `${message || ''}`.trim();
    renderVoiceSampleState();
    refreshActionButtons();
    renderDebugSnapshot();
  }

  function installSdkLogging() {
    // No room SDK transport is used in the direct Codex session flow.
  }

  async function ensureSessionReady() {
    if (!state.session?.id) {
      throw new Error('Start the call before sending turns to the agent.');
    }
  }

  async function prepareLobbySession({ force = false } = {}) {
    if (!state.runtimeConfig) {
      return state.session;
    }

    const form = collectFormState();
    const sessionKey = buildCallSessionKey(form, state.runtimeConfig, getLaunchContext());
    if (!force && state.session?.id && state.sessionKey === sessionKey) {
      return state.session;
    }

    state.sessionPreparing = true;
    renderSessionSnapshot();
    renderAgentStatus();
    renderDebugSnapshot();

    try {
      const sessionResponse = await postJson(
        '/api/call/sessions',
        buildCallSessionPayload(form, state.runtimeConfig, getLaunchContext()),
      );
      applySessionPayload(sessionResponse);
      state.sessionKey = sessionKey;
      await syncSessionSetup();
      renderSessionSnapshot();
      renderTranscriptList();
      renderDebugSnapshot();
      addLog('info', 'Prepared direct Codex session.', {
        sessionId: state.session.id,
        title: state.session.title,
      });
      return state.session;
    } finally {
      state.sessionPreparing = false;
      renderSessionSnapshot();
      renderAgentStatus();
      renderDebugSnapshot();
      refreshActionButtons();
    }
  }

  function scheduleLobbySessionPreparation({ force = false, immediate = false } = {}) {
    if (prepareDebounceId) {
      clearTimeout(prepareDebounceId);
      prepareDebounceId = 0;
    }

    const run = async () => {
      try {
        await prepareLobbySession({ force });
      } catch (error) {
        addLog('error', 'Prepare call session failed.', formatError(error));
      }
    };

    if (immediate) {
      void run();
      return;
    }

    prepareDebounceId = window.setTimeout(() => {
      prepareDebounceId = 0;
      void run();
    }, 300);
  }

  async function refreshSession() {
    if (!state.session?.id) {
      return;
    }

    const payload = await fetchJson(`/api/call/sessions/${encodeURIComponent(state.session.id)}`);
    applySessionPayload(payload);
    renderSessionSnapshot();
    renderTranscriptList();
    renderDebugSnapshot();
  }

  async function markReplyPlayed(turnId) {
    if (!state.session?.id || !turnId) {
      return;
    }

    const payload = await postJson(
      `/api/call/sessions/${encodeURIComponent(state.session.id)}/turns/${encodeURIComponent(turnId)}/played`,
      {},
    );
    applySessionPayload(payload);
  }

  async function playTurnReply(turn) {
    const reply = turn?.agentReply;
    if (!reply) {
      return;
    }

    state.currentTurnId = turn.id;
    const playbackGeneration = state.playbackGeneration;
    const renderProfile = agentVoiceLayer.resolveRenderProfile({
      characterId: resolveActiveCharacterId(),
      mood: reply.mood,
    });
    const timeline = avatarSpeech.buildMouthTimeline(reply.text, renderProfile.speechRate);
    const startSpeechBeats = buildSpeechBeatTimers(reply, timeline.durationMs);

    try {
      await avatarSpeech.speakText(reply.text, {
        withVoice: agentVoiceLayer.getSnapshot().speechSynthesisSupported,
        source: `codex-turn:${turn.id}`,
        locale: collectFormState().humanLocale || 'en-US',
        characterId: resolveActiveCharacterId(),
        mood: reply.mood,
        onPlaybackStart: () => {
          stopAgentThinkingTimer();
          applySpeechScene(reply);
          startSpeechBeats();
          renderAgentStatus();
          syncAmbientMotion();
        },
      });
    } finally {
      clearSpeechBeats();
    }

    stopAgentThinkingTimer();

    if (playbackGeneration === state.playbackGeneration) {
      await markReplyPlayed(turn.id).catch((error) => {
        addLog('error', 'Mark reply played failed.', formatError(error));
      });
    }

    state.currentTurnId = null;
    renderSessionSnapshot();
    renderTranscriptList();
    renderDebugSnapshot();
    renderAgentStatus();
    syncAmbientMotion();
  }

  async function interruptActiveReply(
    reason = 'human started speaking',
    { preserveThinkingTimer = false } = {},
  ) {
    if (!state.session?.id) {
      return false;
    }

    const hadActiveWork = Boolean(
      state.processingReplies ||
        avatarSpeech.getSnapshot().active ||
        state.currentTurnId ||
        state.activeReplyAbortController,
    );
    if (!hadActiveWork) {
      return false;
    }

    state.playbackGeneration += 1;
    state.currentTurnId = null;
    state.processingReplies = false;
    if (!preserveThinkingTimer) {
      stopAgentThinkingTimer();
    }
    clearSpeechBeats();
    avatarSpeech.stop({ cancelVoice: true });

    if (state.activeReplyAbortController) {
      state.activeReplyAbortController.abort();
      state.activeReplyAbortController = null;
    }

    try {
      const payload = await postJson(
        `/api/call/sessions/${encodeURIComponent(state.session.id)}/interrupt`,
        { reason },
      );
      applySessionPayload(payload);
    } catch (error) {
      addLog('error', 'Interrupt agent failed.', formatError(error));
    }

    setSubtitle('agent', 'Interrupted. Listening…', 'interrupted');
    renderSessionSnapshot();
    renderTranscriptList();
    renderDebugSnapshot();
    renderAgentStatus();
    syncAmbientMotion();
    return true;
  }

  async function stopLiveAgentWork(reason = 'call ended by human') {
    const hadActiveServerWork = Boolean(
      state.processingReplies ||
        state.currentTurnId ||
        state.activeReplyAbortController,
    );

    clearAmbientLoop();
    clearSpeechBeats();
    clearScheduledLocalHello({ releaseLock: true });
    interruptionIssuedForUtterance = false;
    stopAgentThinkingTimer();
    state.callEndingDimmed = false;
    state.humanMicLevel = 0;
    state.playbackGeneration += 1;
    state.currentTurnId = null;
    state.processingReplies = false;
    state.activeUtteranceId = null;
    state.activeUtteranceText = '';
    state.transcriptPreview = '';
    avatarSpeech.stop({ cancelVoice: true });

    if (state.activeReplyAbortController) {
      state.activeReplyAbortController.abort();
      state.activeReplyAbortController = null;
    }

    if (!state.session?.id || !hadActiveServerWork) {
      return;
    }

    try {
      const payload = await postJson(
        `/api/call/sessions/${encodeURIComponent(state.session.id)}/interrupt`,
        { reason },
      );
      applySessionPayload(payload);
    } catch (error) {
      addLog('error', 'Interrupt agent failed while ending the call.', formatError(error));
    }
  }

  async function playLocalGoodbye() {
    const avatarSnapshot = avatarLayer.getSnapshot();
    const currentGestureId = avatarSnapshot.gestureId || '';
    const selectedGesture = pickDramaticGoodbyeGesture(
      avatarSnapshot.availableGestures,
      currentGestureId,
      random,
    );
    const goodbyeText = pickRandomGoodbyePhrase(random);
    let endDelayStarted = false;
    let resolveEndDelay = () => {};
    const endDelayPromise = new Promise((resolve) => {
      resolveEndDelay = resolve;
    });

    function startEndDelay() {
      if (endDelayStarted) {
        return;
      }

      endDelayStarted = true;
      state.callEndingDimmed = true;
      renderSessionSnapshot();
      renderTranscriptList();
      renderDebugSnapshot();
      renderAgentStatus();
      refreshActionButtons();
      timers.setTimeout?.(() => {
        resolveEndDelay();
      }, 3000);
    }

    setSubtitle('agent', goodbyeText, 'ending');
    state.callEndingDimmed = false;

    if (selectedGesture?.id) {
      selectEmote('playful', { persist: false });
      selectGesture(selectedGesture.id, { persist: false });
    } else {
      selectEmote('warm', { persist: false });
    }

    renderAgentStatus();
    syncAmbientMotion();

    const speechPromise = avatarSpeech
      .speakText(goodbyeText, {
        withVoice: agentVoiceLayer.getSnapshot().speechSynthesisSupported,
        source: 'local-goodbye',
        locale: collectFormState().humanLocale || 'en-US',
        characterId: resolveActiveCharacterId(),
        mood: selectedGesture?.id === 'Cheer' || selectedGesture?.id === 'Peace' ? 'playful' : 'warm',
        onPlaybackStart: () => {
          setSubtitle('agent', goodbyeText, 'speaking');
          renderAgentStatus();
        },
        onPlaybackEnd: () => {
          startEndDelay();
        },
      })
      .catch((error) => {
        addLog('error', 'Local goodbye playback failed.', formatError(error));
      })
      .finally(() => {
        startEndDelay();
      });

    await Promise.allSettled([speechPromise, endDelayPromise]);
  }

  async function startCall() {
    const productionVoice = getProductionVoiceState();
    const codex = getCodexState();

    if (!productionVoice.profile?.referenceAvailable) {
      throw new Error('Upload a WAV production voice sample before starting the call.');
    }

    if (!productionVoice.backendRunning) {
      throw new Error(
        productionVoice.backendDetail || 'Production voice backend is unavailable.',
      );
    }

    if (!codex.backendRunning) {
      throw new Error(codex.backendDetail || 'Codex exec is unavailable.');
    }

    await prepareLobbySession({ force: true });
    await ensureSessionReady();
    await syncSessionSetup();

    const payload = await postJson(
      `/api/call/sessions/${encodeURIComponent(state.session.id)}/state`,
      { state: 'live' },
    );
    applySessionPayload(payload);
    state.activeCall = true;
    state.endingCall = false;
    state.callEndingDimmed = false;
    state.startupGreetingActive = true;
    state.humanMicMuted = false;
    state.humanMicLevel = 0;
    humanVoiceLayer.updateConfig?.({ autoRestart: false });
    state.playbackGeneration += 1;
    interruptionIssuedForUtterance = false;

    updateRoomStatus('ready', 'Call live', 'Agent is greeting you.');
    setSubtitle('human', 'Muted for intro.', 'idle');
    setSubtitle('agent', 'Joining…', 'ready');
    renderSessionSnapshot();
    renderTranscriptList();
    renderDebugSnapshot();
    renderAgentStatus();
    refreshActionButtons();
    syncAmbientMotion();

    addLog('info', 'Voice call started.', {
      sessionId: state.session.id,
    });
    scheduleLocalHello();
  }

  async function setMicrophoneMuted(muted = true) {
    const nextMuted = Boolean(muted);

    if (state.endingCall) {
      return state.humanMicMuted;
    }

    if (!state.activeCall) {
      state.humanMicMuted = nextMuted;
      state.humanMicLevel = 0;
      renderSessionSnapshot();
      renderDebugSnapshot();
      renderAgentStatus();
      refreshActionButtons();
      return state.humanMicMuted;
    }

    if (state.humanMicMuted === nextMuted) {
      return state.humanMicMuted;
    }

    if (nextMuted) {
      humanVoiceLayer.updateConfig?.({ autoRestart: false });
      humanVoiceLayer.stopListening({ suppressAutoRestart: true });
      state.humanMicMuted = true;
      state.humanMicLevel = 0;
      setSubtitle('human', 'Muted.', 'idle');
    } else {
      try {
        humanVoiceLayer.updateConfig?.({ autoRestart: true });
        await humanVoiceLayer.startListening({ restart: true });
        state.humanMicMuted = false;
        state.humanMicLevel = 0;
        setSubtitle('human', 'Listening…', 'listening');
      } catch (error) {
        state.humanMicMuted = true;
        state.humanMicLevel = 0;
        renderSessionSnapshot();
        renderDebugSnapshot();
        renderAgentStatus();
        refreshActionButtons();
        throw error;
      }
    }

    renderSessionSnapshot();
    renderDebugSnapshot();
    renderAgentStatus();
    refreshActionButtons();
    return state.humanMicMuted;
  }

  async function toggleMicrophoneMuted() {
    return setMicrophoneMuted(!state.humanMicMuted);
  }

  async function endCall({ reason = 'human ended call' } = {}) {
    if (activeEndCallPromise) {
      return activeEndCallPromise;
    }

    activeEndCallPromise = (async () => {
      humanVoiceLayer.stopListening();
      state.endingCall = true;
      state.callEndingDimmed = false;
      state.startupGreetingActive = false;
      updateRoomStatus('loading', 'Ending call', 'Wrapping up the conversation.');
      setSubtitle('human', 'Ending call…', 'idle');
      renderSessionSnapshot();
      renderTranscriptList();
      renderDebugSnapshot();
      renderAgentStatus();
      refreshActionButtons();

      await stopLiveAgentWork(reason);

      if (state.activeCall) {
        await playLocalGoodbye();
      }

      state.playbackGeneration += 1;
      state.currentTurnId = null;
      state.activeCall = false;
      state.endingCall = false;
      state.callEndingDimmed = false;
      state.startupGreetingActive = false;
      state.humanMicMuted = false;
      state.humanMicLevel = 0;
      humanVoiceLayer.updateConfig?.({ autoRestart: true });
      state.activeUtteranceId = null;
      state.activeUtteranceText = '';
      state.transcriptPreview = '';
      state.processingReplies = false;

      if (state.session?.id) {
        try {
          const payload = await postJson(
            `/api/call/sessions/${encodeURIComponent(state.session.id)}/end`,
            {
              reason,
              skipAgentFinalize: true,
            },
          );
          applySessionPayload(payload);
        } catch (error) {
          addLog('error', 'End call finalize failed.', formatError(error));
        }
      }

      updateRoomStatus('idle', 'Call ended', 'The browser is no longer listening.');
      setSubtitle('human', 'Call ended.', 'idle');
      setSubtitle('agent', 'Agent is offline.', 'idle');
      renderSessionSnapshot();
      renderTranscriptList();
      renderDebugSnapshot();
      renderAgentStatus();
      refreshActionButtons();
    })();

    try {
      await activeEndCallPromise;
    } finally {
      activeEndCallPromise = null;
    }
  }

  async function handlePrimaryCallAction() {
    const launch = getLaunchContext();
    if (
      launch.mode === 'linked-call' &&
      (launch.callStatus === 'ended' || launch.callStatus === 'retry-needed')
    ) {
      throw new Error('This linked call has already ended.');
    }

    if (state.activeCall) {
      await endCall();
      return;
    }

    await startCall();
  }

  async function maybeStartLaunchCall() {
    const launch = getLaunchContext();
    if (
      launch.mode !== 'linked-call' ||
      !launch.autoStart ||
      state.activeCall ||
      launch.callStatus === 'ended' ||
      launch.callStatus === 'retry-needed'
    ) {
      return false;
    }

    const humanVoiceSnapshot = state.humanVoiceSnapshot || humanVoiceLayer.getSnapshot();
    const action = getCallPrimaryAction({
      activeCall: state.activeCall,
      sessionPreparing: state.sessionPreparing,
      modelLoading: state.modelLoading,
      recognitionSupported: humanVoiceSnapshot.recognitionSupported,
      setupReady: Boolean(state.preferences.bundledModelId),
      productionVoiceReady: Boolean(
        state.productionVoice.backendRunning && state.productionVoice.profile?.referenceAvailable,
      ),
      codexReady: Boolean(state.codex.backendRunning),
    });

    if (action.disabled) {
      return false;
    }

    await startCall();
    return true;
  }

  async function beginUserUtterance(utteranceId = createUtteranceId()) {
    await ensureSessionReady();
    state.activeUtteranceId = utteranceId;
    state.activeUtteranceText = '';
    return utteranceId;
  }

  async function syncInterimTranscript(text) {
    if (!state.session?.id || !state.activeCall) {
      return;
    }

    const nextText = `${text || ''}`.trim();
    if (nextText) {
      clearScheduledLocalHello({ releaseLock: true });
    }
    state.transcriptPreview = nextText;
    if (!nextText) {
      renderSubtitles();
      return;
    }

    if (!interruptionIssuedForUtterance) {
      const interrupted = await interruptActiveReply();
      if (interrupted) {
        interruptionIssuedForUtterance = true;
      }
    }

    setSubtitle('human', nextText, 'listening');
    state.activeUtteranceId ||= await beginUserUtterance();
    state.activeUtteranceText = nextText;
    renderDebugSnapshot();
  }

  async function finalizeUserUtterance(transcript, source) {
    await ensureSessionReady();
    const cleanedTranscript = `${transcript || ''}`.trim();
    if (!cleanedTranscript) {
      return;
    }

    clearScheduledLocalHello({ releaseLock: true });

    startAgentThinkingTimer();

    if (!interruptionIssuedForUtterance) {
      const interrupted = await interruptActiveReply(
        source === 'typed' ? 'typed turn superseded agent reply' : 'human started speaking',
        { preserveThinkingTimer: true },
      );
      if (interrupted) {
        interruptionIssuedForUtterance = true;
      }
    }

    const utteranceId = state.activeUtteranceId || (await beginUserUtterance());
    const form = collectFormState();
    const requestController = new AbortController();
    const playbackGeneration = state.playbackGeneration;
    state.activeReplyAbortController = requestController;
    state.activeUtteranceId = utteranceId;
    state.activeUtteranceText = '';
    state.transcriptPreview = '';
    state.processingReplies = true;
    setSubtitle('human', cleanedTranscript, 'final');
    setSubtitle('agent', 'Thinking…', 'thinking');
    renderSessionSnapshot();
    renderTranscriptList();
    renderDebugSnapshot();
    renderAgentStatus();
    addLog('info', 'Sent human turn directly to Codex.', {
      source,
      transcript: cleanedTranscript,
    });
    syncAmbientMotion();

    try {
      const payload = await postJson(
        `/api/call/sessions/${encodeURIComponent(state.session.id)}/turns`,
        {
          text: cleanedTranscript,
          source,
          humanIdentity: form.humanIdentity,
          humanName: form.participantName,
        },
        { signal: requestController.signal },
      );

      if (
        state.activeReplyAbortController !== requestController ||
        playbackGeneration !== state.playbackGeneration
      ) {
        return;
      }

      state.activeReplyAbortController = null;
      state.processingReplies = false;
      applySessionPayload(payload);
      renderSessionSnapshot();
      renderTranscriptList();
      renderDebugSnapshot();
      renderAgentStatus();

      if (payload.interrupted || !payload.turn?.agentReply) {
        stopAgentThinkingTimer();
        setSubtitle('agent', 'Interrupted. Listening…', 'interrupted');
        syncAmbientMotion();
        return;
      }

      await playTurnReply(payload.turn);
    } catch (error) {
      state.processingReplies = false;
      stopAgentThinkingTimer();
      if (state.activeReplyAbortController === requestController) {
        state.activeReplyAbortController = null;
      }

      if (error?.name === 'AbortError') {
        return;
      }

      setSubtitle('agent', 'Codex could not reply.', 'error');
      renderSessionSnapshot();
      renderTranscriptList();
      renderDebugSnapshot();
      renderAgentStatus();
      addLog('error', 'Direct Codex turn failed.', formatError(error));
      throw error;
    } finally {
      state.activeUtteranceId = null;
      state.activeUtteranceText = '';
      interruptionIssuedForUtterance = false;
      syncAmbientMotion();
    }
  }

  async function enqueueHumanTurn(transcript, source) {
    await finalizeUserUtterance(transcript, source);
  }

  function sendBestEffortSessionClose(reason = 'call window closed') {
    if (
      getLaunchContext().mode !== 'linked-call' ||
      !state.session?.id ||
      !state.activeCall ||
      typeof fetch !== 'function'
    ) {
      return;
    }

    const sessionBase = `/api/call/sessions/${encodeURIComponent(state.session.id)}`;
    const payloads = [[`${sessionBase}/end`, { reason }]];

    payloads.forEach(([url, body]) => {
      void fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        keepalive: true,
      }).catch(() => {});
    });
  }

  function destroy({ reason = 'call window closed' } = {}) {
    if (prepareDebounceId) {
      clearTimeout(prepareDebounceId);
      prepareDebounceId = 0;
    }
    sendBestEffortSessionClose(reason);
    clearScheduledLocalHello({ releaseLock: true });
    clearAmbientLoop();
    clearSpeechBeats();
    humanVoiceLayer.stopListening();
    avatarSpeech.stop({ cancelVoice: true });
    state.activeReplyAbortController?.abort?.();
    humanVoiceLayer.destroy();
    agentVoiceLayer.destroy();
    avatarLayer.destroy();
  }

  return {
    installSdkLogging,
    ensureSessionReady,
    prepareLobbySession,
    scheduleLobbySessionPreparation,
    handlePrimaryCallAction,
    beginUserUtterance,
    syncInterimTranscript,
    finalizeUserUtterance,
    syncSessionSetup,
    syncWorkspaceSetup,
    loadProductionVoiceState,
    loadCodexState,
    loadWorkspaceSetup,
    resolveLinkedLaunch,
    refreshSession,
    enqueueHumanTurn,
    uploadVoiceSample,
    setVoiceSampleValidationMessage,
    interruptActiveReply,
    toggleMicrophoneMuted,
    endCall,
    maybeStartLaunchCall,
    destroy,
  };
}
