import test from 'node:test';
import assert from 'node:assert/strict';

import { createDirectSessionRuntime } from './direct-session-runtime.mjs';

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, resolve, reject };
}

function createRuntime({ agentRunnerOverrides = {} } = {}) {
  const activeAborts = [];
  const baseAgentRunner = {
    async resetSession() {},
    async startReply({ turn }) {
      return {
        requestId: `req-${turn.id}`,
        abort(reason) {
          activeAborts.push(reason);
          return true;
        },
        promise: Promise.resolve({
          text: `Reply to ${turn.transcript}`,
          subtitle: `Reply to ${turn.transcript}`,
          mood: 'warm',
          emoteId: 'warm',
          gestureId: 'Greeting',
          animationSequence: [{ gestureId: 'Greeting', atRatio: 0 }],
          rawText: '{"spokenText":"ok"}',
          runMode: 'initial',
        }),
      };
    },
    async startSpeculativeReply({ transcript }) {
      return {
        requestId: `spec-${transcript}`,
        abort() {
          return true;
        },
        promise: Promise.resolve({
          text: `Maybe ${transcript}`,
          subtitle: `Maybe ${transcript}`,
          mood: 'warm',
          emoteId: 'warm',
          gestureId: 'Greeting',
          animationSequence: [{ gestureId: 'Greeting', atRatio: 0 }],
          rawText: '{"spokenText":"maybe"}',
          runMode: 'speculative',
        }),
      };
    },
  };
  const runtime = createDirectSessionRuntime({
    agentRunner: {
      ...baseAgentRunner,
      ...agentRunnerOverrides,
    },
    modelsById: new Map([
      ['bhf-1-2', { id: 'bhf-1-2', label: 'Red Tinker Bell' }],
    ]),
    gestureCatalogByModel: {
      'bhf-1-2': [{ id: 'Greeting', intent: 'greet', bestFor: ['hello'] }],
    },
    defaultModelId: 'bhf-1-2',
    projectTitle: 'talking-agent',
  });

  return {
    runtime,
    activeAborts,
  };
}

function createLinkedRuntime({ callRecordStore } = {}) {
  const runtime = createDirectSessionRuntime({
    agentRunner: {
      async resetSession() {},
      async startReply({ turn }) {
        return {
          requestId: `req-${turn.id}`,
          abort() {
            return true;
          },
          promise: Promise.resolve({
            text: `Reply to ${turn.transcript}`,
            subtitle: `Reply to ${turn.transcript}`,
            mood: 'warm',
            emoteId: 'warm',
            gestureId: 'Greeting',
            animationSequence: [{ gestureId: 'Greeting', atRatio: 0 }],
            rawText: '{"spokenText":"ok"}',
            runMode: 'resume',
          }),
        };
      },
      async finalizeSession() {
        return {
          summary: 'We agreed the call should use original_session_id and call_session_id separately.',
          writeBackText: 'Recorded in original thread.',
        };
      },
    },
    callRecordStore,
    modelsById: new Map([
      ['bhf-1-2', { id: 'bhf-1-2', label: 'Red Tinker Bell' }],
    ]),
    gestureCatalogByModel: {
      'bhf-1-2': [{ id: 'Greeting', intent: 'greet', bestFor: ['hello'] }],
    },
    defaultModelId: 'bhf-1-2',
    projectTitle: 'talking-agent',
  });

  return { runtime };
}

test('runtime creates sessions, syncs setup, and produces direct replies', async () => {
  const { runtime } = createRuntime();
  const created = await runtime.createSession({
    title: 'talking-agent',
    metadata: {
      agentSetup: {
        activeModelId: 'bhf-1-2',
        voiceSampleFileName: 'reference.wav',
      },
    },
  });
  const sessionId = created.session.id;

  const synced = await runtime.syncSetup({
    sessionId,
    metadata: {
      agentSetup: {
        voiceSampleSpeakerLabel: 'EN-US',
      },
    },
  });
  await runtime.setCallState({ sessionId, state: 'live' });
  const replied = await runtime.submitHumanTurn({
    sessionId,
    text: 'Hello there',
    source: 'voice',
  });

  assert.equal(synced.session.avatar.activeModelLabel, 'Red Tinker Bell');
  assert.equal(replied.turn.agentReply.text, 'Reply to Hello there');
  assert.equal(replied.session.metrics.turnCount, 1);
  assert.equal(replied.session.metrics.unplayedReplies, 1);
});

