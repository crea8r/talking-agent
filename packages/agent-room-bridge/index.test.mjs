import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createAgentRoomBridgeStore } from './index.mjs';

function createStateFilePath(name) {
  return path.join('/private/tmp', `agent-room-bridge-${name}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
}

test('createSession reuses the matching session for the same call identity', async () => {
  const store = createAgentRoomBridgeStore({
    stateFilePath: createStateFilePath('reuse'),
  });

  const first = await store.createSession({
    title: 'talking-agent',
    roomName: 'talking-agent-call',
    livekitUrl: 'ws://127.0.0.1:7880',
    humanIdentity: 'human-room-host',
    humanName: 'Human Caller',
    metadata: {
      app: 'one-to-one-agent-room',
    },
  });

  const second = await store.createSession({
    title: 'talking-agent',
    roomName: 'talking-agent-call',
    livekitUrl: 'ws://127.0.0.1:7880',
    humanIdentity: 'human-room-host',
    humanName: 'Human Caller',
    metadata: {
      app: 'one-to-one-agent-room',
      codexProjectName: 'talking-agent',
    },
  });

  const sessions = await store.listSessions();

  assert.equal(second.id, first.id);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].metadata.codexProjectName, 'talking-agent');
});

test('createSession prefers the matching session with an active agent heartbeat', async () => {
  const store = createAgentRoomBridgeStore({
    stateFilePath: createStateFilePath('heartbeat'),
  });

  const first = await store.createSession({
    title: 'talking-agent',
    roomName: 'talking-agent-call',
    livekitUrl: 'ws://127.0.0.1:7880',
    humanIdentity: 'human-room-host',
    humanName: 'Human Caller',
    metadata: {
      app: 'one-to-one-agent-room',
    },
  });

  await store.heartbeatAgent({
    sessionId: first.id,
    agentId: 'codex-openai',
    agentLabel: 'Codex OpenAI',
  });

  const second = await store.createSession({
    title: 'talking-agent',
    roomName: 'talking-agent-call',
    livekitUrl: 'ws://127.0.0.1:7880',
    humanIdentity: 'human-room-host',
    humanName: 'Human Caller',
    metadata: {
      app: 'one-to-one-agent-room',
    },
  });

  assert.equal(second.id, first.id);
  assert.equal(second.agent.id, 'codex-openai');
  assert.ok(second.agent.lastSeenAt);
});

test('listSessions clears stale agent heartbeat details from the snapshot', async () => {
  const stateFilePath = createStateFilePath('stale-agent');
  const store = createAgentRoomBridgeStore({
    stateFilePath,
  });

  const session = await store.createSession({
    title: 'talking-agent',
    roomName: 'talking-agent-call',
    livekitUrl: 'ws://127.0.0.1:7880',
    humanIdentity: 'human-room-host',
    humanName: 'Human Caller',
    metadata: {
      app: 'one-to-one-agent-room',
    },
  });

  await store.heartbeatAgent({
    sessionId: session.id,
    agentId: 'codex-openai',
    agentLabel: 'Codex OpenAI',
  });

  const raw = JSON.parse(await readFile(stateFilePath, 'utf8'));
  raw.sessions[session.id].agent.lastSeenAt = new Date(Date.now() - 60_000).toISOString();
  await writeFile(stateFilePath, JSON.stringify(raw, null, 2));

  const sessions = await store.listSessions();
  const snapshot = sessions.find((entry) => entry.id === session.id);

  assert.equal(snapshot.agent.id, null);
  assert.equal(snapshot.agent.lastSeenAt, null);
  assert.equal(snapshot.agent.label, 'Codex OpenAI');
});

test('joinCall returns the active call cursor and avatar catalog metadata', async () => {
  const store = createAgentRoomBridgeStore({
    stateFilePath: createStateFilePath('join'),
  });

  const call = await store.createSession({
    title: 'talking-agent',
    roomName: 'talking-agent-call',
    livekitUrl: 'ws://127.0.0.1:7880',
    humanIdentity: 'human-room-host',
    humanName: 'Human Caller',
    metadata: {
      app: 'one-to-one-agent-room',
    },
  });

  await store.syncAvatarCatalog({
    sessionId: call.id,
    activeModelId: 'bhf-1-2',
    catalogVersion: 'avatar-v1',
    catalogUri: 'avatar://catalog/bhf-1-2',
  });

  const joined = await store.joinCall({
    agentId: 'codex-openai',
    agentLabel: 'Codex OpenAI',
  });

  assert.equal(joined.callId, call.id);
  assert.equal(joined.activeModelId, 'bhf-1-2');
  assert.equal(joined.avatarCatalogUri, 'avatar://catalog/bhf-1-2');
  assert.equal(joined.avatarCatalogVersion, 'avatar-v1');
  assert.match(joined.cursor, /^\d+$/);
});

test('waitForEvents returns partial and final utterance events in cursor order', async () => {
  const store = createAgentRoomBridgeStore({
    stateFilePath: createStateFilePath('events'),
  });

  const call = await store.createSession({
    title: 'talking-agent',
    roomName: 'talking-agent-call',
    livekitUrl: 'ws://127.0.0.1:7880',
    humanIdentity: 'human-room-host',
    humanName: 'Human Caller',
    metadata: {
      app: 'one-to-one-agent-room',
    },
  });

  await store.appendUserUtteranceStart({
    sessionId: call.id,
    utteranceId: 'u1',
  });
  await store.appendUserUtterancePartial({
    sessionId: call.id,
    utteranceId: 'u1',
    delta: 'hello',
  });
  await store.appendUserUtteranceFinal({
    sessionId: call.id,
    utteranceId: 'u1',
    text: 'hello there',
    humanIdentity: 'human-room-host',
    humanName: 'Human Caller',
  });

  await store.joinCall({
    agentId: 'codex-openai',
    agentLabel: 'Codex OpenAI',
  });

  const result = await store.waitForEvents({
    callId: call.id,
    cursor: '0',
    maxEvents: 10,
    waitMs: 0,
  });

  assert.deepEqual(
    result.events.map((event) => event.type),
    ['utt.start', 'utt.partial', 'utt.final', 'call.joined'],
  );
  assert.equal(result.events[0].uttId, 'u1');
  assert.equal(result.events[1].delta, 'hello');
  assert.equal(result.events[2].text, 'hello there');
});

test('publishActions is idempotent by actionId and exposes pending browser actions once', async () => {
  const store = createAgentRoomBridgeStore({
    stateFilePath: createStateFilePath('actions'),
  });

  const call = await store.createSession({
    title: 'talking-agent',
    roomName: 'talking-agent-call',
    livekitUrl: 'ws://127.0.0.1:7880',
    humanIdentity: 'human-room-host',
    humanName: 'Human Caller',
    metadata: {
      app: 'one-to-one-agent-room',
    },
  });

  await store.appendUserUtteranceFinal({
    sessionId: call.id,
    utteranceId: 'u2',
    text: 'what is next',
    humanIdentity: 'human-room-host',
    humanName: 'Human Caller',
  });

  await store.publishActions({
    callId: call.id,
    actions: [
      {
        actionId: 'a1',
        type: 'anim',
        gestureId: 'Thinking',
        emoteId: 'focused',
      },
      {
        actionId: 'a2',
        type: 'speech',
        text: 'Let me think about that.',
        characterId: 'ava',
        mood: 'focused',
      },
    ],
  });

  await store.publishActions({
    callId: call.id,
    actions: [
      {
        actionId: 'a1',
        type: 'anim',
        gestureId: 'Thinking',
        emoteId: 'focused',
      },
      {
        actionId: 'a2',
        type: 'speech',
        text: 'Let me think about that.',
        characterId: 'ava',
        mood: 'focused',
      },
    ],
  });

  const pending = await store.listPendingActions({
    sessionId: call.id,
  });

  assert.equal(pending.actions.length, 2);
  assert.deepEqual(
    pending.actions.map((action) => action.actionId),
    ['a1', 'a2'],
  );

  const session = await store.getSession(call.id);
  assert.equal(session.turns[0].agentReply.text, 'Let me think about that.');
  assert.equal(session.turns[0].agentReply.gestureId, 'Thinking');
  assert.equal(session.turns[0].agentReply.emoteId, 'focused');
  assert.equal(pending.actions[1].characterId, 'ava');
  assert.equal(pending.actions[1].mood, 'focused');
  assert.equal(session.turns[0].agentReply.characterId, 'ava');
  assert.equal(session.turns[0].agentReply.mood, 'focused');
});
