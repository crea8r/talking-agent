import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';

import {
  persistCurrentSessionSnapshot,
  persistSessionPayload,
} from './session-persistence.mjs';

test('persistSessionPayload writes the session report atomically under the session directory', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'one-to-one-agent-room-session-'));
  const payload = {
    session: {
      id: 'session-1',
      state: 'live',
      turns: [{ id: 'turn-1', transcript: 'Hello' }],
    },
  };

  await persistSessionPayload({ rootDir, payload });
  await persistSessionPayload({
    rootDir,
    payload: {
      session: {
        id: 'session-1',
        state: 'ended',
        turns: [{ id: 'turn-1', transcript: 'Hello again' }],
      },
    },
  });

  const sessionDir = path.join(rootDir, 'session-1');
  const files = (await readdir(sessionDir)).sort();
  const savedPayload = JSON.parse(
    await readFile(path.join(sessionDir, 'session-report.json'), 'utf8'),
  );

  assert.deepEqual(files, ['session-report.json']);
  assert.equal(savedPayload.session.state, 'ended');
  assert.equal(savedPayload.session.turns[0].transcript, 'Hello again');
});

test('persistCurrentSessionSnapshot fetches the latest session payload before saving it', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'one-to-one-agent-room-session-'));
  const sessionRuntime = {
    async getSession(sessionId) {
      return {
        session: {
          id: sessionId,
          state: 'error',
          turns: [
            {
              id: 'turn-9',
              status: 'error',
              errorText: 'Codex request timed out after 45000ms.',
            },
          ],
        },
      };
    },
  };

  const payload = await persistCurrentSessionSnapshot({
    sessionRuntime,
    rootDir,
    sessionId: 'session-9',
  });
  const savedPayload = JSON.parse(
    await readFile(path.join(rootDir, 'session-9', 'session-report.json'), 'utf8'),
  );

  assert.equal(payload.session.turns[0].errorText, 'Codex request timed out after 45000ms.');
  assert.equal(savedPayload.session.turns[0].errorText, 'Codex request timed out after 45000ms.');
});
