import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AGENT_READY_WINDOW_MS,
  buildAgentChatPrompt,
  buildAgentConnectGuide,
  buildCallSessionKey,
  buildDefaultCallForm,
  getCallTitle,
  getCallPrimaryAction,
  getAgentHeartbeatState,
  normalizeSessionForUi,
  shouldReplaceLegacyCallValue,
} from './call-session.js';

test('getCallTitle prefers the session title and falls back to the project name', () => {
  assert.equal(
    getCallTitle({ title: 'workspace-alpha' }, { codexProjectName: 'talking-agent' }),
    'workspace-alpha',
  );
  assert.equal(getCallTitle(null, { codexProjectName: 'talking-agent' }), 'talking-agent');
  assert.equal(getCallTitle(null, null), 'Codex Project');
});

test('buildCallSessionKey only depends on the call-defining fields', () => {
  const first = buildCallSessionKey(
    {
      livekitUrl: 'ws://127.0.0.1:7880',
      roomName: 'app4-one-to-one-room',
      identity: 'human-123',
      participantName: 'ignored',
    },
    { codexProjectName: 'talking-agent' },
  );
  const second = buildCallSessionKey(
    {
      livekitUrl: 'ws://127.0.0.1:7880',
      roomName: 'app4-one-to-one-room',
      identity: 'human-123',
      participantName: 'still ignored',
    },
    { codexProjectName: 'talking-agent' },
  );

  assert.equal(first, second);
});

test('getAgentHeartbeatState marks recent heartbeats as ready and old ones as stale', () => {
  const now = Date.now();
  const ready = getAgentHeartbeatState(
    {
      id: 'session-1',
      agent: {
        id: 'codex-openai',
        label: 'Codex OpenAI',
        lastSeenAt: new Date(now - 2_000).toISOString(),
      },
    },
    now,
  );
  const stale = getAgentHeartbeatState(
    {
      id: 'session-1',
      agent: {
        id: 'codex-openai',
        label: 'Codex OpenAI',
        lastSeenAt: new Date(now - AGENT_READY_WINDOW_MS - 1_000).toISOString(),
      },
    },
    now,
  );

  assert.equal(ready.status, 'ready');
  assert.equal(ready.ready, true);
  assert.equal(stale.status, 'stale');
  assert.equal(stale.ready, false);
});

