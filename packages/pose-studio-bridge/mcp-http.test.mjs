import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import path from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { CallToolResultSchema, ListToolsResultSchema } from '@modelcontextprotocol/sdk/types.js';

import { createPoseStudioBridgeStore } from './index.mjs';
import { createPoseStudioMcpHttpHandler } from './mcp-http.mjs';

function createStateFilePath(name) {
  return path.join(
    '/private/tmp',
    `pose-studio-bridge-http-${name}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
  );
}

test('streamable HTTP MCP route exposes pose-studio tools and stages a sequence', async (t) => {
  const store = createPoseStudioBridgeStore({
    stateFilePath: createStateFilePath('server'),
  });
  await store.syncRuntime({
    modelId: 'bhf-1-2',
    modelLabel: 'Red Tinker Bell',
    availableGestures: [
      { id: 'Greeting', label: 'Greeting', durationMs: 2100, supportsSpeech: true, bestFor: ['hello'] },
      { id: 'Pose', label: 'Pose', durationMs: 1800, supportsSpeech: true, bestFor: ['idle'] },
    ],
  });

  const mcp = createPoseStudioMcpHttpHandler({ store, pathname: '/mcp' });
  const server = createServer(async (req, res) => {
    if (await mcp.handle(req, res, req.url || '/')) return;
    res.writeHead(404).end();
  });
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
  } catch (error) {
    if (error?.code === 'EPERM') {
      t.skip('sandbox blocks loopback listen in this environment');
      return;
    }
    throw error;
  }

  const { port } = server.address();
  const client = new Client({ name: 'node-test', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`));

  try {
    await client.connect(transport);
    const tools = await client.request({ method: 'tools/list' }, ListToolsResultSchema);
    assert.ok(tools.tools.some((tool) => tool.name === 'stage_pose_sequence'));

    const result = await client.request({
      method: 'tools/call',
      params: {
        name: 'stage_pose_sequence',
        arguments: {
          modelId: 'bhf-1-2',
          prompt: 'Wave then settle.',
          steps: [{ gestureId: 'Greeting' }, { gestureId: 'Pose' }],
        },
      },
    }, CallToolResultSchema);

    assert.deepEqual(result.content, []);
    assert.equal(result.structuredContent.steps.length, 2);
    const state = await store.getState();
    assert.equal(state.director.activeSequence.steps[0].gestureId, 'Greeting');
  } finally {
    await client.close();
    await transport.close();
    await mcp.close();
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('director HTTP surface exposes only director write tools with a compact result payload', async (t) => {
  const store = createPoseStudioBridgeStore({
    stateFilePath: createStateFilePath('director'),
  });
  await store.syncRuntime({
    modelId: 'bhf-1-2',
    modelLabel: 'Red Tinker Bell',
    availableGestures: [
      { id: 'Greeting', label: 'Greeting', durationMs: 2100, supportsSpeech: true, bestFor: ['hello'] },
      { id: 'Pose', label: 'Pose', durationMs: 1800, supportsSpeech: true, bestFor: ['idle'] },
    ],
  });

  const mcp = createPoseStudioMcpHttpHandler({ store, pathname: '/mcp', surface: 'director' });
  const server = createServer(async (req, res) => {
    if (await mcp.handle(req, res, req.url || '/')) return;
    res.writeHead(404).end();
  });
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
  } catch (error) {
    if (error?.code === 'EPERM') {
      t.skip('sandbox blocks loopback listen in this environment');
      return;
    }
    throw error;
  }

  const { port } = server.address();
  const client = new Client({ name: 'node-test', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`));

  try {
    await client.connect(transport);
    const tools = await client.request({ method: 'tools/list' }, ListToolsResultSchema);
    assert.deepEqual(
      tools.tools.map((tool) => tool.name),
      ['stage_pose_sequence', 'report_pose_sequence_error'],
    );

    const result = await client.request({
      method: 'tools/call',
      params: {
        name: 'stage_pose_sequence',
        arguments: {
          prompt: 'Wave then settle.',
          steps: [{ gestureId: 'Greeting' }, { gestureId: 'Pose' }],
        },
      },
    }, CallToolResultSchema);

    assert.deepEqual(result.content, []);
    assert.equal(result.structuredContent.modelId, 'bhf-1-2');
    assert.equal(result.structuredContent.totalDurationMs, 3900);
    assert.equal('steps' in result.structuredContent, false);
    const state = await store.getState();
    assert.equal(state.director.activeSequence.steps[0].gestureId, 'Greeting');
  } finally {
    await client.close();
    await transport.close();
    await mcp.close();
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
