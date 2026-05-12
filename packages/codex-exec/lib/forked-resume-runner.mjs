import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { mkdir, rm } from 'node:fs/promises';

import { DEFAULT_CAPABILITY_POLICY, DEFAULT_TIMEOUT_MS } from './constants.mjs';
import { syncCodexHomeConfig } from './codex-home.mjs';
import { buildForkedCallExecArgs } from './args.mjs';
import { createCodexEnv, launchCodexProcess, resolveCodexLaunch } from './process-runner.mjs';
import { normalizeString } from './strings.mjs';

export function createForkedResumeRunner({
  sourceCodexHome,
  codexCommand = 'codex',
  timeoutMs = DEFAULT_TIMEOUT_MS,
  spawnCodex = spawn,
} = {}) {
  async function startForkedResume({
    codexHomeDir,
    sessionId,
    prompt,
    capabilityPolicy = DEFAULT_CAPABILITY_POLICY,
    workspaceRoot = '',
    timeoutMsOverride = timeoutMs,
  } = {}) {
    const cleanedSessionId = normalizeString(sessionId);
    const cleanedPrompt = normalizeString(prompt);
    if (!cleanedSessionId) {
      throw new Error('runForkedResume requires a session id.');
    }
    if (!cleanedPrompt) {
      throw new Error('runForkedResume requires a prompt.');
    }

    const outputFilePath = path.join(path.dirname(codexHomeDir), `reply-${randomUUID()}.txt`);
    const workdir = normalizeString(workspaceRoot) || path.join(path.dirname(codexHomeDir), 'workdir');
    await mkdir(workdir, { recursive: true });
    if (path.resolve(codexHomeDir) !== path.resolve(sourceCodexHome)) {
      await syncCodexHomeConfig({ sourceCodexHome, codexHomeDir, capabilityPolicy });
    }

    const args = buildForkedCallExecArgs({
      sessionId: cleanedSessionId,
      capabilityPolicy,
      workdir,
      outputFilePath,
      prompt: cleanedPrompt,
    });
    const launch = await resolveCodexLaunch(codexCommand);
    const handle = launchCodexProcess({
      command: launch.command,
      args: [...launch.argsPrefix, ...args],
      cwd: workdir,
      env: createCodexEnv({ codexHomeDir }),
      outputFilePath,
      timeoutMs: timeoutMsOverride,
      spawnCodex,
    });

    return {
      requestId: randomUUID(),
      abort: handle.abort,
      promise: handle.promise
        .then((result) => ({ ...result, mode: 'resume' }))
        .finally(async () => rm(outputFilePath, { force: true }).catch(() => {})),
    };
  }

  async function runForkedResume(options = {}) {
    return (await startForkedResume(options)).promise;
  }

  return { startForkedResume, runForkedResume };
}
