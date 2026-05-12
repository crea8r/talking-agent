import { readFile } from 'node:fs/promises';

import { DEFAULT_TIMEOUT_MS } from './constants.mjs';
import { normalizeString, summarizeOutput } from './strings.mjs';

export function createAbortError(message = 'Codex request aborted.') {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

export async function resolveCodexLaunch(codexCommand) {
  if (!codexCommand || !codexCommand.startsWith('/')) {
    return { command: codexCommand, argsPrefix: [] };
  }

  try {
    const scriptHead = await readFile(codexCommand, 'utf8');
    if (scriptHead.startsWith('#!/usr/bin/env node')) {
      return { command: process.execPath, argsPrefix: [codexCommand] };
    }
  } catch {}

  return { command: codexCommand, argsPrefix: [] };
}

export function createCodexEnv({ codexHomeDir } = {}) {
  return {
    ...process.env,
    CODEX_HOME: codexHomeDir,
    OTEL_SDK_DISABLED: 'true',
  };
}

export function launchCodexProcess({
  command,
  args,
  cwd,
  env,
  outputFilePath,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  spawnCodex,
} = {}) {
  let settled = false;
  let abortReason = '';
  let timedOut = false;
  let stdout = '';
  let stderr = '';
  const child = spawnCodex(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });

  const timeoutId = setTimeout(() => {
    if (settled) {
      return;
    }
    timedOut = true;
    abortReason = `Codex request timed out after ${timeoutMs}ms.`;
    child.kill('SIGTERM');
    setTimeout(() => !settled && child.kill('SIGKILL'), 1_500).unref?.();
  }, timeoutMs);

  const promise = new Promise((resolve, reject) => {
    child.stdout?.on('data', (chunk) => { stdout += `${chunk}`; });
    child.stderr?.on('data', (chunk) => { stderr += `${chunk}`; });
    child.once('error', (error) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeoutId);
        reject(error);
      }
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
        const summary = summarizeOutput(stderr) || summarizeOutput(stdout) || `signal ${signal || 'unknown'}`;
        reject(new Error(timedOut ? abortReason || `Codex request timed out: ${summary}` : `Codex request failed: ${summary}`));
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

  return {
    child,
    abort(reason = 'Codex request aborted.') {
      if (settled || abortReason) {
        return false;
      }
      abortReason = normalizeString(reason) || 'Codex request aborted.';
      child.kill('SIGTERM');
      setTimeout(() => !settled && child.kill('SIGKILL'), 1_500).unref?.();
      return true;
    },
    promise,
  };
}