test('runtime starts a hidden Codex warmup when the call becomes live', async () => {
  const warmupCalls = [];
  const runtime = createDirectSessionRuntime({
    agentRunner: {
      async resetSession() {},
      async startSessionWarmup({ session }) {
        warmupCalls.push(session.id);
        return {
          started: true,
          requestId: 'warmup-1',
          promise: Promise.resolve(),
        };
      },
      async startReply({ turn }) {
        return {
          requestId: `req-${turn.id}`,
          abort() {
            return true;
          },
          promise: Promise.resolve({
            text: `Reply to ${turn.transcript}`,
            subtitle: `Reply to ${turn.transcript}`,
            mood: 'warm',
            emoteId: 'warm',
            gestureId: 'Greeting',
            animationSequence: [{ gestureId: 'Greeting', atRatio: 0 }],
            rawText: '{"spokenText":"ok"}',
            runMode: 'resume',
          }),
        };
      },
    },
    modelsById: new Map([
      ['bhf-1-2', { id: 'bhf-1-2', label: 'Red Tinker Bell' }],
    ]),
    gestureCatalogByModel: {
      'bhf-1-2': [{ id: 'Greeting', intent: 'greet', bestFor: ['hello'] }],
    },
    defaultModelId: 'bhf-1-2',
    projectTitle: 'talking-agent',
  });

  const created = await runtime.createSession({});
  const sessionId = created.session.id;
  const live = await runtime.setCallState({ sessionId, state: 'live' });
  await Promise.resolve();

  assert.deepEqual(warmupCalls, [sessionId]);
  assert.equal(live.session.state, 'live');
  assert.ok(live.session.events.some((event) => event.type === 'codex.warmup_started'));
});

test('runtime can mark the call live without starting hidden warmup', async () => {
  const warmupCalls = [];
  const runtime = createDirectSessionRuntime({
    agentRunner: {
      async resetSession() {},
      async startSessionWarmup({ session }) {
        warmupCalls.push(session.id);
        return {
          started: true,
          requestId: 'warmup-1',
          promise: Promise.resolve(),
        };
      },
      async startReply({ turn }) {
        return {
          requestId: `req-${turn.id}`,
          abort() {
            return true;
          },
          promise: Promise.resolve({
            text: `Reply to ${turn.transcript}`,
            subtitle: `Reply to ${turn.transcript}`,
            mood: 'warm',
            emoteId: 'warm',
            gestureId: 'Greeting',
            animationSequence: [{ gestureId: 'Greeting', atRatio: 0 }],
            rawText: '{"spokenText":"ok"}',
            runMode: 'initial',
          }),
        };
      },
    },
    modelsById: new Map([
      ['bhf-1-2', { id: 'bhf-1-2', label: 'Red Tinker Bell' }],
    ]),
    gestureCatalogByModel: {
      'bhf-1-2': [{ id: 'Greeting', intent: 'greet', bestFor: ['hello'] }],
    },
    defaultModelId: 'bhf-1-2',
    projectTitle: 'talking-agent',
  });

  const created = await runtime.createSession({});
  const sessionId = created.session.id;
  const live = await runtime.setCallState({ sessionId, state: 'live', skipWarmup: true });
  await Promise.resolve();

  assert.deepEqual(warmupCalls, []);
  assert.equal(live.session.state, 'live');
  assert.equal(live.session.events.some((event) => event.type === 'codex.warmup_started'), false);
});

