import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
  createOneToOneAgentRoomPlan,
  resolveProductionVoicePythonCandidates,
} from './one-to-one-agent-room-launcher.mjs';

const REPO_ROOT = '/repo';

test('resolveProductionVoicePythonCandidates prefers explicit env first', () => {
  const candidates = resolveProductionVoicePythonCandidates({
    env: {
      ONE_TO_ONE_AGENT_ROOM_PRODUCTION_VOICE_PYTHON: '/custom/python',
    },
    repoRoot: REPO_ROOT,
  });

  assert.deepEqual(candidates, [
    '/custom/python',
    path.join(REPO_ROOT, 'packages', 'production-voice', '.venv', 'bin', 'python'),
    path.join(REPO_ROOT, 'apps', 'voice-cast', 'vendor', 'production-voice', '.venv', 'bin', 'python'),
    'python3',
  ]);
});

test('createOneToOneAgentRoomPlan wires production voice and room app defaults', () => {
  const plan = createOneToOneAgentRoomPlan({
    mode: 'start',
    repoRoot: REPO_ROOT,
    env: {},
  });

  assert.equal(plan.productionVoice.scriptPath, path.join(REPO_ROOT, 'packages', 'production-voice', 'production_voice_server.py'));
  assert.equal(plan.productionVoice.host, '127.0.0.1');
  assert.equal(plan.productionVoice.port, 50003);
  assert.equal(plan.productionVoice.vendorRoot, path.join(REPO_ROOT, 'apps', 'voice-cast', 'vendor'));
  assert.equal(plan.roomApp.port, 4384);
  assert.equal(plan.roomApp.workspaceName, '@talking-agent/one-to-one-agent-room');
  assert.equal(plan.roomApp.npmScript, 'start');
});

test('createOneToOneAgentRoomPlan honors env overrides for ports and mode', () => {
  const plan = createOneToOneAgentRoomPlan({
    mode: 'dev',
    repoRoot: REPO_ROOT,
    env: {
      PORT: '4499',
      ONE_TO_ONE_AGENT_ROOM_PRODUCTION_VOICE_PORT: '51000',
      ONE_TO_ONE_AGENT_ROOM_PRODUCTION_VOICE_HOST: '0.0.0.0',
      PRODUCTION_VOICE_VENDOR_ROOT: '/vendor-root',
    },
  });

  assert.equal(plan.productionVoice.host, '0.0.0.0');
  assert.equal(plan.productionVoice.port, 51000);
  assert.equal(plan.productionVoice.vendorRoot, '/vendor-root');
  assert.equal(plan.roomApp.port, 4499);
  assert.equal(plan.roomApp.npmScript, 'dev');
});
