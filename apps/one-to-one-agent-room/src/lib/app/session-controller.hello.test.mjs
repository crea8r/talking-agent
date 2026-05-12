import test from 'node:test';
import assert from 'node:assert/strict';

import { createSessionController } from './session-controller.js';
import { getHelloPhrases } from './hello-sequence.js';

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
  };
}

function createHarness({
  random = () => 0,
  playbackEndBeforeSpeechStops = false,
} = {}) {
  const speechDeferred = createDeferred();
  const manualTimers = createManualTimers();
  const postCalls = [];
  const spokenTexts = [];
  const selectedGestures = [];
  const selectedEmotes = [];
  const roomStatuses = [];
  let speechActive = false;
  let listening = false;
  let activeSpeechOptions = null;
  let stopCount = 0;
  const state = {
    runtimeConfig: null,
    session: {
      id: 'session-1',
      title: 'talking-agent',
      state: 'idle',
      turns: [],
      metrics: {
        pendingTurns: 0,
        turnCount: 0,
        unplayedReplies: 0,
      },
      agent: {
        id: 'codex-openai',
        label: 'Codex OpenAI',
        status: 'idle',
        currentTurnId: null,
        lastReplyAt: null,
        lastError: '',
      },
      avatar: {
        activeModelId: 'bhf-1-2',
        activeModelLabel: 'Red Tinker Bell',
        gestureCatalog: [
          { id: 'Greeting' },
          { id: 'Peace' },
          { id: 'Pose' },
        ],
      },
    },
    sessionKey: 'session-1',
    sessionPreparing: false,
    activeCall: false,
    endingCall: false,
    callEndingDimmed: false,
    startupGreetingActive: false,
    humanMicMuted: false,
    humanMicLevel: 0,
    currentTurnId: null,
    playbackGeneration: 0,
    activeReplyAbortController: null,
    activeUtteranceId: null,
    activeUtteranceText: '',
    transcriptPreview: '',
    processingReplies: false,
    agentThinkingActive: false,
    agentThinkingElapsedTenths: 0,
    modelLoading: false,
    subtitles: {
      human: {
        mode: 'idle',
        text: 'Waiting',
      },
      agent: {
        mode: 'idle',
        text: 'Offline',
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
    setTimeout: manualTimers.setTimeout,
    clearTimeout: manualTimers.clearTimeout,
    setInterval: manualTimers.setInterval,
    clearInterval: manualTimers.clearInterval,
    requestAnimationFrame(callback) {
      callback();
    },
  };

  const controller = createSessionController({
    state,
    humanVoiceLayer: {
      stopListening() {
        listening = false;
      },
      async startListening() {
        listening = true;
      },
      getSnapshot() {
        return {
          recognitionSupported: true,
          status: 'ready',
          listening,
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
        spokenTexts.push(text);
        speechActive = true;
        activeSpeechOptions = options;
        options.onPlaybackStart?.();
        try {
          await speechDeferred.promise;
          if (playbackEndBeforeSpeechStops) {
            options.onPlaybackEnd?.();
            speechActive = false;
            activeSpeechOptions = null;
          } else {
            speechActive = false;
            activeSpeechOptions = null;
            options.onPlaybackEnd?.();
          }
        } finally {
          speechActive = false;
          activeSpeechOptions = null;
        }
      },
      stop() {
        stopCount += 1;
        if (!speechActive) {
          return;
        }
        speechActive = false;
        const currentOptions = activeSpeechOptions;
        activeSpeechOptions = null;
        currentOptions?.onPlaybackEnd?.();
        speechDeferred.resolve();
      },
    },
    avatarLayer: {
      getSnapshot() {
        return {
          ready: true,
          gestureId: 'Pose',
          availableGestures: state.session.avatar.gestureCatalog,
        };
      },
      destroy() {},
    },
    dom: {},
    stageMap: new Map(),
    emoteMap: new Map([
      ['neutral', { id: 'neutral' }],
      ['warm', { id: 'warm' }],
      ['playful', { id: 'playful' }],
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
      return {
        session: {
          ...state.session,
          state: url.endsWith('/state') ? body?.state || state.session.state : state.session.state,
        },
      };
    },
    postFormData: async () => ({}),
    addLog() {},
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
    manualTimers,
    speechDeferred,
    postCalls,
    spokenTexts,
    selectedGestures,
    selectedEmotes,
    roomStatuses,
    getListening() {
      return listening;
    },
    stopCount() {
      return stopCount;
    },
  };
}

test('getHelloPhrases returns 100 prepared greetings', () => {
  assert.equal(getHelloPhrases().length, 100);
});

test('starting a call schedules and plays a local hello without a Codex turn', async () => {
  const harness = createHarness({ random: () => 0 });

  await harness.controller.handlePrimaryCallAction();

  assert.equal(harness.state.activeCall, true);
  assert.equal(harness.state.startupGreetingActive, true);
  assert.equal(harness.getListening(), false);
  assert.equal(harness.manualTimers.pendingTimeoutDelays.includes(0), true);
  assert.equal(harness.controller.shouldAcceptVoiceInput(), false);
  assert.equal(harness.controller.shouldAcceptVoiceInput({ allowDuringStartupGreeting: true }), false);
  assert.deepEqual(harness.spokenTexts, []);
  assert.deepEqual(harness.roomStatuses.at(-1), {
    stateValue: 'loading',
    title: 'Connecting call',
    detail: 'Waiting for the agent greeting to start.',
  });

  harness.manualTimers.flushNextTimeout();
  await Promise.resolve();

  assert.deepEqual(harness.spokenTexts, [getHelloPhrases()[0]]);
  assert.equal(harness.postCalls.some((call) => call.url.endsWith('/turns')), false);
  assert.match(harness.state.subtitles.agent.text, /great to see you|glad you are here|welcome/i);
  assert.equal(harness.selectedEmotes.length > 0, true);
  assert.equal(harness.selectedGestures.length > 0, true);
  assert.equal(harness.state.startupGreetingActive, true);
  assert.equal(harness.getListening(), false);
  assert.deepEqual(harness.roomStatuses.at(-1), {
    stateValue: 'ready',
    title: 'Call live',
    detail: 'Agent is greeting you.',
  });

  harness.speechDeferred.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(harness.state.startupGreetingActive, false);
  assert.equal(harness.getListening(), true);
  assert.deepEqual(harness.roomStatuses.at(-1), {
    stateValue: 'ready',
    title: 'Call live',
    detail: 'Listening for your voice.',
  });
});

test('startup hello keeps the microphone closed until playback completes', async () => {
  const harness = createHarness({ random: () => 0.4 });

  await harness.controller.handlePrimaryCallAction();
  assert.equal(harness.getListening(), false);

  harness.manualTimers.flushNextTimeout();
  await Promise.resolve();

  assert.equal(harness.spokenTexts.length, 1);
  assert.equal(harness.state.startupGreetingActive, true);
  assert.equal(harness.getListening(), false);
  assert.equal(harness.stopCount(), 0);
});

test('startup hello still resumes listening when playback end fires before avatar speech clears active', async () => {
  const harness = createHarness({
    random: () => 0.2,
    playbackEndBeforeSpeechStops: true,
  });

  await harness.controller.handlePrimaryCallAction();
  harness.manualTimers.flushNextTimeout();
  await Promise.resolve();

  assert.equal(harness.state.startupGreetingActive, true);
  assert.equal(harness.getListening(), false);

  harness.speechDeferred.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(harness.state.startupGreetingActive, false);
  assert.equal(harness.getListening(), true);
  assert.equal(harness.state.subtitles.human.text, 'Listening…');
});
