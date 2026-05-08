import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';

import { createCallRecordStore } from './index.mjs';

test('call record store persists original and call session ids for a launch record', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'call-record-store-'));
  const store = createCallRecordStore({ rootDir });

  const created = await store.createRecord({
    launchId: 'launch-123',
    originalSessionId: 'session-original',
    callSessionId: 'session-call',
    workspaceRoot: '/Users/hieu/Work/crea8r/talking-agent',
    displayTitle: 'talking-agent',
    status: 'ready',
  });

  const loaded = await store.loadRecord({ launchId: 'launch-123' });

  assert.equal(created.originalSessionId, 'session-original');
  assert.equal(created.callSessionId, 'session-call');
  assert.equal(loaded.workspaceRoot, '/Users/hieu/Work/crea8r/talking-agent');
  assert.equal(loaded.status, 'ready');
});

test('call record store keeps the summary for ended calls', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'call-record-store-'));
  const store = createCallRecordStore({ rootDir });

  await store.createRecord({
    launchId: 'launch-123',
    originalSessionId: 'session-original',
    callSessionId: 'session-call',
    workspaceRoot: '/Users/hieu/Work/crea8r/talking-agent',
    displayTitle: 'talking-agent',
    status: 'ready',
  });

  const ended = await store.updateRecord({
    launchId: 'launch-123',
    patch: {
      status: 'ended',
      summary: 'Discussed the linked call flow and next implementation steps.',
      endedAt: '2026-05-08T10:00:00.000Z',
    },
  });

  assert.equal(ended.status, 'ended');
  assert.equal(ended.summary, 'Discussed the linked call flow and next implementation steps.');
  assert.equal(ended.endedAt, '2026-05-08T10:00:00.000Z');
});
