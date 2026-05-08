import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { access, mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';

import {
  buildCodexHomeConfig,
  createIsolatedCodexExecutor,
} from './index.mjs';

test('buildCodexHomeConfig disables plugins in the isolated codex home', () => {
  const config = buildCodexHomeConfig();
  assert.match(config, /plugins\."github@openai-curated"/);
  assert.match(config, /enabled = false/);
});

test('executor seeds isolated codex homes and uses resume after the first prompt', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codex-exec-runner-'));
  const sourceCodexHome = path.join(tempDir, 'source-codex-home');
  await mkdir(sourceCodexHome, { recursive: true });
  await writeFile(path.join(sourceCodexHome, 'auth.json'), '{"ok":true}');
  await writeFile(path.join(sourceCodexHome, 'installation_id'), 'codex-exec-test');

  const calls = [];
  const executor = createIsolatedCodexExecutor({
    rootDir: path.join(tempDir, 'runner-root'),
    sourceCodexHome,
    spawnCodex(command, args, options) {
      const events = new Map();
      calls.push({ command, args, options });
      const outputFilePath = args[args.indexOf('-o') + 1];

      return {
        stdout: { on() {} },
        stderr: { on() {} },
        once(eventName, handler) {
          events.set(eventName, handler);
          if (eventName === 'exit') {
            void writeFile(outputFilePath, calls.length === 1 ? 'First reply.' : 'Second reply.').then(() => {
              handler(0, null);
            });
          }
        },
        kill() {},
      };
    },
  });

  const first = await executor.runPrompt({
    sessionId: 'session-alpha',
    initialPrompt: 'Initial prompt',
    resumePrompt: 'Resume prompt',
  });
  const second = await executor.runPrompt({
    sessionId: 'session-alpha',
    initialPrompt: 'Initial prompt',
    resumePrompt: 'Resume prompt',
  });

  assert.equal(first.text, 'First reply.');
  assert.equal(first.mode, 'initial');
  assert.equal(second.text, 'Second reply.');
  assert.equal(second.mode, 'resume');
  assert.equal(calls[0].args.includes('resume'), false);
  assert.equal(calls[1].args.includes('resume'), true);
  assert.equal(calls[1].options.env.OTEL_SDK_DISABLED, 'true');
  assert.match(calls[1].options.env.CODEX_HOME, /session-alpha\/codex-home$/);

  const configToml = await readFile(path.join(calls[0].options.env.CODEX_HOME, 'config.toml'), 'utf8');
  assert.match(configToml, /plugins\."superpowers@openai-curated"/);
});

test('executor can run codex in an explicit workspace root while keeping the isolated codex home', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codex-exec-workspace-'));
  const sourceCodexHome = path.join(tempDir, 'source-codex-home');
  const workspaceRoot = path.join(tempDir, 'workspace-root');
  await mkdir(sourceCodexHome, { recursive: true });
  await mkdir(workspaceRoot, { recursive: true });
  await writeFile(path.join(sourceCodexHome, 'auth.json'), '{"ok":true}');
  await writeFile(path.join(sourceCodexHome, 'installation_id'), 'codex-exec-test');

  const calls = [];
  const executor = createIsolatedCodexExecutor({
    rootDir: path.join(tempDir, 'runner-root'),
    sourceCodexHome,
    spawnCodex(command, args, options) {
      calls.push({ command, args, options });
      const outputFilePath = args[args.indexOf('-o') + 1];

      return {
        stdout: { on() {} },
        stderr: { on() {} },
        once(eventName, handler) {
          if (eventName === 'exit') {
            void writeFile(outputFilePath, 'Workspace reply.').then(() => handler(0, null));
          }
        },
        kill() {},
      };
    },
  });

  const result = await executor.runPrompt({
    sessionId: 'session-alpha',
    initialPrompt: 'Initial prompt',
    workspaceRoot,
  });

  assert.equal(result.text, 'Workspace reply.');
  assert.equal(calls[0].options.cwd, workspaceRoot);
  assert.equal(calls[0].args[calls[0].args.indexOf('-C') + 1], workspaceRoot);
  assert.match(calls[0].options.env.CODEX_HOME, /session-alpha\/codex-home$/);
});

test('executor health check verifies the source codex home and creates the root directory', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codex-exec-health-'));
  const sourceCodexHome = path.join(tempDir, 'source-codex-home');
  const rootDir = path.join(tempDir, 'runner-root');
  await mkdir(sourceCodexHome, { recursive: true });
  await writeFile(path.join(sourceCodexHome, 'auth.json'), '{"ok":true}');
  await writeFile(path.join(sourceCodexHome, 'installation_id'), 'codex-exec-test');

  const executor = createIsolatedCodexExecutor({
    rootDir,
    sourceCodexHome,
    spawnCodex() {
      return {
        stdout: { on() {} },
        stderr: { on() {} },
        once(eventName, handler) {
          if (eventName === 'exit') {
            handler(0, null);
          }
        },
        kill() {},
      };
    },
  });

  const payload = await executor.checkHealth();
  await access(rootDir);
  assert.equal(payload.app, 'codex-exec');
});
