import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { access, copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_CODEX_MODEL = 'gpt-5.4';
const DEFAULT_REASONING_EFFORT = 'low';
const DEFAULT_TIMEOUT_MS = 45_000;
const FILES_TO_SEED = ['auth.json', 'installation_id'];

function normalizeString(value) {
  return `${value || ''}`.trim();
}

function buildCodexHomeConfig() {
  return [
    'notify = []',
    '',
    '[shell_environment_policy]',
    'inherit = "core"',
    '',
    '[plugins."github@openai-curated"]',
    'enabled = false',
    '',
    '[plugins."gmail@openai-curated"]',
    'enabled = false',
    '',
    '[plugins."google-calendar@openai-curated"]',
    'enabled = false',
    '',
    '[plugins."figma@openai-curated"]',
    'enabled = false',
    '',
    '[plugins."superpowers@openai-curated"]',
    'enabled = false',
    '',
    '[plugins."hyperframes@openai-curated"]',
    'enabled = false',
    '',
    '[plugins."remotion@openai-curated"]',
    'enabled = false',
    '',
    '[plugins."google-drive@openai-curated"]',
    'enabled = false',
    '',
  ].join('\n');
}

async function exists(filePath) {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function summarizeOutput(text = '') {
  return `${text || ''}`
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-6)
    .join(' | ');
}

function shellQuote(value) {
  return `'${`${value || ''}`.replaceAll("'", "'\\''")}'`;
}

function formatHistory(history = [], maxTurns = 6) {
  return history
    .slice(0, maxTurns)
    .reverse()
    .flatMap((turn) => {
      const lines = [];
      const userText = normalizeString(turn?.userTranscript);
      const replyText = normalizeString(turn?.replyText);

      if (userText) {
        lines.push(`User: ${userText}`);
      }
      if (replyText) {
        lines.push(`Agent: ${replyText}`);
      }
      return lines;
    })
    .join('\n');
}

export function buildInitialReplyPrompt({ transcript, history = [] } = {}) {
  const historyBlock = formatHistory(history);
  return [
    'You are the speaking agent inside Voice Cast.',
    'Reply in natural spoken English only.',
    'Keep every reply to one to three short sentences.',
    'Return only the exact text the agent should speak.',
    'Do not use markdown, bullet points, role labels, code fences, or stage directions.',
    'Do not narrate actions or explain your reasoning.',
    'Do not browse the web or use any tools.',
    historyBlock ? 'Recent conversation:' : '',
    historyBlock,
    `User: ${normalizeString(transcript)}`,
    'Agent:',
  ].filter(Boolean).join('\n');
}

export function buildResumeReplyPrompt({ transcript } = {}) {
  return [
    'Continue the same spoken conversation.',
    'Reply in natural spoken English only and keep it to one to three short sentences.',
    'Return only the exact text the agent should speak.',
    'Do not browse the web or use any tools.',
    `User: ${normalizeString(transcript)}`,
    'Agent:',
  ].join('\n');
}

function buildCodexBaseArgs({
  workdir,
} = {}) {
  return [
    '-a', 'never',
    '-s', 'read-only',
    '--disable', 'plugins',
    '--disable', 'shell_tool',
    '--disable', 'shell_snapshot',
    '--disable', 'multi_agent',
    '--disable', 'multi_agent_v2',
    '--disable', 'enable_fanout',
    '-C', workdir,
  ];
}

export function buildInitialExecArgs({
  model = DEFAULT_CODEX_MODEL,
  reasoningEffort = DEFAULT_REASONING_EFFORT,
  workdir,
  outputFilePath,
  prompt,
} = {}) {
  return [
    ...buildCodexBaseArgs({ workdir }),
    'exec',
    '--skip-git-repo-check',
    '-m', model,
    '-c', `model_reasoning_effort=${JSON.stringify(reasoningEffort)}`,
    '-o', outputFilePath,
    prompt,
  ];
}

export function buildResumeExecArgs({
  model = DEFAULT_CODEX_MODEL,
  reasoningEffort = DEFAULT_REASONING_EFFORT,
  workdir,
  outputFilePath,
  prompt,
} = {}) {
  return [
    ...buildCodexBaseArgs({ workdir }),
    'exec',
    'resume',
    '--last',
    '--skip-git-repo-check',
    '-m', model,
    '-c', `model_reasoning_effort=${JSON.stringify(reasoningEffort)}`,
    '-o', outputFilePath,
    prompt,
  ];
}

async function resolveCodexLaunch(codexCommand) {
  if (!path.isAbsolute(codexCommand)) {
    return {
      command: codexCommand,
      argsPrefix: [],
    };
  }

  try {
    const scriptHead = await readFile(codexCommand, 'utf8');
    if (scriptHead.startsWith('#!/usr/bin/env node')) {
      return {
        command: process.execPath,
        argsPrefix: [codexCommand],
      };
    }
  } catch {}

  return {
    command: codexCommand,
    argsPrefix: [],
  };
}

async function runCodexCommand({
  codexCommand = 'codex',
  args = [],
  cwd,
  env,
  outputFilePath = '',
  timeoutMs = DEFAULT_TIMEOUT_MS,
  spawnCodex = spawn,
} = {}) {
  const launch = await resolveCodexLaunch(codexCommand);
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let settled = false;

    const shellCommand = [launch.command, ...launch.argsPrefix, ...args]
      .map((segment) => shellQuote(segment))
      .join(' ');

    const child = spawnCodex('/bin/zsh', ['-lc', shellCommand], {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const timeoutId = setTimeout(() => {
      if (settled) {
        return;
      }
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!settled) {
          child.kill('SIGKILL');
        }
      }, 1_500).unref?.();
    }, timeoutMs);

    child.stdout?.on('data', (chunk) => {
      stdout += `${chunk}`;
    });
    child.stderr?.on('data', (chunk) => {
      stderr += `${chunk}`;
    });

    child.once('error', (error) => {
      settled = true;
      clearTimeout(timeoutId);
      reject(error);
    });

    child.once('exit', async (code, signal) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeoutId);

      if (code !== 0) {
        const summary = summarizeOutput(stderr) || summarizeOutput(stdout) || `signal ${signal || 'unknown'}`;
        reject(new Error(`Codex reply generation failed: ${summary}`));
        return;
      }

      let message = '';
      if (outputFilePath) {
        try {
          message = normalizeString(await readFile(outputFilePath, 'utf8'));
        } catch (error) {
          reject(new Error('Codex reply generation did not produce an output message.'));
          return;
        }
      }

      resolve({ message, stdout, stderr });
    });
  });
}

