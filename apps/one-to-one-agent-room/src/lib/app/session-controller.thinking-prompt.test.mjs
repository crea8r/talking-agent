import test from 'node:test';
import assert from 'node:assert/strict';

import { createSessionController } from './session-controller.js';
import { getThinkingPromptPhrases } from './thinking-prompt-sequence.js';

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
      for (const task of timeouts.values()) {
        task.delay = Math.max(0, task.delay - nextEntry[1].delay);
      }
      nextEntry[1].callback();
      return nextEntry[1].delay;
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

function createHarness({
  random = () => 0,
  agentMode = 'standard',
  reservePacket = null,
  fetchSessionResponses = [],
} = {}) {
  const manualTimers = createManualTimers();
  const turnResponse = createDeferred();
  const speakCalls = [];
  const postCalls = [];
  let humanListening = true;
  let startListeningCount = 0;
  let stopListeningCount = 0;
  let stopSpeechCount = 0;
  let speechActive = false;
  let activeSpeechCall = null;
  const preparedSpeechCalls = [];
  const disposedPreparedSpeechTexts = [];
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
    agentSelf: {
      loading: false,
      saving: false,
      settings: {
        agentMode,
        selfProfile: {
          name: '',
          pronouns: '',
          personality: '',
          interests: '',
          selfPrompt: '',
        },
      },
    },
  };

  globalThis.window = {
    setTimeout() {
      return 0;
    },
    clearTimeout() {},
    setInterval() {
      return 0;
    },
    clearInterval() {},
    requestAnimationFrame(callback) {
      callback();
    },
  };

  const controller = createSessionController({
    state,
    humanVoiceLayer: {
      stopListening() {
        humanListening = false;
        stopListeningCount += 1;
      },
      async startListening() {
        humanListening = true;
        startListeningCount += 1;
      },
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
      prepareSpeech(text, source, renderOptions = {}) {
        const preparedSpeech = {
          text,
          source,
          renderOptions,
        };
        preparedSpeechCalls.push(preparedSpeech);
        return preparedSpeech;
      },
      disposePreparedSpeech(preparedSpeech) {
        disposedPreparedSpeechTexts.push(preparedSpeech?.text || '');
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
        activeSpeechCall = {
          ...call,
          options,
        };
        speechActive = true;
        options.onPlaybackStart?.();
        try {
          await deferred.promise;
          options.onPlaybackEnd?.();
        } finally {
          speechActive = false;
          if (activeSpeechCall?.deferred === deferred) {
            activeSpeechCall = null;
          }
        }
      },
      stop() {
        stopSpeechCount += 1;
        if (activeSpeechCall) {
          const currentSpeechCall = activeSpeechCall;
          activeSpeechCall = null;
          speechActive = false;
          currentSpeechCall.options.onPlaybackEnd?.();
          currentSpeechCall.deferred.resolve();
          return;
        }
        speechActive = false;
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
    dom: {},
    stageMap: new Map(),
    emoteMap: new Map([
      ['neutral', { id: 'neutral' }],
      ['warm', { id: 'warm' }],
      ['playful', { id: 'playful' }],
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
    fetchJson: async (url) => {
      if (url.includes('/api/call/sessions/')) {
        if (fetchSessionResponses.length > 0) {
          const next = fetchSessionResponses.shift();
          return typeof next === 'function' ? next(state) : next;
        }

        return createSessionPayload(state.session);
      }

      return {};
    },
    postJson: async (url, body) => {
      postCalls.push({ url, body });

      if (url.endsWith('/turns')) {
        return turnResponse.promise;
      }

      if (url.includes('/agent-self/reserve')) {
        return {
          ok: true,
          packet: reservePacket,
        };
      }

      if (url.includes('/agent-self/turn-complete')) {
        return {
          ok: true,
        };
      }

      if (url.endsWith('/played')) {
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
    random,
  });

  return {
    controller,
    state,
    manualTimers,
    turnResponse,
    speakCalls,
    postCalls,
    humanVoice() {
      return {
        listening: humanListening,
        startListeningCount,
        stopListeningCount,
      };
    },
    stopSpeechCount() {
      return stopSpeechCount;
    },
    preparedSpeechCalls,
    disposedPreparedSpeechTexts,
  };
}

async function flushPromises(count = 10) {
  for (let index = 0; index < count; index += 1) {
    await Promise.resolve();
  }
}

async function flushPromisesUntil(predicate, maxSteps = 20) {
  for (let index = 0; index < maxSteps; index += 1) {
    if (predicate()) {
      return true;
    }
    await Promise.resolve();
  }
  return predicate();
}

async function flushTimeoutsUntil(harness, predicate, maxSteps = 6) {
  for (let index = 0; index < maxSteps; index += 1) {
    if (predicate()) {
      return true;
    }
    const delay = harness.manualTimers.flushNextTimeout();
    if (delay === null) {
      break;
    }
    await flushPromises();
  }
  return predicate();
}

test('getThinkingPromptPhrases returns 100 short waiting lines', () => {
  assert.equal(getThinkingPromptPhrases().length, 100);
});

test('active-turn polling can surface a live Codex notice before the generic thinking prompt', async () => {
  const harness = createHarness({
    fetchSessionResponses: [
      {
        ...createSessionPayload({
          id: 'session-1',
          title: 'talking-agent',
          turns: [],
          avatar: {
            activeModelId: 'bhf-1-2',
            activeModelLabel: 'Red Tinker Bell',
            gestureCatalog: [],
          },
        }),
        inspector: {
          activeRequest: {
            requestId: 'req-turn-1',
            turnId: 'turn-1',
            startedAt: '2026-05-12T09:00:00.000Z',
          },
          recentEvents: [
            {
              id: 'evt-notice-1',
              type: 'codex.notice',
              details: {
                text: 'Checking your calendar connection.',
                speakText: 'Checking your calendar connection.',
              },
            },
          ],
        },
      },
    ],
  });

  const finalizePromise = harness.controller.finalizeUserUtterance('Book the meeting', 'typed');
  await flushPromises();

  assert.equal(harness.manualTimers.pendingTimeoutDelays.includes(300), true);
  assert.equal(harness.manualTimers.pendingTimeoutDelays.includes(550), true);

  await flushTimeoutsUntil(
    harness,
    () => harness.speakCalls.some((call) => call.source === 'agent-progress-notice'),
  );

  assert.equal(harness.state.subtitles.agent.text, 'Checking your calendar connection.');
  assert.equal(harness.speakCalls[0]?.source, 'agent-progress-notice');
  assert.equal(harness.speakCalls[0]?.text, 'Checking your calendar connection.');

  harness.speakCalls[0].deferred.resolve();
  for (let index = 0; index < 4; index += 1) {
    await Promise.resolve();
  }

  harness.turnResponse.resolve({
    ...createSessionPayload({
      id: 'session-1',
      title: 'talking-agent',
      turns: [
        {
          id: 'turn-1',
          transcript: 'Book the meeting',
          source: 'typed',
          status: 'replied',
          agentReply: {
            id: 'reply-1',
            text: 'Done.',
            subtitle: 'Done.',
            mood: 'warm',
            emoteId: 'warm',
            gestureId: 'Greeting',
            animationSequence: [],
            followUps: [],
            playedAt: null,
            interruptedAt: null,
          },
        },
      ],
      avatar: {
        activeModelId: 'bhf-1-2',
        activeModelLabel: 'Red Tinker Bell',
        gestureCatalog: [],
      },
    }),
    turn: {
      id: 'turn-1',
      transcript: 'Book the meeting',
      source: 'typed',
      status: 'replied',
      agentReply: {
        id: 'reply-1',
        text: 'Done.',
        subtitle: 'Done.',
        mood: 'warm',
        emoteId: 'warm',
        gestureId: 'Greeting',
        animationSequence: [],
        followUps: [],
        playedAt: null,
        interruptedAt: null,
      },
    },
  });
  await flushPromisesUntil(() => harness.speakCalls.length > 1);
  harness.speakCalls[1].deferred.resolve();
  await finalizePromise;
});

test('continuity reserve speech can play before the generic thinking prompt starts', async () => {
  const harness = createHarness({
    agentMode: 'continuity',
    reservePacket: {
      turnId: 'turn-ctx-1',
      kind: 'frame',
      text: 'This seems to hinge on hidden state and app relevance.',
      mood: 'focused',
      notBeforeMs: 300,
      dropIfMainReplyStarted: true,
    },
  });

  const finalizePromise = harness.controller.finalizeUserUtterance('Tell me something', 'typed');
  await flushPromises();

  assert.equal(harness.manualTimers.pendingTimeoutDelays.includes(300), true);
  assert.equal(harness.manualTimers.pendingTimeoutDelays.includes(550), true);

  await flushTimeoutsUntil(
    harness,
    () => harness.speakCalls.some((call) => call.source === 'agent-self-reserve'),
  );

  assert.equal(harness.speakCalls[0]?.source, 'agent-self-reserve');
  assert.equal(harness.speakCalls[0]?.text, 'This seems to hinge on hidden state and app relevance.');

  harness.speakCalls[0].deferred.resolve();
  for (let index = 0; index < 6; index += 1) {
    await Promise.resolve();
  }

  await flushTimeoutsUntil(
    harness,
    () => harness.speakCalls.some((call) => call.source === 'local-thinking-prompt'),
  );
  assert.equal(harness.speakCalls[1]?.source, 'local-thinking-prompt');

  harness.speakCalls[1].deferred.resolve();
  for (let index = 0; index < 6; index += 1) {
    await Promise.resolve();
  }

  harness.turnResponse.resolve({
    turn: {
      id: 'turn-1',
      transcript: 'Tell me something',
      createdAt: '2026-05-08T10:00:00.000Z',
      agentReply: {
        createdAt: '2026-05-08T10:00:10.000Z',
        text: 'Here is the real reply.',
        subtitle: 'Here is the real reply.',
        mood: 'warm',
      },
    },
    session: harness.state.session,
  });
  await flushPromisesUntil(() => harness.speakCalls.length > 2);

  harness.speakCalls[2].deferred.resolve();
  await finalizePromise;
});

test('continuity reserve speech is skipped when the main reply begins before the reserve delay elapses', async () => {
  const harness = createHarness({
    agentMode: 'continuity',
    reservePacket: {
      turnId: 'turn-ctx-1',
      kind: 'frame',
      text: 'This seems to hinge on hidden state and app relevance.',
      mood: 'focused',
      notBeforeMs: 900,
      dropIfMainReplyStarted: true,
    },
  });

  const finalizePromise = harness.controller.finalizeUserUtterance('Tell me something', 'typed');
  await flushPromises();

  harness.turnResponse.resolve({
    turn: {
      id: 'turn-1',
      transcript: 'Tell me something',
      createdAt: '2026-05-08T10:00:00.000Z',
      agentReply: {
        createdAt: '2026-05-08T10:00:10.000Z',
        text: 'Here is the real reply.',
        subtitle: 'Here is the real reply.',
        mood: 'warm',
      },
    },
    session: harness.state.session,
  });
  await flushPromisesUntil(() => harness.speakCalls[0]?.source === 'codex-turn:turn-1:segment-0');

  assert.equal(harness.speakCalls[0]?.source, 'codex-turn:turn-1:segment-0');

  await flushTimeoutsUntil(
    harness,
    () => harness.postCalls.some((call) => call.url.includes('/agent-self/reserve')),
  );

  assert.equal(
    harness.speakCalls.some((call) => call.source === 'agent-self-reserve'),
    false,
  );

  harness.speakCalls[0].deferred.resolve();
  await finalizePromise;
});

test('thinking prompts begin after 550ms and stop once the real reply starts', async () => {
  const harness = createHarness({ random: () => 0 });

  const finalizePromise = harness.controller.finalizeUserUtterance('Tell me something', 'typed');
  await flushPromises();

  assert.equal(harness.state.processingReplies, true);
  assert.equal(harness.manualTimers.pendingTimeoutDelays.includes(550), true);

  await flushTimeoutsUntil(
    harness,
    () => harness.speakCalls.some((call) => call.source === 'local-thinking-prompt'),
  );

  assert.equal(harness.speakCalls[0]?.source, 'local-thinking-prompt');
  assert.equal(harness.speakCalls[0]?.text, getThinkingPromptPhrases()[0]);
  assert.equal(
    harness.postCalls.some(
      (call) =>
        call.url.endsWith('/playback-events') &&
        call.body?.phase === 'started' &&
        call.body?.kind === 'thinking' &&
        call.body?.text === getThinkingPromptPhrases()[0],
    ),
    true,
  );

  harness.speakCalls[0].deferred.resolve();
  for (let index = 0; index < 20; index += 1) {
    await Promise.resolve();
  }

  assert.equal(harness.manualTimers.pendingTimeoutDelays.includes(1000), true);
  assert.equal(
    harness.postCalls.some(
      (call) =>
        call.url.endsWith('/playback-events') &&
        call.body?.phase === 'ended' &&
        call.body?.kind === 'thinking' &&
        call.body?.text === getThinkingPromptPhrases()[0],
    ),
    true,
  );

  harness.turnResponse.resolve({
    turn: {
      id: 'turn-1',
      transcript: 'Tell me something',
      createdAt: '2026-05-08T10:00:00.000Z',
      agentReply: {
        createdAt: '2026-05-08T10:00:10.000Z',
        text: 'Here is the real reply.',
        subtitle: 'Here is the real reply.',
        mood: 'warm',
      },
    },
    session: harness.state.session,
  });
  await flushPromisesUntil(() => harness.speakCalls[1]?.source === 'codex-turn:turn-1:segment-0');

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
  assert.equal(harness.manualTimers.pendingTimeoutDelays.includes(550), false);
  assert.equal(harness.manualTimers.pendingTimeoutDelays.includes(1000), false);

  harness.speakCalls[1].deferred.resolve();
  await finalizePromise;
});

test('speech recognition is suspended while agent thinks and resumes after the reply finishes', async () => {
  const harness = createHarness();

  const finalizePromise = harness.controller.finalizeUserUtterance('Tell me something', 'typed');
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(harness.state.agentThinkingActive, true);
  assert.equal(harness.humanVoice().listening, false);
  assert.equal(harness.humanVoice().stopListeningCount, 1);

  harness.turnResponse.resolve({
    turn: {
      id: 'turn-1',
      transcript: 'Tell me something',
      createdAt: '2026-05-08T10:00:00.000Z',
      agentReply: {
        createdAt: '2026-05-08T10:00:10.000Z',
        text: 'Here is the real reply.',
        subtitle: 'Here is the real reply.',
        mood: 'warm',
      },
    },
    session: harness.state.session,
  });
  await flushPromisesUntil(() => harness.speakCalls[0]?.source === 'codex-turn:turn-1:segment-0');

  assert.equal(harness.speakCalls[0]?.source, 'codex-turn:turn-1:segment-0');
  assert.equal(harness.humanVoice().listening, false);

  harness.speakCalls[0].deferred.resolve();
  await finalizePromise;

  assert.equal(harness.humanVoice().listening, true);
  assert.equal(harness.humanVoice().startListeningCount, 1);
});

test('soft-timed-out turns announce background work and play the late reply when it arrives', async () => {
  const processingTurn = {
    id: 'turn-bg-1',
    transcript: 'Can you look into my calendar access?',
    createdAt: '2026-05-08T10:00:00.000Z',
    status: 'processing',
    agentReply: null,
  };
  const repliedTurn = {
    ...processingTurn,
    status: 'replied',
    agentReply: {
      createdAt: '2026-05-08T10:00:45.000Z',
      text: 'I checked the setup and the calendar plugin is available.',
      subtitle: 'I checked the setup and the calendar plugin is available.',
      mood: 'warm',
      playedAt: null,
      interruptedAt: null,
    },
  };
  const harness = createHarness({
    fetchSessionResponses: [
      createSessionPayload({
        id: 'session-1',
        title: 'talking-agent',
        turns: [repliedTurn],
        avatar: {
          activeModelId: 'bhf-1-2',
          activeModelLabel: 'Red Tinker Bell',
          gestureCatalog: [],
        },
      }),
    ],
  });

  const finalizePromise = harness.controller.finalizeUserUtterance(
    'Can you look into my calendar access?',
    'typed',
  );
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  harness.turnResponse.resolve({
    softTimedOut: true,
    deferred: true,
    deferredTurnId: 'turn-bg-1',
    turn: processingTurn,
    session: createSessionPayload({
      id: 'session-1',
      title: 'talking-agent',
      turns: [processingTurn],
      avatar: {
        activeModelId: 'bhf-1-2',
        activeModelLabel: 'Red Tinker Bell',
        gestureCatalog: [],
      },
    }).session,
  });
  await flushPromisesUntil(() => harness.speakCalls[0]?.source === 'codex-turn:turn-1:segment-0');

  assert.equal(harness.speakCalls[0]?.source, 'local-soft-timeout');
  assert.match(harness.speakCalls[0]?.text || '', /still working on/i);
  assert.match(harness.speakCalls[0]?.text || '', /calendar access/i);

  harness.speakCalls[0].deferred.resolve();
  for (let index = 0; index < 10; index += 1) {
    await Promise.resolve();
  }
  await finalizePromise;

  assert.equal(harness.humanVoice().listening, true);
  assert.equal(harness.manualTimers.pendingTimeoutDelays.includes(2000), true);

  harness.manualTimers.flushNextTimeout();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(harness.speakCalls[1]?.source, 'codex-turn:turn-bg-1:segment-0');
  assert.equal(
    harness.speakCalls[1]?.text,
    'I checked the setup and the calendar plugin is available.',
  );

  harness.speakCalls[1].deferred.resolve();
  await Promise.resolve();
  await Promise.resolve();
});

test('final replies can continue as multiple autonomous speech segments with pauses between them', async () => {
  const harness = createHarness();

  const finalizePromise = harness.controller.finalizeUserUtterance(
    'Name five vintage cars with pauses.',
    'typed',
  );
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  harness.turnResponse.resolve({
    turn: {
      id: 'turn-1',
      transcript: 'Name five vintage cars with pauses.',
      createdAt: '2026-05-08T10:00:00.000Z',
      agentReply: {
        createdAt: '2026-05-08T10:00:10.000Z',
        text: 'Ford Model T.',
        subtitle: 'Ford Model T.',
        mood: 'warm',
        followUps: [
          {
            text: 'Rolls Royce Silver Ghost.',
            subtitle: 'Rolls Royce Silver Ghost.',
            mood: 'warm',
            pauseMs: 5000,
          },
          {
            text: 'Bentley 4 and a Half Litre.',
            subtitle: 'Bentley 4 and a Half Litre.',
            mood: 'warm',
            pauseMs: 5000,
          },
        ],
      },
    },
    session: harness.state.session,
  });
  await flushPromisesUntil(() => harness.speakCalls[0]?.source === 'codex-turn:turn-1:segment-0');

  assert.equal(harness.speakCalls[0]?.source, 'codex-turn:turn-1:segment-0');
  assert.equal(harness.speakCalls[0]?.text, 'Ford Model T.');

  harness.speakCalls[0].deferred.resolve();
  for (let index = 0; index < 12; index += 1) {
    await Promise.resolve();
  }

  assert.equal(harness.humanVoice().listening, false);
  assert.equal(harness.manualTimers.pendingTimeoutDelays.includes(5000), true);

  harness.manualTimers.flushNextTimeout();
  await flushPromisesUntil(() => harness.speakCalls[1]?.source === 'codex-turn:turn-1:segment-1');

  assert.equal(harness.speakCalls[1]?.source, 'codex-turn:turn-1:segment-1');
  assert.equal(harness.speakCalls[1]?.text, 'Rolls Royce Silver Ghost.');

  harness.speakCalls[1].deferred.resolve();
  for (let index = 0; index < 12; index += 1) {
    await Promise.resolve();
  }

  assert.equal(harness.manualTimers.pendingTimeoutDelays.includes(5000), true);

  harness.manualTimers.flushNextTimeout();
  await flushPromisesUntil(() => harness.speakCalls[2]?.source === 'codex-turn:turn-1:segment-2');

  assert.equal(harness.speakCalls[2]?.source, 'codex-turn:turn-1:segment-2');
  assert.equal(harness.speakCalls[2]?.text, 'Bentley 4 and a Half Litre.');

  harness.speakCalls[2].deferred.resolve();
  await finalizePromise;

  assert.equal(
    harness.postCalls.filter(
      (call) =>
        call.url.endsWith('/playback-events') &&
        call.body?.phase === 'started' &&
        call.body?.kind === 'reply',
    ).length,
    3,
  );
});

test('final replies wait for the current thinking speech to finish instead of cutting it off', async () => {
  const harness = createHarness({ random: () => 0 });

  const finalizePromise = harness.controller.finalizeUserUtterance('Tell me something long', 'typed');
  await flushPromises();

  await flushTimeoutsUntil(
    harness,
    () => harness.speakCalls.some((call) => call.source === 'local-thinking-prompt'),
  );

  assert.equal(harness.speakCalls[0]?.source, 'local-thinking-prompt');
  assert.equal(harness.stopSpeechCount(), 0);

  harness.turnResponse.resolve({
    turn: {
      id: 'turn-1',
      transcript: 'Tell me something long',
      createdAt: '2026-05-08T10:00:00.000Z',
      agentReply: {
        createdAt: '2026-05-08T10:00:10.000Z',
        text: 'Here is the real reply.',
        subtitle: 'Here is the real reply.',
        mood: 'warm',
      },
    },
    session: harness.state.session,
  });
  await flushPromisesUntil(() => harness.speakCalls[0]?.source === 'codex-turn:turn-1:segment-0');

  assert.equal(harness.speakCalls.length, 1);
  assert.equal(harness.stopSpeechCount(), 0);

  harness.speakCalls[0].deferred.resolve();
  for (let index = 0; index < 20; index += 1) {
    await Promise.resolve();
  }

  assert.equal(harness.speakCalls[1]?.source, 'codex-turn:turn-1:segment-0');
  harness.speakCalls[1].deferred.resolve();
  await finalizePromise;
});

test('very long replies are auto-segmented into back-to-back speech chunks', async () => {
  const harness = createHarness();
  const longReply = [
    'First, pick a car that feels easy to live with every day.',
    'Second, keep the seating and ride comfort high on your list.',
    'Third, look for something with clear service history and low stress maintenance.',
    'Fourth, decide whether style matters more than practicality for this trip.',
    'Fifth, think about how much highway driving you will really do.',
    'Sixth, leave some budget for fuel, parking, and small surprises on the road.',
  ].join(' ');

  const finalizePromise = harness.controller.finalizeUserUtterance('Give me a long answer.', 'typed');
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  harness.turnResponse.resolve({
    turn: {
      id: 'turn-1',
      transcript: 'Give me a long answer.',
      createdAt: '2026-05-08T10:00:00.000Z',
      agentReply: {
        createdAt: '2026-05-08T10:00:10.000Z',
        text: longReply,
        subtitle: longReply,
        mood: 'warm',
      },
    },
    session: harness.state.session,
  });
  await flushPromisesUntil(() => harness.speakCalls[0]?.source === 'codex-turn:turn-1:segment-0');

  assert.equal(harness.speakCalls[0]?.source, 'codex-turn:turn-1:segment-0');

  harness.speakCalls[0].deferred.resolve();
  for (let index = 0; index < 20; index += 1) {
    await Promise.resolve();
  }

  assert.equal(harness.humanVoice().listening, false);
  assert.equal(harness.manualTimers.pendingTimeoutDelays.length > 0, true);
  assert.equal(harness.manualTimers.pendingTimeoutDelays[0], 120);

  await flushTimeoutsUntil(
    harness,
    () => harness.postCalls.some((call) => call.url.includes('/agent-self/reserve')),
  );
  await Promise.resolve();

  assert.equal(harness.speakCalls.length > 1, true);
  await harness.controller.interruptActiveReply('test cleanup');
  await finalizePromise;
  assert.equal(harness.speakCalls.length >= 2, true);
});

test('follow-up replies pre-synthesize the next segment and clamp default pauses to the short range', async () => {
  const harness = createHarness();

  const finalizePromise = harness.controller.finalizeUserUtterance(
    'Tell me the engine story in three parts.',
    'typed',
  );
  await flushPromises();

  harness.turnResponse.resolve({
    turn: {
      id: 'turn-1',
      transcript: 'Tell me the engine story in three parts.',
      createdAt: '2026-05-08T10:00:00.000Z',
      agentReply: {
        createdAt: '2026-05-08T10:00:10.000Z',
        text: 'Part one about the earliest successful engine.',
        subtitle: 'Part one about the earliest successful engine.',
        mood: 'warm',
        followUps: [
          {
            text: 'Part two about the chain of improvements over time.',
            subtitle: 'Part two about the chain of improvements over time.',
            mood: 'warm',
            pauseMs: 900,
          },
          {
            text: 'Part three about the last fifty years of engine progress.',
            subtitle: 'Part three about the last fifty years of engine progress.',
            mood: 'warm',
            pauseMs: 1100,
          },
        ],
      },
    },
    session: harness.state.session,
  });
  await flushPromises();

  assert.equal(harness.speakCalls[0]?.source, 'codex-turn:turn-1:segment-0');
  assert.equal(
    harness.preparedSpeechCalls.some((call) => call.text === 'Part one about the earliest successful engine.'),
    true,
  );
  assert.equal(
    harness.preparedSpeechCalls.some((call) => call.text === 'Part two about the chain of improvements over time.'),
    true,
  );

  harness.speakCalls[0].deferred.resolve();
  await flushPromises();

  assert.equal(harness.manualTimers.pendingTimeoutDelays.includes(900), false);
  assert.equal(harness.manualTimers.pendingTimeoutDelays.includes(1100), false);
  assert.equal(
    harness.manualTimers.pendingTimeoutDelays.some((delay) => delay >= 100 && delay <= 200),
    true,
  );

  harness.manualTimers.flushNextTimeout();
  await flushPromises();

  assert.equal(harness.speakCalls[1]?.source, 'codex-turn:turn-1:segment-1');
  assert.equal(
    harness.preparedSpeechCalls.some((call) => call.text === 'Part three about the last fifty years of engine progress.'),
    true,
  );

  harness.speakCalls[1].deferred.resolve();
  await flushPromises();
  harness.manualTimers.flushNextTimeout();
  await flushPromises();

  assert.equal(harness.speakCalls[2]?.source, 'codex-turn:turn-1:segment-2');

  harness.speakCalls[2].deferred.resolve();
  await finalizePromise;
});

test('standard mode still routes reserve and turn-complete work through agent-self asynchronously', async () => {
  const harness = createHarness({
    agentMode: 'standard',
    reservePacket: null,
  });

  const finalizePromise = harness.controller.finalizeUserUtterance('Tell me something', 'typed');
  await flushPromises();

  harness.manualTimers.flushNextTimeout();
  await Promise.resolve();

  assert.equal(
    harness.speakCalls.some((call) => call.source === 'agent-self-reserve'),
    false,
  );

  harness.turnResponse.resolve({
    turn: {
      id: 'turn-1',
      transcript: 'Tell me something',
      createdAt: '2026-05-08T10:00:00.000Z',
      agentReply: {
        createdAt: '2026-05-08T10:00:10.000Z',
        text: 'Here is the real reply.',
        subtitle: 'Here is the real reply.',
        mood: 'warm',
      },
    },
    session: harness.state.session,
  });
  await flushPromisesUntil(() => harness.speakCalls[0]?.source === 'codex-turn:turn-1:segment-0');

  assert.equal(
    harness.postCalls.some((call) => call.url.includes('/agent-self/turn-complete')),
    true,
  );

  harness.speakCalls[0].deferred.resolve();
  await finalizePromise;
});
