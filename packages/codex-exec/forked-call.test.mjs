import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';

import { createForkedCallExecutor } from './index.mjs';

async function seedSourceCodexHome(rootDir, originalSessionId) {
  const sourceCodexHome = path.join(rootDir, 'source-codex-home');
  const sessionDir = path.join(sourceCodexHome, 'sessions', '2026', '05', '08');
  await mkdir(sessionDir, { recursive: true });
  await writeFile(path.join(sourceCodexHome, 'auth.json'), '{"ok":true}');
  await writeFile(path.join(sourceCodexHome, 'installation_id'), 'codex-exec-test');
  await writeFile(
    path.join(sourceCodexHome, 'session_index.jsonl'),
    `${JSON.stringify({
      id: originalSessionId,
      thread_name: 'Original coding thread',
      updated_at: '2026-05-08T10:00:00.000Z',
    })}\n`,
  );
  await writeFile(
    path.join(sessionDir, `rollout-2026-05-08T10-00-00-${originalSessionId}.jsonl`),
    [
      JSON.stringify({
        timestamp: '2026-05-08T10:00:00.000Z',
        type: 'session_meta',
        payload: {
          id: originalSessionId,
          timestamp: '2026-05-08T10:00:00.000Z',
          cwd: '/Users/hieu/Work/crea8r/talking-agent',
          source: 'desktop',
        },
      }),
      JSON.stringify({
        timestamp: '2026-05-08T10:01:00.000Z',
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'Help me implement app4.' }],
        },
      }),
      '',
    ].join('\n'),
  );

  return sourceCodexHome;
}

test('forked call executor clones the source session, mints a call session id, and seeds the bootstrap prompt', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codex-forked-call-'));
  const originalSessionId = 'session-original';
  const sourceCodexHome = await seedSourceCodexHome(tempDir, originalSessionId);
  const workspaceRoot = path.join(tempDir, 'workspace-root');
  await mkdir(workspaceRoot, { recursive: true });

  const calls = [];
  const executor = createForkedCallExecutor({
    rootDir: path.join(tempDir, 'runner-root'),
    sourceCodexHome,
    spawnCodex(command, args, options) {
      calls.push({ command, args, options });
      const outputFilePath = args[args.indexOf('-o') + 1];
      return {
        stdout: { on() {} },
        stderr: { on() {} },
        once(eventName, handler) {
          if (eventName === 'exit') {
            void writeFile(outputFilePath, 'Bootstrap complete.').then(() => handler(0, null));
          }
        },
        kill() {},
      };
    },
  });

  const created = await executor.createCallSession({
    launchId: 'launch-123',
    originalSessionId,
    workspaceRoot,
    bootstrapPrompt: 'You are now on a voice call.',
  });

  assert.equal(created.launchId, 'launch-123');
  assert.notEqual(created.callSessionId, originalSessionId);
  assert.match(created.callCodexHomeDir, /launch-123\/codex-home$/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.cwd, workspaceRoot);
  assert.equal(calls[0].options.env.CODEX_HOME, created.callCodexHomeDir);
  assert.equal(calls[0].args.includes('resume'), true);
  assert.equal(calls[0].args.includes(created.callSessionId), true);
  assert.equal(calls[0].args.at(-1), 'You are now on a voice call.');

  const sessionIndex = await readFile(path.join(created.callCodexHomeDir, 'session_index.jsonl'), 'utf8');
  assert.match(sessionIndex, new RegExp(created.callSessionId));

  const sessionMeta = await readFile(created.callSessionFilePath, 'utf8');
  assert.match(sessionMeta, new RegExp(`"id":"${created.callSessionId}"`));
  assert.match(sessionMeta, new RegExp(`"forked_from_id":"${originalSessionId}"`));
});

test('forked call executor writes back the call note to the original session and tears down the call home', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codex-forked-call-'));
  const originalSessionId = 'session-original';
  const sourceCodexHome = await seedSourceCodexHome(tempDir, originalSessionId);
  const workspaceRoot = path.join(tempDir, 'workspace-root');
  await mkdir(workspaceRoot, { recursive: true });

  const calls = [];
  const executor = createForkedCallExecutor({
    rootDir: path.join(tempDir, 'runner-root'),
    sourceCodexHome,
    spawnCodex(command, args, options) {
      calls.push({ command, args, options });
      const outputFilePath = args[args.indexOf('-o') + 1];
      return {
        stdout: { on() {} },
        stderr: { on() {} },
        once(eventName, handler) {
          if (eventName === 'exit') {
            void writeFile(outputFilePath, calls.length === 1 ? 'Bootstrap complete.' : 'Recorded summary in the original thread.').then(() => handler(0, null));
          }
        },
        kill() {},
      };
    },
  });

  const created = await executor.createCallSession({
    launchId: 'launch-123',
    originalSessionId,
    workspaceRoot,
    bootstrapPrompt: 'You are now on a voice call.',
  });

  const writeBack = await executor.writeBackSummary({
    originalSessionId,
    prompt: 'Keep this short as a record.',
    workspaceRoot,
  });

  await executor.destroyCallSession({ launchId: 'launch-123' });

  assert.equal(writeBack.text, 'Recorded summary in the original thread.');
  assert.equal(calls[1].options.env.CODEX_HOME, sourceCodexHome);
  assert.equal(calls[1].args.includes(originalSessionId), true);
});
