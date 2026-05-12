import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';

import { createIsolatedCodexExecutor } from './index.mjs';
import { seedBasicSourceCodexHome, seedPlugin } from './test-helpers.mjs';

test('executor seeds isolated codex homes and uses resume after the first prompt', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codex-exec-runner-'));
  const sourceCodexHome = path.join(tempDir, 'source-codex-home');
  await seedBasicSourceCodexHome(sourceCodexHome);

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
            void writeFile(outputFilePath, calls.length === 1 ? 'First reply.' : 'Second reply.').then(() => handler(0, null));
          }
        },
        kill() {},
      };
    },
  });

  const first = await executor.runPrompt({ sessionId: 'session-alpha', initialPrompt: 'Initial prompt', resumePrompt: 'Resume prompt' });
  const second = await executor.runPrompt({ sessionId: 'session-alpha', initialPrompt: 'Initial prompt', resumePrompt: 'Resume prompt' });

  assert.equal(first.mode, 'initial');
  assert.equal(second.mode, 'resume');
  assert.equal(calls[0].args.includes('resume'), false);
  assert.equal(calls[1].args.includes('resume'), true);
  assert.equal(calls[1].options.env.OTEL_SDK_DISABLED, 'true');
  assert.match(calls[1].options.env.CODEX_HOME, /session-alpha\/codex-home$/);

  const configToml = await readFile(path.join(calls[0].options.env.CODEX_HOME, 'config.toml'), 'utf8');
  assert.doesNotMatch(configToml, /plugins\."/);
  assert.match(configToml, /notify = \[\]/);
});

test('executor enables selected plugins and advanced tools per prompt', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codex-exec-policy-'));
  const sourceCodexHome = path.join(tempDir, 'source-codex-home');
  await seedBasicSourceCodexHome(sourceCodexHome);
  await seedPlugin({ sourceCodexHome, name: 'github', displayName: 'GitHub' });

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
            void writeFile(outputFilePath, 'Policy reply.').then(() => handler(0, null));
          }
        },
        kill() {},
      };
    },
  });

  await executor.runPrompt({
    sessionId: 'session-alpha',
    initialPrompt: 'Initial prompt',
    capabilityPolicy: {
      enabledPluginIds: ['github@openai-curated'],
      enableControlComputer: true,
      enableComplexTasks: true,
    },
  });

  assert.equal(calls[0].args.includes('--disable'), false);
  const configToml = await readFile(path.join(calls[0].options.env.CODEX_HOME, 'config.toml'), 'utf8');
  assert.match(configToml, /\[plugins\."github@openai-curated"\]\nenabled = true/);
});

test('executor can run codex in an explicit workspace root while keeping the isolated codex home', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codex-exec-workspace-'));
  const sourceCodexHome = path.join(tempDir, 'source-codex-home');
  const workspaceRoot = path.join(tempDir, 'workspace-root');
  await seedBasicSourceCodexHome(sourceCodexHome);
  await mkdir(workspaceRoot, { recursive: true });

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

  const result = await executor.runPrompt({ sessionId: 'session-alpha', initialPrompt: 'Initial prompt', workspaceRoot });
  assert.equal(result.text, 'Workspace reply.');
  assert.equal(calls[0].options.cwd, workspaceRoot);
  assert.equal(calls[0].args[calls[0].args.indexOf('-C') + 1], workspaceRoot);
  assert.match(calls[0].options.env.CODEX_HOME, /session-alpha\/codex-home$/);
});
