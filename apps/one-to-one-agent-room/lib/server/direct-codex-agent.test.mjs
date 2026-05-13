import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildInitialTurnPrompt,
  buildResumeTurnPrompt,
  buildSpeculativeTurnPrompt,
  createDirectCodexAgent,
  normalizeAgentReply,
} from './direct-codex-agent.mjs';

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

const SESSION_FIXTURE = {
  id: 'session-1',
  avatar: {
    activeModelId: 'bhf-1-2',
    activeModelLabel: 'Red Tinker Bell',
    gestureCatalog: [
      { id: 'Greeting', intent: 'greet', bestFor: ['hello'] },
      { id: 'Pose', intent: 'idle', bestFor: ['neutral speaking'] },
      { id: 'Apologize', intent: 'Apologize', bestFor: ['apologize'] },
    ],
  },
  metadata: {
    agentSetup: {
      voiceSampleFileName: 'reference.wav',
      voiceSampleSpeakerLabel: 'EN-US',
      codexCapabilityPolicy: {
        enabledPluginIds: [
          'google-drive@openai-curated',
          'browser-use@openai-bundled',
          'future-plugin_v2@openai-curated',
        ],
      },
    },
    agentIdentity: {
      mode: 'continuity',
      name: 'Jane',
      pronouns: 'she',
      personality: 'playful',
      interests: 'outgoing, sport',
      selfPrompt: 'dream about sky',
    },
  },
  turns: [
    {
      id: 'turn-0',
      transcript: 'Hello there',
      agentReply: {
        text: 'Hi.',
      },
    },
  ],
};

test('turn prompts keep startup setup heavy and resume turns compact', () => {
  const turn = { id: 'turn-1', transcript: 'How are you doing?' };
  const initialPrompt = buildInitialTurnPrompt({ session: SESSION_FIXTURE, turn });
  const resumePrompt = buildResumeTurnPrompt({ session: SESSION_FIXTURE, turn });

  assert.match(initialPrompt, /Return exactly one JSON object/);
  assert.match(initialPrompt, /^You are the speaking avatar agent in a live voice call\./);
  assert.match(initialPrompt, /Spoken agent identity:/);
  assert.match(initialPrompt, /Name: Jane/);
  assert.match(initialPrompt, /The human usually does not need your internal reasoning/);
  assert.match(initialPrompt, /Action policy:/);
  assert.match(initialPrompt, /Connected tools and apps available: google drive, browser use, future plugin v2\./);
  assert.match(initialPrompt, /Character model: Red Tinker Bell/);
  assert.match(initialPrompt, /followUps is optional and may contain 0 to 7 additional spoken segments/);
  assert.match(initialPrompt, /Valid gesture ids: Greeting, Pose, Apologize/);
  assert.doesNotMatch(initialPrompt, /subtitle is required/);
  assert.doesNotMatch(initialPrompt, /one-to-one agent room/);
  assert.match(resumePrompt, /Continue the same live voice call/);
  assert.match(resumePrompt, /Use the established session contract from startup/);
  assert.match(resumePrompt, /Do not give a talk-only answer/);
  assert.doesNotMatch(resumePrompt, /Spoken agent identity:/);
  assert.doesNotMatch(resumePrompt, /Character model:/);
  assert.match(resumePrompt, /Human: How are you doing\?/);
});

test('speculative turn prompt stays compact and aligned with resume turns', () => {
  const prompt = buildSpeculativeTurnPrompt({
    session: SESSION_FIXTURE,
    transcript: 'I want to save this to my drive',
  });

  assert.match(prompt, /Continue the same live voice call\./);
  assert.match(prompt, /Use the established session contract from startup\./);
  assert.match(prompt, /Human partial transcript so far: I want to save this to my drive/);
  assert.match(prompt, /Return exactly one JSON object and nothing else\./);
  assert.doesNotMatch(prompt, /Spoken agent identity:/);
  assert.doesNotMatch(prompt, /Character model:/);
  assert.doesNotMatch(prompt, /Recent conversation:/);
});

test('normalizeAgentReply keeps only allowed gestures and derives subtitles when omitted', () => {
  const allowedGestures = SESSION_FIXTURE.avatar.gestureCatalog;
  const normalized = normalizeAgentReply(
    JSON.stringify({
      spokenText: 'Hello there.',
      mood: 'warm',
      animationSequence: [
        { gestureId: 'Greeting', atRatio: 0 },
        { gestureId: 'Missing', atRatio: 0.5 },
      ],
      followUps: [
        {
          spokenText: 'Second beat.',
          mood: 'playful',
          pauseMs: 5000,
          animationSequence: [
            { gestureId: 'Pose', atRatio: 0.2 },
          ],
        },
      ],
    }),
    allowedGestures,
  );
  const fallback = normalizeAgentReply('Sorry about that.', allowedGestures);

  assert.equal(normalized.text, 'Hello there.');
  assert.equal(normalized.subtitle, 'Hello there.');
  assert.equal(normalized.animationSequence.length, 1);
  assert.equal(normalized.animationSequence[0].gestureId, 'Greeting');
  assert.equal(normalized.followUps.length, 1);
  assert.equal(normalized.followUps[0].text, 'Second beat.');
  assert.equal(normalized.followUps[0].subtitle, 'Second beat.');
  assert.equal(normalized.followUps[0].pauseMs, 5000);
  assert.equal(fallback.emoteId, 'warm');
  assert.ok(fallback.animationSequence.length >= 1);
});

