import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';

import {
  buildDirectorCodexExecArgs,
  createPoseStudioRequestHandler,
} from './server-lib.mjs';

function createBridgeStoreStub() {
  const state = {
    director: {
      revision: 0,
      activeSequence: null,
      lastSequence: null,
      lastError: null,
      playback: {
        status: 'idle',
        sequenceId: '',
        source: '',
        currentStepIndex: -1,
        currentGestureId: '',
        updatedAt: null,
      },
    },
  };

  return {
    state,
    stateFilePath: '/private/tmp/pose-studio-test-state.json',
    async getCatalog() {
      return {
        activeModelId: 'bhf-1-2',
        activeModelLabel: 'Red Tinker Bell',
        requestedModelId: 'bhf-1-2',
        catalogVersion: 'test',
        models: [
          { id: 'bhf-1-2', label: 'Red Tinker Bell' },
          { id: 'fbf-1-0', label: 'Green Fairy' },
          { id: 'smg-1-0', label: 'Snowshoe' },
        ],
        gestures: [],
      };
    },
    async getState() {
      return JSON.parse(JSON.stringify(state));
    },
    async syncRuntime() {
      return {};
    },
    async reportError({ modelId = '', prompt = '', message = '' } = {}) {
      state.director.revision += 1;
      state.director.activeSequence = null;
      state.director.lastError = {
        revision: state.director.revision,
        modelId,
        prompt,
        message,
      };
      return state.director.lastError;
    },
    async stageSequence({ modelId = 'bhf-1-2', prompt = '', steps = [] } = {}) {
      state.director.revision += 1;
      state.director.lastError = null;
      state.director.activeSequence = {
        sequenceId: `seq-${state.director.revision}`,
        revision: state.director.revision,
        modelId,
        prompt,
        steps,
      };
      state.director.lastSequence = {
        ...state.director.activeSequence,
        status: 'queued',
      };
      return state.director.activeSequence;
    },
    async updatePlayback() {
      return {};
    },
    async stopSequence() {
      return {};
    },
  };
}

function createSpawnStub() {
  const calls = [];
  const children = [];

  const spawnFn = (command, args, options) => {
    const child = new EventEmitter();
    child.stdin = {
      ended: false,
      end() {
        this.ended = true;
      },
    };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {
      child.killed = true;
      child.emit('exit', null, 'SIGTERM');
    };
    child.pid = 4242 + calls.length;
    child.killed = false;
    calls.push({ command, args, options, child });
    children.push(child);
    return child;
  };

  return {
    calls,
    children,
    spawnFn,
  };
}

async function invokeHandler(handler, {
  method = 'GET',
  url = '/',
  body = null,
} = {}) {
  const chunks = [];
  const request = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
  request.method = method;
  request.url = url;
  request.headers = body
    ? { 'content-type': 'application/json; charset=utf-8' }
    : {};

  const response = {
    statusCode: 200,
    headers: {},
    ended: false,
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
      return this;
    },
    end(chunk = '') {
      if (chunk) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      }
      this.ended = true;
    },
  };

  await handler(request, response);

  return {
    statusCode: response.statusCode,
    headers: response.headers,
    payload: chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null,
  };
}

async function withHandler(run, options = {}) {
  const bridgeStore = options.bridgeStore || createBridgeStoreStub();
  const handler = createPoseStudioRequestHandler({
    host: '127.0.0.1',
    port: 4387,
    repoRoot: '/Users/hieu/Work/crea8r/talking-agent',
    bridgeStore,
    spawnCodex: options.spawnCodex,
  });

  await run({ bridgeStore, handler });
}

