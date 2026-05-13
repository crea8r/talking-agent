import path from 'node:path';
import { EventEmitter } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';

export async function seedBasicSourceCodexHome(sourceCodexHome, { configToml = '' } = {}) {
  await mkdir(sourceCodexHome, { recursive: true });
  await writeFile(path.join(sourceCodexHome, 'auth.json'), '{"ok":true}');
  await writeFile(path.join(sourceCodexHome, 'installation_id'), 'codex-exec-test');
  await writeFile(path.join(sourceCodexHome, 'config.toml'), configToml);
}

export async function seedPlugin({
  sourceCodexHome,
  marketplace = 'openai-curated',
  name,
  version = '0.1.0',
  displayName,
} = {}) {
  const pluginDir = path.join(
    sourceCodexHome,
    'plugins',
    'cache',
    marketplace,
    name,
    '1141b764',
    '.codex-plugin',
  );
  await mkdir(pluginDir, { recursive: true });
  await writeFile(
    path.join(pluginDir, 'plugin.json'),
    JSON.stringify({
      name,
      version,
      interface: { displayName: displayName || name },
    }),
  );
}

export async function seedForkedSourceCodexHome(rootDir, originalSessionId) {
  const sourceCodexHome = path.join(rootDir, 'source-codex-home');
  const sessionDir = path.join(sourceCodexHome, 'sessions', '2026', '05', '08');
  const shellSnapshotDir = path.join(sourceCodexHome, 'shell_snapshots');

  await seedBasicSourceCodexHome(sourceCodexHome, { configToml: 'model = "gpt-5.4"\n' });
  await seedPlugin({ sourceCodexHome, name: 'github', displayName: 'GitHub' });
  await mkdir(sessionDir, { recursive: true });
  await mkdir(shellSnapshotDir, { recursive: true });
  await writeFile(path.join(shellSnapshotDir, 'skip-me.sh'), 'echo do not copy\n');
  await writeFile(
    path.join(sourceCodexHome, 'session_index.jsonl'),
    `${JSON.stringify({
      id: originalSessionId,
      thread_name: 'Original coding thread',
      updated_at: '2026-05-08T10:00:00.000Z',
    })}\n`,
  );
  await writeFile(
    path.join(sessionDir, `rollout-2026-05-08T10-00-00-${originalSessionId}.jsonl`),
    [
      JSON.stringify({
        timestamp: '2026-05-08T10:00:00.000Z',
        type: 'session_meta',
        payload: {
          id: originalSessionId,
          timestamp: '2026-05-08T10:00:00.000Z',
          cwd: '/Users/hieu/Work/crea8r/talking-agent',
          source: 'desktop',
        },
      }),
      JSON.stringify({
        timestamp: '2026-05-08T10:01:00.000Z',
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'Help me implement app4.' }],
        },
      }),
      '',
    ].join('\n'),
  );

  return sourceCodexHome;
}

export function createMockMcpSpawn({
  threadId = 'thread-1',
  onToolCall = null,
} = {}) {
  const spawns = [];
  const toolCalls = [];
  const cancellations = [];

  function spawnCodex(command, args, options = {}) {
    const child = new EventEmitter();
    const stdout = new EventEmitter();
    const stderr = new EventEmitter();
    const stdin = new EventEmitter();
    let inputBuffer = '';
    let exited = false;
    const spawnRecord = { command, args, options, child };
    spawns.push(spawnRecord);

    function emitResponse(payload) {
      stdout.emit('data', `${JSON.stringify(payload)}\n`);
    }

    function emitNotification(method, params = {}) {
      stdout.emit('data', `${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
    }

    function emitStderr(text) {
      stderr.emit('data', `${text}`);
    }

    function handleToolCall(message) {
      const call = {
        name: message?.params?.name || '',
        arguments: message?.params?.arguments || {},
      };
      toolCalls.push(call);
      const content =
        typeof onToolCall === 'function'
          ? onToolCall({ ...call, id: message.id, emitResponse, emitNotification, emitStderr })
          : call.name === 'codex-reply'
            ? 'Second reply.'
            : 'First reply.';

      if (content === null) {
        return;
      }

      setImmediate(() => {
        emitResponse({
          jsonrpc: '2.0',
          id: message.id,
          result: {
            content: [{ type: 'text', text: `${content}` }],
            structuredContent: {
              threadId,
              content: `${content}`,
            },
          },
        });
      });
    }

    function handleMessage(message) {
      if (message.method === 'initialize') {
        emitResponse({
          jsonrpc: '2.0',
          id: message.id,
          result: {
            protocolVersion: '2025-03-26',
            capabilities: {},
            serverInfo: { name: 'mock-codex', version: '1.0.0' },
          },
        });
        return;
      }
      if (message.method === 'notifications/cancelled') {
        cancellations.push(message.params || {});
        return;
      }
      if (message.method === 'tools/call') {
        handleToolCall(message);
      }
    }

    stdin.write = (chunk) => {
      inputBuffer += `${chunk || ''}`;
      let newlineIndex = inputBuffer.indexOf('\n');
      while (newlineIndex >= 0) {
        const line = inputBuffer.slice(0, newlineIndex).trim();
        inputBuffer = inputBuffer.slice(newlineIndex + 1);
        if (line) {
          handleMessage(JSON.parse(line));
        }
        newlineIndex = inputBuffer.indexOf('\n');
      }
      return true;
    };
    stdin.end = () => {};
    child.stdout = stdout;
    child.stderr = stderr;
    child.stdin = stdin;
    child.kill = () => {
      if (exited) {
        return false;
      }
      exited = true;
      setImmediate(() => child.emit('exit', 0, null));
      return true;
    };

    return child;
  }

  return {
    spawnCodex,
    spawns,
    toolCalls,
    cancellations,
  };
}
