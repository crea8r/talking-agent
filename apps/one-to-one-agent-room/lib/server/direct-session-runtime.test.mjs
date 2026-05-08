import test from 'node:test';
import assert from 'node:assert/strict';

import { createDirectSessionRuntime } from './direct-session-runtime.mjs';

function createRuntime() {
  const activeAborts = [];
  const runtime = createDirectSessionRuntime({
    agentRunner: {
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