test('buildDirectorCodexExecArgs injects a local pose-studio MCP config override', () => {
  const args = buildDirectorCodexExecArgs({
    repoRoot: '/Users/hieu/Work/crea8r/talking-agent',
    stateFilePath: '/private/tmp/pose-studio-state.json',
    prompt: 'Make her greet, think, then bow.',
    modelId: 'bhf-1-2',
  });

  assert.deepEqual(args.slice(0, 7), [
    'exec',
    '--json',
    '--ephemeral',
    '--skip-git-repo-check',
    '-s',
    'read-only',
    '-C',
  ]);
  assert.match(args.join(' '), /mcp_servers\.pose-studio\.command=/);
  assert.match(args.join(' '), /mcp_servers\.pose-studio\.args=/);
  assert.match(args.join(' '), /POSE_STUDIO_BRIDGE_STATE_PATH/);
  assert.match(args.join(' '), /tools\.report_pose_sequence_error\.approval_mode/);
  assert.match(args.join(' '), /tools\.stage_pose_sequence\.approval_mode=\"approve\"/);
  assert.match(args.at(-1), /pose:\/\/catalog/);
  assert.match(args.at(-1), /stage_pose_sequence/);
  assert.match(args.at(-1), /report_pose_sequence_error/);
  assert.match(args.at(-1), /bhf-1-2/);
  assert.match(args.at(-1), /Make her greet, think, then bow\./);
});

test('POST /api/director/request launches a single ephemeral codex run', async () => {
  const spawnStub = createSpawnStub();

  await withHandler(async ({ handler }) => {
    const firstResponse = await invokeHandler(handler, {
      method: 'POST',
      url: '/api/director/request',
      body: {
        modelId: 'bhf-1-2',
        prompt: 'Wave hello, pause, then settle into Pose.',
      },
    });

    assert.equal(firstResponse.statusCode, 202);
    assert.equal(firstResponse.payload.ok, true);
    assert.equal(spawnStub.calls.length, 1);
    assert.equal(spawnStub.calls[0].command, 'codex');
    assert.equal(spawnStub.children[0].stdin.ended, true);

    const activeState = await invokeHandler(handler, {
      method: 'GET',
      url: '/api/director/state',
    });
    assert.equal(activeState.statusCode, 200);
    assert.equal(activeState.payload.request.active, true);
    assert.equal(activeState.payload.request.modelId, 'bhf-1-2');

    const secondResponse = await invokeHandler(handler, {
      method: 'POST',
      url: '/api/director/request',
      body: {
        modelId: 'fbf-1-0',
        prompt: 'Spin and nod.',
      },
    });

    assert.equal(secondResponse.statusCode, 409);
    assert.equal(secondResponse.payload.error.code, 'DIRECTOR_REQUEST_ACTIVE');
    assert.equal(secondResponse.payload.error.data.request.active, true);

    spawnStub.children[0].emit('exit', 0, null);

    const clearedState = await invokeHandler(handler, {
      method: 'GET',
      url: '/api/director/state',
    });
    assert.equal(clearedState.statusCode, 200);
    assert.equal(clearedState.payload.request.active, false);

    const thirdResponse = await invokeHandler(handler, {
      method: 'POST',
      url: '/api/director/request',
      body: {
        modelId: 'smg-1-0',
        prompt: 'Look around, then wave goodbye.',
      },
    });

    assert.equal(thirdResponse.statusCode, 202);
    assert.equal(spawnStub.calls.length, 2);
    spawnStub.children[1].emit('exit', 0, null);
  }, {
    spawnCodex: spawnStub.spawnFn,
  });
});

test('POST /api/director/request rejects an empty prompt', async () => {
  const spawnStub = createSpawnStub();

  await withHandler(async ({ handler }) => {
    const response = await invokeHandler(handler, {
      method: 'POST',
      url: '/api/director/request',
      body: {
        modelId: 'bhf-1-2',
        prompt: '   ',
      },
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.payload.error.code, 'DIRECTOR_REQUEST_INVALID');
    assert.equal(spawnStub.calls.length, 0);
  }, {
    spawnCodex: spawnStub.spawnFn,
  });
});

test('GET /api/director/state exposes the MCP-reported error text when no sequence was staged', async () => {
  const spawnStub = createSpawnStub();

  await withHandler(async ({ handler, bridgeStore }) => {
    const accepted = await invokeHandler(handler, {
      method: 'POST',
      url: '/api/director/request',
      body: {
        modelId: 'bhf-1-2',
        prompt: 'Tell me something instead of moving.',
      },
    });

    assert.equal(accepted.statusCode, 202);

    await bridgeStore.reportError({
      modelId: 'bhf-1-2',
      prompt: 'Tell me something instead of moving.',
      message: 'I can describe the motion, but I could not map it to the current gesture catalog.',
    });
    spawnStub.children[0].emit('exit', 0, null);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const stateResponse = await invokeHandler(handler, {
      method: 'GET',
      url: '/api/director/state',
    });

    assert.equal(stateResponse.statusCode, 200);
    assert.equal(stateResponse.payload.request.active, false);
    assert.match(
      stateResponse.payload.request.errorText,
      /could not map it to the current gesture catalog/i,
    );
  }, {
    spawnCodex: spawnStub.spawnFn,
  });
});

test('GET /api/director/state ignores stale MCP-reported errors from earlier revisions', async () => {
  const spawnStub = createSpawnStub();

  await withHandler(async ({ handler, bridgeStore }) => {
    await bridgeStore.reportError({
      modelId: 'bhf-1-2',
      prompt: 'An older prompt.',
      message: 'Old error.',
    });

    const accepted = await invokeHandler(handler, {
      method: 'POST',
      url: '/api/director/request',
      body: {
        modelId: 'bhf-1-2',
        prompt: 'Explain why you cannot map this request.',
      },
    });

    assert.equal(accepted.statusCode, 202);

    spawnStub.children[0].emit('exit', 0, null);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const stateResponse = await invokeHandler(handler, {
      method: 'GET',
      url: '/api/director/state',
    });

    assert.equal(stateResponse.statusCode, 200);
    assert.equal(stateResponse.payload.request.active, false);
    assert.equal(
      stateResponse.payload.request.errorText,
      'Local Codex finished without staging a sequence.',
    );
  }, {
    spawnCodex: spawnStub.spawnFn,
  });
});
