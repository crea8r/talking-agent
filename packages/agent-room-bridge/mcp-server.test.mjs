import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { createAgentRoomBridgeStore } from './index.mjs';

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');

function createStateFilePath(name) {
  return path.join(
    '/private/tmp',
    `agent-room-bridge-mcp-${name}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
  );
}

function createMcpClient(proc) {
  let nextId = 1;
  let buffer = Buffer.alloc(0);
  const pending = new Map();

  function onFrame(message) {
    if (typeof message.id === 'undefined') {
      return;
    }

    const entry = pending.get(message.id);
    if (!entry) {
      return;
    }

    pending.delete(message.id);
    if (message.error) {
      entry.reject(message.error);
      return;
    }

    entry.resolve(message.result);
  }

  proc.stdout.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);

    while (buffer.length) {
      const headerEnd = buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) {
        return;
      }

      const header = buffer.slice(0, headerEnd).toString('utf8');
      const lengthMatch = header.match(/Content-Length:\s*(\d+)/i);
      if (!lengthMatch) {
        buffer = buffer.slice(headerEnd + 4);
        continue;
      }

      const contentLength = Number.parseInt(lengthMatch[1], 10);
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + contentLength;
      if (buffer.length < bodyEnd) {
        return;
      }

      const body = buffer.slice(bodyStart, bodyEnd).toString('utf8');
      buffer = buffer.slice(bodyEnd);
      onFrame(JSON.parse(body));
    }
  });

  proc.stderr.on('data', (chunk) => {
    const text = chunk.toString('utf8');
    if (text.trim()) {
      process.stderr.write(text);
    }
  });

  return {
    request(method, params = undefined) {
      const id = nextId++;
      const payload = {
        jsonrpc: '2.0',
        id,
        method,
        ...(typeof params !== 'undefined' ? { params } : {}),
      };
      const body = JSON.stringify(payload);
      proc.stdin.write(
        `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\nContent-Type: application/json\r\n\r\n${body}`,
      );

      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
      });
    },
  };
}

async function withServer(setup, run) {
  const stateFilePath = createStateFilePath('server');
  const store = createAgentRoomBridgeStore({ stateFilePath });
  if (setup) {
    await setup(store);
  }

  const proc = spawn(process.execPath, ['packages/agent-room-bridge/mcp-server.mjs'], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      AGENT_ROOM_BRIDGE_STATE_PATH: stateFilePath,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const client = createMcpClient(proc);

  await client.request('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: {
      name: 'node-test',
      version: '1.0.0',
    },
  });
  proc.stdin.write(
    'Content-Length: 52\r\nContent-Type: application/json\r\n\r\n{"jsonrpc":"2.0","method":"notifications/initialized"}',
  );

  try {
    await run(client, store);
  } finally {
    proc.stdin.end();
    proc.kill();
  }
}

test('tools/list exposes the singleton-call protocol', async () => {
  await withServer(null, async (client) => {
    const result = await client.request('tools/list');
    assert.deepEqual(
      result.tools.map((tool) => tool.name),
      ['join_call', 'wait_for_events', 'publish_actions', 'leave_call', 'get_recent_turns'],
    );
  });
});

test('resources/read and prompts/get expose the bootstrap context', async () => {
  await withServer(null, async (client) => {
    const resources = await client.request('resources/list');
    assert.ok(resources.resources.some((resource) => resource.uri === 'bridge://capabilities'));

    const resourcePayload = await client.request('resources/read', {
      uri: 'bridge://capabilities',
    });
    assert.match(resourcePayload.contents[0].text, /wait_for_events/);

    const promptPayload = await client.request('prompts/get', {
      name: 'call_agent_bootstrap',
    });
    assert.match(promptPayload.messages[0].content.text, /join_call/);
    assert.match(promptPayload.messages[0].content.text, /publish_actions/);
  });
});

test('tools/call join_call attaches to the active call and returns avatar catalog metadata', async () => {
  await withServer(async (store) => {
    const call = await store.createSession({
      title: 'talking-agent',
      roomName: 'talking-agent-call',
      livekitUrl: 'ws://127.0.0.1:7880',
      humanIdentity: 'human-room-host',
      humanName: 'Human Caller',
      metadata: {
        app: 'one-to-one-agent-room',
      },
    });

    await store.syncAvatarCatalog({
      sessionId: call.id,
      activeModelId: 'bhf-1-2',
      catalogVersion: 'avatar-v1',
      catalogUri: 'avatar://catalog/bhf-1-2',
    });
  }, async (client) => {
    const payload = await client.request('tools/call', {
      name: 'join_call',
      arguments: {
        agentId: 'codex-openai',
        agentLabel: 'Codex OpenAI',
      },
    });

    assert.equal(payload.structuredContent.activeModelId, 'bhf-1-2');
    assert.equal(payload.structuredContent.avatarCatalogUri, 'avatar://catalog/bhf-1-2');
  });
});