test('runtime records worker notifications in the session event timeline', async () => {
  let sessionListener = null;
  const runtime = createDirectSessionRuntime({
    agentRunner: {
      async resetSession() {},
      subscribeSessionEvents({ listener }) {
        sessionListener = listener;
        return () => {
          sessionListener = null;
        };
      },
      async startReply({ turn }) {
        return {
          requestId: `req-${turn.id}`,
          abort() {
            return true;
          },
          promise: Promise.resolve({
            text: `Reply to ${turn.transcript}`,
            subtitle: `Reply to ${turn.transcript}`,
            mood: 'warm',
            emoteId: 'warm',
            gestureId: 'Greeting',
            animationSequence: [{ gestureId: 'Greeting', atRatio: 0 }],
            rawText: '{"spokenText":"ok"}',
            runMode: 'resume',
          }),
        };
      },
    },
    modelsById: new Map([
      ['bhf-1-2', { id: 'bhf-1-2', label: 'Red Tinker Bell' }],
    ]),
    gestureCatalogByModel: {
      'bhf-1-2': [{ id: 'Greeting', intent: 'greet', bestFor: ['hello'] }],
    },
    defaultModelId: 'bhf-1-2',
    projectTitle: 'talking-agent',
  });

  const created = await runtime.createSession({});
  const sessionId = created.session.id;
  sessionListener?.({
    kind: 'notice',
    level: 'info',
    text: 'Checking your calendar connection.',
    speakText: 'Checking your calendar connection.',
    source: 'mcp-notification',
  });
  sessionListener?.({
    kind: 'log',
    level: 'warn',
    text: 'warning: connector is slow',
    source: 'mcp-stderr',
  });
  const payload = await runtime.getSession(sessionId);

  assert.equal(payload.session.events[0].type, 'codex.log');
  assert.equal(payload.session.events[0].details.text, 'warning: connector is slow');
  assert.equal(payload.session.events[1].type, 'codex.notice');
  assert.equal(payload.session.events[1].details.speakText, 'Checking your calendar connection.');
});

test('runtime tracks a generic operation summary across defer and background completion', async () => {
  const replyDeferred = createDeferred();
  const { runtime } = createRuntime({
    agentRunnerOverrides: {
      async startReply() {
        return {
          requestId: 'req-op-1',
          abort() {
            return true;
          },
          promise: replyDeferred.promise,
        };
      },
    },
  });

  const created = await runtime.createSession({});
  const sessionId = created.session.id;
  await runtime.setCallState({ sessionId, state: 'live' });
  const submitPromise = runtime.submitHumanTurn({
    sessionId,
    text: 'save the airplane report to Google Drive',
    source: 'voice',
  });
  await Promise.resolve();

  const active = await runtime.getSession(sessionId);
  const activeTurn = active.session.turns.at(-1);
  assert.equal(activeTurn.operation.summary, 'save the airplane report to Google Drive');
  assert.equal(activeTurn.operation.phase, 'thinking');

  const deferred = await runtime.deferActiveTurn({
    sessionId,
    reason: 'Still working in the background.',
  });
  assert.equal(deferred.turn.operation.phase, 'background');
  assert.equal(deferred.turn.operation.statusText, 'Still working in the background.');

  replyDeferred.resolve({
    text: 'Done. I saved it.',
    subtitle: 'Done. I saved it.',
    mood: 'warm',
    animationSequence: [],
    followUps: [],
    rawText: '{"spokenText":"Done. I saved it."}',
    runMode: 'resume',
  });
  const completed = await submitPromise;
  assert.equal(completed.turn.operation.summary, 'save the airplane report to Google Drive');
  assert.equal(completed.turn.operation.phase, 'background');
  assert.equal(completed.turn.operation.statusText, 'Reply ready in the background.');
});

