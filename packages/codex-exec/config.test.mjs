import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, writeFile } from 'node:fs/promises';

import {
  buildCodexHomeConfig,
  listAvailablePlugins,
  resolveDefaultSourceCodexHome,
} from './index.mjs';
import { seedBasicSourceCodexHome, seedPlugin } from './test-helpers.mjs';

test('buildCodexHomeConfig disables plugins in the isolated codex home', () => {
  const config = buildCodexHomeConfig({
    availablePlugins: [{ id: 'github@openai-curated' }, { id: 'figma@openai-curated' }],
  });
  assert.match(config, /plugins\."github@openai-curated"/);
  assert.match(config, /enabled = false/);
});

test('buildCodexHomeConfig enables only the selected plugins', () => {
  const config = buildCodexHomeConfig({
    availablePlugins: [
      { id: 'github@openai-curated' },
      { id: 'figma@openai-curated' },
      { id: 'gmail@openai-curated' },
    ],
    capabilityPolicy: { enabledPluginIds: ['figma@openai-curated'] },
  });

  assert.match(config, /\[plugins\."figma@openai-curated"\]\nenabled = true/);
  assert.match(config, /\[plugins\."github@openai-curated"\]\nenabled = false/);
  assert.match(config, /\[plugins\."gmail@openai-curated"\]\nenabled = false/);
});

test('listAvailablePlugins reads installed plugin metadata and enabled state', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codex-exec-plugins-'));
  const sourceCodexHome = path.join(tempDir, 'source-codex-home');
  await seedBasicSourceCodexHome(sourceCodexHome);
  await seedPlugin({ sourceCodexHome, name: 'github', displayName: 'GitHub' });
  await seedPlugin({ sourceCodexHome, name: 'figma', version: '2.0.7', displayName: 'Figma' });
  await writeFile(
    path.join(sourceCodexHome, 'config.toml'),
    [
      '[plugins."github@openai-curated"]',
      'enabled = true',
      '',
      '[plugins."figma@openai-curated"]',
      'enabled = false',
      '',
    ].join('\n'),
  );

  const plugins = await listAvailablePlugins({ sourceCodexHome });
  assert.deepEqual(
    plugins.map((plugin) => ({ id: plugin.id, displayName: plugin.displayName, enabled: plugin.enabled })),
    [
      { id: 'figma@openai-curated', displayName: 'Figma', enabled: false },
      { id: 'github@openai-curated', displayName: 'GitHub', enabled: true },
    ],
  );
});

test('resolveDefaultSourceCodexHome prefers CODEX_SOURCE_HOME and ignores CODEX_HOME', () => {
  assert.equal(
    resolveDefaultSourceCodexHome({
      env: {
        HOME: '/Users/example',
        CODEX_HOME: '/tmp/local-codex-home',
        CODEX_SOURCE_HOME: '/Users/example/.codex-source',
      },
      homeDir: '/Users/example',
    }),
    '/Users/example/.codex-source',
  );
  assert.equal(
    resolveDefaultSourceCodexHome({
      env: { HOME: '/Users/example', CODEX_HOME: '/tmp/local-codex-home' },
      homeDir: '/Users/example',
    }),
    '/Users/example/.codex',
  );
});