test('direct codex agent normalizes the executor output into a speech action', async () => {
  let capturedWorkspaceRoot = '';
  const agent = createDirectCodexAgent({
    executor: {
      async checkHealth() {
        return { ok: true };
      },
      async resetSession() {},
      async startPrompt({ workspaceRoot }) {
        capturedWorkspaceRoot = workspaceRoot;
        return {
          requestId: 'req-1',
          abort() {
            return true;
          },
          promise: Promise.resolve({
            text: '{"spokenText":"Hi there.","mood":"playful","animationSequence":[{"gestureId":"Greeting","atRatio":0}]}',
            mode: 'initial',
          }),
        };
      },
    },
  });

  const handle = await agent.startReply({
    session: {
      ...SESSION_FIXTURE,
      metadata: {
        ...SESSION_FIXTURE.metadata,
        launch: {
          workspaceRoot: '/tmp/workspace-alpha',
        },
      },
    },
    turn: { id: 'turn-1', transcript: 'Say hello.' },
  });
  const reply = await handle.promise;

  assert.equal(handle.requestId, 'req-1');
  assert.equal(capturedWorkspaceRoot, '/tmp/workspace-alpha');
  assert.equal(reply.text, 'Hi there.');
  assert.equal(reply.emoteId, 'playful');
  assert.equal(reply.animationSequence[0].gestureId, 'Greeting');
});

test('direct codex agent warms the direct session during connecting and waits for it before the first reply', async () => {
  const warmupDeferred = createDeferred();
  const startCalls = [];
  const agent = createDirectCodexAgent({
    executor: {
      async checkHealth() {
        return { ok: true };
      },
      async resetSession() {},
      async startPrompt(options) {
        startCalls.push(options);
        if (startCalls.length === 1) {
          return {
            requestId: 'warmup-1',
            abort() {
              return true;
            },
            promise: warmupDeferred.promise,
          };
        }
        return {
          requestId: 'reply-1',
          abort() {
            return true;
          },
          promise: Promise.resolve({
            text: '{"spokenText":"Hi after warmup.","mood":"warm","animationSequence":[{"gestureId":"Greeting","atRatio":0}]}',
            mode: 'resume',
          }),
        };
      },
    },
  });

  const session = {
    ...SESSION_FIXTURE,
    metadata: {
      ...SESSION_FIXTURE.metadata,
      launch: {
        workspaceRoot: '/tmp/workspace-alpha',
      },
    },
  };

  const warmup = await agent.startSessionWarmup({ session });
  const replyHandlePromise = agent.startReply({
    session,
    turn: { id: 'turn-1', transcript: 'Say hello.' },
  });
  await Promise.resolve();

  assert.equal(warmup.started, true);
  assert.equal(startCalls.length, 1);
  assert.match(startCalls[0].initialPrompt, /No human has spoken yet\./);

  warmupDeferred.resolve({
    text: '{"spokenText":"Ready.","mood":"warm","animationSequence":[{"gestureId":"Pose","atRatio":0}]}',
    mode: 'initial',
  });
  const replyHandle = await replyHandlePromise;
  const reply = await replyHandle.promise;

  assert.equal(startCalls.length, 2);
  assert.equal(startCalls[1].sessionId, session.id);
  assert.match(startCalls[1].resumePrompt, /Continue the same live voice call\./);
  assert.equal(reply.runMode, 'resume');
  assert.equal(reply.text, 'Hi after warmup.');
});

