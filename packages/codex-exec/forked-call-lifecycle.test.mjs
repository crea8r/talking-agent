import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { access, mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';

import { createForkedCallExecutor } from './index.mjs';
import { seedForkedSourceCodexHome } from './test-helpers.mjs';

test('forked call executor writes back the call note to the original session and tears down the call home', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codex-forked-call-'));
  const sourceCodexHome = await seedForkedSourceCodexHome(tempDir, 'session-original');
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

  await executor.createCallSession({
    launchId: 'launch-123',
    originalSessionId: 'session-original',
    workspaceRoot,
    bootstrapPrompt: 'You are now on a voice call.',
  });
  const writeBack = await executor.writeBackSummary({
    originalSessionId: 'session-original',
    prompt: 'Keep this short as a record.',
    workspaceRoot,
  });
  await executor.destroyCallSession({ launchId: 'launch-123' });

  assert.equal(writeBack.text, 'Recorded summary in the original thread.');
  assert.equal(calls[1].options.env.CODEX_HOME, sourceCodexHome);
  assert.equal(calls[1].args.includes('session-original'), true);
});

test('forked call executor can sync selected plugin assets into an existing launch home', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codex-forked-call-'));
  const sourceCodexHome = await seedForkedSourceCodexHome(tempDir, 'session-original');
  const workspaceRoot = path.join(tempDir, 'workspace-root');
  await mkdir(workspaceRoot, { recursive: true });

  const executor = createForkedCallExecutor({
    rootDir: path.join(tempDir, 'runner-root'),
    sourceCodexHome,
    spawnCodex() {
      throw new Error('spawnCodex should not run during syncLaunchCapabilities');
    },
  });

  const created = await executor.createCallSession({
    launchId: 'launch-123',
    originalSessionId: 'session-original',
    workspaceRoot,
  });
  const synced = await executor.syncLaunchCapabilities({
    launchId: 'launch-123',
    capabilityPolicy: { enabledPluginIds: ['github@openai-curated'] },
  });

  assert.equal(synced.synced, true);
  await access(
    path.join(
      created.callCodexHomeDir,
      'plugins',
      'cache',
      'openai-curated',
      'github',
      '1141b764',
      '.codex-plugin',
      'plugin.json',
    ),
  );
  const configToml = await readFile(path.join(created.callCodexHomeDir, 'config.toml'), 'utf8');
  assert.match(configToml, /\[plugins\."github@openai-curated"\]\nenabled = true/);
});
