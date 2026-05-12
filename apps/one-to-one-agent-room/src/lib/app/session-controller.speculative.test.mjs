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
  let now = 0;
  const timeouts = new Map();

  function runDueTimeouts() {
    while (true) {
      const nextEntry = [...timeouts.entries()].sort((left, right) => left[1].dueAt - right[1].dueAt)[0];
      if (!nextEntry || nextEntry[1].dueAt > now) {
        return;
      }

      timeouts.delete(nextEntry[0]);
      nextEntry[1].callback();
    }
  }

  return {
    setTimeout(callback, delay = 0) {
      const id = nextId++;
      timeouts.set(id, {
        callback,
        delay: Math.max(0, Number(delay) || 0),
        dueAt: now + Math.max(0, Number(delay) || 0),
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
      const nextEntry = [...timeouts.entries()].sort((left, right) => left[1].dueAt - right[1].dueAt)[0];
      if (!nextEntry) {
        return null;
      }

      timeouts.delete(nextEntry[0]);
      now = nextEntry[1].dueAt;
      nextEntry[1].callback();
      return nextEntry[1].delay;
    },
    advanceBy(ms) {
      now += Math.max(0, Number(ms) || 0);
      runDueTimeouts();
    },
    get pendingTimeoutDelays() {
      return [...timeouts.values()].map((task) => task.delay).sort((left, right) => left - right);
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

function createHarness() {
  const speculativeRequests = [];
  const postCalls = [];
  const turnResponse = createDeferred();
  const speakCalls = [];
  const manualTimers = createManualTimers();
  let activeSpeech = null;
  let humanListening = true;
  let stopCount = 0;

  const state = {
    runtimeConfig: {},
    session: createSessionPayload({
      id: 'session-1',
      title: 'talking-agent',
      turns: [],
      avatar: {
        activeModelId: 'bhf-1-2',
        activeModelLabel: 'Red Tinker Bell',
        gestureCatalog: [],
      },
    }).session,
    sessionKey: 'session-1',
    sessionPreparing: false,
    activeCall: true,
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
        text: 'Listening…',
      },
      agent: {
        mode: 'idle',
        text: 'Waiting.',
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
        humanListening = false;
      },
      async startListening() {
        humanListening = true;
      },
      updateConfig() {},
      getSnapshot() {
        return {
          recognitionSupported: true,
          status: 'ready',
          listening: humanListening,
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
          active: Boolean(activeSpeech),
        };
      },
      buildMouthTimeline() {
        return {
          durationMs: 1200,
        };
      },
      async speakText(text, options = {}) {
        const deferred = createDeferred();
        const call = {
          text,
          source: options.source,
          deferred,
        };
        speakCalls.push(call);
        activeSpeech = {
          call,
          options,
        };
        options.onPlaybackStart?.();
        try {
          await deferred.promise;
          options.onPlaybackEnd?.();
        } finally {
          if (activeSpeech?.call === call) {
            activeSpeech = null;
          }
        }
      },
      stop() {
        stopCount += 1;
        if (!activeSpeech) {
          return;
        }

        const current = activeSpeech;
        activeSpeech = null;
        current.options.onPlaybackEnd?.();
        current.call.deferred.resolve();
      },
    },
    avatarLayer: {
      getSnapshot() {
        return {
          ready: true,
          gestureId: 'Pose',
          availableGestures: [],
        };
      },
      destroy() {},
    },
    dom: {
      lastAgentReply: {
        textContent: '',
      },
    },
    stageMap: new Map(),
    emoteMap: new Map([
      ['neutral', { id: 'neutral' }],
      ['warm', { id: 'warm' }],
      ['playful', { id: 'playful' }],
      ['focused', { id: 'focused' }],
    ]),
    selectStage() {},
    selectEmote() {},
    selectGesture() {},
    collectFormState() {
      return {
        humanLocale: 'en-US',
        humanIdentity: 'human-caller',
        participantName: 'Human Caller',
      };
    },
    fetchJson: async () => ({}),
    postJson: async (url, body, options = {}) => {
      postCalls.push({ url, body });

      if (url.endsWith('/speculative-turns')) {
        const request = {
          url,
          body,
          aborted: false,
          deferred: createDeferred(),
        };
        options.signal?.addEventListener(
          'abort',
          () => {
            request.aborted = true;
            const error = new Error('Speculative turn aborted.');
            error.name = 'AbortError';
            request.deferred.reject(error);
          },
          { once: true },
        );
        speculativeRequests.push(request);
        return request.deferred.promise;
      }

      if (url.endsWith('/turns')) {
        return turnResponse.promise;
      }

      if (url.endsWith('/played') || url.endsWith('/interrupt')) {
        return createSessionPayload(state.session);
      }

      return createSessionPayload(state.session);
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
    updateRoomStatus() {},
    timers: manualTimers,
  });

  return {
    controller,
    state,
    manualTimers,
    postCalls,
    speculativeRequests,
    turnResponse,
    speakCalls,
    stopCount() {
      return stopCount;
    },
  };
}

test('sentence-level speculative turns keep the in-flight request alive and queue the newer transcript', async () => {
  const harness = createHarness();

  await harness.controller.syncInterimTranscript('First sentence.');
  const firstPromise = harness.controller.startSpeculativeTurn('First sentence.', 'voice-sentence');
  await Promise.resolve();

  assert.equal(harness.speculativeRequests.length, 1);
  assert.equal(harness.speculativeRequests[0].aborted, false);

  await harness.controller.syncInterimTranscript('First sentence. Second sentence.');
  const secondPromise = harness.controller.startSpeculativeTurn(
    'First sentence. Second sentence.',
    'voice-sentence',
  );
  await Promise.resolve();

  assert.equal(harness.speculativeRequests.length, 1);
  assert.equal(harness.speculativeRequests[0].aborted, false);

  harness.speculativeRequests[0].deferred.resolve({
    speculativeReply: {
      text: 'I see where this is going.',
      subtitle: 'I see where this is going.',
      mood: 'warm',
    },
    session: harness.state.session,
  });
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(harness.speakCalls.length, 1);
  assert.match(harness.speakCalls[0].source, /^speculative-turn:/);
  assert.equal(harness.speakCalls[0].text, 'I see where this is going.');
  assert.equal(harness.speculativeRequests.length, 2);
  assert.equal(
    harness.speculativeRequests[1].body.text,
    'First sentence. Second sentence.',
  );
  assert.equal(
    harness.postCalls.some(
      (call) =>
        call.url.endsWith('/playback-events') &&
        call.body?.phase === 'started' &&
        call.body?.kind === 'speculative' &&
        call.body?.text === 'I see where this is going.',
    ),
    true,
  );

  harness.speakCalls[0].deferred.resolve();
  harness.speculativeRequests[1].deferred.resolve({
    interrupted: true,
    session: harness.state.session,
  });
  await firstPromise;
  await secondPromise;

  assert.equal(harness.speculativeRequests[0].aborted, false);
  assert.equal(
    harness.postCalls.some(
      (call) =>
        call.url.endsWith('/playback-events') &&
        call.body?.phase === 'ended' &&
        call.body?.kind === 'speculative' &&
        call.body?.text === 'I see where this is going.',
    ),
    true,
  );
});

test('final user turns stop speculative playback before the canonical reply begins', async () => {
  const harness = createHarness();

  await harness.controller.syncInterimTranscript('First sentence.');
  const speculativePromise = harness.controller.startSpeculativeTurn(
    'First sentence.',
    'voice-sentence',
  );
  await Promise.resolve();

  harness.speculativeRequests[0].deferred.resolve({
    speculativeReply: {
      text: 'Let me think through that first part.',
      subtitle: 'Let me think through that first part.',
      mood: 'warm',
    },
    session: harness.state.session,
  });
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(harness.speakCalls.length, 1);
  assert.match(harness.speakCalls[0].source, /^speculative-turn:/);

  const finalizePromise = harness.controller.finalizeUserUtterance(
    'First sentence. Second sentence.',
    'voice',
  );
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(harness.stopCount(), 0);
  assert.equal(harness.postCalls.some((call) => call.url.endsWith('/turns')), true);
  assert.equal(
    harness.postCalls.some(
      (call) =>
        call.url.endsWith('/playback-events') &&
        call.body?.phase === 'ended' &&
        call.body?.kind === 'speculative',
    ),
    false,
  );

  harness.turnResponse.resolve({
    turn: {
      id: 'turn-1',
      transcript: 'First sentence. Second sentence.',
      createdAt: '2026-05-10T12:00:00.000Z',
      agentReply: {
        createdAt: '2026-05-10T12:00:02.000Z',
        text: 'Here is the final answer.',
        subtitle: 'Here is the final answer.',
        mood: 'warm',
      },
    },
    session: harness.state.session,
  });
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(harness.speakCalls[1], undefined);

  harness.speakCalls[0].deferred.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(harness.speakCalls[1]?.source, 'codex-turn:turn-1:segment-0');
  assert.equal(
    harness.postCalls.some(
      (call) =>
        call.url.endsWith('/playback-events') &&
        call.body?.phase === 'started' &&
        call.body?.kind === 'reply' &&
        call.body?.turnId === 'turn-1',
    ),
    true,
  );
  harness.speakCalls[1].deferred.resolve();

  await Promise.all([speculativePromise, finalizePromise]);
});

test('continued interim updates do not stop an already-playing speculative reply', async () => {
  const harness = createHarness();

  await harness.controller.syncInterimTranscript('First sentence.');
  const speculativePromise = harness.controller.startSpeculativeTurn(
    'First sentence.',
    'voice-sentence',
  );
  await Promise.resolve();

  harness.speculativeRequests[0].deferred.resolve({
    speculativeReply: {
      text: 'Let me stay with that thought.',
      subtitle: 'Let me stay with that thought.',
      mood: 'warm',
    },
    session: harness.state.session,
  });
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(harness.speakCalls.length, 1);
  assert.equal(harness.stopCount(), 0);

  await harness.controller.syncInterimTranscript('First sentence. More detail here.', {
    phase: 'interim',
  });

  assert.equal(harness.stopCount(), 0);

  harness.speakCalls[0].deferred.resolve();
  await speculativePromise;
});

test('interim transcript growth can trigger speculative turns without browser-final sentence chunks', async () => {
  const harness = createHarness();

  await harness.controller.syncInterimTranscript(
    'I want to talk about a sleep habit that matters a lot to me',
    { phase: 'interim' },
  );

  assert.equal(harness.speculativeRequests.length, 0);
  assert.equal(harness.manualTimers.pendingTimeoutDelays.length > 0, true);

  harness.manualTimers.flushNextTimeout();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(harness.speculativeRequests.length, 1);
  assert.equal(
    harness.speculativeRequests[0].body.text,
    'I want to talk about a sleep habit that matters a lot to me',
  );
  assert.equal(harness.speculativeRequests[0].body.source, 'voice-interim');
});

test('interim transcript churn does not starve speculative triggering forever', async () => {
  const harness = createHarness();

  await harness.controller.syncInterimTranscript('I want to explain a habit');
  assert.equal(harness.manualTimers.pendingTimeoutDelays.includes(450), true);

  harness.manualTimers.advanceBy(200);
  await harness.controller.syncInterimTranscript('I want to explain a habit that matters to me');
  harness.manualTimers.advanceBy(200);
  await harness.controller.syncInterimTranscript(
    'I want to explain a habit that matters to me because I keep waking up late',
  );

  assert.equal(harness.speculativeRequests.length, 0);

  harness.manualTimers.advanceBy(50);
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(harness.speculativeRequests.length, 1);
  assert.equal(
    harness.speculativeRequests[0].body.text,
    'I want to explain a habit that matters to me because I keep waking up late',
  );
  assert.equal(harness.speculativeRequests[0].body.source, 'voice-interim');
});
