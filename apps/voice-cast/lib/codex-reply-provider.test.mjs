import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { access, mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';

import {
  buildInitialReplyPrompt,
  buildResumeReplyPrompt,
  createCodexReplyProvider,
} from './codex-reply-provider.mjs';

test('reply prompts use spoken-agent instructions and include the current transcript', () => {
  const initialPrompt = buildInitialReplyPrompt({
    transcript: 'Where should we go next?',
    history: [
      { userTranscript: 'Hello there.', replyText: 'Hi.' },
      { userTranscript: 'Do you know this place?', replyText: 'I do.' },
    ],
  });
  const resumePrompt = buildResumeReplyPrompt({
    transcript: 'Tell me what you found.',
  });

  assert.match(initialPrompt, /Voice Cast/);
  assert.match(initialPrompt, /User: Hello there\./);
  assert.match(initialPrompt, /User: Where should we go next\?/);
  assert.match(initialPrompt, /Agent:/);
  assert.match(resumePrompt, /Continue the same spoken conversation/);
  assert.match(resumePrompt, /User: Tell me what you found\./);
});

test('provider seeds an isolated codex home and uses exec then resume for the same profile', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'voice-cast-codex-provider-'));
  const sourceCodexHome = path.join(tempDir, 'source-codex-home');
  await mkdir(sourceCodexHome, { recursive: true });
  await writeFile(path.join(sourceCodexHome, 'auth.json'), '{"ok":true}');
  await writeFile(path.join(sourceCodexHome, 'installation_id'), 'voice-cast-test');

  const calls = [];
  const provider = createCodexReplyProvider({
    rootDir: path.join(tempDir, 'provider-root'),
    sourceCodexHome,
    model: 'gpt-5.4',
    reasoningEffort: 'minimal',
    async runCommand({ args, cwd, env }) {
      calls.push({ args, cwd, env });
      if (args.includes('--version')) {
        return { message: '', stdout: 'OpenAI Codex v0.0.0', stderr: '' };
      }

      return {
        message: calls.length === 1 ? 'First codex reply.' : 'Second codex reply.',
        stdout: '',
        stderr: '',
      };
    },
  });

  const firstReply = await provider.generateReply({
    profile: { id: 'profile-alpha' },
    transcript: 'Say hello.',
    history: [
      { userTranscript: 'Who are you?', replyText: 'A voice agent.' },
    ],
  });
  const secondReply = await provider.generateReply({
    profile: { id: 'profile-alpha' },
    transcript: 'Say something else.',
    history: [],
  });

  assert.equal(firstReply, 'First codex reply.');
  assert.equal(secondReply, 'Second codex reply.');
  assert.deepEqual(calls[0].args.includes('resume'), false);
  assert.equal(calls[1].args.includes('resume'), true);
  assert.equal(calls[1].args.includes('--last'), true);
  assert.equal(calls[0].env.OTEL_SDK_DISABLED, 'true');
  assert.match(calls[0].env.CODEX_HOME, /profile-alpha\/codex-home$/);

  const configToml = await readFile(path.join(calls[0].env.CODEX_HOME, 'config.toml'), 'utf8');
  assert.match(configToml, /plugins\."github@openai-curated"/);
});

test('provider health check verifies codex auth seed and codex binary access', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'voice-cast-codex-health-'));
  const sourceCodexHome = path.join(tempDir, 'source-codex-home');
  await mkdir(sourceCodexHome, { recursive: true });
  await writeFile(path.join(sourceCodexHome, 'auth.json'), '{"ok":true}');
  await writeFile(path.join(sourceCodexHome, 'installation_id'), 'voice-cast-test');

  let versionArgs = [];
  const provider = createCodexReplyProvider({
    rootDir: path.join(tempDir, 'provider-root'),
    sourceCodexHome,
    async runCommand({ args }) {
      versionArgs = args;
      return { message: '', stdout: 'OpenAI Codex v0.0.0', stderr: '' };
    },
  });

  const payload = await provider.checkHealth();
  assert.equal(payload.app, 'codex-reply');
  assert.deepEqual(versionArgs, ['--version']);
});

test('provider health check creates the root directory before launching codex', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'voice-cast-codex-health-root-'));
  const sourceCodexHome = path.join(tempDir, 'source-codex-home');
  const rootDir = path.join(tempDir, 'provider-root');
  await mkdir(sourceCodexHome, { recursive: true });
  await writeFile(path.join(sourceCodexHome, 'auth.json'), '{"ok":true}');
  await writeFile(path.join(sourceCodexHome, 'installation_id'), 'voice-cast-test');

  const provider = createCodexReplyProvider({
    rootDir,
    sourceCodexHome,
    async runCommand() {
      return { message: '', stdout: 'OpenAI Codex v0.0.0', stderr: '' };
    },
  });

  await provider.checkHealth();
  await access(rootDir);
});
