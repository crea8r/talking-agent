import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { CallToolResultSchema, ListToolsResultSchema } from '@modelcontextprotocol/sdk/types.js';

import { createCallRecordStore } from '../call-record-store/index.mjs';
import { createProductionVoiceProfileStore } from '../production-voice/profile-store.mjs';
import { createWorkspaceSetupStore } from '../workspace-setup-store/index.mjs';
import { createCallLinkService } from './index.mjs';
import { createCallLinkMcpHttpHandler } from './mcp-http.mjs';

test('streamable HTTP MCP route exposes create_call_link from the room runtime surface', async (t) => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'call-link-mcp-http-'));
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
  });
  await productionVoiceProfileStore.saveProfile({
    scopeKey: 'workspace-alpha',
    referenceOriginalFileName: 'reference.wav',
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

  const mcp = createCallLinkMcpHttpHandler({ service, pathname: '/mcp' });
  const server = createServer(async (req, res) => {
    if (await mcp.handle(req, res, req.url || '/')) {
      return;
    }
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
    assert.deepEqual(tools.tools.map((tool) => tool.name), ['create_call_link']);

    const result = await client.request({
      method: 'tools/call',
      params: {
        name: 'create_call_link',
        arguments: {
          originalSessionId: 'session-original',
          workspaceRoot,
          displayTitle: 'workspace-alpha',
          scopeKey: 'workspace-alpha',
        },
      },
    }, CallToolResultSchema);

    assert.equal(result.structuredContent.ok, true);
    assert.equal(result.structuredContent.callSessionId, 'session-call');
    assert.match(result.structuredContent.url, /\?mode=linked-call&launch=/);
  } finally {
    await client.close();
    await transport.close();
    await mcp.close();
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
