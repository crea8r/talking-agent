import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile } from 'node:fs/promises';

import { createPersistentCodexMcpWorker } from './index.mjs';
import {
  createMockMcpSpawn,
  seedBasicSourceCodexHome,
  seedPlugin,
} from './test-helpers.mjs';

test('persistent MCP worker reuses one Codex server and sends resume turns via codex-reply', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codex-mcp-worker-'));
  const sourceCodexHome = path.join(tempDir, 'source-codex-home');
  await seedBasicSourceCodexHome(sourceCodexHome);

  const mock = createMockMcpSpawn();
  const worker = createPersistentCodexMcpWorker({
    rootDir: path.join(tempDir, 'worker-root'),
    sourceCodexHome,
    spawnCodex: mock.spawnCodex,
  });

  const first = await worker.runPrompt({
    sessionId: 'session-alpha',
    initialPrompt: 'Warm up this call.',
    resumePrompt: 'Continue this call.',
    workspaceRoot: '/tmp/workspace-alpha',
  });
  const second = await worker.runPrompt({
    sessionId: 'session-alpha',
    initialPrompt: 'Warm up this call.',
    resumePrompt: 'Continue this call.',
    workspaceRoot: '/tmp/workspace-alpha',
  });

  assert.equal(first.mode, 'initial');
  assert.equal(second.mode, 'resume');
  assert.equal(mock.spawns.length, 1);
  assert.equal(mock.spawns[0].args.includes('mcp-server'), true);
  assert.equal(mock.toolCalls[0].name, 'codex');
  assert.equal(mock.toolCalls[0].arguments.prompt, 'Warm up this call.');
  assert.equal(mock.toolCalls[1].name, 'codex-reply');
  assert.equal(mock.toolCalls[1].arguments.threadId, 'thread-1');
  assert.equal(mock.toolCalls[1].arguments.prompt, 'Continue this call.');
  assert.match(mock.spawns[0].options.env.CODEX_HOME, /session-alpha\/codex-home$/);
});

test('persistent MCP worker syncs plugin config and can cancel an in-flight tool call', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codex-mcp-policy-'));
  const sourceCodexHome = path.join(tempDir, 'source-codex-home');
  await seedBasicSourceCodexHome(sourceCodexHome);
  await seedPlugin({ sourceCodexHome, name: 'github', displayName: 'GitHub' });

  const mock = createMockMcpSpawn({
    onToolCall({ name, id, emitResponse }) {
      if (name !== 'codex') {
        return 'Unexpected.';
      }
      setTimeout(() => {
        emitResponse({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: 'Late reply.' }],
            structuredContent: {
              threadId: 'thread-2',
              content: 'Late reply.',
            },
          },
        });
      }, 20);
      return null;
    },
  });
  const worker = createPersistentCodexMcpWorker({
    rootDir: path.join(tempDir, 'worker-root'),
    sourceCodexHome,
    spawnCodex: mock.spawnCodex,
  });

  await worker.syncSessionCapabilities({
    sessionId: 'session-alpha',
    capabilityPolicy: { enabledPluginIds: ['github@openai-curated'] },
  });
  const configToml = await readFile(
    path.join(tempDir, 'worker-root', 'session-alpha', 'codex-home', 'config.toml'),
    'utf8',
  );
  assert.match(configToml, /\[plugins\."github@openai-curated"\]\nenabled = true/);

  const handle = await worker.startPrompt({
    sessionId: 'session-alpha',
    initialPrompt: 'Start a long reply.',
  });
  assert.equal(handle.abort('Human interrupted.'), true);
  await assert.rejects(handle.promise, /Human interrupted/);
  assert.deepEqual(mock.cancellations[0], {
    requestId: 2,
    reason: 'Human interrupted.',
  });
});

test('persistent MCP worker forwards MCP notifications and stderr logs to session subscribers', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codex-mcp-events-'));
  const sourceCodexHome = path.join(tempDir, 'source-codex-home');
  await seedBasicSourceCodexHome(sourceCodexHome);

  const mock = createMockMcpSpawn({
    onToolCall({ emitNotification, emitStderr }) {
      emitNotification('codex/event', {
        payload: {
          type: 'agent_message',
          message: 'Checking your calendar connection.',
        },
      });
      emitNotification('codex/event', {
        payload: {
          type: 'mcp_tool_call',
          name: '_get_availability',
        },
      });
      emitStderr('warning: background connector is slow\n');
      return 'Done.';
    },
  });
  const worker = createPersistentCodexMcpWorker({
    rootDir: path.join(tempDir, 'worker-root'),
    sourceCodexHome,
    spawnCodex: mock.spawnCodex,
  });
  const events = [];
  worker.subscribeSessionEvents({
    sessionId: 'session-alpha',
    listener: (event) => events.push(event),
  });

  const reply = await worker.runPrompt({
    sessionId: 'session-alpha',
    initialPrompt: 'Check the calendar.',
  });

  assert.equal(reply.text, 'Done.');
  assert.equal(events[0].kind, 'notice');
  assert.equal(events[0].text, 'Checking your calendar connection.');
  assert.equal(events[0].speakText, 'Checking your calendar connection.');
  assert.equal(events[1].kind, 'tool-start');
  assert.equal(events[1].text, 'Using get availability.');
  assert.equal(events[2].kind, 'log');
  assert.equal(events[2].level, 'warn');
  assert.equal(events[2].text, 'warning: background connector is slow');
});
