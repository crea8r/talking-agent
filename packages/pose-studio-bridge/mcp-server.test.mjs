import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { createPoseStudioBridgeStore } from './index.mjs';

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');

function createStateFilePath(name) {
  return path.join(
    '/private/tmp',
    `pose-studio-bridge-mcp-${name}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
  );
}

function createMcpClient(proc) {
  let nextId = 1;
  let buffer = '';
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
    buffer += chunk.toString('utf8');

    while (buffer.length) {
      const newlineIndex = buffer.indexOf('\n');
      if (newlineIndex === -1) {
        return;
      }

      const line = buffer.slice(0, newlineIndex).replace(/\r$/, '');
      buffer = buffer.slice(newlineIndex + 1);
      if (!line) {
        continue;
      }

      onFrame(JSON.parse(line));
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
      proc.stdin.write(`${JSON.stringify(payload)}\n`);

      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
      });
    },
  };
}

async function withServer(setup, run, options = {}) {
  const stateFilePath = createStateFilePath('server');
  const store = createPoseStudioBridgeStore({ stateFilePath });
  if (setup) {
    await setup(store);
  }

  let stderr = '';

  const proc = spawn(process.execPath, ['packages/pose-studio-bridge/mcp-server.mjs'], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      POSE_STUDIO_BRIDGE_STATE_PATH: stateFilePath,
    },
    stdio: ['pipe', 'pipe', options.captureStderr ? 'pipe' : 'inherit'],
  });
  if (options.captureStderr) {
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
  }
  const client = createMcpClient(proc);
  const protocolVersion = options.protocolVersion || '2024-11-05';

  const initializeResult = await client.request('initialize', {
    protocolVersion,
    capabilities: {},
    clientInfo: {
      name: 'node-test',
      version: '1.0.0',
    },
  });
  proc.stdin.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n');

  try {
    await run(client, store, initializeResult, {
      getStderr() {
        return stderr;
      },
    });
  } finally {
    proc.stdin.end();
    proc.kill();
  }
}

test('initialize negotiates the latest supported SDK protocol version', async () => {
  await withServer(null, async (_client, _store, initializeResult) => {
    assert.equal(initializeResult.protocolVersion, '2025-11-25');
  }, { protocolVersion: '2025-11-25' });
});

test('tools/list exposes the pose director tool surface', async () => {
  await withServer(async (store) => {
    await store.syncRuntime({
      modelId: 'bhf-1-2',
      modelLabel: 'Red Tinker Bell',
      availableGestures: [
        {
          id: 'Pose',
          label: 'Pose',
          description: 'Held neutral model pose.',
          bestFor: ['idle'],
          durationMs: 1800,
        },
      ],
    });
  }, async (client) => {
    const result = await client.request('tools/list');
    assert.deepEqual(
      result.tools.map((tool) => tool.name),
      ['get_pose_state', 'stage_pose_sequence', 'report_pose_sequence_error', 'stop_pose_sequence'],
    );
    assert.match(result.tools[1].description, /Available gestures:/);
    assert.match(result.tools[1].description, /gestureId: Pose/);
  });
});

test('resources/read exposes catalog and state', async () => {
  await withServer(async (store) => {
    await store.syncRuntime({
      modelId: 'fbf-1-0',
      modelLabel: 'Green Fairy',
      availableGestures: [
        {
          id: 'Thinking',
          label: 'Thinking',
          description: 'Reflective pause motion.',
          bestFor: ['thinking'],
          durationMs: 2300,
        },
      ],
    });
  }, async (client) => {
    const resources = await client.request('resources/list');
    assert.ok(resources.resources.some((resource) => resource.uri === 'pose://catalog'));

    const catalog = await client.request('resources/read', { uri: 'pose://catalog' });
    assert.match(catalog.contents[0].text, /Green Fairy/);

    const state = await client.request('resources/read', { uri: 'pose://state' });
    assert.match(state.contents[0].text, /"runtime"/);
  });
});

test('tools/call stage_pose_sequence writes a queued sequence into the bridge store', async () => {
  await withServer(async (store) => {
    await store.syncRuntime({
      modelId: 'bhf-1-2',
      modelLabel: 'Red Tinker Bell',
      availableGestures: [
        {
          id: 'Pose',
          label: 'Pose',
          description: 'Held neutral model pose.',
          bestFor: ['idle'],
          durationMs: 1800,
        },
        {
          id: 'Greeting',
          label: 'Greeting',
          description: 'Friendly hello.',
          bestFor: ['hello'],
          durationMs: 2100,
        },
      ],
    });
  }, async (client, store) => {
    const payload = await client.request('tools/call', {
      name: 'stage_pose_sequence',
      arguments: {
        prompt: 'Say hello then settle',
        steps: [
          { gestureId: 'Greeting' },
          { gestureId: 'Pose' },
        ],
      },
    });

    assert.deepEqual(payload.content, []);
    assert.equal(payload.structuredContent.steps.length, 2);
    assert.equal(payload.structuredContent.modelId, 'bhf-1-2');

    const state = await store.getState();
    assert.equal(state.director.playback.status, 'queued');
    assert.equal(state.director.activeSequence.steps[0].gestureId, 'Greeting');
  });
});

test('tools/call report_pose_sequence_error writes a bridge error result', async () => {
  await withServer(async (store) => {
    await store.syncRuntime({
      modelId: 'bhf-1-2',
      modelLabel: 'Red Tinker Bell',
      availableGestures: [
        {
          id: 'Pose',
          label: 'Pose',
          description: 'Held neutral model pose.',
          bestFor: ['idle'],
          durationMs: 1800,
        },
      ],
    });
  }, async (client, store) => {
    const payload = await client.request('tools/call', {
      name: 'report_pose_sequence_error',
      arguments: {
        modelId: 'bhf-1-2',
        prompt: 'Do something impossible.',
        message: 'I could not map that request to the current gesture catalog.',
      },
    });

    assert.equal(
      payload.structuredContent.message,
      'I could not map that request to the current gesture catalog.',
    );

    const state = await store.getState();
    assert.equal(state.director.activeSequence, null);
    assert.equal(
      state.director.lastError?.message,
      'I could not map that request to the current gesture catalog.',
    );
  });
});

test('tools/call writes terminal-visible stderr logs', async () => {
  await withServer(async (store) => {
    await store.syncRuntime({
      modelId: 'bhf-1-2',
      modelLabel: 'Red Tinker Bell',
      availableGestures: [
        {
          id: 'Greeting',
          label: 'Greeting',
          description: 'Friendly hello.',
          bestFor: ['hello'],
          durationMs: 2100,
        },
      ],
    });
  }, async (client, _store, _initializeResult, helpers) => {
    await client.request('tools/call', {
      name: 'stage_pose_sequence',
      arguments: {
        prompt: 'Say hello',
        steps: [{ gestureId: 'Greeting' }],
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 25));
    const stderr = helpers.getStderr();
    assert.match(stderr, /\[pose-studio mcp\] server\/start/);
    assert.match(stderr, /\[pose-studio mcp\] tools\/call\.start/);
    assert.match(stderr, /\[pose-studio mcp\] tools\/call\.end/);
    assert.match(stderr, /\[pose-studio bridge\] stageSequence\.timing/);
  }, { captureStderr: true });
});
