import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';

import { createCallRecordStore } from '../call-record-store/index.mjs';
import { createProductionVoiceProfileStore } from '../production-voice/profile-store.mjs';
import { createWorkspaceSetupStore } from '../workspace-setup-store/index.mjs';
import { createCallLinkService } from './index.mjs';

test('createCallLink creates a launch record and uses the saved character model in the bootstrap prompt', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'codex-call-link-service-'));
  const sourceCodexHome = path.join(rootDir, 'source-codex-home');
  const workspaceRoot = path.join(rootDir, 'workspace-alpha');
  const callRecordStore = createCallRecordStore({
    rootDir: path.join(rootDir, 'call-records'),
  });
  const workspaceSetupStore = createWorkspaceSetupStore({
    rootDir: path.join(rootDir, 'workspace-setup'),
  });
  const productionVoiceProfileStore = createProductionVoiceProfileStore({
    rootDir: path.join(rootDir, 'production-voice'),
  });
  await mkdir(sourceCodexHome, { recursive: true });
  await mkdir(workspaceRoot, { recursive: true });
  await writeFile(
    path.join(sourceCodexHome, 'session_index.jsonl'),
    `${JSON.stringify({
      id: 'session-original',
      thread_name: 'Original coding thread',
      updated_at: '2026-05-08T10:00:00.000Z',
    })}\n`,
  );

  await workspaceSetupStore.saveSetup({
    scopeKey: 'workspace-alpha',
    activeModelId: 'fbf-1-0',
    activeModelLabel: 'Green Fairy',
    enabledPluginIds: ['github@openai-curated'],
    enableControlComputer: true,
    enableComplexTasks: false,
  });
  await productionVoiceProfileStore.saveProfile({
    scopeKey: 'workspace-alpha',
    referenceOriginalFileName: 'reference.wav',
    referenceMimeType: 'audio/wav',
    referenceBuffer: Buffer.from([1, 2, 3, 4]),
    meloBaseSpeakerId: 'EN-US',
    meloBaseSpeakerLabel: 'EN-US',
  });

  let capturedBootstrapPrompt = '';
  let capturedCapabilityPolicy = null;
  const service = createCallLinkService({
    appBaseUrl: 'http://127.0.0.1:4384',
    sourceCodexHome,
    callRecordStore,
    workspaceSetupStore,
    productionVoiceProfileStore,
    forkedCallExecutor: {
      async createCallSession({
        launchId,
        originalSessionId,
        workspaceRoot: nextWorkspaceRoot,
        bootstrapPrompt,
        capabilityPolicy,
      }) {
        capturedBootstrapPrompt = bootstrapPrompt;
        capturedCapabilityPolicy = capabilityPolicy;
        return {
          launchId,
          originalSessionId,
          callSessionId: 'session-call',
          callCodexHomeDir: path.join(rootDir, 'forked-call-home'),
          callSessionFilePath: path.join(rootDir, 'forked-call-home', 'session.jsonl'),
          workspaceRoot: nextWorkspaceRoot,
        };
      },
    },
  });

  const created = await service.createCallLink({
    originalSessionId: 'session-original',
    workspaceRoot,
    displayTitle: 'workspace-alpha',
    scopeKey: 'workspace-alpha',
  });

  const record = await callRecordStore.loadRecord({ launchId: created.launchId });

  assert.match(created.url, /\?mode=linked-call&launch=/);
  assert.equal(created.originalSessionId, 'session-original');
  assert.equal(created.callSessionId, 'session-call');
  assert.equal(record.status, 'ready');
  assert.equal(record.activeModelId, 'fbf-1-0');
  assert.equal(record.activeModelLabel, 'Green Fairy');
  assert.deepEqual(capturedCapabilityPolicy, {
    enabledPluginIds: ['github@openai-curated'],
    enableControlComputer: true,
    enableComplexTasks: false,
  });
  assert.match(capturedBootstrapPrompt, /Green Fairy/);
  assert.match(capturedBootstrapPrompt, /voice call/);
});

test('createCallLink falls back to default setup and default voice profile for a new workspace', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'codex-call-link-service-'));
  const sourceCodexHome = path.join(rootDir, 'source-codex-home');
  const workspaceRoot = path.join(rootDir, 'workspace-beta');
  const callRecordStore = createCallRecordStore({
    rootDir: path.join(rootDir, 'call-records'),
  });
  const workspaceSetupStore = createWorkspaceSetupStore({
    rootDir: path.join(rootDir, 'workspace-setup'),
  });
  const productionVoiceProfileStore = createProductionVoiceProfileStore({
    rootDir: path.join(rootDir, 'production-voice'),
  });
  await mkdir(sourceCodexHome, { recursive: true });
  await mkdir(workspaceRoot, { recursive: true });
  await writeFile(
    path.join(sourceCodexHome, 'session_index.jsonl'),
    `${JSON.stringify({
      id: 'session-original',
      thread_name: 'Original coding thread',
      updated_at: '2026-05-08T10:00:00.000Z',
    })}\n`,
  );

  await workspaceSetupStore.saveSetup({
    activeModelId: 'bhf-1-2',
    activeModelLabel: 'Red Tinker Bell',
  });
  await productionVoiceProfileStore.saveProfile({
    referenceOriginalFileName: 'default.wav',
    referenceMimeType: 'audio/wav',
    referenceBuffer: Buffer.from([1, 2, 3, 4]),
    meloBaseSpeakerId: 'EN-US',
    meloBaseSpeakerLabel: 'EN-US',
  });

  const service = createCallLinkService({
    appBaseUrl: 'http://127.0.0.1:4384',
    sourceCodexHome,
    callRecordStore,
    workspaceSetupStore,
    productionVoiceProfileStore,
    forkedCallExecutor: {
      async createCallSession({ launchId, originalSessionId, workspaceRoot: nextWorkspaceRoot }) {
        return {
          launchId,
          originalSessionId,
          callSessionId: 'session-call',
          callCodexHomeDir: path.join(rootDir, 'forked-call-home'),
          callSessionFilePath: path.join(rootDir, 'forked-call-home', 'session.jsonl'),
          workspaceRoot: nextWorkspaceRoot,
        };
      },
    },
  });

  const created = await service.createCallLink({
    originalSessionId: 'session-original',
    workspaceRoot,
    displayTitle: 'workspace-beta',
  });

  assert.match(created.url, /\?mode=linked-call&launch=/);
  assert.equal(created.callSessionId, 'session-call');
});
