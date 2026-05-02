import test from 'node:test';
import assert from 'node:assert/strict';

import { createAppStore } from './store.js';

test('store tracks bridge events and pending actions separately', () => {
  const store = createAppStore();
  store.pushHumanLog({ kind: 'partial', text: 'hello' });
  store.setMcpSnapshot({
    transcript: [{ direction: 'request', payload: { method: 'tools/list' } }],
    state: {
      connected: true,
      pid: 42,
      transcriptCount: 1,
      pendingCount: 0,
      stateFilePath: '/tmp/test.json',
      lastError: null,
    },
  });
  store.setBridgePayload({
    session: { id: 'session-1', state: 'live' },
    inspector: { recentEvents: [] },
    pendingActions: [{ actionId: 'a1', type: 'speech' }],
  });

  assert.equal(store.state.humanLog.length, 1);
  assert.equal(store.state.mcpTranscript.length, 1);
  assert.equal(store.state.pendingActions.length, 1);
  assert.equal(store.state.session.id, 'session-1');
});
