import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';

import { createAgentRoomBridgeStore } from './index.mjs';
import { createMcpHarness } from './mcp-harness.mjs';

test('mcp harness can initialize and call tools against the real server', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'agent-room-mcp-harness-'));
  const stateFilePath = path.join(tempDir, 'bridge.json');
  const store = createAgentRoomBridgeStore({ stateFilePath });

  const session = await store.createSession({
    roomName: 'tester-call',
    livekitUrl: 'debug://local',
    humanIdentity: 'tester-human',
    humanName: 'Tester Human',
    title: 'MCP Tester',
    metadata: {},
  });
  await store.setCallState({ sessionId: session.id, state: 'live' });

  const harness = createMcpHarness({
    stateFilePath,
    cwd: path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..'),
  });

  await harness.connect();

  const init = await harness.request({
    jsonrpc: '2.0',
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'node-test',
        version: '1.0.0',
      },
    },
  });
  assert.equal(init.result.serverInfo.name, 'talking-agent-room-bridge');

  await harness.request({
    jsonrpc: '2.0',
    method: 'notifications/initialized',
  });

  const tools = await harness.request({
    jsonrpc: '2.0',
    method: 'tools/list',
    params: {},
  });
  assert.ok(tools.result.tools.find((tool) => tool.name === 'join_call'));

  const transcript = harness.getTranscript();
  assert.ok(transcript.some((entry) => entry.direction === 'request' && entry.payload.method === 'initialize'));
  assert.ok(transcript.some((entry) => entry.direction === 'response' && entry.payload.id === init.id));

  await harness.close();
});
