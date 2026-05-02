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
