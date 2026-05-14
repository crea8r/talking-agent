import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
  buildTailscaleServeArgs,
  createOneToOneAgentRoomPlan,
  extractTailscaleDnsName,
  parseOneToOneAgentRoomLauncherArgs,
  resolveProductionVoicePythonCandidates,
  resolveTailscalePublicBaseUrl,
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

test('parseOneToOneAgentRoomLauncherArgs accepts the tailscale flag', () => {
  const options = parseOneToOneAgentRoomLauncherArgs(['dev', '--tailscale']);

  assert.deepEqual(options, {
    mode: 'dev',
    tailscale: true,
  });
});

test('extractTailscaleDnsName strips the trailing dot from tailscale status output', () => {
  const dnsName = extractTailscaleDnsName({
    Self: {
      DNSName: 'laptop.tail1234.ts.net.',
    },
  });

  assert.equal(dnsName, 'laptop.tail1234.ts.net');
});

test('resolveTailscalePublicBaseUrl keeps non-default https ports in the URL', () => {
  const publicBaseUrl = resolveTailscalePublicBaseUrl({
    dnsName: 'laptop.tail1234.ts.net.',
    httpsPort: 4384,
  });

  assert.equal(publicBaseUrl, 'https://laptop.tail1234.ts.net:4384');
});

test('buildTailscaleServeArgs proxies the room app through tailscale serve', () => {
  const args = buildTailscaleServeArgs({
    targetPort: 4384,
    httpsPort: 443,
  });

  assert.deepEqual(args, [
    'serve',
    '--bg',
    '--https=443',
    'http://127.0.0.1:4384',
  ]);
});

test('createOneToOneAgentRoomPlan enables tailscale with default external https port 443', () => {
  const plan = createOneToOneAgentRoomPlan({
    mode: 'start',
    repoRoot: REPO_ROOT,
    env: {},
    enableTailscale: true,
  });

  assert.equal(plan.tailscale.enabled, true);
  assert.equal(plan.tailscale.httpsPort, 443);
});

test('createOneToOneAgentRoomPlan still honors an explicit tailscale https port override', () => {
  const plan = createOneToOneAgentRoomPlan({
    mode: 'start',
    repoRoot: REPO_ROOT,
    env: {
      ONE_TO_ONE_AGENT_ROOM_TAILSCALE_HTTPS_PORT: '4384',
    },
    enableTailscale: true,
  });

  assert.equal(plan.tailscale.enabled, true);
  assert.equal(plan.tailscale.httpsPort, 4384);
});
