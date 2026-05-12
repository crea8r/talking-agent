import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { access, mkdtemp, readFile } from 'node:fs/promises';

import { createIsolatedCodexExecutor } from './index.mjs';
import { seedBasicSourceCodexHome, seedPlugin } from './test-helpers.mjs';

test('executor can sync selected plugin assets into the local codex home before the first prompt', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codex-exec-sync-'));
  const sourceCodexHome = path.join(tempDir, 'source-codex-home');
  await seedBasicSourceCodexHome(sourceCodexHome);
  await seedPlugin({ sourceCodexHome, name: 'github', displayName: 'GitHub' });

  const executor = createIsolatedCodexExecutor({
    rootDir: path.join(tempDir, 'runner-root'),
    sourceCodexHome,
    spawnCodex() {
      throw new Error('spawnCodex should not run during syncSessionCapabilities');
    },
  });

  const synced = await executor.syncSessionCapabilities({
    sessionId: 'session-alpha',
    capabilityPolicy: { enabledPluginIds: ['github@openai-curated'] },
  });

  await access(
    path.join(
      synced.codexHomeDir,
      'plugins',
      'cache',
      'openai-curated',
      'github',
      '1141b764',
      '.codex-plugin',
      'plugin.json',
    ),
  );
  const configToml = await readFile(path.join(synced.codexHomeDir, 'config.toml'), 'utf8');
  assert.match(configToml, /\[plugins\."github@openai-curated"\]\nenabled = true/);
});

test('executor health check verifies the source codex home and creates the root directory', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codex-exec-health-'));
  const sourceCodexHome = path.join(tempDir, 'source-codex-home');
  const rootDir = path.join(tempDir, 'runner-root');
  await seedBasicSourceCodexHome(sourceCodexHome);

  const executor = createIsolatedCodexExecutor({
    rootDir,
    sourceCodexHome,
    spawnCodex() {
      return {
        stdout: { on() {} },
        stderr: { on() {} },
        once(eventName, handler) {
          if (eventName === 'exit') {
            handler(0, null);
          }
        },
        kill() {},
      };
    },
  });

  const payload = await executor.checkHealth();
  await access(rootDir);
  assert.equal(payload.app, 'codex-exec');
});