test('normalizeSessionForUi preserves stale heartbeats but clears incomplete or future-dated ones', () => {
  const now = Date.now();

  const stale = normalizeSessionForUi(
    {
      id: 'session-1',
      agent: {
        id: 'codex-openai',
        label: 'Codex OpenAI',
        lastSeenAt: new Date(now - AGENT_READY_WINDOW_MS - 1_000).toISOString(),
      },
    },
    now,
  );
  const missingId = normalizeSessionForUi(
    {
      id: 'session-1',
      agent: {
        id: '',
        label: 'Codex OpenAI',
        lastSeenAt: new Date(now - 2_000).toISOString(),
      },
    },
    now,
  );
  const future = normalizeSessionForUi(
    {
      id: 'session-1',
      agent: {
        id: 'codex-openai',
        label: 'Codex OpenAI',
        lastSeenAt: new Date(now + 60_000).toISOString(),
      },
    },
    now,
  );

  assert.equal(stale.agent.id, 'codex-openai');
  assert.match(stale.agent.lastSeenAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(missingId.agent.id, null);
  assert.match(missingId.agent.lastSeenAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(future.agent.id, null);
  assert.equal(future.agent.lastSeenAt, null);
});

test('getCallPrimaryAction switches from connect agent to start room after heartbeat', () => {
  const now = Date.now();

  const waiting = getCallPrimaryAction({
    session: {
      id: 'session-1',
      agent: {
        label: 'Codex OpenAI',
        lastSeenAt: null,
      },
    },
    sessionPreparing: false,
    modelLoading: false,
    room: null,
    formReady: true,
    now,
  });

  const ready = getCallPrimaryAction({
    session: {
      id: 'session-1',
      agent: {
        id: 'codex-openai',
        label: 'Codex OpenAI',
        lastSeenAt: new Date(now - 2_000).toISOString(),
      },
    },
    sessionPreparing: false,
    modelLoading: false,
    room: null,
    formReady: true,
    now,
  });

  assert.deepEqual(waiting, {
    mode: 'connect-agent',
    label: 'Connect Agent',
    disabled: false,
  });
  assert.deepEqual(ready, {
    mode: 'start-room',
    label: 'Start Room',
    disabled: false,
  });
});

test('getCallPrimaryAction keeps connect agent when the heartbeat has no agent id', () => {
  const now = Date.now();

  const action = getCallPrimaryAction({
    session: {
      id: 'session-1',
      agent: {
        id: null,
        label: 'Codex OpenAI',
        lastSeenAt: new Date(now - 2_000).toISOString(),
      },
    },
    sessionPreparing: false,
    modelLoading: false,
    room: null,
    formReady: true,
    now,
  });

  assert.deepEqual(action, {
    mode: 'connect-agent',
    label: 'Connect Agent',
    disabled: false,
  });
});

test('getCallPrimaryAction enables connect agent before the bridge session exists', () => {
  const action = getCallPrimaryAction({
    session: null,
    sessionPreparing: false,
    modelLoading: false,
    room: null,
    formReady: true,
  });

  assert.deepEqual(action, {
    mode: 'connect-agent',
    label: 'Connect Agent',
    disabled: false,
  });
});

test('getCallPrimaryAction keeps connect agent enabled while the bridge session is preparing', () => {
  const action = getCallPrimaryAction({
    session: null,
    sessionPreparing: true,
    modelLoading: false,
    room: null,
    formReady: true,
  });

  assert.deepEqual(action, {
    mode: 'connect-agent',
    label: 'Connect Agent',
    disabled: false,
  });
});

test('getCallPrimaryAction keeps connect agent enabled while the avatar is still loading', () => {
  const action = getCallPrimaryAction({
    session: null,
    sessionPreparing: false,
    modelLoading: true,
    room: null,
    formReady: true,
  });

  assert.deepEqual(action, {
    mode: 'connect-agent',
    label: 'Connect Agent',
    disabled: false,
  });
});

test('getCallPrimaryAction keeps connect agent enabled even before the form is complete', () => {
  const action = getCallPrimaryAction({
    session: null,
    sessionPreparing: false,
    modelLoading: false,
    room: null,
    formReady: false,
  });

  assert.deepEqual(action, {
    mode: 'connect-agent',
    label: 'Connect Agent',
    disabled: false,
  });
});

test('buildAgentConnectGuide includes session-specific connect steps', () => {
  const guide = buildAgentConnectGuide({
    session: {
      id: 'session-1',
      title: 'talking-agent',
      agent: {
        label: 'Codex OpenAI',
      },
    },
    runtimeConfig: {
      codexProjectName: 'talking-agent',
      codexProjectPath: '/repo/talking-agent',
      bridge: {
        stateFilePath: '/repo/talking-agent/output/one-to-one-agent-room-bridge.json',
        mcpServerCommand: 'node packages/agent-room-bridge/mcp-server.mjs',
      },
    },
  });

  assert.match(guide, /Project: talking-agent/);
  assert.match(guide, /Session: session-1/);
  assert.match(guide, /join_call/);
  assert.match(guide, /wait_for_events/);
  assert.match(guide, /publish_actions/);
});

test('buildAgentChatPrompt creates a paste-ready instruction block for the agent chat', () => {
  const prompt = buildAgentChatPrompt({
    session: {
      id: 'session-1',
      title: 'talking-agent',
      agent: {
        label: 'Codex OpenAI',
      },
    },
    runtimeConfig: {
      codexProjectName: 'talking-agent',
      codexProjectPath: '/repo/talking-agent',
      bridge: {
        stateFilePath: '/repo/talking-agent/output/one-to-one-agent-room-bridge.json',
        mcpServerCommand: 'node packages/agent-room-bridge/mcp-server.mjs',
      },
    },
  });

  assert.match(prompt, /You are connecting to the one-to-one agent room for project "talking-agent"\./);
  assert.match(prompt, /Session ID: session-1/);
  assert.match(prompt, /Start this MCP server:/);
  assert.match(prompt, /join_call/);
  assert.match(prompt, /wait_for_events/);
  assert.match(prompt, /publish_actions/);
});

test('buildAgentConnectGuide tolerates a null runtime config during early boot', () => {
  const guide = buildAgentConnectGuide({
    session: null,
    runtimeConfig: null,
  });

  assert.match(guide, /Project: Codex Project/);
  assert.match(guide, /Session: waiting for session/);
  assert.match(guide, /MCP command unavailable/);
});

test('buildDefaultCallForm derives stable project-based call defaults', () => {
  const defaults = buildDefaultCallForm({
    runtimeConfig: {
      codexProjectName: 'talking-agent',
      livekitUrl: 'ws://127.0.0.1:7880',
    },
  });

  assert.deepEqual(defaults, {
    livekitUrl: 'ws://127.0.0.1:7880',
    roomName: 'talking-agent-call',
    identity: 'human-room-host',
    participantName: 'Human Caller',
    enableCamera: true,
    enableMicrophone: true,
  });
});

test('buildDefaultCallForm tolerates a null runtime config', () => {
  const defaults = buildDefaultCallForm({
    runtimeConfig: null,
  });

  assert.deepEqual(defaults, {
    livekitUrl: 'ws://127.0.0.1:7880',
    roomName: 'codex-project-call',
    identity: 'human-room-host',
    participantName: 'Human Caller',
    enableCamera: true,
    enableMicrophone: true,
  });
});

test('shouldReplaceLegacyCallValue catches the old generic room and random identity', () => {
  assert.equal(shouldReplaceLegacyCallValue('roomName', 'app4-one-to-one-room'), true);
  assert.equal(shouldReplaceLegacyCallValue('identity', 'human-a1b2c3'), true);
  assert.equal(shouldReplaceLegacyCallValue('roomName', 'talking-agent-call'), false);
  assert.equal(shouldReplaceLegacyCallValue('identity', 'human-room-host'), false);
});