test('direct codex agent preempts an unfinished warmup when the first human turn arrives', async () => {
  const startCalls = [];
  const resetCalls = [];
  const warmupDeferred = createDeferred();
  const agent = createDirectCodexAgent({
    executor: {
      async checkHealth() {
        return { ok: true };
      },
      async resetSession({ sessionId }) {
        resetCalls.push(sessionId);
      },
      async startPrompt(options) {
        startCalls.push(options);
        if (startCalls.length === 1) {
          return {
            requestId: 'warmup-1',
            abort() {
              warmupDeferred.reject(new Error('warmup superseded'));
              return true;
            },
            promise: warmupDeferred.promise,
          };
        }
        return {
          requestId: 'reply-1',
          abort() {
            return true;
          },
          promise: Promise.resolve({
            text: '{"spokenText":"Hi right away.","mood":"warm","animationSequence":[{"gestureId":"Greeting","atRatio":0}]}',
            mode: 'initial',
          }),
        };
      },
    },
  });

  const session = {
    ...SESSION_FIXTURE,
    metadata: {
      ...SESSION_FIXTURE.metadata,
      launch: {
        workspaceRoot: '/tmp/workspace-alpha',
      },
    },
  };

  const warmup = await agent.startSessionWarmup({ session });
  const replyHandle = await agent.startReply({
    session,
    turn: { id: 'turn-1', transcript: 'Say hello immediately.' },
  });
  const reply = await replyHandle.promise;

  assert.equal(warmup.started, true);
  assert.equal(resetCalls.length, 1);
  assert.equal(resetCalls[0], session.id);
  assert.equal(startCalls.length, 2);
  assert.match(startCalls[1].initialPrompt, /Human: Say hello immediately\./);
  assert.equal(reply.runMode, 'initial');
  assert.equal(reply.text, 'Hi right away.');
});

test('direct codex agent routes linked calls through the forked call executor and writes back a summary on finalize', async () => {
  const linkedCalls = [];
  const writeBacks = [];
  const agent = createDirectCodexAgent({
    executor: {
      async checkHealth() {
        return { ok: true };
      },
      async resetSession() {},
      async startPrompt() {
        throw new Error('manual executor should not be used for linked calls');
      },
    },
    linkedCallExecutor: {
      async startCallPrompt({ launchId, callSessionId, prompt, workspaceRoot }) {
        linkedCalls.push({ launchId, callSessionId, prompt, workspaceRoot });
        return {
          requestId: 'req-linked',
          abort() {
            return true;
          },
          promise: Promise.resolve({
            text: '{"spokenText":"I can help with that.","mood":"focused","animationSequence":[{"gestureId":"Pose","atRatio":0.2}]}',
            mode: 'resume',
          }),
        };
      },
      async runCallPrompt({ launchId, callSessionId, prompt, workspaceRoot }) {
        linkedCalls.push({ launchId, callSessionId, prompt, workspaceRoot, summary: true });
        return {
          text: 'We discussed the call link flow and agreed on the two-session model.',
          mode: 'resume',
        };
      },
      async writeBackSummary({ originalSessionId, prompt, workspaceRoot }) {
        writeBacks.push({ originalSessionId, prompt, workspaceRoot });
        return {
          text: 'Recorded in original thread.',
          mode: 'resume',
        };
      },
    },
  });

  const session = {
    ...SESSION_FIXTURE,
    title: 'talking-agent',
    metadata: {
      ...SESSION_FIXTURE.metadata,
      launch: {
        mode: 'linked-call',
        launchId: 'launch-123',
        originalSessionId: 'session-original',
        callSessionId: 'session-call',
        workspaceRoot: '/tmp/workspace-alpha',
      },
    },
    turns: [
      ...SESSION_FIXTURE.turns,
      {
        id: 'turn-1',
        transcript: 'Can you call me and summarize the flow?',
        agentReply: {
          text: 'Yes. I can summarize it when we finish.',
        },
      },
    ],
  };

  const handle = await agent.startReply({
    session,
    turn: { id: 'turn-2', transcript: 'What should happen at hang-up?' },
  });
  const reply = await handle.promise;
  const finalized = await agent.finalizeSession({
    session,
    reason: 'human ended call',
  });

  assert.equal(handle.requestId, 'req-linked');
  assert.equal(linkedCalls[0].launchId, 'launch-123');
  assert.equal(linkedCalls[0].callSessionId, 'session-call');
  assert.equal(linkedCalls[0].workspaceRoot, '/tmp/workspace-alpha');
  assert.equal(reply.text, 'I can help with that.');
  assert.match(linkedCalls[1].prompt, /Create a short summary/);
  assert.equal(finalized.summary, 'We discussed the call link flow and agreed on the two-session model.');
  assert.equal(writeBacks[0].originalSessionId, 'session-original');
  assert.match(writeBacks[0].prompt, /Keep this as a short record/);
});

test('direct codex agent exposes session event subscriptions when the executor supports them', () => {
  const calls = [];
  const agent = createDirectCodexAgent({
    executor: {
      checkHealth() {
        return { ok: true };
      },
      subscribeSessionEvents(options) {
        calls.push(options);
        return () => {
          calls.push({ unsubscribed: true, sessionId: options.sessionId });
        };
      },
    },
  });

  const listener = () => {};
  const unsubscribe = agent.subscribeSessionEvents({
    sessionId: 'session-alpha',
    listener,
  });
  unsubscribe();

  assert.equal(calls[0].sessionId, 'session-alpha');
  assert.equal(calls[0].listener, listener);
  assert.deepEqual(calls[1], {
    unsubscribed: true,
    sessionId: 'session-alpha',
  });
});
