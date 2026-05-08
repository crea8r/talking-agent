import test from 'node:test';
import assert from 'node:assert/strict';

import { createSessionController } from './session-controller.js';

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, resolve, reject };
}

function createManualTimers() {
  let nextId = 1;
  const timeouts = new Map();

  return {
    setTimeout(callback, delay = 0) {
      const id = nextId++;
      timeouts.set(id, {
        callback,
        delay: Math.max(0, Number(delay) || 0),
      });
      return id;
    },
    clearTimeout(id) {
      timeouts.delete(id);
    },
    setInterval() {
      return 0;
    },
    clearInterval() {},
    flushAllTimeouts() {
      const pending = [...timeouts.entries()].sort((left, right) => left[1].delay - right[1].delay);
      timeouts.clear();
      pending.forEach(([, task]) => task.callback());
    },
    flushNextTimeout() {
      const nextEntry = [...timeouts.entries()].sort((left, right) => left[1].delay - right[1].delay)[0];
      if (!nextEntry) {
        return null;
      }

      timeouts.delete(nextEntry[0]);
      nextEntry[1].callback();
      return nextEntry[1].delay;
    },
    get pendingTimeoutDelays() {
      return [...timeouts.values()].map((task) => task.delay).sort((left, right) => left - right);
    },
    get pendingTimeoutCount() {
      return timeouts.size;
    },
  };
}

function createSessionPayload(session) {
  return {
    session: {
      id: session.id,
      title: session.title,
      state: session.state || 'live',
      human: session.human || {
        identity: 'human-caller',
        name: 'Human Caller',
      },
      agent: {
        id: 'codex-openai',
        label: 'Codex OpenAI',
        status: 'idle',
        currentTurnId: null,
        lastReplyAt: null,
        lastError: '',
      },
      avatar: session.avatar || {
        activeModelId: 'bhf-1-2',
        activeModelLabel: 'Red Tinker Bell',
        gestureCatalog: [],
      },
      turns: session.turns || [],
      metrics: {
        pendingTurns: 0,
        turnCount: Array.isArray(session.turns) ? session.turns.length : 0,
        unplayedReplies: 0,
      },
    },
  };
}

function createHarness({
  availableGestures,
  random = () => 0,
} = {}) {
  const speechDeferred = createDeferred();
  const manualTimers = createManualTimers();
  const postCalls = [];
  const selectedGestures = [];
  const selectedEmotes = [];
  const stoppedListening = [];
  const stoppedSpeech = [];
  const roomStatuses = [];
  const logs = [];
  let speechActive = false;
  const state = {
    runtimeConfig: {},
    session: createSessionPayload({
      id: 'session-1',
      title: 'talking-agent',
      turns: [],
      avatar: {
        activeModelId: 'bhf-1-2',
        activeModelLabel: 'Red Tinker Bell',
        gestureCatalog: availableGestures || [],
      },
    }).session,
    sessionKey: 'session-1',
    sessionPreparing: false,
    activeCall: true,
    endingCall: false,
    currentTurnId: null,
    playbackGeneration: 0,
    activeReplyAbortController: null,
    activeUtteranceId: 'utt-1',
    activeUtteranceText: 'hello',
    transcriptPreview: '',
    processingReplies: false,
    agentThinkingActive: false,
    agentThinkingElapsedTenths: 0,
    modelLoading: false,
    subtitles: {
      human: {
        mode: 'final',
        text: 'Hello',
      },
      agent: {
        mode: 'ready',
        text: 'Waiting',
      },
    },
    preferences: {
      bundledModelId: 'bhf-1-2',
      humanLocale: 'en-US',
      gestureId: 'Pose',
      emoteId: 'neutral',
    },
    productionVoice: {
      loading: false,
      uploading: false,
      backendRunning: true,
      profile: {
        referenceAvailable: true,
      },
      validationMessage: '',
    },
    codex: {
      loading: false,
      backendRunning: true,
    },
  };

  globalThis.window = {
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    requestAnimationFrame(callback) {
      callback();
    },
  };

  const controller = createSessionController({
    state,
    humanVoiceLayer: {
      stopListening() {
        stoppedListening.push(true);
      },
      startListening: async () => {},
      getSnapshot() {
        return {
          recognitionSupported: true,
          status: 'ready',
          listening: false,
        };
      },
      destroy() {},
    },
    agentVoiceLayer: {
      getSnapshot() {
        return {
          speechSynthesisSupported: true,
        };
      },
      resolveRenderProfile() {
        return {
          speechRate: 1,
        };
      },
      updateConfig() {},
      destroy() {},
    },
    avatarSpeech: {
      getSnapshot() {
        return {
          active: speechActive,
        };
      },
      buildMouthTimeline() {
        return {
          durationMs: 1400,
        };
      },
      async speakText(text, options = {}) {
        speechActive = true;
        options.onPlaybackStart?.();
        try {
          await speechDeferred.promise;
          speechActive = false;
          options.onPlaybackEnd?.();
        } finally {
          speechActive = false;
        }
      },
      stop(options = {}) {
        speechActive = false;
        stoppedSpeech.push(options);
      },
    },
    avatarLayer: {
      getSnapshot() {
        return {
          ready: true,
          gestureId: 'Pose',
          availableGestures: availableGestures || [],
        };
      },
      destroy() {},
    },
    dom: {},
    stageMap: new Map(),
    emoteMap: new Map([
      ['neutral', { id: 'neutral', label: 'Neutral' }],
      ['warm', { id: 'warm', label: 'Warm' }],
      ['playful', { id: 'playful', label: 'Playful' }],
    ]),
    selectStage() {},
    selectEmote(emoteId) {
      selectedEmotes.push(emoteId);
    },
    selectGesture(gestureId) {
      selectedGestures.push(gestureId);
    },
    collectFormState() {
      return {
        humanLocale: 'en-US',
      };
    },
    fetchJson: async () => ({}),
    postJson: async (url, body) => {
      postCalls.push({ url, body });
      if (url.endsWith('/end')) {
        return createSessionPayload({
          ...state.session,
          state: 'ended',
        });
      }

      if (url.endsWith('/interrupt')) {
        return createSessionPayload({
          ...state.session,
        });
      }

      return createSessionPayload(state.session);
    },
    postFormData: async () => ({}),
    addLog(level, message, details) {
      logs.push({ level, message, details });
    },
    formatError(error) {
      return error instanceof Error ? error.message : `${error || ''}`;
    },
    renderSessionSnapshot() {},
    renderTranscriptList() {},
    renderSubtitles() {},
    renderDebugSnapshot() {},
    renderAgentStatus() {},
    renderVoiceSampleState() {},
    refreshActionButtons() {},
    syncVoiceSampleProfile() {},
    persistState() {},
    updateRoomStatus(stateValue, title, detail) {
      roomStatuses.push({ stateValue, title, detail });
    },
    timers: manualTimers,
    random,
  });

  return {
    controller,
    state,
    speechDeferred,
    manualTimers,
    postCalls,
    selectedGestures,
    selectedEmotes,
    stoppedListening,
    stoppedSpeech,
    roomStatuses,
    logs,
  };
}

