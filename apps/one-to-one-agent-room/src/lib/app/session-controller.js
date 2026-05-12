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
import {
  pickRandomThinkingPromptPhrase,
} from './thinking-prompt-sequence.js';

const INITIAL_THINKING_PROMPT_DELAY_MS = 550;
const THINKING_PROMPT_LOOP_BASE_DELAY_MS = 1_000;
const THINKING_PROMPT_LOOP_JITTER_MS = 0;
const AGENT_SELF_RESERVE_DELAY_MS = 300;
const INTERIM_SPECULATIVE_BOUNDARY_DELAY_MS = 180;
const INTERIM_SPECULATIVE_STALL_DELAY_MS = 450;
const INTERIM_SPECULATIVE_MIN_GROWTH_CHARS = 24;
const LOCAL_HELLO_DELAY_MS = 0;
const AUTO_REPLY_SEGMENT_TARGET_DURATION_MS = 5_500;
const AUTO_REPLY_SEGMENT_TOTAL_DURATION_MS = 15_000;
const AUTO_REPLY_SEGMENT_SENTENCE_THRESHOLD = 6;
const AUTO_REPLY_SEGMENT_MAX_CHARS = 180;
const AUTO_REPLY_SEGMENT_MAX_WORDS = 26;
const AUTO_REPLY_SEGMENT_PAUSE_MS = 120;
const BACKGROUND_TURN_POLL_INTERVAL_MS = 2_000;
const SOFT_TIMEOUT_NOTICE_TEXT =
  "I'm still working on that, and it may take a while. We can talk about something else, and I'll come back when it's ready.";

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
  renderCallSnapshot = () => {},
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
  let pendingThinkingPromptTimerId = 0;
  let thinkingPromptToken = 0;
  let localThinkingPromptActive = false;
  let pendingReserveTimerId = 0;
  let localReservePromptActive = false;
  let activeLocalHelloText = '';
  let activeSpeculativeAbortController = null;
  let pendingInterimSpeculativeTimerId = 0;
  let pendingInterimSpeculativeDelayMs = 0;
  let pendingReplyContinuationTimerId = 0;
  let speculativePlaybackGeneration = 0;
  let speculativeSpeechActive = false;
  let lastSpeculativeTranscript = '';
  let lastSpeculativeBoundaryIndex = -1;
  let queuedSpeculativeTranscript = '';
  let queuedSpeculativeSource = '';
  let speechIdleWaiters = [];
  let pendingDeferredTurnIds = new Set();
  let deferredTurnStartedAtById = new Map();
  let pendingDeferredTurnPollTimerId = 0;
  let deferredTurnPollInFlight = false;
  let activeDeferredTurnPlaybackId = '';
  let deferredIndicatorTimerId = 0;

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

  function buildAgentSelfScopeQuery() {
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
        availablePlugins: [],
        pluginInventoryLoading: false,
      };
    }

    return state.codex;
  }

  function getAgentSelfState() {
    if (!state.agentSelf) {
      state.agentSelf = {
        loading: false,
        saving: false,
        settings: {
          agentMode: 'standard',
          selfProfile: {
            name: '',
            pronouns: '',
            personality: '',
            interests: '',
            selfPrompt: '',
          },
        },
      };
    }

    return state.agentSelf;
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

  function shouldAcceptVoiceInput({
    allowDuringStartupGreeting = false,
    ignoreBlockingAgentSpeech = false,
  } = {}) {
    const blockingAgentSpeech =
      !ignoreBlockingAgentSpeech &&
      avatarSpeech.getSnapshot().active &&
      !speculativeSpeechActive;
    return Boolean(
      state.activeCall &&
        !state.endingCall &&
        !state.callEndingDimmed &&
        !state.humanMicMuted &&
        !state.agentThinkingActive &&
        !state.startupGreetingActive &&
        !blockingAgentSpeech,
    );
  }

  function suspendHumanListening() {
    humanVoiceLayer.updateConfig?.({ autoRestart: false });
    humanVoiceLayer.stopListening({ suppressAutoRestart: true });
    state.humanMicLevel = 0;
  }

  async function resumeHumanListeningIfAllowed({
    updateSubtitle = false,
    ignoreBlockingAgentSpeech = false,
  } = {}) {
    if (!shouldAcceptVoiceInput({ ignoreBlockingAgentSpeech })) {
      return false;
    }

    humanVoiceLayer.updateConfig?.({ autoRestart: true });
    const humanVoiceSnapshot = state.humanVoiceSnapshot || humanVoiceLayer.getSnapshot?.() || {};
    if (!humanVoiceSnapshot.listening) {
      await humanVoiceLayer.startListening({ restart: true });
    }
    state.humanMicLevel = 0;
    if (updateSubtitle && !state.transcriptPreview && !state.activeUtteranceId) {
      setSubtitle('human', 'Listening…', 'listening');
    }
    return true;
  }

  async function resumeHumanListeningDuringReplyPause() {
    if (
      !state.activeCall ||
      state.endingCall ||
      state.callEndingDimmed ||
      state.humanMicMuted ||
      state.startupGreetingActive
    ) {
      return false;
    }

    humanVoiceLayer.updateConfig?.({ autoRestart: true });
    const humanVoiceSnapshot = state.humanVoiceSnapshot || humanVoiceLayer.getSnapshot?.() || {};
    if (!humanVoiceSnapshot.listening) {
      await humanVoiceLayer.startListening({ restart: true });
    }
    state.humanMicLevel = 0;
    if (!state.transcriptPreview && state.activeUtteranceId) {
      setSubtitle('human', state.activeUtteranceText || state.transcriptPreview, 'listening');
    } else if (!state.transcriptPreview) {
      setSubtitle('human', 'Listening…', 'listening');
    }
    return true;
  }

  function clearThinkingTimer() {
    if (thinkingTimerId) {
      timers.clearInterval?.(thinkingTimerId);
      thinkingTimerId = 0;
    }
  }

  function normalizeTranscriptForComparison(text) {
    return `${text || ''}`
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function findLastStrongBoundaryIndex(text) {
    const transcript = `${text || ''}`;
    let lastIndex = -1;
    const matches = transcript.matchAll(/[.!?;:](?=\s|$)/g);
    for (const match of matches) {
      lastIndex = match.index ?? lastIndex;
    }
    return lastIndex;
  }

  function clearPendingInterimSpeculative() {
    if (!pendingInterimSpeculativeTimerId) {
      pendingInterimSpeculativeDelayMs = 0;
      return;
    }

    timers.clearTimeout?.(pendingInterimSpeculativeTimerId);
    pendingInterimSpeculativeTimerId = 0;
    pendingInterimSpeculativeDelayMs = 0;
  }

  function clearPendingReplyContinuation() {
    if (!pendingReplyContinuationTimerId) {
      return;
    }

    timers.clearTimeout?.(pendingReplyContinuationTimerId);
    pendingReplyContinuationTimerId = 0;
  }

  function clearPendingDeferredTurnPoll() {
    if (!pendingDeferredTurnPollTimerId) {
      return;
    }

    timers.clearTimeout?.(pendingDeferredTurnPollTimerId);
    pendingDeferredTurnPollTimerId = 0;
  }

  function getDeferredIndicatorState() {
    if (!state.deferredIndicator || typeof state.deferredIndicator !== 'object') {
      state.deferredIndicator = {
        active: false,
        elapsedSeconds: 0,
        pendingCount: 0,
      };
    }

    return state.deferredIndicator;
  }

  function clearDeferredIndicatorTimer() {
    if (!deferredIndicatorTimerId) {
      return;
    }

    timers.clearInterval?.(deferredIndicatorTimerId);
    deferredIndicatorTimerId = 0;
  }

  function syncDeferredIndicator() {
    const indicator = getDeferredIndicatorState();
    const turns = Array.isArray(state.session?.turns) ? state.session.turns : [];
    const turnsById = new Map(turns.map((turn) => [`${turn?.id || ''}`.trim(), turn]));
    const unresolvedEntries = [...pendingDeferredTurnIds]
      .map((turnId) => {
        const turn = turnsById.get(turnId);
        if (!turn || turn.status !== 'processing') {
          return null;
        }

        return {
          turnId,
          startedAt: deferredTurnStartedAtById.get(turnId) || Date.now(),
        };
      })
      .filter(Boolean);

    if (!unresolvedEntries.length) {
      indicator.active = false;
      indicator.elapsedSeconds = 0;
      indicator.pendingCount = 0;
      clearDeferredIndicatorTimer();
      renderCallSnapshot();
      return;
    }

    const oldestStartedAt = Math.min(...unresolvedEntries.map((entry) => entry.startedAt));
    indicator.active = true;
    indicator.pendingCount = unresolvedEntries.length;
    indicator.elapsedSeconds = Math.max(0, Math.floor((Date.now() - oldestStartedAt) / 1000));
    if (!deferredIndicatorTimerId) {
      deferredIndicatorTimerId =
        timers.setInterval?.(() => {
          syncDeferredIndicator();
        }, 1000) || 0;
    }
    renderCallSnapshot();
  }

  function resetDeferredTurnTracking() {
    clearPendingDeferredTurnPoll();
    deferredTurnPollInFlight = false;
    pendingDeferredTurnIds.clear();
    deferredTurnStartedAtById.clear();
    activeDeferredTurnPlaybackId = '';
    const indicator = getDeferredIndicatorState();
    indicator.active = false;
    indicator.elapsedSeconds = 0;
    indicator.pendingCount = 0;
    clearDeferredIndicatorTimer();
  }

  function notifySpeechIdleWaiters() {
    if (avatarSpeech.getSnapshot().active || !speechIdleWaiters.length) {
      return;
    }

    const waiters = speechIdleWaiters;
    speechIdleWaiters = [];
    waiters.forEach((resolve) => resolve());
  }

  function waitForSpeechIdle() {
    if (!avatarSpeech.getSnapshot().active) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      speechIdleWaiters.push(resolve);
    });
  }

  function pruneDeferredTurnTracking() {
    const turns = Array.isArray(state.session?.turns) ? state.session.turns : [];
    const turnsById = new Map(turns.map((turn) => [`${turn?.id || ''}`.trim(), turn]));
    for (const turnId of [...pendingDeferredTurnIds]) {
      const turn = turnsById.get(turnId);
      if (!turn) {
        pendingDeferredTurnIds.delete(turnId);
        deferredTurnStartedAtById.delete(turnId);
        continue;
      }

      if (
        turn.status === 'error' ||
        turn.status === 'interrupted' ||
        turn.agentReply?.playedAt ||
        turn.agentReply?.interruptedAt
      ) {
        pendingDeferredTurnIds.delete(turnId);
        deferredTurnStartedAtById.delete(turnId);
      }
    }

    syncDeferredIndicator();
    if (!pendingDeferredTurnIds.size) {
      clearPendingDeferredTurnPoll();
    }
  }

  function isLikelyLocalHelloEcho(text) {
    if (!state.startupGreetingActive || !activeLocalHelloText) {
      return false;
    }

    const normalizedTranscript = normalizeTranscriptForComparison(text);
    const normalizedHello = normalizeTranscriptForComparison(activeLocalHelloText);
    if (!normalizedTranscript || !normalizedHello || normalizedTranscript.length < 8) {
      return false;
    }

    return (
      normalizedHello.startsWith(normalizedTranscript) ||
      normalizedTranscript.startsWith(normalizedHello)
    );
  }

  function estimateSpeechDurationMs(text, speechRate = 1) {
    const words = `${text || ''}`.trim().split(/\s+/).filter(Boolean).length;
    if (!words) {
      return 0;
    }

    const normalizedSpeechRate =
      Number.isFinite(Number(speechRate)) && Number(speechRate) > 0
        ? Number(speechRate)
        : 1;
    const wordsPerSecond = 2.6 * normalizedSpeechRate;
    return Math.round((words / wordsPerSecond) * 1_000);
  }

  function splitTextByWordCount(text, maxWords = AUTO_REPLY_SEGMENT_MAX_WORDS) {
    const words = `${text || ''}`.trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      return [];
    }

    const segments = [];
    for (let index = 0; index < words.length; index += maxWords) {
      segments.push(words.slice(index, index + maxWords).join(' ').trim());
    }
    return segments.filter(Boolean);
  }

  function splitSpeechTokens(text) {
    const normalizedText = `${text || ''}`.trim();
    if (!normalizedText) {
      return [];
    }

    const sentenceTokens = normalizedText
      .split(/(?<=[.!?])\s+/)
      .map((token) => token.trim())
      .filter(Boolean);
    if (sentenceTokens.length > 1) {
      return sentenceTokens;
    }

    const clauseTokens = normalizedText
      .split(/(?<=[,;:])\s+/)
      .map((token) => token.trim())
      .filter(Boolean);
    if (clauseTokens.length > 1) {
      return clauseTokens;
    }

    return [normalizedText];
  }

  function splitLongReplyText(text, mood = 'warm') {
    const cleanedText = `${text || ''}`.trim();
    if (!cleanedText) {
      return [];
    }

    const renderProfile = agentVoiceLayer.resolveRenderProfile({
      characterId: resolveActiveCharacterId(),
      mood,
    });
    const totalDurationMs = estimateSpeechDurationMs(cleanedText, renderProfile.speechRate);
    const tokenCount = splitSpeechTokens(cleanedText).length;
    const needsSegmentation =
      totalDurationMs > AUTO_REPLY_SEGMENT_TOTAL_DURATION_MS ||
      tokenCount >= AUTO_REPLY_SEGMENT_SENTENCE_THRESHOLD;
    if (!needsSegmentation) {
      return [cleanedText];
    }

    const segments = [];
    const tokens = splitSpeechTokens(cleanedText);
    let current = '';

    const flushCurrent = () => {
      const next = `${current || ''}`.trim();
      if (next) {
        segments.push(next);
      }
      current = '';
    };

    const pushToken = (token) => {
      const candidate = current ? `${current} ${token}` : token;
      const candidateDurationMs = estimateSpeechDurationMs(candidate, renderProfile.speechRate);
      const candidateWordCount = candidate.split(/\s+/).filter(Boolean).length;
      if (
        !current ||
        (
          candidateDurationMs <= AUTO_REPLY_SEGMENT_TARGET_DURATION_MS &&
          candidate.length <= AUTO_REPLY_SEGMENT_MAX_CHARS &&
          candidateWordCount <= AUTO_REPLY_SEGMENT_MAX_WORDS
        )
      ) {
        current = candidate;
        return;
      }

      flushCurrent();
      current = token;
    };

    tokens.forEach((token) => {
      const tokenDurationMs = estimateSpeechDurationMs(token, renderProfile.speechRate);
      const tokenWordCount = token.split(/\s+/).filter(Boolean).length;
      if (
        tokenDurationMs <= AUTO_REPLY_SEGMENT_TARGET_DURATION_MS &&
        token.length <= AUTO_REPLY_SEGMENT_MAX_CHARS &&
        tokenWordCount <= AUTO_REPLY_SEGMENT_MAX_WORDS
      ) {
        pushToken(token);
        return;
      }

      flushCurrent();
      splitTextByWordCount(token).forEach((chunk) => pushToken(chunk));
    });

    flushCurrent();
    return segments.length ? segments : [cleanedText];
  }

  function scheduleInterimSpeculativeTurn(transcript) {
    const cleanedTranscript = `${transcript || ''}`.trim();
    if (!cleanedTranscript || !state.session?.id || !state.activeCall) {
      return;
    }

    const currentBoundaryIndex = findLastStrongBoundaryIndex(cleanedTranscript);
    const hasNewBoundary = currentBoundaryIndex > lastSpeculativeBoundaryIndex;
    const growthSinceLast = cleanedTranscript.length - lastSpeculativeTranscript.length;
    if (!hasNewBoundary && growthSinceLast < INTERIM_SPECULATIVE_MIN_GROWTH_CHARS) {
      return;
    }

    const delayMs = hasNewBoundary
      ? INTERIM_SPECULATIVE_BOUNDARY_DELAY_MS
      : INTERIM_SPECULATIVE_STALL_DELAY_MS;
    if (pendingInterimSpeculativeTimerId) {
      if (delayMs >= pendingInterimSpeculativeDelayMs) {
        return;
      }
      clearPendingInterimSpeculative();
    }

    pendingInterimSpeculativeDelayMs = delayMs;
    pendingInterimSpeculativeTimerId =
      timers.setTimeout?.(() => {
        pendingInterimSpeculativeTimerId = 0;
        pendingInterimSpeculativeDelayMs = 0;
        const latestTranscript = `${state.activeUtteranceText || state.transcriptPreview || cleanedTranscript || ''}`.trim();
        if (!latestTranscript) {
          return;
        }

        const latestBoundaryIndex = findLastStrongBoundaryIndex(latestTranscript);
        const latestHasNewBoundary = latestBoundaryIndex > lastSpeculativeBoundaryIndex;
        const latestGrowthSinceLast = latestTranscript.length - lastSpeculativeTranscript.length;
        if (!latestHasNewBoundary && latestGrowthSinceLast < INTERIM_SPECULATIVE_MIN_GROWTH_CHARS) {
          return;
        }

        void startSpeculativeTurn(latestTranscript, 'voice-interim');
      }, delayMs) || 0;
  }

  function renderThinkingTimer() {
    renderSessionSnapshot();
    renderAgentStatus();
  }

  function stopAgentThinkingTimer() {
    clearThinkingTimer();
    clearThinkingPromptLoop();
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
    clearThinkingPromptLoop();
    thinkingStartedAt = Date.now();
    state.agentThinkingActive = true;
    state.agentThinkingElapsedTenths = 0;
    suspendHumanListening();
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

    pruneDeferredTurnTracking();
    if (pendingDeferredTurnIds.size) {
      void maybePlayDeferredTurn();
      scheduleDeferredTurnPolling();
    }
  }

  function canPlayDeferredTurn() {
    return Boolean(
      state.activeCall &&
        !state.endingCall &&
        !state.callEndingDimmed &&
        !state.startupGreetingActive &&
        !state.processingReplies &&
        !state.agentThinkingActive &&
        !state.currentTurnId &&
        !state.activeUtteranceId &&
        !state.transcriptPreview &&
        !avatarSpeech.getSnapshot().active,
    );
  }

  function getReadyDeferredTurn() {
    if (!pendingDeferredTurnIds.size) {
      return null;
    }

    const turns = Array.isArray(state.session?.turns) ? state.session.turns : [];
    return (
      turns.find(
        (turn) =>
          pendingDeferredTurnIds.has(`${turn?.id || ''}`.trim()) &&
          turn.status === 'replied' &&
          turn.agentReply &&
          !turn.agentReply.playedAt &&
          !turn.agentReply.interruptedAt,
      ) || null
    );
  }

  async function maybePlayDeferredTurn() {
    if (activeDeferredTurnPlaybackId || !canPlayDeferredTurn()) {
      return false;
    }

    const turn = getReadyDeferredTurn();
    if (!turn?.id) {
      return false;
    }

    activeDeferredTurnPlaybackId = turn.id;
    pendingDeferredTurnIds.delete(turn.id);
    deferredTurnStartedAtById.delete(turn.id);
    syncDeferredIndicator();
    try {
      await playTurnReply(turn);
      return true;
    } finally {
      activeDeferredTurnPlaybackId = '';
      pruneDeferredTurnTracking();
      if (pendingDeferredTurnIds.size) {
        scheduleDeferredTurnPolling({ immediate: true });
      }
    }
  }

  async function pollDeferredTurnReplies() {
    if (
      deferredTurnPollInFlight ||
      !state.session?.id ||
      !state.activeCall ||
      !pendingDeferredTurnIds.size
    ) {
      return;
    }

    deferredTurnPollInFlight = true;
    clearPendingDeferredTurnPoll();
    try {
      const payload = await fetchJson(`/api/call/sessions/${encodeURIComponent(state.session.id)}`);
      applySessionPayload(payload);
      renderSessionSnapshot();
      renderTranscriptList();
      renderDebugSnapshot();
      renderAgentStatus();
      await maybePlayDeferredTurn();
    } catch (error) {
      addLog('error', 'Deferred reply refresh failed.', formatError(error));
    } finally {
      deferredTurnPollInFlight = false;
      pruneDeferredTurnTracking();
      if (pendingDeferredTurnIds.size) {
        scheduleDeferredTurnPolling();
      }
    }
  }

  function scheduleDeferredTurnPolling({ immediate = false } = {}) {
    if (!state.activeCall || !pendingDeferredTurnIds.size) {
      clearPendingDeferredTurnPoll();
      return;
    }

    clearPendingDeferredTurnPoll();
    if (immediate) {
      void pollDeferredTurnReplies();
      return;
    }

    pendingDeferredTurnPollTimerId =
      timers.setTimeout?.(() => {
        pendingDeferredTurnPollTimerId = 0;
        void pollDeferredTurnReplies();
      }, BACKGROUND_TURN_POLL_INTERVAL_MS) || 0;
  }

  function trackDeferredTurn(turnId) {
    const normalizedTurnId = `${turnId || ''}`.trim();
    if (!normalizedTurnId) {
      return;
    }

    pendingDeferredTurnIds.add(normalizedTurnId);
    if (!deferredTurnStartedAtById.has(normalizedTurnId)) {
      deferredTurnStartedAtById.set(normalizedTurnId, Date.now());
    }
    pruneDeferredTurnTracking();
    void maybePlayDeferredTurn();
    scheduleDeferredTurnPolling();
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

  function applyAgentSelfSettingsPayload(payload) {
    const agentSelf = getAgentSelfState();
    const settings = payload?.settings || {};
    agentSelf.settings = {
      agentMode: `${settings.agentMode || 'standard'}`.trim() === 'continuity' ? 'continuity' : 'standard',
      selfProfile: {
        name: `${settings.selfProfile?.name || ''}`.trim(),
        pronouns: `${settings.selfProfile?.pronouns || ''}`.trim(),
        personality: `${settings.selfProfile?.personality || ''}`.trim(),
        interests: `${settings.selfProfile?.interests || ''}`.trim(),
        selfPrompt: `${settings.selfProfile?.selfPrompt || ''}`.trim(),
      },
    };
    renderDebugSnapshot();
  }

  function applyWorkspaceSetupPayload(payload) {
    const setup = payload?.setup || null;
    if (!setup?.activeModelId) {
      return;
    }

    state.preferences.bundledModelId = `${setup.activeModelId}`.trim() || state.preferences.bundledModelId;
    state.preferences.enabledPluginIds = Array.from(
      new Set(
        (Array.isArray(setup.enabledPluginIds) ? setup.enabledPluginIds : [])
          .map((value) => `${value || ''}`.trim())
          .filter(Boolean),
      ),
    ).sort((left, right) => left.localeCompare(right));
    state.preferences.enableControlComputer = setup.enableControlComputer === true;
    state.preferences.enableComplexTasks = setup.enableComplexTasks === true;
  }

  function applyCodexPluginsPayload(payload) {
    const codex = getCodexState();
    codex.availablePlugins = Array.isArray(payload?.plugins)
      ? payload.plugins
          .map((plugin) => ({
            id: `${plugin?.id || ''}`.trim(),
            name: `${plugin?.name || ''}`.trim(),
            displayName: `${plugin?.displayName || plugin?.name || plugin?.id || ''}`.trim(),
            description: `${plugin?.description || ''}`.trim(),
            version: `${plugin?.version || ''}`.trim(),
            marketplace: `${plugin?.marketplace || ''}`.trim(),
            enabled: plugin?.enabled === true,
          }))
          .filter((plugin) => plugin.id)
      : [];
    return codex.availablePlugins;
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

  function clearThinkingPromptLoop({ stopSpeech = false } = {}) {
    if (pendingThinkingPromptTimerId) {
      timers.clearTimeout?.(pendingThinkingPromptTimerId);
      pendingThinkingPromptTimerId = 0;
    }
    thinkingPromptToken += 1;
    if (stopSpeech && localThinkingPromptActive) {
      localThinkingPromptActive = false;
      avatarSpeech.stop({ cancelVoice: true });
      notifySpeechIdleWaiters();
    } else if (!stopSpeech) {
      localThinkingPromptActive = false;
    }
  }

  function clearPendingReservePlayback({ stopSpeech = false } = {}) {
    if (pendingReserveTimerId) {
      timers.clearTimeout?.(pendingReserveTimerId);
      pendingReserveTimerId = 0;
    }
    if (stopSpeech && localReservePromptActive) {
      localReservePromptActive = false;
      avatarSpeech.stop({ cancelVoice: true });
      notifySpeechIdleWaiters();
    } else if (!stopSpeech) {
      localReservePromptActive = false;
    }
  }

  function canScheduleAgentSelfReserve(requestController) {
    return (
      state.activeCall &&
      !state.endingCall &&
      !state.callEndingDimmed &&
      !state.startupGreetingActive &&
      state.processingReplies &&
      state.agentThinkingActive &&
      !state.currentTurnId
    );
  }

  function canPlayAgentSelfReserve(requestController) {
    return canScheduleAgentSelfReserve(requestController) && !avatarSpeech.getSnapshot().active;
  }

  async function playAgentSelfReserve(packet, requestController) {
    if (!packet?.text || !canPlayAgentSelfReserve(requestController)) {
      return;
    }

    localReservePromptActive = true;
    let playbackStarted = false;

    await avatarSpeech
      .speakText(packet.text, {
        withVoice: agentVoiceLayer.getSnapshot().speechSynthesisSupported,
        source: 'agent-self-reserve',
        locale: collectFormState().humanLocale || 'en-US',
        characterId: resolveActiveCharacterId(),
        mood: packet.mood || 'focused',
        onPlaybackStart: () => {
          if (!canPlayAgentSelfReserve(requestController)) {
            return;
          }

          playbackStarted = true;
          setSubtitle('agent', packet.text, 'thinking');
          renderAgentStatus();
          syncAmbientMotion();
        },
      })
      .catch((error) => {
        addLog('error', 'Continuity reserve playback failed.', formatError(error));
      })
      .finally(() => {
        localReservePromptActive = false;
        notifySpeechIdleWaiters();
        renderAgentStatus();
        syncAmbientMotion();
        if (playbackStarted && canScheduleAgentSelfReserve(requestController)) {
          scheduleThinkingPromptLoop(THINKING_PROMPT_LOOP_BASE_DELAY_MS);
        }
      });
  }

  async function maybeScheduleAgentSelfReserve({ turnId = '', text = '', requestController } = {}) {
    const cleanedText = `${text || ''}`.trim();
    if (!cleanedText) {
      return null;
    }

    pendingReserveTimerId = timers.setTimeout?.(() => {
      pendingReserveTimerId = 0;
      if (!canScheduleAgentSelfReserve(requestController)) {
        return;
      }

      void postJson(`/api/agent-self/reserve${buildAgentSelfScopeQuery()}`, {
        turnId,
        text: cleanedText,
      })
        .then((payload) => {
          if (!payload?.packet?.text || !canPlayAgentSelfReserve(requestController)) {
            return;
          }
          return playAgentSelfReserve(payload.packet, requestController);
        })
        .catch(() => {});
    }, AGENT_SELF_RESERVE_DELAY_MS) || 0;

    return {
      turnId,
      delayMs: AGENT_SELF_RESERVE_DELAY_MS,
    };
  }

  function recordAgentSelfTurnComplete({ turnId = '', userText = '', agentText = '' } = {}) {
    void postJson(`/api/agent-self/turn-complete${buildAgentSelfScopeQuery()}`, {
      turnId,
      userText,
      agentText,
    }).catch(() => {});
  }

  function canPlaySpeculativeReply(expectedGeneration) {
    return (
      expectedGeneration === speculativePlaybackGeneration &&
      state.activeCall &&
      !state.endingCall &&
      !state.callEndingDimmed &&
      !state.startupGreetingActive &&
      !state.processingReplies &&
      !state.agentThinkingActive &&
      !state.currentTurnId
    );
  }

  function cancelSpeculativeTurn({
    stopSpeech = false,
    resetTranscript = false,
    clearPendingTimer = true,
  } = {}) {
    speculativePlaybackGeneration += 1;
    if (clearPendingTimer) {
      clearPendingInterimSpeculative();
    }

    queuedSpeculativeTranscript = '';
    queuedSpeculativeSource = '';

    if (activeSpeculativeAbortController) {
      activeSpeculativeAbortController.abort();
      activeSpeculativeAbortController = null;
    }

    if (stopSpeech && speculativeSpeechActive) {
      speculativeSpeechActive = false;
      avatarSpeech.stop({ cancelVoice: true });
      notifySpeechIdleWaiters();
    }

    if (resetTranscript) {
      lastSpeculativeTranscript = '';
      lastSpeculativeBoundaryIndex = -1;
    }
  }

  async function playSpeculativeReply(reply, expectedGeneration) {
    if (!reply?.text) {
      return;
    }

    while (avatarSpeech.getSnapshot().active && canPlaySpeculativeReply(expectedGeneration)) {
      await waitForSpeechIdle();
    }
    if (!canPlaySpeculativeReply(expectedGeneration)) {
      return;
    }

    const renderProfile = agentVoiceLayer.resolveRenderProfile({
      characterId: resolveActiveCharacterId(),
      mood: reply.mood,
    });
    const timeline = avatarSpeech.buildMouthTimeline(reply.text, renderProfile.speechRate);
    const startSpeechBeats = buildSpeechBeatTimers(reply, timeline.durationMs);
    speculativeSpeechActive = true;
    let playbackStarted = false;

    try {
      await avatarSpeech.speakText(reply.text, {
        withVoice: agentVoiceLayer.getSnapshot().speechSynthesisSupported,
        source: `speculative-turn:${expectedGeneration}`,
        locale: collectFormState().humanLocale || 'en-US',
        characterId: resolveActiveCharacterId(),
        mood: reply.mood,
        onPlaybackStart: () => {
          if (!canPlaySpeculativeReply(expectedGeneration)) {
            return;
          }

          playbackStarted = true;
          applySpeechScene(reply);
          startSpeechBeats();
          renderAgentStatus();
          syncAmbientMotion();
          sendPlaybackEvent({
            phase: 'started',
            kind: 'speculative',
            source: 'speculative-turn',
            text: reply.text,
          });
        },
      });
    } finally {
      clearSpeechBeats();
      if (playbackStarted) {
        sendPlaybackEvent({
          phase: 'ended',
          kind: 'speculative',
          source: 'speculative-turn',
          text: reply.text,
        });
      }
      speculativeSpeechActive = false;
      notifySpeechIdleWaiters();
      renderAgentStatus();
      syncAmbientMotion();
    }
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

  function canPlayThinkingPrompt(expectedToken) {
    return (
      expectedToken === thinkingPromptToken &&
      state.activeCall &&
      !state.endingCall &&
      !state.callEndingDimmed &&
      !state.startupGreetingActive &&
      state.processingReplies &&
      state.agentThinkingActive &&
      !state.currentTurnId &&
      !avatarSpeech.getSnapshot().active
    );
  }

  function scheduleThinkingPromptLoop(delayMs = INITIAL_THINKING_PROMPT_DELAY_MS) {
    if (!state.activeCall || !state.processingReplies || !state.agentThinkingActive) {
      return;
    }

    clearThinkingPromptLoop();
    const nextToken = thinkingPromptToken;
    pendingThinkingPromptTimerId = timers.setTimeout?.(() => {
      pendingThinkingPromptTimerId = 0;
      void playThinkingPrompt(nextToken);
    }, delayMs) || 0;
  }

  async function playThinkingPrompt(expectedToken) {
    if (!canPlayThinkingPrompt(expectedToken)) {
      return;
    }

    const promptText = pickRandomThinkingPromptPhrase(random);
    localThinkingPromptActive = true;
    let playbackStarted = false;

    await avatarSpeech
      .speakText(promptText, {
        withVoice: agentVoiceLayer.getSnapshot().speechSynthesisSupported,
        source: 'local-thinking-prompt',
        locale: collectFormState().humanLocale || 'en-US',
        characterId: resolveActiveCharacterId(),
        mood: 'warm',
        onPlaybackStart: () => {
          playbackStarted = true;
          setSubtitle('agent', promptText, 'thinking');
          renderAgentStatus();
          sendPlaybackEvent({
            phase: 'started',
            kind: 'thinking',
            source: 'local-thinking-prompt',
            text: promptText,
          });
        },
      })
      .catch((error) => {
        addLog('error', 'Local thinking prompt playback failed.', formatError(error));
      })
      .finally(() => {
        if (playbackStarted) {
          sendPlaybackEvent({
            phase: 'ended',
            kind: 'thinking',
            source: 'local-thinking-prompt',
            text: promptText,
          });
        }
        localThinkingPromptActive = false;
        notifySpeechIdleWaiters();
        if (canPlayThinkingPrompt(expectedToken)) {
          scheduleThinkingPromptLoop(
            THINKING_PROMPT_LOOP_BASE_DELAY_MS +
              Math.round(random() * THINKING_PROMPT_LOOP_JITTER_MS),
          );
        }
      });
  }

  async function playSoftTimeoutNotice() {
    while (avatarSpeech.getSnapshot().active) {
      await waitForSpeechIdle();
    }

    let playbackStarted = false;
    await avatarSpeech
      .speakText(SOFT_TIMEOUT_NOTICE_TEXT, {
        withVoice: agentVoiceLayer.getSnapshot().speechSynthesisSupported,
        source: 'local-soft-timeout',
        locale: collectFormState().humanLocale || 'en-US',
        characterId: resolveActiveCharacterId(),
        mood: 'warm',
        onPlaybackStart: () => {
          playbackStarted = true;
          setSubtitle('agent', SOFT_TIMEOUT_NOTICE_TEXT, 'thinking');
          renderAgentStatus();
          syncAmbientMotion();
          sendPlaybackEvent({
            phase: 'started',
            kind: 'thinking',
            source: 'local-soft-timeout',
            text: SOFT_TIMEOUT_NOTICE_TEXT,
          });
        },
      })
      .catch((error) => {
        addLog('error', 'Soft-timeout notice playback failed.', formatError(error));
      })
      .finally(() => {
        if (playbackStarted) {
          sendPlaybackEvent({
            phase: 'ended',
            kind: 'thinking',
            source: 'local-soft-timeout',
            text: SOFT_TIMEOUT_NOTICE_TEXT,
          });
        }
        notifySpeechIdleWaiters();
        renderAgentStatus();
        syncAmbientMotion();
      });
  }

  async function finishLocalHello(expectedToken) {
    if (
      expectedToken !== localHelloToken ||
      !state.activeCall ||
      state.endingCall ||
      state.callEndingDimmed
    ) {
      return;
    }

    setStartupGreetingActive(false);
    state.humanMicLevel = 0;
    let listeningReady = false;
    try {
      listeningReady = await resumeHumanListeningIfAllowed({
        updateSubtitle: true,
        ignoreBlockingAgentSpeech: true,
      });
    } catch (error) {
      addLog('error', 'Speech recognition failed to start after the startup hello.', formatError(error));
    }
    renderCallSnapshot();
    if (!listeningReady) {
      updateRoomStatus('warn', 'Microphone inactive', 'Browser listening did not start after the greeting.');
      setSubtitle('human', 'Mic inactive.', 'idle');
      setSubtitle('agent', 'Microphone did not start listening.', 'warn');
      return;
    }
    updateRoomStatus('ready', 'Call live', 'Listening for your voice.');
    if (!state.transcriptPreview && !state.activeUtteranceId) {
      setSubtitle('human', 'Listening…', 'listening');
      setSubtitle('agent', 'Waiting for your first line.', 'ready');
    }
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
    activeLocalHelloText = helloText;
    const helloMood =
      selectedGesture?.id === 'Cheer' || selectedGesture?.id === 'Peace'
        ? 'playful'
        : 'warm';
    let playbackStarted = false;

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
          playbackStarted = true;
          updateRoomStatus('ready', 'Call live', 'Agent is greeting you.');
          setSubtitle('agent', helloText, 'speaking');
          renderCallSnapshot();
          renderAgentStatus();
          syncAmbientMotion();
          sendPlaybackEvent({
            phase: 'started',
            kind: 'hello',
            source: 'local-hello',
            text: helloText,
          });
        },
        onPlaybackEnd: () => {
          void finishLocalHello(expectedToken);
        },
      })
      .catch((error) => {
        addLog('error', 'Local hello playback failed.', formatError(error));
        if (canPlayLocalHello(expectedToken)) {
          void finishLocalHello(expectedToken);
        }
      })
      .finally(() => {
        if (playbackStarted) {
          sendPlaybackEvent({
            phase: 'ended',
            kind: 'hello',
            source: 'local-hello',
            text: helloText,
          });
        }
        activeLocalHelloText = '';
        notifySpeechIdleWaiters();
        if (state.activeCall && !state.endingCall && !state.processingReplies && !state.currentTurnId) {
          renderAgentStatus();
          syncAmbientMotion();
        }
      });
  }

  function scheduleLocalHello() {
    clearScheduledLocalHello();
    const nextToken = localHelloToken;
    const delayMs = LOCAL_HELLO_DELAY_MS;
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

    const payload = buildCallSessionPayload(
      collectFormState(),
      state.runtimeConfig,
      getLaunchContext(),
      getAgentSelfState().settings,
    );
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
    persistState();
    renderDebugSnapshot();
    return payload;
  }

  async function loadAgentSelfSettings() {
    const agentSelf = getAgentSelfState();
    agentSelf.loading = true;
    try {
      const payload = await fetchJson('/api/agent-self/settings');
      applyAgentSelfSettingsPayload(payload);
      return payload;
    } finally {
      agentSelf.loading = false;
      renderDebugSnapshot();
    }
  }

  async function saveAgentSelfSettings(settings) {
    const agentSelf = getAgentSelfState();
    agentSelf.saving = true;
    try {
      const payload = await postJson('/api/agent-self/settings', settings);
      applyAgentSelfSettingsPayload(payload);
      return payload;
    } finally {
      agentSelf.saving = false;
      renderDebugSnapshot();
    }
  }

  async function syncWorkspaceSetup({
    activeModelId = resolveActiveCharacterId(),
    activeModelLabel = '',
    enabledPluginIds = collectFormState().enabledPluginIds,
    enableControlComputer = collectFormState().enableControlComputer,
    enableComplexTasks = collectFormState().enableComplexTasks,
  } = {}) {
    const payload = await postJson(`/api/workspace-setup${buildWorkspaceSetupScopeQuery()}`, {
      activeModelId,
      activeModelLabel,
      enabledPluginIds,
      enableControlComputer,
      enableComplexTasks,
    });
    applyWorkspaceSetupPayload(payload);
    persistState();
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

  async function loadAvailablePlugins() {
    const codex = getCodexState();
    codex.pluginInventoryLoading = true;
    renderDebugSnapshot();
    try {
      const payload = await fetchJson('/api/codex/plugins');
      return applyCodexPluginsPayload(payload);
    } finally {
      codex.pluginInventoryLoading = false;
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
    const sessionKey = buildCallSessionKey(
      form,
      state.runtimeConfig,
      getLaunchContext(),
      getAgentSelfState().settings,
    );
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
        buildCallSessionPayload(
          form,
          state.runtimeConfig,
          getLaunchContext(),
          getAgentSelfState().settings,
        ),
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

  async function postPlaybackEvent({
    phase,
    kind,
    source = '',
    text = '',
    turnId = '',
    turnCompleted,
  } = {}) {
    if (!state.session?.id || !phase || !kind) {
      return;
    }

    return postJson(
      `/api/call/sessions/${encodeURIComponent(state.session.id)}/playback-events`,
      {
        phase,
        kind,
        source,
        text,
        turnId,
        turnCompleted,
      },
    );
  }

  function sendPlaybackEvent(event) {
    void postPlaybackEvent(event).catch(() => {});
  }

  function normalizeReplyPauseMs(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return 0;
    }
    return Math.max(0, Math.min(15_000, Math.round(numeric)));
  }

  function expandReplySegment(segment) {
    const text = `${segment?.text || ''}`.trim();
    if (!text) {
      return [];
    }

    const chunks = splitLongReplyText(text, segment.mood);
    if (chunks.length <= 1) {
      return [{
        ...segment,
        text,
        subtitle: `${segment?.subtitle || text}`.trim() || text,
      }];
    }

    return chunks.map((chunk, index) => ({
      ...segment,
      text: chunk,
      subtitle: chunk,
      pauseMs: index === 0 ? normalizeReplyPauseMs(segment.pauseMs) : AUTO_REPLY_SEGMENT_PAUSE_MS,
      animationSequence: index === 0
        ? Array.isArray(segment.animationSequence)
          ? structuredClone(segment.animationSequence)
          : []
        : [],
    }));
  }

  function buildReplySegments(reply) {
    if (!reply?.text) {
      return [];
    }

    const baseSegment = {
      text: `${reply.text || ''}`.trim(),
      subtitle: `${reply.subtitle || reply.text || ''}`.trim(),
      mood: `${reply.mood || 'warm'}`.trim() || 'warm',
      pauseMs: 0,
      animationSequence: Array.isArray(reply.animationSequence)
        ? structuredClone(reply.animationSequence)
        : [],
    };

    const followUps = Array.isArray(reply.followUps)
      ? reply.followUps
          .map((segment) => {
            const text = `${segment?.text || segment?.spokenText || ''}`.trim();
            if (!text) {
              return null;
            }

            return {
              text,
              subtitle: `${segment?.subtitle || text}`.trim() || text,
              mood: `${segment?.mood || reply.mood || 'warm'}`.trim() || 'warm',
              pauseMs: normalizeReplyPauseMs(segment?.pauseMs),
              animationSequence: Array.isArray(segment?.animationSequence)
                ? structuredClone(segment.animationSequence)
                : [],
            };
          })
          .filter(Boolean)
      : [];

    return [baseSegment, ...followUps].flatMap((segment) => expandReplySegment(segment));
  }

  function waitForReplyContinuation(delayMs = 0) {
    const normalizedDelayMs = normalizeReplyPauseMs(delayMs);
    if (!normalizedDelayMs) {
      return Promise.resolve();
    }

    clearPendingReplyContinuation();
    return new Promise((resolve) => {
      pendingReplyContinuationTimerId =
        timers.setTimeout?.(() => {
          pendingReplyContinuationTimerId = 0;
          resolve();
        }, normalizedDelayMs) || 0;
    });
  }

  async function playTurnReply(turn) {
    clearPendingReservePlayback({ stopSpeech: true });
    clearThinkingPromptLoop({ stopSpeech: false });
    const reply = turn?.agentReply;
    if (!reply) {
      return;
    }

    const segments = buildReplySegments(reply);
    if (!segments.length) {
      return;
    }

    state.currentTurnId = turn.id;
    const playbackGeneration = state.playbackGeneration;
    try {
      for (const [index, segment] of segments.entries()) {
        if (playbackGeneration !== state.playbackGeneration || state.currentTurnId !== turn.id) {
          return;
        }

        if (index > 0) {
          await waitForReplyContinuation(segment.pauseMs);
          if (playbackGeneration !== state.playbackGeneration || state.currentTurnId !== turn.id) {
            return;
          }
        }

        if (index === 0) {
          while (avatarSpeech.getSnapshot().active) {
            await waitForSpeechIdle();
            if (playbackGeneration !== state.playbackGeneration || state.currentTurnId !== turn.id) {
              return;
            }
          }
        }

        suspendHumanListening();
        const renderProfile = agentVoiceLayer.resolveRenderProfile({
          characterId: resolveActiveCharacterId(),
          mood: segment.mood,
        });
        const timeline = avatarSpeech.buildMouthTimeline(segment.text, renderProfile.speechRate);
        const startSpeechBeats = buildSpeechBeatTimers(
          {
            ...reply,
            ...segment,
          },
          timeline.durationMs,
        );
        let playbackStarted = false;

        try {
          await avatarSpeech.speakText(segment.text, {
            withVoice: agentVoiceLayer.getSnapshot().speechSynthesisSupported,
            source: `codex-turn:${turn.id}:segment-${index}`,
            locale: collectFormState().humanLocale || 'en-US',
            characterId: resolveActiveCharacterId(),
            mood: segment.mood,
            onPlaybackStart: () => {
              playbackStarted = true;
              stopAgentThinkingTimer();
              applySpeechScene({
                ...reply,
                ...segment,
              });
              startSpeechBeats();
              setSubtitle('agent', segment.subtitle || segment.text, 'speaking');
              renderAgentStatus();
              syncAmbientMotion();
              sendPlaybackEvent({
                phase: 'started',
                kind: 'reply',
                source: 'codex-turn',
                turnId: turn.id,
                text: segment.text,
              });
            },
          });
        } finally {
          clearSpeechBeats();
          notifySpeechIdleWaiters();
        }

        if (playbackStarted) {
          const payload = await postPlaybackEvent({
            phase: 'ended',
            kind: 'reply',
            source: 'codex-turn',
            turnId: turn.id,
            text: segment.text,
            turnCompleted: index === segments.length - 1,
          }).catch((error) => {
            addLog('error', 'Reply playback event failed.', formatError(error));
            return null;
          });
          if (payload?.session) {
            applySessionPayload(payload);
          }
        }
      }
    } finally {
      clearPendingReplyContinuation();
      stopAgentThinkingTimer();
      state.currentTurnId = null;
      await resumeHumanListeningIfAllowed({ updateSubtitle: true }).catch((error) => {
        addLog('error', 'Speech recognition failed to resume after agent reply.', formatError(error));
      });
      renderSessionSnapshot();
      renderTranscriptList();
      renderDebugSnapshot();
      renderAgentStatus();
      syncAmbientMotion();
    }
  }

  async function interruptActiveReply(
    reason = 'human started speaking',
    { preserveThinkingTimer = false } = {},
  ) {
    if (!state.session?.id) {
      return false;
    }

    const blockingAgentSpeech =
      avatarSpeech.getSnapshot().active && !speculativeSpeechActive;
    const hadActiveWork = Boolean(
      state.processingReplies ||
        blockingAgentSpeech ||
        state.currentTurnId ||
        state.activeReplyAbortController,
    );
    if (!hadActiveWork) {
      return false;
    }

    state.playbackGeneration += 1;
    clearPendingReplyContinuation();
    clearPendingReservePlayback({ stopSpeech: true });
    state.currentTurnId = null;
    state.processingReplies = false;
    clearThinkingPromptLoop({ stopSpeech: true });
    if (!preserveThinkingTimer) {
      stopAgentThinkingTimer();
    }
    clearSpeechBeats();
    avatarSpeech.stop({ cancelVoice: true });
    notifySpeechIdleWaiters();

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
    clearPendingReplyContinuation();
    clearPendingReservePlayback({ stopSpeech: true });
    clearSpeechBeats();
    clearScheduledLocalHello({ releaseLock: true });
    clearThinkingPromptLoop({ stopSpeech: true });
    cancelSpeculativeTurn({ stopSpeech: true, resetTranscript: true });
    resetDeferredTurnTracking();
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
    notifySpeechIdleWaiters();

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
    let playbackStarted = false;
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
          playbackStarted = true;
          setSubtitle('agent', goodbyeText, 'speaking');
          renderAgentStatus();
          sendPlaybackEvent({
            phase: 'started',
            kind: 'goodbye',
            source: 'local-goodbye',
            text: goodbyeText,
          });
        },
        onPlaybackEnd: () => {
          startEndDelay();
        },
      })
      .catch((error) => {
        addLog('error', 'Local goodbye playback failed.', formatError(error));
      })
      .finally(() => {
        if (playbackStarted) {
          sendPlaybackEvent({
            phase: 'ended',
            kind: 'goodbye',
            source: 'local-goodbye',
            text: goodbyeText,
          });
        }
        notifySpeechIdleWaiters();
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
    humanVoiceLayer.updateConfig?.({ autoRestart: true });
    state.playbackGeneration += 1;
    interruptionIssuedForUtterance = false;
    resetDeferredTurnTracking();

    updateRoomStatus('loading', 'Connecting call', 'Waiting for the agent greeting to start.');
    setSubtitle('human', 'Stand by…', 'idle');
    setSubtitle('agent', 'Connecting…', 'ready');
    renderCallSnapshot();
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
      resetDeferredTurnTracking();

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

  async function syncInterimTranscript(text, { phase = 'interim' } = {}) {
    if (!state.session?.id || !state.activeCall) {
      return;
    }

    const nextText = `${text || ''}`.trim();
    if (isLikelyLocalHelloEcho(nextText)) {
      return;
    }
    if (nextText) {
      clearScheduledLocalHello({ releaseLock: true });
      if (avatarSpeech.getSnapshot().active && activeLocalHelloText) {
        avatarSpeech.stop({ cancelVoice: true });
      }
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
    if (phase === 'sentence') {
      await startSpeculativeTurn(nextText, 'voice-sentence');
    } else if (phase === 'interim') {
      scheduleInterimSpeculativeTurn(nextText);
    }
    renderDebugSnapshot();
  }

  async function startSpeculativeTurn(transcript, source = 'voice-sentence') {
    if (!state.session?.id || !state.activeCall) {
      return { interrupted: true };
    }

    const cleanedTranscript = `${transcript || ''}`.trim();
    if (!cleanedTranscript) {
      return { interrupted: true };
    }
    if (
      state.endingCall ||
      state.callEndingDimmed ||
      state.startupGreetingActive ||
      state.processingReplies ||
      state.agentThinkingActive ||
      state.currentTurnId
    ) {
      return { interrupted: true };
    }
    if (
      cleanedTranscript === lastSpeculativeTranscript ||
      cleanedTranscript === queuedSpeculativeTranscript
    ) {
      return { skipped: true };
    }

    if (activeSpeculativeAbortController) {
      queuedSpeculativeTranscript = cleanedTranscript;
      queuedSpeculativeSource = source;
      return { queued: true };
    }

    lastSpeculativeTranscript = cleanedTranscript;
    lastSpeculativeBoundaryIndex = findLastStrongBoundaryIndex(cleanedTranscript);
    const requestController = new AbortController();
    activeSpeculativeAbortController = requestController;
    const generation = speculativePlaybackGeneration;
    addLog('info', 'Sent speculative human turn to Codex.', {
      source,
      transcript: cleanedTranscript,
    });

    const maybeStartQueuedSpeculativeTurn = () => {
      if (
        activeSpeculativeAbortController ||
        !queuedSpeculativeTranscript ||
        !state.activeCall ||
        state.endingCall ||
        state.callEndingDimmed ||
        state.startupGreetingActive ||
        state.processingReplies ||
        state.agentThinkingActive ||
        state.currentTurnId
      ) {
        return;
      }

      const nextTranscript = queuedSpeculativeTranscript;
      const nextSource = queuedSpeculativeSource || source;
      queuedSpeculativeTranscript = '';
      queuedSpeculativeSource = '';
      void startSpeculativeTurn(nextTranscript, nextSource);
    };

    try {
      const payload = await postJson(
        `/api/call/sessions/${encodeURIComponent(state.session.id)}/speculative-turns`,
        {
          text: cleanedTranscript,
          source,
        },
        { signal: requestController.signal },
      );

      if (
        activeSpeculativeAbortController !== requestController ||
        generation !== speculativePlaybackGeneration
      ) {
        return {
          ...payload,
          interrupted: true,
        };
      }

      activeSpeculativeAbortController = null;
      maybeStartQueuedSpeculativeTurn();
      if (payload.interrupted || !payload.speculativeReply) {
        return payload;
      }

      await playSpeculativeReply(payload.speculativeReply, generation);
      maybeStartQueuedSpeculativeTurn();
      return payload;
    } catch (error) {
      if (activeSpeculativeAbortController === requestController) {
        activeSpeculativeAbortController = null;
      }

      if (error?.name === 'AbortError') {
        return { interrupted: true };
      }

      addLog('error', 'Speculative Codex turn failed.', formatError(error));
      throw error;
    } finally {
      maybeStartQueuedSpeculativeTurn();
    }
  }

  async function finalizeUserUtterance(transcript, source) {
    const cleanedTranscript = `${transcript || ''}`.trim();
    if (isLikelyLocalHelloEcho(cleanedTranscript)) {
      return;
    }
    await ensureSessionReady();
    if (!cleanedTranscript) {
      return;
    }

    clearScheduledLocalHello({ releaseLock: true });
    cancelSpeculativeTurn({ stopSpeech: false, resetTranscript: true });

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
    scheduleThinkingPromptLoop(INITIAL_THINKING_PROMPT_DELAY_MS);
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
    const reservePromise = maybeScheduleAgentSelfReserve({
      turnId: utteranceId,
      text: cleanedTranscript,
      requestController,
    }).catch(() => null);

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

      clearPendingReservePlayback({ stopSpeech: true });
      state.activeReplyAbortController = null;
      state.processingReplies = false;
      applySessionPayload(payload);
      renderSessionSnapshot();
      renderTranscriptList();
      renderDebugSnapshot();
      renderAgentStatus();

      if (payload.softTimedOut && payload.deferredTurnId) {
        stopAgentThinkingTimer();
        trackDeferredTurn(payload.deferredTurnId);
        await playSoftTimeoutNotice();
        setSubtitle('agent', 'Still working in the background.', 'thinking');
        await resumeHumanListeningIfAllowed({ updateSubtitle: true }).catch((error) => {
          addLog(
            'error',
            'Speech recognition failed to resume after deferred turn handoff.',
            formatError(error),
          );
        });
        syncAmbientMotion();
        return;
      }

      if (payload.interrupted || !payload.turn?.agentReply) {
        stopAgentThinkingTimer();
        setSubtitle('agent', 'Interrupted. Listening…', 'interrupted');
        await resumeHumanListeningIfAllowed({ updateSubtitle: true }).catch((error) => {
          addLog('error', 'Speech recognition failed to resume after interruption.', formatError(error));
        });
        syncAmbientMotion();
        return;
      }

      recordAgentSelfTurnComplete({
        turnId: payload.turn.id,
        userText: cleanedTranscript,
        agentText: payload.turn.agentReply.text,
      });
      await playTurnReply(payload.turn);
    } catch (error) {
      state.processingReplies = false;
      clearPendingReservePlayback({ stopSpeech: true });
      stopAgentThinkingTimer();
      if (state.activeReplyAbortController === requestController) {
        state.activeReplyAbortController = null;
      }

      if (error?.name === 'AbortError') {
        return;
      }

      setSubtitle('agent', 'Codex could not reply.', 'error');
      await resumeHumanListeningIfAllowed({ updateSubtitle: true }).catch((resumeError) => {
        addLog(
          'error',
          'Speech recognition failed to resume after Codex error.',
          formatError(resumeError),
        );
      });
      renderSessionSnapshot();
      renderTranscriptList();
      renderDebugSnapshot();
      renderAgentStatus();
      addLog('error', 'Direct Codex turn failed.', formatError(error));
      throw error;
    } finally {
      await reservePromise;
      state.activeUtteranceId = null;
      state.activeUtteranceText = '';
      lastSpeculativeTranscript = '';
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
    clearThinkingPromptLoop({ stopSpeech: true });
    clearPendingReservePlayback({ stopSpeech: true });
    clearAmbientLoop();
    clearSpeechBeats();
    cancelSpeculativeTurn({ stopSpeech: true, resetTranscript: true });
    humanVoiceLayer.stopListening();
    avatarSpeech.stop({ cancelVoice: true });
    notifySpeechIdleWaiters();
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
    loadAvailablePlugins,
    loadWorkspaceSetup,
    loadAgentSelfSettings,
    saveAgentSelfSettings,
    resolveLinkedLaunch,
    refreshSession,
    enqueueHumanTurn,
    startSpeculativeTurn,
    uploadVoiceSample,
    setVoiceSampleValidationMessage,
    interruptActiveReply,
    toggleMicrophoneMuted,
    shouldAcceptVoiceInput,
    endCall,
    maybeStartLaunchCall,
    destroy,
  };
}
