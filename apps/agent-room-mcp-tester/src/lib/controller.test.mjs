import test from 'node:test';
import assert from 'node:assert/strict';

import { createAppStore } from './store.js';
import { createController } from './controller.js';

test('auto ack finishes speech actions and completes animation actions', async () => {
  const posts = [];
  const store = createAppStore();
  store.setBridgePayload({
    session: { id: 'session-1' },
    inspector: null,
    pendingActions: [
      { actionId: 'a1', type: 'anim' },
      { actionId: 'a2', type: 'speech', text: 'Hello' },
    ],
  });
  store.setAutoAck(true);

  const controller = createController({
    store,
    fetchJson: async () => ({ ok: true }),
    postJson: async (url) => {
      posts.push(url);
      return {
        session: { id: 'session-1' },
        inspector: null,
        pendingActions: [],
      };
    },
    render() {},
    createRecognition: null,
  });

  await controller.consumePendingActions();

  assert.deepEqual(posts, [
    '/api/bridge/sessions/session-1/actions/a1/completed',
    '/api/bridge/sessions/session-1/actions/a2/started',
    '/api/bridge/sessions/session-1/actions/a2/finished',
  ]);
});

test('typed final transcript writes directly to the bridge', async () => {
  const posts = [];
  const store = createAppStore();
  store.setBridgePayload({
    session: { id: 'session-9' },
    inspector: null,
    pendingActions: [],
  });

  const controller = createController({
    store,
    fetchJson: async () => ({ ok: true }),
    postJson: async (url, body) => {
      posts.push({ url, body });
      return {
        session: { id: 'session-9' },
        inspector: null,
        pendingActions: [],
      };
    },
    render() {},
    createRecognition: null,
  });

  await controller.finalizeTranscript('hello world', {
    source: 'typed',
    humanIdentity: 'tester-human',
    humanName: 'Tester Human',
  });

  assert.equal(posts[0].url, '/api/bridge/sessions/session-9/utterances/start');
  assert.equal(posts[1].url, '/api/bridge/sessions/session-9/utterances/final');
  assert.equal(posts[1].body.text, 'hello world');
});

test('startSession captures initialize, tools/list, and join_call exposure', async () => {
  const posts = [];
  const store = createAppStore();

  const controller = createController({
    store,
    fetchJson: async (url) => {
      if (url === '/api/mcp/state') {
        return { state: { connected: false } };
      }

      if (url === '/api/mcp/transcript') {
        return { transcript: [] };
      }

      if (url === '/api/bridge/sessions/session-42') {
        return {
          session: {
            id: 'session-42',
            title: 'MCP Tester',
            state: 'live',
            lastAgentReply: null,
            turns: [],
            agent: { id: 'preview-agent', label: 'Preview Agent' },
          },
          inspector: { recentEvents: [] },
          pendingActions: [],
        };
      }

      return { ok: true };
    },
    postJson: async (url, body) => {
      posts.push({ url, body });

      if (url === '/api/mcp/reset') {
        return {
          state: { connected: false, pid: null, transcriptCount: 0, pendingCount: 0, stateFilePath: '/tmp/test.json', lastError: null },
          transcript: [],
        };
      }

      if (url === '/api/bridge/sessions') {
        return {
          session: { id: 'session-42', title: 'MCP Tester', state: 'waiting' },
          inspector: null,
          pendingActions: [],
        };
      }

      if (url === '/api/bridge/sessions/session-42/state') {
        return {
          session: { id: 'session-42', title: 'MCP Tester', state: 'live' },
          inspector: null,
          pendingActions: [],
        };
      }

      if (url === '/api/mcp/connect') {
        return {
          state: { connected: true, pid: 1001, transcriptCount: 0, pendingCount: 0, stateFilePath: '/tmp/test.json', lastError: null },
          transcript: [],
        };
      }

      if (url === '/api/mcp/request' && body.method === 'initialize') {
        return {
          response: {
            jsonrpc: '2.0',
            id: 1,
            result: { serverInfo: { name: 'talking-agent-room-bridge' } },
          },
          state: { connected: true, pid: 1001, transcriptCount: 1, pendingCount: 0, stateFilePath: '/tmp/test.json', lastError: null },
          transcript: [{ direction: 'request', payload: body }],
        };
      }

      if (url === '/api/mcp/request' && body.method === 'notifications/initialized') {
        return {
          response: null,
          state: { connected: true, pid: 1001, transcriptCount: 2, pendingCount: 0, stateFilePath: '/tmp/test.json', lastError: null },
          transcript: [{ direction: 'request', payload: body }],
        };
      }

      if (url === '/api/mcp/request' && body.method === 'tools/list') {
        return {
          response: {
            jsonrpc: '2.0',
            id: 2,
            result: {
              tools: [{ name: 'join_call', description: 'Attach agent.' }],
            },
          },
          state: { connected: true, pid: 1001, transcriptCount: 3, pendingCount: 0, stateFilePath: '/tmp/test.json', lastError: null },
          transcript: [{ direction: 'request', payload: body }],
        };
      }

      if (url === '/api/mcp/request' && body.params?.name === 'join_call') {
        return {
          response: {
            jsonrpc: '2.0',
            id: 3,
            result: {
              structuredContent: {
                callId: 'session-42',
                cursor: '9',
              },
            },
          },
          state: { connected: true, pid: 1001, transcriptCount: 4, pendingCount: 0, stateFilePath: '/tmp/test.json', lastError: null },
          transcript: [{ direction: 'request', payload: body }],
        };
      }

      throw new Error(`Unexpected request: ${url}`);
    },
    render() {},
    createRecognition: null,
  });

  await controller.startSession({
    title: 'MCP Tester',
    humanIdentity: 'tester-human',
    humanName: 'Tester Human',
    agentId: 'preview-agent',
    agentLabel: 'Preview Agent',
  });

  assert.equal(store.state.localAgentCursor, '9');
  assert.equal(store.state.bootstrapDebug.initializeRequest.method, 'initialize');
  assert.equal(store.state.bootstrapDebug.toolsListResponse.result.tools[0].name, 'join_call');
  assert.equal(store.state.bootstrapDebug.joinCallResponse.result.structuredContent.callId, 'session-42');

  assert.deepEqual(
    posts.map((entry) => entry.url),
    [
      '/api/mcp/reset',
      '/api/bridge/sessions',
      '/api/bridge/sessions/session-42/state',
      '/api/mcp/connect',
      '/api/mcp/request',
      '/api/mcp/request',
      '/api/mcp/request',
      '/api/mcp/request',
    ],
  );
});