test('endCall starts the dim state when goodbye speech stops and waits 3 seconds before finalize', async () => {
  const harness = createHarness({
    availableGestures: [
      { id: 'Goodbye', durationMs: 1200 },
      { id: 'Cheer', durationMs: 3200 },
      { id: 'Pose', durationMs: 0 },
    ],
    random: () => 0.9,
  });

  const endPromise = harness.controller.endCall();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(harness.state.activeCall, true);
  assert.equal(harness.state.endingCall, true);
  assert.equal(harness.state.callEndingDimmed, false);
  assert.equal(harness.postCalls.some((call) => call.url.endsWith('/end')), false);
  assert.deepEqual(harness.selectedEmotes, ['playful']);
  assert.deepEqual(harness.selectedGestures, ['Cheer']);

  harness.speechDeferred.resolve();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(harness.postCalls.some((call) => call.url.endsWith('/end')), false);
  assert.equal(harness.state.callEndingDimmed, true);
  assert.deepEqual(harness.manualTimers.pendingTimeoutDelays, [3000]);

  harness.manualTimers.flushNextTimeout();
  await endPromise;

  assert.equal(harness.state.activeCall, false);
  assert.equal(harness.state.endingCall, false);
  assert.equal(harness.state.callEndingDimmed, false);
  assert.equal(harness.postCalls.some((call) => call.url.endsWith('/end')), true);
  assert.equal(
    harness.postCalls.find((call) => call.url.endsWith('/end'))?.body?.skipAgentFinalize,
    true,
  );
  assert.equal(harness.stoppedListening.length, 1);
  assert.match(harness.state.subtitles.agent.text, /Agent is offline/);
});

test('endCall does not finalize before the goodbye speech stops', async () => {
  const harness = createHarness({
    availableGestures: [
      { id: 'Goodbye', durationMs: 1200 },
      { id: 'Pose', durationMs: 0 },
    ],
    random: () => 0,
  });

  const endPromise = harness.controller.endCall();
  await Promise.resolve();
  await Promise.resolve();

  harness.manualTimers.flushAllTimeouts();
  await Promise.resolve();
  assert.equal(harness.postCalls.some((call) => call.url.endsWith('/end')), false);
  assert.equal(harness.state.callEndingDimmed, false);

  harness.speechDeferred.resolve();
  await Promise.resolve();
  assert.equal(harness.postCalls.some((call) => call.url.endsWith('/end')), false);

  harness.manualTimers.flushNextTimeout();
  await endPromise;

  assert.equal(harness.state.activeCall, false);
  assert.equal(harness.postCalls.some((call) => call.url.endsWith('/end')), true);
  assert.deepEqual(harness.selectedGestures, ['Goodbye']);
  assert.match(harness.roomStatuses.at(-1)?.title || '', /Call ended/);
});
