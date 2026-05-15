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
import { runCodexHealthCheck } from './health-check.mjs';
import { createMcpLineClient } from './mcp-line-client.mjs';
import {
  normalizeWorkerNotification,
  normalizeWorkerStderrLine,
  readThreadState,
} from './mcp-session-signals.mjs';
import { createMcpSubscriberStore } from './mcp-subscriber-store.mjs';
import {
  buildCodexReplyToolArguments,
  buildCodexToolArguments,
  buildMcpServerArgs,
  parseCodexToolResult,
} from './mcp-tools.mjs';
import { createSessionPaths, resolveExecutionWorkdir } from './paths.mjs';
import { createAbortError, createCodexEnv, resolveCodexLaunch } from './process-runner.mjs';
import { resolveDefaultSourceCodexHome } from './source-home.mjs';
import { normalizeString } from './strings.mjs';
export function createPersistentCodexMcpWorker({
  rootDir,
  sourceCodexHome = resolveDefaultSourceCodexHome(),
  codexCommand = 'codex',
  model = DEFAULT_CODEX_MODEL,
  reasoningEffort = DEFAULT_REASONING_EFFORT,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  spawnCodex = spawn,
} = {}) {
  if (!rootDir) {
    throw new Error('createPersistentCodexMcpWorker requires a rootDir.');
  }
  const sessions = new Map();
  const sessionSubscribers = createMcpSubscriberStore();
  async function closeSessionClient(sessionId, reason = 'Session worker closed.') {
    const entry = sessions.get(sessionId);
    if (!entry) {
      return;
    }
    sessions.delete(sessionId);
    entry.client.close(reason);
  }

  async function ensureSessionClient({ sessionId, capabilityPolicy, workspaceRoot } = {}) {
    const paths = createSessionPaths(rootDir, sessionId);
    const executionWorkdir = resolveExecutionWorkdir(paths.codexWorkdir, workspaceRoot);
    const active = sessions.get(sessionId);
    if (active && !active.client.isClosed() && active.executionWorkdir === executionWorkdir) {
      return { entry: active, paths, executionWorkdir };
    }
    await mkdir(rootDir, { recursive: true });
    await Promise.all([mkdir(paths.sessionDir, { recursive: true }), mkdir(paths.codexWorkdir, { recursive: true })]);
    await ensureCodexHome({ sourceCodexHome, codexHomeDir: paths.codexHomeDir, capabilityPolicy });
    const launch = await resolveCodexLaunch(codexCommand);
    const client = createMcpLineClient({
      command: launch.command,
      args: [...launch.argsPrefix, ...buildMcpServerArgs({ capabilityPolicy, workdir: executionWorkdir })],
      cwd: executionWorkdir,
      env: createCodexEnv({ codexHomeDir: paths.codexHomeDir }),
      spawnCodex,
      onNotification(message) {
        sessionSubscribers.emit(sessionId, normalizeWorkerNotification(message));
      },
      onStderrLine(line) {
        sessionSubscribers.emit(sessionId, normalizeWorkerStderrLine(line));
      },
    });
    await client.request('initialize', {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'codex-exec', version: '1.0.0' },
    }).promise;
    client.notify('notifications/initialized');

    const threadState = await readThreadState(paths.sessionReadyPath);
    const entry = {
      client,
      executionWorkdir,
      threadId: normalizeString(threadState.threadId),
    };
    sessions.set(sessionId, entry);
    return { entry, paths, executionWorkdir };
  }

  async function checkHealth() {
    return runCodexHealthCheck({ rootDir, sourceCodexHome, codexCommand, timeoutMs, spawnCodex, extra: { model, reasoningEffort, mode: 'mcp-server' } });
  }

  async function resetSession({ sessionId } = {}) {
    const normalizedSessionId = normalizeString(sessionId);
    if (!normalizedSessionId) {
      throw new Error('resetSession requires a sessionId.');
    }
    await closeSessionClient(normalizedSessionId, 'Session reset.');
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

    const { entry, paths, executionWorkdir } = await ensureSessionClient({
      sessionId: normalizedSessionId,
      capabilityPolicy,
      workspaceRoot,
    });
    const mode = entry.threadId && cleanedResumePrompt ? 'resume' : 'initial';
    const request = entry.client.request('tools/call', {
      name: mode === 'resume' ? 'codex-reply' : 'codex',
      arguments:
        mode === 'resume'
          ? buildCodexReplyToolArguments({ prompt: cleanedResumePrompt, threadId: entry.threadId })
          : buildCodexToolArguments({
              prompt: cleanedInitialPrompt,
              workdir: executionWorkdir,
              model,
              reasoningEffort,
              capabilityPolicy,
            }),
    });

    let abort = null;
    const promise = new Promise((resolve, reject) => {
      abort = (reason = 'Codex request aborted.') => {
        const message = normalizeString(reason) || 'Codex request aborted.';
        entry.client.cancel(request.id, message);
        reject(createAbortError(message));
        return true;
      };
      request.promise
        .then(async (result) => {
          const parsed = parseCodexToolResult(result);
          entry.threadId = normalizeString(parsed.threadId) || entry.threadId;
          await writeFile(paths.sessionReadyPath, JSON.stringify({
            sessionId: normalizedSessionId, threadId: entry.threadId, updatedAt: new Date().toISOString(),
          }, null, 2));
          resolve({ text: parsed.content, mode });
        })
        .catch(reject);
    });

    return {
      requestId: randomUUID(),
      sessionId: normalizedSessionId,
      mode,
      abort,
      promise,
    };
  }

  async function runPrompt(options = {}) { return (await startPrompt(options)).promise; }

  async function syncSessionCapabilities({ sessionId, capabilityPolicy = DEFAULT_CAPABILITY_POLICY } = {}) {
    const normalizedSessionId = normalizeString(sessionId);
    if (!normalizedSessionId) {
      throw new Error('syncSessionCapabilities requires a sessionId.');
    }
    const paths = createSessionPaths(rootDir, normalizedSessionId);
    await Promise.all([mkdir(paths.sessionDir, { recursive: true }), mkdir(paths.codexWorkdir, { recursive: true })]);
    await ensureCodexHome({ sourceCodexHome, codexHomeDir: paths.codexHomeDir, capabilityPolicy });
    await closeSessionClient(normalizedSessionId, 'Capabilities updated.');
    return { sessionId: normalizedSessionId, codexHomeDir: paths.codexHomeDir };
  }

  function subscribeSessionEvents({ sessionId, listener } = {}) {
    return sessionSubscribers.subscribe({ sessionId, listener });
  }

  return {
    checkHealth,
    resetSession,
    startPrompt,
    runPrompt,
    syncSessionCapabilities,
    subscribeSessionEvents,
  };
}