test('sendTurnAndPreview stores the exact wait_for_events request and response', async () => {
  const posts = [];
  const store = createAppStore();
  store.setBridgePayload({
    session: { id: 'session-55' },
    inspector: null,
    pendingActions: [],
  });
  store.setMcpSnapshot({
    state: {
      connected: true,
      pid: 1002,
      transcriptCount: 0,
      pendingCount: 0,
      stateFilePath: '/tmp/test.json',
      lastError: null,
    },
    transcript: [],
  });
  store.setLocalAgentCursor('3');

  const controller = createController({
    store,
    fetchJson: async () => ({
      session: { id: 'session-55', lastAgentReply: null, turns: [] },
      inspector: { recentEvents: [] },
      pendingActions: [],
    }),
    postJson: async (url, body) => {
      posts.push({ url, body });

      if (url === '/api/bridge/sessions/session-55/utterances/start') {
        return {
          session: { id: 'session-55' },
          inspector: null,
          pendingActions: [],
        };
      }

      if (url === '/api/bridge/sessions/session-55/utterances/final') {
        return {
          session: { id: 'session-55' },
          inspector: null,
          pendingActions: [],
        };
      }

      if (url === '/api/mcp/request' && body.params?.name === 'wait_for_events') {
        return {
          response: {
            jsonrpc: '2.0',
            id: 10,
            result: {
              structuredContent: {
                callId: 'session-55',
                nextCursor: '5',
                events: [
                  { id: 'evt-4', type: 'utt.final', text: 'hello there' },
                ],
              },
            },
          },
          state: {
            connected: true,
            pid: 1002,
            transcriptCount: 1,
            pendingCount: 0,
            stateFilePath: '/tmp/test.json',
            lastError: null,
          },
          transcript: [{ direction: 'request', payload: body }],
        };
      }

      throw new Error(`Unexpected request: ${url}`);
    },
    render() {},
    createRecognition: null,
  });

  await controller.sendTurnAndPreview({
    text: 'hello there',
    humanIdentity: 'tester-human',
    humanName: 'Tester Human',
  });

  assert.equal(store.state.localAgentCursor, '5');
  assert.equal(store.state.lastEventDebug.request.params.name, 'wait_for_events');
  assert.equal(store.state.lastEventDebug.response.result.structuredContent.events[0].type, 'utt.final');
  assert.equal(posts[2].url, '/api/mcp/request');
});
