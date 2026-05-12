import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';

import { createWorkspaceSetupStore } from './index.mjs';

test('workspace setup store persists the selected character model per workspace scope', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'workspace-setup-store-'));
  const store = createWorkspaceSetupStore({ rootDir });

  await store.saveSetup({
    scopeKey: 'workspace-alpha',
    activeModelId: 'fbf-1-0',
    activeModelLabel: 'Green Fairy',
    enabledPluginIds: ['github@openai-curated', 'figma@openai-curated'],
    enableControlComputer: true,
    enableComplexTasks: false,
  });

  await store.saveSetup({
    scopeKey: 'workspace-beta',
    activeModelId: 'bhf-1-2',
    activeModelLabel: 'Red Tinker Bell',
    enabledPluginIds: [],
    enableControlComputer: false,
    enableComplexTasks: true,
  });

  const alpha = await store.loadSetup({ scopeKey: 'workspace-alpha' });
  const beta = await store.loadSetup({ scopeKey: 'workspace-beta' });

  assert.equal(alpha.activeModelId, 'fbf-1-0');
  assert.equal(alpha.activeModelLabel, 'Green Fairy');
   assert.deepEqual(alpha.enabledPluginIds, ['figma@openai-curated', 'github@openai-curated']);
   assert.equal(alpha.enableControlComputer, true);
   assert.equal(alpha.enableComplexTasks, false);
  assert.equal(beta.activeModelId, 'bhf-1-2');
  assert.equal(beta.activeModelLabel, 'Red Tinker Bell');
   assert.deepEqual(beta.enabledPluginIds, []);
   assert.equal(beta.enableControlComputer, false);
   assert.equal(beta.enableComplexTasks, true);
});

test('workspace setup store returns null when no setup exists for a workspace scope', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'workspace-setup-store-'));
  const store = createWorkspaceSetupStore({ rootDir });

  const setup = await store.loadSetup({ scopeKey: 'missing-workspace' });

  assert.equal(setup, null);
});

test('workspace setup store falls back to the default setup for new scopes', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'workspace-setup-store-'));
  const store = createWorkspaceSetupStore({ rootDir });

  await store.saveSetup({
    activeModelId: 'bhf-1-2',
    activeModelLabel: 'Red Tinker Bell',
  });

  const setup = await store.loadSetup({ scopeKey: 'brand-new-workspace' });

  assert.equal(setup.activeModelId, 'bhf-1-2');
  assert.equal(setup.activeModelLabel, 'Red Tinker Bell');
});
