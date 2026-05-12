import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';

import {
  DEFAULT_CAPABILITY_POLICY,
  DEFAULT_CODEX_MODEL,
  DEFAULT_REASONING_EFFORT,
  DEFAULT_TIMEOUT_MS,
} from './constants.mjs';
import { ensureCodexHome } from './codex-home.mjs';
import { exists } from './fs-utils.mjs';
import { runCodexHealthCheck } from './health-check.mjs';
import { createSessionPaths, resolveExecutionWorkdir } from './paths.mjs';
import { buildExecArgs } from './args.mjs';
import { createCodexEnv, launchCodexProcess, resolveCodexLaunch } from './process-runner.mjs';
import { resolveDefaultSourceCodexHome } from './source-home.mjs';
import { normalizeString } from './strings.mjs';

export function createIsolatedCodexExecutor({
  rootDir,
  sourceCodexHome = resolveDefaultSourceCodexHome(),
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
    return runCodexHealthCheck({
      rootDir,
      sourceCodexHome,
      codexCommand,
      timeoutMs,
      spawnCodex,
      extra: { model, reasoningEffort },
    });
  }

  async function resetSession({ sessionId } = {}) {
    const normalizedSessionId = normalizeString(sessionId);
    if (!normalizedSessionId) {
      throw new Error('resetSession requires a sessionId.');
    }
    await rm(createSessionPaths(rootDir, normalizedSessionId).sessionDir, { recursive: true, force: true });
  }

  async function startPrompt({
    sessionId,
    initialPrompt,
    resumePrompt = '',
    forceFresh = false,
    capabilityPolicy = DEFAULT_CAPABILITY_POLICY,
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
    await Promise.all([mkdir(paths.sessionDir, { recursive: true }), mkdir(paths.codexWorkdir, { recursive: true })]);
    await ensureCodexHome({ sourceCodexHome, codexHomeDir: paths.codexHomeDir, capabilityPolicy });

    const sessionReady = await exists(paths.sessionReadyPath);
    const mode = sessionReady && cleanedResumePrompt ? 'resume' : 'initial';
    const prompt = mode === 'resume' ? cleanedResumePrompt : cleanedInitialPrompt;
    const executionWorkdir = resolveExecutionWorkdir(paths.codexWorkdir, workspaceRoot);
    const args = buildExecArgs({
      mode,
      model,
      reasoningEffort,
      capabilityPolicy,
      workdir: executionWorkdir,
      outputFilePath: paths.outputFilePath,
      prompt,
    });
    const launch = await resolveCodexLaunch(codexCommand);
    const handle = launchCodexProcess({
      command: launch.command,
      args: [...launch.argsPrefix, ...args],
      cwd: executionWorkdir,
      env: createCodexEnv({ codexHomeDir: paths.codexHomeDir }),
      outputFilePath: paths.outputFilePath,
      timeoutMs,
      spawnCodex,
    });

    return {
      requestId: randomUUID(),
      sessionId: normalizedSessionId,
      mode,
      abort: handle.abort,
      promise: handle.promise
        .then(async (result) => {
          await writeFile(
            paths.sessionReadyPath,
            JSON.stringify({ sessionId: normalizedSessionId, updatedAt: new Date().toISOString() }, null, 2),
          );
          return { ...result, mode };
        })
        .finally(async () => rm(paths.outputFilePath, { force: true }).catch(() => {})),
    };
  }

  async function runPrompt(options = {}) {
    return (await startPrompt(options)).promise;
  }

  async function syncSessionCapabilities({
    sessionId,
    capabilityPolicy = DEFAULT_CAPABILITY_POLICY,
  } = {}) {
    const normalizedSessionId = normalizeString(sessionId);
    if (!normalizedSessionId) {
      throw new Error('syncSessionCapabilities requires a sessionId.');
    }

    await mkdir(rootDir, { recursive: true });
    const paths = createSessionPaths(rootDir, normalizedSessionId);
    await Promise.all([mkdir(paths.sessionDir, { recursive: true }), mkdir(paths.codexWorkdir, { recursive: true })]);
    await ensureCodexHome({ sourceCodexHome, codexHomeDir: paths.codexHomeDir, capabilityPolicy });
    return { sessionId: normalizedSessionId, codexHomeDir: paths.codexHomeDir };
  }

  return { checkHealth, resetSession, startPrompt, runPrompt, syncSessionCapabilities };
}