test('runtime interrupt marks the latest reply interrupted', async () => {
  const { runtime } = createRuntime();
  const created = await runtime.createSession({});
  const sessionId = created.session.id;

  await runtime.setCallState({ sessionId, state: 'live' });
  await runtime.submitHumanTurn({
    sessionId,
    text: 'Hello there',
    source: 'voice',
  });
  const interrupted = await runtime.interrupt({
    sessionId,
    reason: 'human started speaking',
  });

  const latestTurn = interrupted.session.turns.at(-1);
  assert.ok(latestTurn.agentReply.interruptedAt);
  assert.equal(interrupted.session.agent.status, 'listening');
});

test('runtime keeps speculative replies out of canonical session history', async () => {
  const { runtime } = createRuntime();
  const created = await runtime.createSession({});
  const sessionId = created.session.id;

  await runtime.setCallState({ sessionId, state: 'live' });
  const speculative = await runtime.startSpeculativeHumanTurn({
    sessionId,
    text: 'Hello there',
    source: 'voice-sentence',
  });

  assert.equal(speculative.speculativeReply.text, 'Maybe Hello there');
  assert.equal(speculative.session.turns.length, 0);
  assert.equal(speculative.session.metrics.turnCount, 0);
});

test('runtime aborts active speculative replies when the final human turn is submitted', async () => {
  const speculativeDeferred = createDeferred();
  const speculativeAborts = [];
  const runtime = createDirectSessionRuntime({
    agentRunner: {
      async resetSession() {},
      async startReply({ turn }) {
        return {
          requestId: `req-${turn.id}`,
          abort() {
            return true;
          },
          promise: Promise.resolve({
            text: `Reply to ${turn.transcript}`,
            subtitle: `Reply to ${turn.transcript}`,
            mood: 'warm',
            emoteId: 'warm',
            gestureId: 'Greeting',
            animationSequence: [{ gestureId: 'Greeting', atRatio: 0 }],
            rawText: '{"spokenText":"ok"}',
            runMode: 'initial',
          }),
        };
      },
      async startSpeculativeReply() {
        return {
          requestId: 'spec-1',
          abort(reason) {
            speculativeAborts.push(reason);
            const error = new Error(`${reason || 'Speculative turn aborted.'}`.trim());
            error.name = 'AbortError';
            speculativeDeferred.reject(error);
            return true;
          },
          promise: speculativeDeferred.promise,
        };
      },
    },
    modelsById: new Map([
      ['bhf-1-2', { id: 'bhf-1-2', label: 'Red Tinker Bell' }],
    ]),
    gestureCatalogByModel: {
      'bhf-1-2': [{ id: 'Greeting', intent: 'greet', bestFor: ['hello'] }],
    },
    defaultModelId: 'bhf-1-2',
    projectTitle: 'talking-agent',
  });
  const created = await runtime.createSession({});
  const sessionId = created.session.id;

  await runtime.setCallState({ sessionId, state: 'live' });
  const speculativePromise = runtime.startSpeculativeHumanTurn({
    sessionId,
    text: 'First sentence',
    source: 'voice-sentence',
  });
  await Promise.resolve();

  const finalReply = await runtime.submitHumanTurn({
    sessionId,
    text: 'First sentence. Second sentence.',
    source: 'voice',
  });
  const speculativeResult = await speculativePromise;

  assert.equal(speculativeAborts.length, 1);
  assert.match(speculativeAborts[0], /Final turn superseded/i);
  assert.equal(speculativeResult.interrupted, true);
  assert.equal(finalReply.session.turns.length, 1);
  assert.equal(finalReply.turn.transcript, 'First sentence. Second sentence.');
});

