import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { access, copyFile, cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_CODEX_MODEL = 'gpt-5.4';
export const DEFAULT_REASONING_EFFORT = 'low';
export const DEFAULT_TIMEOUT_MS = 45_000;
const FILES_TO_SEED = ['auth.json', 'installation_id'];

function normalizeString(value) {
  return `${value || ''}`.trim();
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

async function exists(filePath) {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export function buildCodexHomeConfig() {
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

function buildCodexBaseArgs({ workdir } = {}) {
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

function buildExecArgs({
  mode = 'initial',
  model = DEFAULT_CODEX_MODEL,
  reasoningEffort = DEFAULT_REASONING_EFFORT,
  workdir,
  outputFilePath,
  prompt,
} = {}) {
  const base = [
    ...buildCodexBaseArgs({ workdir }),
    'exec',
  ];

  if (mode === 'resume') {
    base.push('resume', '--last');
  }

  base.push(
    '--skip-git-repo-check',
    '-m', model,
    '-c', `model_reasoning_effort=${JSON.stringify(reasoningEffort)}`,
    '-o', outputFilePath,
    prompt,
  );

  return base;
}

function buildForkedCallExecArgs({
  sessionId,
  workdir,
  outputFilePath,
  prompt,
} = {}) {
  return [
    '-a', 'never',
    '-C', workdir,
    'exec',
    'resume',
    sessionId,
    '--skip-git-repo-check',
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

function resolveExecutionWorkdir(paths, workspaceRoot) {
  const cleanedWorkspaceRoot = normalizeString(workspaceRoot);
  return cleanedWorkspaceRoot || paths.codexWorkdir;
}

async function ensureSourceCodexHome(sourceCodexHome) {
  for (const fileName of FILES_TO_SEED) {
    const filePath = path.join(sourceCodexHome, fileName);
    if (!(await exists(filePath))) {
      throw new Error(`Codex auth seed is missing ${fileName} in ${sourceCodexHome}.`);
    }
  }
}

async function ensureCodexHome({ sourceCodexHome, codexHomeDir } = {}) {
  await ensureSourceCodexHome(sourceCodexHome);
  await mkdir(codexHomeDir, { recursive: true });

  await Promise.all(
    FILES_TO_SEED.map(async (fileName) => {
      await copyFile(
        path.join(sourceCodexHome, fileName),
        path.join(codexHomeDir, fileName),
      );
    }),
  );

  await writeFile(path.join(codexHomeDir, 'config.toml'), buildCodexHomeConfig());
  await Promise.all([
    mkdir(path.join(codexHomeDir, 'memories'), { recursive: true }),
    mkdir(path.join(codexHomeDir, 'shell_snapshots'), { recursive: true }),
    mkdir(path.join(codexHomeDir, 'tmp'), { recursive: true }),
  ]);
}

function createAbortError(message = 'Codex request aborted.') {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

function createCodexEnv({ codexHomeDir } = {}) {
  return {
    ...process.env,
    CODEX_HOME: codexHomeDir,
    OTEL_SDK_DISABLED: 'true',
  };
}

function createSessionPaths(rootDir, sessionId) {
  const sessionDir = path.join(rootDir, normalizeString(sessionId));
  return {
    sessionDir,
    codexHomeDir: path.join(sessionDir, 'codex-home'),
    codexWorkdir: path.join(sessionDir, 'workdir'),
    sessionReadyPath: path.join(sessionDir, 'session-ready.json'),
    outputFilePath: path.join(sessionDir, `reply-${randomUUID()}.txt`),
  };
}

function createLaunchPaths(rootDir, launchId) {
  const cleanedLaunchId = normalizeString(launchId);
  const launchDir = path.join(rootDir, cleanedLaunchId);
  return {
    launchDir,
    codexHomeDir: path.join(launchDir, 'codex-home'),
    workdir: path.join(launchDir, 'workdir'),
    outputFilePath: path.join(launchDir, `reply-${randomUUID()}.txt`),
  };
}

async function readSessionIndexEntries(codexHomeDir) {
  const sessionIndexPath = path.join(codexHomeDir, 'session_index.jsonl');
  const raw = await readFile(sessionIndexPath, 'utf8').catch(() => '');
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

async function appendSessionIndexEntry(codexHomeDir, entry) {
  const sessionIndexPath = path.join(codexHomeDir, 'session_index.jsonl');
  const line = `${JSON.stringify(entry)}\n`;
  await writeFile(sessionIndexPath, line, { flag: 'a' });
}

async function listFilesRecursive(rootDir) {
  const entries = await readdir(rootDir, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const filePath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(filePath)));
      continue;
    }
    files.push(filePath);
  }
  return files;
}

async function findSessionFileById(codexHomeDir, sessionId) {
  const sessionsDir = path.join(codexHomeDir, 'sessions');
  const files = await listFilesRecursive(sessionsDir);
  for (const filePath of files) {
    if (!filePath.endsWith('.jsonl')) {
      continue;
    }
    const raw = await readFile(filePath, 'utf8').catch(() => '');
    const firstLine = raw.split('\n').find((line) => line.trim());
    if (!firstLine) {
      continue;
    }

    try {
      const parsed = JSON.parse(firstLine);
      if (parsed?.type === 'session_meta' && parsed?.payload?.id === sessionId) {
        return filePath;
      }
    } catch {}
  }
  return '';
}

function createForkedSessionFilePath(codexHomeDir, callSessionId) {
  const now = new Date();
  const year = `${now.getUTCFullYear()}`;
  const month = `${now.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${now.getUTCDate()}`.padStart(2, '0');
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  const fileName = `rollout-${timestamp}-${callSessionId}.jsonl`;
  return path.join(codexHomeDir, 'sessions', year, month, day, fileName);
}

async function cloneSessionFile({
  sourceFilePath,
  targetFilePath,
  originalSessionId,
  callSessionId,
  workspaceRoot = '',
} = {}) {
  const raw = await readFile(sourceFilePath, 'utf8');
  const now = new Date().toISOString();
  const lines = raw
    .split('\n')
    .map((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return line;
      }

      if (index !== 0) {
        return line;
      }

      try {
        const parsed = JSON.parse(line);
        if (parsed?.type !== 'session_meta' || !parsed?.payload) {
          return line;
        }

        const next = {
          ...parsed,
          timestamp: now,
          payload: {
            ...parsed.payload,
            id: callSessionId,
            forked_from_id: originalSessionId,
            timestamp: now,
            cwd: normalizeString(workspaceRoot) || parsed.payload.cwd,
          },
        };
        return JSON.stringify(next);
      } catch {
        return line;
      }
    })
    .join('\n');

  await mkdir(path.dirname(targetFilePath), { recursive: true });
  await writeFile(targetFilePath, lines);
}

function launchCodexProcess({
  command,
  args,
  cwd,
  env,
  outputFilePath,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  spawnCodex = spawn,
} = {}) {
  let settled = false;
  let abortReason = '';
  let timedOut = false;
  let stdout = '';
  let stderr = '';

  const child = spawnCodex(command, args, {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const timeoutId = setTimeout(() => {
    if (settled) {
      return;
    }
    timedOut = true;
    abortReason = `Codex request timed out after ${timeoutMs}ms.`;
    child.kill('SIGTERM');
    setTimeout(() => {
      if (!settled) {
        child.kill('SIGKILL');
      }
    }, 1_500).unref?.();
  }, timeoutMs);

  const promise = new Promise((resolve, reject) => {
    child.stdout?.on('data', (chunk) => {
      stdout += `${chunk}`;
    });

    child.stderr?.on('data', (chunk) => {
      stderr += `${chunk}`;
    });

    child.once('error', (error) => {
      if (settled) {
        return;
      }
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

      if (abortReason) {
        reject(createAbortError(abortReason));
        return;
      }

      if (code !== 0) {
        const summary =
          summarizeOutput(stderr) ||
          summarizeOutput(stdout) ||
          `signal ${signal || 'unknown'}`;
        reject(
          new Error(
            timedOut
              ? abortReason || `Codex request timed out: ${summary}`
              : `Codex request failed: ${summary}`,
          ),
        );
        return;
      }

      let text = '';
      if (outputFilePath) {
        try {
          text = normalizeString(await readFile(outputFilePath, 'utf8'));
        } catch {
          reject(new Error('Codex request did not write an output file.'));
          return;
        }
      }

      resolve({ text, stdout, stderr });
    });
  });

  function abort(reason = 'Codex request aborted.') {
    if (settled || abortReason) {
      return false;
    }

    abortReason = normalizeString(reason) || 'Codex request aborted.';
    child.kill('SIGTERM');
    setTimeout(() => {
      if (!settled) {
        child.kill('SIGKILL');
      }
    }, 1_500).unref?.();
    return true;
  }

  return {
    child,
    abort,
    promise,
  };
}

export function createIsolatedCodexExecutor({
  rootDir,
  sourceCodexHome = process.env.CODEX_HOME || path.join(process.env.HOME || os.homedir(), '.codex'),
  codexCommand = 'codex',
  model = DEFAULT_CODEX_MODEL,
  reasoningEffort = DEFAULT_REASONING_EFFORT,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  spawnCodex = spawn,
} = {}) {
  if (!rootDir) {
    throw new Error('createIsolatedCodexExecutor requires a rootDir.');
  }

  async function checkHealth() {
    await ensureSourceCodexHome(sourceCodexHome);
    await mkdir(rootDir, { recursive: true });

    const launch = await resolveCodexLaunch(codexCommand);
    const health = launchCodexProcess({
      command: launch.command,
      args: [...launch.argsPrefix, '--version'],
      cwd: rootDir,
      env: {
        ...process.env,
        OTEL_SDK_DISABLED: 'true',
      },
      outputFilePath: '',
      timeoutMs,
      spawnCodex,
    });

    const result = await health.promise.catch((error) => {
      throw error;
    });

    return {
      ok: true,
      app: 'codex-exec',
      detail: summarizeOutput(result.stdout) || summarizeOutput(result.stderr) || 'ready',
      model,
      reasoningEffort,
    };
  }

  async function resetSession({ sessionId } = {}) {
    const normalizedSessionId = normalizeString(sessionId);
    if (!normalizedSessionId) {
      throw new Error('resetSession requires a sessionId.');
    }

    const paths = createSessionPaths(rootDir, normalizedSessionId);
    await rm(paths.sessionDir, { recursive: true, force: true });
  }

  async function startPrompt({
    sessionId,
    initialPrompt,
    resumePrompt = '',
    forceFresh = false,
    workspaceRoot = '',
  } = {}) {
    const normalizedSessionId = normalizeString(sessionId) || randomUUID();
    const cleanedInitialPrompt = normalizeString(initialPrompt);
    const cleanedResumePrompt = normalizeString(resumePrompt);
    if (!cleanedInitialPrompt) {
      throw new Error('startPrompt requires an initial prompt.');
    }

    if (forceFresh) {
      await resetSession({ sessionId: normalizedSessionId });
    }

    await mkdir(rootDir, { recursive: true });
    const paths = createSessionPaths(rootDir, normalizedSessionId);
    await mkdir(paths.sessionDir, { recursive: true });
    await mkdir(paths.codexWorkdir, { recursive: true });
    await ensureCodexHome({
      sourceCodexHome,
      codexHomeDir: paths.codexHomeDir,
    });

    const sessionReady = await exists(paths.sessionReadyPath);
    const mode = sessionReady && cleanedResumePrompt ? 'resume' : 'initial';
    const prompt = mode === 'resume' ? cleanedResumePrompt : cleanedInitialPrompt;
    const executionWorkdir = resolveExecutionWorkdir(paths, workspaceRoot);
    const args = buildExecArgs({
      mode,
      model,
      reasoningEffort,
      workdir: executionWorkdir,
      outputFilePath: paths.outputFilePath,
      prompt,
    });
    const launch = await resolveCodexLaunch(codexCommand);
    const requestId = randomUUID();
    const processHandle = launchCodexProcess({
      command: launch.command,
      args: [...launch.argsPrefix, ...args],
      cwd: executionWorkdir,
      env: createCodexEnv({ codexHomeDir: paths.codexHomeDir }),
      outputFilePath: paths.outputFilePath,
      timeoutMs,
      spawnCodex,
    });

    const promise = processHandle.promise
      .then(async (result) => {
        await writeFile(
          paths.sessionReadyPath,
          JSON.stringify(
            {
              sessionId: normalizedSessionId,
              updatedAt: new Date().toISOString(),
            },
            null,
            2,
          ),
        );

        return {
          ...result,
          mode,
        };
      })
      .finally(async () => {
        await rm(paths.outputFilePath, { force: true }).catch(() => {});
      });

    return {
      requestId,
      sessionId: normalizedSessionId,
      mode,
      abort: processHandle.abort,
      promise,
    };
  }

  async function runPrompt(options = {}) {
    const handle = await startPrompt(options);
    return handle.promise;
  }

  return {
    checkHealth,
    resetSession,
    startPrompt,
    runPrompt,
  };
}

export function createForkedCallExecutor({
  rootDir,
  sourceCodexHome = process.env.CODEX_HOME || path.join(process.env.HOME || os.homedir(), '.codex'),
  codexCommand = 'codex',
  timeoutMs = DEFAULT_TIMEOUT_MS,
  spawnCodex = spawn,
} = {}) {
  if (!rootDir) {
    throw new Error('createForkedCallExecutor requires a rootDir.');
  }

  async function checkHealth() {
    await ensureSourceCodexHome(sourceCodexHome);
    await mkdir(rootDir, { recursive: true });

    const launch = await resolveCodexLaunch(codexCommand);
    const health = launchCodexProcess({
      command: launch.command,
      args: [...launch.argsPrefix, '--version'],
      cwd: rootDir,
      env: {
        ...process.env,
        OTEL_SDK_DISABLED: 'true',
      },
      outputFilePath: '',
      timeoutMs,
      spawnCodex,
    });

    const result = await health.promise;
    return {
      ok: true,
      app: 'codex-exec',
      detail: summarizeOutput(result.stdout) || summarizeOutput(result.stderr) || 'ready',
    };
  }

  async function destroyCallSession({ launchId } = {}) {
    const paths = createLaunchPaths(rootDir, launchId);
    await rm(paths.launchDir, { recursive: true, force: true });
  }

  async function runForkedResume({
    codexHomeDir,
    sessionId,
    prompt,
    workspaceRoot = '',
  } = {}) {
    const handle = await startForkedResume({
      codexHomeDir,
      sessionId,
      prompt,
      workspaceRoot,
    });
    return handle.promise;
  }

  async function startForkedResume({
    codexHomeDir,
    sessionId,
    prompt,
    workspaceRoot = '',
  } = {}) {
    const cleanedSessionId = normalizeString(sessionId);
    const cleanedPrompt = normalizeString(prompt);
    if (!cleanedSessionId) {
      throw new Error('runForkedResume requires a session id.');
    }
    if (!cleanedPrompt) {
      throw new Error('runForkedResume requires a prompt.');
    }

    const paths = {
      outputFilePath: path.join(path.dirname(codexHomeDir), `reply-${randomUUID()}.txt`),
      workdir: normalizeString(workspaceRoot) || path.join(path.dirname(codexHomeDir), 'workdir'),
    };
    await mkdir(paths.workdir, { recursive: true });
    const args = buildForkedCallExecArgs({
      sessionId: cleanedSessionId,
      workdir: paths.workdir,
      outputFilePath: paths.outputFilePath,
      prompt: cleanedPrompt,
    });
    const launch = await resolveCodexLaunch(codexCommand);
    const handle = launchCodexProcess({
      command: launch.command,
      args: [...launch.argsPrefix, ...args],
      cwd: paths.workdir,
      env: createCodexEnv({ codexHomeDir }),
      outputFilePath: paths.outputFilePath,
      timeoutMs,
      spawnCodex,
    });

    try {
      const promise = handle.promise
        .then((result) => ({
          ...result,
          mode: 'resume',
        }))
        .finally(async () => {
          await rm(paths.outputFilePath, { force: true }).catch(() => {});
        });

      return {
        requestId: randomUUID(),
        abort: handle.abort,
        promise,
      };
    } catch (error) {
      await rm(paths.outputFilePath, { force: true }).catch(() => {});
      throw error;
    }
  }

  async function createCallSession({
    launchId,
    originalSessionId,
    workspaceRoot = '',
    bootstrapPrompt = '',
    displayTitle = '',
  } = {}) {
    const cleanedLaunchId = normalizeString(launchId);
    const cleanedOriginalSessionId = normalizeString(originalSessionId);
    if (!cleanedLaunchId) {
      throw new Error('createCallSession requires a launchId.');
    }
    if (!cleanedOriginalSessionId) {
      throw new Error('createCallSession requires an originalSessionId.');
    }

    await ensureSourceCodexHome(sourceCodexHome);
    const paths = createLaunchPaths(rootDir, cleanedLaunchId);
    await rm(paths.launchDir, { recursive: true, force: true });
    await mkdir(paths.launchDir, { recursive: true });
    await cp(sourceCodexHome, paths.codexHomeDir, { recursive: true });
    await mkdir(paths.workdir, { recursive: true });

    const sourceSessionFilePath = await findSessionFileById(paths.codexHomeDir, cleanedOriginalSessionId);
    if (!sourceSessionFilePath) {
      throw new Error(`Unable to locate source session ${cleanedOriginalSessionId}.`);
    }

    const originalIndexEntries = await readSessionIndexEntries(paths.codexHomeDir);
    const originalEntry = originalIndexEntries.find((entry) => entry.id === cleanedOriginalSessionId) || null;
    const callSessionId = randomUUID();
    const callSessionFilePath = createForkedSessionFilePath(paths.codexHomeDir, callSessionId);

    await cloneSessionFile({
      sourceFilePath: sourceSessionFilePath,
      targetFilePath: callSessionFilePath,
      originalSessionId: cleanedOriginalSessionId,
      callSessionId,
      workspaceRoot,
    });
    await appendSessionIndexEntry(paths.codexHomeDir, {
      id: callSessionId,
      thread_name: normalizeString(displayTitle) || originalEntry?.thread_name || 'Voice call',
      updated_at: new Date().toISOString(),
    });

    if (normalizeString(bootstrapPrompt)) {
      await runForkedResume({
        codexHomeDir: paths.codexHomeDir,
        sessionId: callSessionId,
        prompt: bootstrapPrompt,
        workspaceRoot,
      });
    }

    return {
      launchId: cleanedLaunchId,
      originalSessionId: cleanedOriginalSessionId,
      callSessionId,
      callCodexHomeDir: paths.codexHomeDir,
      callSessionFilePath,
    };
  }

  async function runCallPrompt({
    launchId,
    callSessionId,
    prompt,
    workspaceRoot = '',
  } = {}) {
    const paths = createLaunchPaths(rootDir, launchId);
    return runForkedResume({
      codexHomeDir: paths.codexHomeDir,
      sessionId: callSessionId,
      prompt,
      workspaceRoot,
    });
  }

  async function startCallPrompt({
    launchId,
    callSessionId,
    prompt,
    workspaceRoot = '',
  } = {}) {
    const paths = createLaunchPaths(rootDir, launchId);
    return startForkedResume({
      codexHomeDir: paths.codexHomeDir,
      sessionId: callSessionId,
      prompt,
      workspaceRoot,
    });
  }

  async function writeBackSummary({
    originalSessionId,
    prompt,
    workspaceRoot = '',
  } = {}) {
    return runForkedResume({
      codexHomeDir: sourceCodexHome,
      sessionId: originalSessionId,
      prompt,
      workspaceRoot,
    });
  }

  return {
    checkHealth,
    createCallSession,
    destroyCallSession,
    runCallPrompt,
    startCallPrompt,
    writeBackSummary,
  };
}
