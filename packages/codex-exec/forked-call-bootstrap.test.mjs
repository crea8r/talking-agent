import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';

import { createForkedCallExecutor } from './index.mjs';
import { seedForkedSourceCodexHome } from './test-helpers.mjs';

test('forked call executor starts bootstrap in the background and returns the call session immediately', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codex-forked-call-'));
  const sourceCodexHome = await seedForkedSourceCodexHome(tempDir, 'session-original');
  const workspaceRoot = path.join(tempDir, 'workspace-root');
  await mkdir(workspaceRoot, { recursive: true });

  const calls = [];
  const completeProcesses = [];
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
            completeProcesses.push(async (text = 'Bootstrap complete.') => {
              await writeFile(outputFilePath, text);
              handler(0, null);
            });
          }
        },
        kill() {},
      };
    },
  });

  const created = await executor.createCallSession({
    launchId: 'launch-123',
    originalSessionId: 'session-original',
    workspaceRoot,
    bootstrapPrompt: 'You are now on a voice call.',
  });

  assert.equal(created.launchId, 'launch-123');
  assert.notEqual(created.callSessionId, 'session-original');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.cwd, workspaceRoot);
  assert.equal(calls[0].options.env.CODEX_HOME, created.callCodexHomeDir);
  assert.equal(calls[0].args.includes('resume'), true);
  assert.equal(calls[0].args.includes(created.callSessionId), true);
  assert.equal(calls[0].args.at(-1), 'You are now on a voice call.');

  const sessionIndex = await readFile(path.join(created.callCodexHomeDir, 'session_index.jsonl'), 'utf8');
  const sessionMeta = await readFile(created.callSessionFilePath, 'utf8');
  assert.match(sessionIndex, new RegExp(created.callSessionId));
  assert.match(sessionMeta, new RegExp(`"id":"${created.callSessionId}"`));
  assert.match(sessionMeta, /"forked_from_id":"session-original"/);
  await assert.rejects(readFile(path.join(created.callCodexHomeDir, 'shell_snapshots', 'skip-me.sh'), 'utf8'));

  await completeProcesses[0]?.();
});

test('forked call executor waits for background bootstrap to finish before starting the next linked-call prompt', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codex-forked-call-'));
  const sourceCodexHome = await seedForkedSourceCodexHome(tempDir, 'session-original');
  const workspaceRoot = path.join(tempDir, 'workspace-root');
  await mkdir(workspaceRoot, { recursive: true });

  const calls = [];
  const completeProcesses = [];
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
            completeProcesses.push(async (text) => {
              await writeFile(outputFilePath, text);
              handler(0, null);
            });
          }
        },
        kill() {},
      };
    },
  });

  const created = await executor.createCallSession({
    launchId: 'launch-123',
    originalSessionId: 'session-original',
    workspaceRoot,
    bootstrapPrompt: 'You are now on a voice call.',
  });
  const replyHandlePromise = executor.startCallPrompt({
    launchId: 'launch-123',
    callSessionId: created.callSessionId,
    prompt: 'Answer the caller now.',
    workspaceRoot,
  });

  await Promise.resolve();
  await Promise.resolve();
  assert.equal(calls.length, 1);

  await completeProcesses[0]?.('Bootstrap complete.');
  const replyHandle = await replyHandlePromise;
  assert.equal(calls.length, 2);
  assert.equal(calls[1].args.at(-1), 'Answer the caller now.');

  await completeProcesses[1]?.('The real reply.');
  const reply = await replyHandle.promise;
  assert.equal(reply.text, 'The real reply.');
});