function createProfilePaths(rootDir, profileId) {
  const profileDir = path.join(rootDir, profileId);
  return {
    profileDir,
    codexHomeDir: path.join(profileDir, 'codex-home'),
    codexWorkdir: path.join(profileDir, 'workdir'),
    sessionReadyPath: path.join(profileDir, 'session-ready.json'),
    outputFilePath: path.join(profileDir, `reply-${randomUUID()}.txt`),
  };
}

async function ensureSourceCodexHome(sourceCodexHome) {
  for (const fileName of FILES_TO_SEED) {
    const filePath = path.join(sourceCodexHome, fileName);
    if (!(await exists(filePath))) {
      throw new Error(`Voice Cast could not find ${fileName} in ${sourceCodexHome}.`);
    }
  }
}

async function ensureCodexHome({ sourceCodexHome, codexHomeDir } = {}) {
  await ensureSourceCodexHome(sourceCodexHome);
  await mkdir(codexHomeDir, { recursive: true });

  await Promise.all(FILES_TO_SEED.map(async (fileName) => {
    await copyFile(
      path.join(sourceCodexHome, fileName),
      path.join(codexHomeDir, fileName),
    );
  }));

  await writeFile(
    path.join(codexHomeDir, 'config.toml'),
    buildCodexHomeConfig(),
  );

  await Promise.all([
    mkdir(path.join(codexHomeDir, 'memories'), { recursive: true }),
    mkdir(path.join(codexHomeDir, 'shell_snapshots'), { recursive: true }),
    mkdir(path.join(codexHomeDir, 'tmp'), { recursive: true }),
  ]);
}

function buildCodexEnv({ codexHomeDir } = {}) {
  return {
    ...process.env,
    CODEX_HOME: codexHomeDir,
    OTEL_SDK_DISABLED: 'true',
  };
}

export function createCodexReplyProvider({
  rootDir,
  sourceCodexHome = path.join(process.env.HOME || os.homedir(), '.codex'),
  codexCommand = 'codex',
  model = DEFAULT_CODEX_MODEL,
  reasoningEffort = DEFAULT_REASONING_EFFORT,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  runCommand = runCodexCommand,
  spawnCodex = spawn,
} = {}) {
  if (!rootDir) {
    throw new Error('createCodexReplyProvider requires a rootDir.');
  }

  async function checkHealth() {
    await ensureSourceCodexHome(sourceCodexHome);
    await mkdir(rootDir, { recursive: true });
    await runCommand({
      codexCommand,
      args: ['--version'],
      cwd: rootDir,
      env: {
        ...process.env,
        OTEL_SDK_DISABLED: 'true',
      },
      timeoutMs,
      spawnCodex,
    });

    return {
      ok: true,
      app: 'codex-reply',
    };
  }

  async function generateReply({ profile, transcript, history = [] } = {}) {
    const profileId = normalizeString(profile?.id);
    const normalizedTranscript = normalizeString(transcript);
    if (!profileId) {
      throw new Error('A production profile id is required for Codex replies.');
    }
    if (!normalizedTranscript) {
      throw new Error('A transcript is required for Codex replies.');
    }

    const paths = createProfilePaths(rootDir, profileId);
    await mkdir(paths.profileDir, { recursive: true });
    await mkdir(paths.codexWorkdir, { recursive: true });
    await ensureCodexHome({
      sourceCodexHome,
      codexHomeDir: paths.codexHomeDir,
    });

    const env = buildCodexEnv({ codexHomeDir: paths.codexHomeDir });
    const sessionReady = await exists(paths.sessionReadyPath);
    const prompt = sessionReady
      ? buildResumeReplyPrompt({ transcript: normalizedTranscript })
      : buildInitialReplyPrompt({ transcript: normalizedTranscript, history });
    const args = sessionReady
      ? buildResumeExecArgs({
        model,
        reasoningEffort,
        workdir: paths.codexWorkdir,
        outputFilePath: paths.outputFilePath,
        prompt,
      })
      : buildInitialExecArgs({
        model,
        reasoningEffort,
        workdir: paths.codexWorkdir,
        outputFilePath: paths.outputFilePath,
        prompt,
      });

    try {
      const result = await runCommand({
        codexCommand,
        args,
        cwd: paths.codexWorkdir,
        env,
        outputFilePath: paths.outputFilePath,
        timeoutMs,
        spawnCodex,
      });

      const replyText = normalizeString(result.message);
      if (!replyText) {
        throw new Error('Codex returned an empty reply.');
      }

      await writeFile(paths.sessionReadyPath, JSON.stringify({
        profileId,
        updatedAt: new Date().toISOString(),
      }, null, 2));

      return replyText;
    } finally {
      await rm(paths.outputFilePath, { force: true }).catch(() => {});
    }
  }

  return {
    checkHealth,
    generateReply,
  };
}