test('runtime can defer a long-running turn and keep the late reply when it finishes', async () => {
  const replyDeferred = createDeferred();
  const runtime = createDirectSessionRuntime({
    agentRunner: {
      async resetSession() {},
      async startReply({ turn }) {
        return {
          requestId: `req-${turn.id}`,
          abort() {
            return true;
          },
          promise: replyDeferred.promise,
        };
      },
    },
    modelsById: new Map([
      ['bhf-1-2', { id: 'bhf-1-2', label: 'Red Tinker Bell' }],
    ]),
    gestureCatalogByModel: {
      'bhf-1-2': [{ id: 'Greeting', intent: 'greet', bestFor: ['hello'] }],
    },
    defaultModelId: 'bhf-1-2',
    projectTitle: 'talking-agent',
  });
  const created = await runtime.createSession({});
  const sessionId = created.session.id;

  await runtime.setCallState({ sessionId, state: 'live' });
  const replyPromise = runtime.submitHumanTurn({
    sessionId,
    text: 'Can you check my calendar access?',
    source: 'voice',
  });
  await Promise.resolve();

  const deferred = await runtime.deferActiveTurn({
    sessionId,
    reason: 'soft timeout',
  });

  assert.equal(deferred.softTimedOut, true);
  assert.equal(deferred.deferred, true);
  assert.equal(deferred.deferredTurnId, deferred.turn.id);
  assert.equal(deferred.session.turns[0].status, 'processing');
  assert.equal(deferred.session.agent.status, 'listening');

  replyDeferred.resolve({
    text: 'Yes, I can use the calendar plugin once you tell me what to do.',
    subtitle: 'Yes, I can use the calendar plugin once you tell me what to do.',
    mood: 'warm',
    emoteId: 'warm',
    gestureId: 'Greeting',
    animationSequence: [{ gestureId: 'Greeting', atRatio: 0 }],
    rawText: '{"spokenText":"Yes, I can use the calendar plugin once you tell me what to do."}',
    runMode: 'initial',
  });

  const completed = await replyPromise;

  assert.equal(completed.turnCompletedInBackground, true);
  assert.equal(completed.turn.agentReply.text, 'Yes, I can use the calendar plugin once you tell me what to do.');
  assert.equal(completed.session.turns[0].status, 'replied');

  const refreshed = await runtime.getSession(sessionId);
  assert.equal(refreshed.session.metrics.pendingTurns, 0);
  assert.equal(refreshed.session.metrics.unplayedReplies, 1);
  assert.equal(refreshed.session.events[0].type, 'codex.completed');
  assert.equal(refreshed.session.events[1].type, 'codex.deferred');
});

test('runtime records playback timeline events and reply playback starts', async () => {
  const { runtime } = createRuntime();
  const created = await runtime.createSession({});
  const sessionId = created.session.id;

  await runtime.setCallState({ sessionId, state: 'live' });
  const replied = await runtime.submitHumanTurn({
    sessionId,
    text: 'Hello there',
    source: 'voice',
  });

  await runtime.recordPlaybackEvent({
    sessionId,
    phase: 'started',
    kind: 'thinking',
    source: 'local-thinking-prompt',
    text: 'One moment.',
  });
  const playbackStarted = await runtime.recordPlaybackEvent({
    sessionId,
    phase: 'started',
    kind: 'reply',
    source: 'codex-turn',
    turnId: replied.turn.id,
    text: replied.turn.agentReply.text,
  });

  assert.ok(playbackStarted.turn.agentReply.playbackStartedAt);
  assert.equal(playbackStarted.session.events[0].type, 'audio.started');
  assert.equal(playbackStarted.session.events[0].details.kind, 'reply');
  assert.equal(playbackStarted.session.events[0].details.turnId, replied.turn.id);
  assert.equal(playbackStarted.session.events[1].type, 'audio.started');
  assert.equal(playbackStarted.session.events[1].details.kind, 'thinking');

  const played = await runtime.markReplyPlayed({
    sessionId,
    turnId: replied.turn.id,
  });

  assert.equal(played.session.events[0].type, 'reply.played');
  assert.equal(played.session.events[1].type, 'audio.ended');
  assert.equal(played.session.events[1].details.kind, 'reply');
  assert.ok(played.turn.agentReply.playedAt);
});

test('runtime retains enough event history for full session reports', async () => {
  const { runtime } = createRuntime();
  const created = await runtime.createSession({});
  const sessionId = created.session.id;

  await runtime.setCallState({ sessionId, state: 'live' });
  for (let index = 0; index < 60; index += 1) {
    await runtime.recordPlaybackEvent({
      sessionId,
      phase: 'started',
      kind: 'thinking',
      source: 'local-thinking-prompt',
      text: `Prompt ${index}`,
    });
  }

  const snapshot = await runtime.getSession(sessionId);
  assert.equal(snapshot.session.events.length >= 62, true);
  assert.equal(
    snapshot.session.events.some(
      (event) => event.type === 'audio.started' && event.details.text === 'Prompt 0',
    ),
    true,
  );
});

test('runtime preserves multi-segment follow-up replies on the canonical turn', async () => {
  const runtime = createDirectSessionRuntime({
    agentRunner: {
      async resetSession() {},
      async startReply({ turn }) {
        return {
          requestId: `req-${turn.id}`,
          abort() {
            return true;
          },
          promise: Promise.resolve({
            text: 'Ford Model T.',
            subtitle: 'Ford Model T.',
            mood: 'warm',
            emoteId: 'warm',
            gestureId: 'Greeting',
            animationSequence: [{ gestureId: 'Greeting', atRatio: 0 }],
            followUps: [
              {
                text: 'Rolls Royce Silver Ghost.',
                subtitle: 'Rolls Royce Silver Ghost.',
                mood: 'warm',
                emoteId: 'warm',
                gestureId: 'Greeting',
                animationSequence: [{ gestureId: 'Greeting', atRatio: 0 }],
                pauseMs: 5000,
              },
            ],
            rawText: '{"spokenText":"Ford Model T."}',
            runMode: 'initial',
          }),
        };
      },
    },
    modelsById: new Map([
      ['bhf-1-2', { id: 'bhf-1-2', label: 'Red Tinker Bell' }],
    ]),
    gestureCatalogByModel: {
      'bhf-1-2': [{ id: 'Greeting', intent: 'greet', bestFor: ['hello'] }],
    },
    defaultModelId: 'bhf-1-2',
    projectTitle: 'talking-agent',
  });
  const created = await runtime.createSession({});
  const sessionId = created.session.id;

  await runtime.setCallState({ sessionId, state: 'live' });
  const replied = await runtime.submitHumanTurn({
    sessionId,
    text: 'Give me spaced vintage cars.',
    source: 'voice',
  });

  assert.equal(replied.turn.agentReply.text, 'Ford Model T.');
  assert.equal(replied.turn.agentReply.followUps.length, 1);
  assert.equal(replied.turn.agentReply.followUps[0].pauseMs, 5000);
});

test('runtime finalizes a linked call, stores the summary, and marks the call ended', async () => {
  const recordUpdates = [];
  const callRecordStore = {
    async loadRecord({ launchId }) {
      return {
        launchId,
        originalSessionId: 'session-original',
        callSessionId: 'session-call',
        status: 'ready',
      };
    },
    async updateRecord({ launchId, patch }) {
      recordUpdates.push({ launchId, patch });
      return {
        launchId,
        ...patch,
      };
    },
  };
  const { runtime } = createLinkedRuntime({ callRecordStore });
  const created = await runtime.createSession({
    title: 'talking-agent',
    metadata: {
      launch: {
        mode: 'linked-call',
        launchId: 'launch-123',
        originalSessionId: 'session-original',
        callSessionId: 'session-call',
        workspaceRoot: '/tmp/workspace-alpha',
      },
      agentSetup: {
        activeModelId: 'bhf-1-2',
      },
    },
  });
  const sessionId = created.session.id;

  await runtime.setCallState({ sessionId, state: 'live' });
  const ended = await runtime.endSession({
    sessionId,
    reason: 'human ended call',
  });

  assert.equal(ended.session.state, 'ended');
  assert.equal(ended.summary, 'We agreed the call should use original_session_id and call_session_id separately.');
  assert.equal(recordUpdates.at(-1).launchId, 'launch-123');
  assert.equal(recordUpdates.at(-1).patch.status, 'ended');
  assert.match(recordUpdates.at(-1).patch.summary, /original_session_id and call_session_id/);
});
