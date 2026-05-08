import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';

import {
  DIRECTOR_CODEX_HOME,
  DIRECTOR_CODEX_MODEL,
  DIRECTOR_CODEX_REASONING_EFFORT,
  DIRECTOR_CODEX_WORKDIR,
  DIRECTOR_REQUEST_TIMEOUT_MS,
  SOURCE_CODEX_HOME,
} from './config.mjs';
import { buildDirectorCodexExecArgs, ensureDirectorCodexHome } from './director-codex.mjs';
import { createDirectorEventLogger, forwardChildOutput, serializeActiveDirectorRequest } from './director-events.mjs';
import { createTypedError, normalizeString } from './http-utils.mjs';

export async function validateDirectorRequest(body, bridgeStore) {
  const prompt = normalizeString(body?.prompt);
  const modelId = normalizeString(body?.modelId);
  if (!prompt) {
    throw createTypedError('DIRECTOR_REQUEST_INVALID', 'Prompt is required.');
  }
  if (!modelId) {
    throw createTypedError('DIRECTOR_REQUEST_INVALID', 'Model id is required.');
  }

  const catalog = await bridgeStore.getCatalog();
  const knownModelIds = new Set((catalog.models || []).map((model) => model.id));
  if (!knownModelIds.has(modelId)) {
    throw createTypedError('DIRECTOR_REQUEST_INVALID', `Unknown model id: ${modelId}.`);
  }
  return { prompt, modelId };
}

export function createDirectorController({
  bridgeStore,
  spawnCodex = spawn,
  codexCommand = 'codex',
  directorRequestTimeoutMs = DIRECTOR_REQUEST_TIMEOUT_MS,
  directorCodexHome = DIRECTOR_CODEX_HOME,
  directorCodexWorkdir = DIRECTOR_CODEX_WORKDIR,
  directorMcpUrl,
  prepareDirectorCodexHome = ensureDirectorCodexHome,
} = {}) {
  let activeDirectorRequest = null;
  let lastDirectorRequestResult = { requestId: '', active: false, errorText: '' };

  function clearActiveDirectorRequest(runId) {
    if (activeDirectorRequest?.id !== runId) return;
    if (activeDirectorRequest.timeoutId) clearTimeout(activeDirectorRequest.timeoutId);
    activeDirectorRequest = null;
  }

  async function launchDirectorRequest({ prompt, modelId }) {
    if (activeDirectorRequest) {
      throw createTypedError('DIRECTOR_REQUEST_ACTIVE', 'A local Codex director request is already running.', {
        request: serializeActiveDirectorRequest(activeDirectorRequest),
      });
    }

    const runId = randomUUID();
    const startedAt = Date.now();
    const eventLogger = createDirectorEventLogger(runId, startedAt);
    eventLogger.logMilestone('request.accepted', { modelId });

    await prepareDirectorCodexHome({ sourceCodexHome: SOURCE_CODEX_HOME, directorCodexHome });
    eventLogger.logMilestone('codex_home_ready', { codexHome: directorCodexHome });
    await mkdir(directorCodexWorkdir, { recursive: true });
    eventLogger.logMilestone('codex_workdir_ready', { codexWorkdir: directorCodexWorkdir });

    const initialState = await bridgeStore.getState();
    const startRevision = Number(initialState?.director?.revision || 0);
    eventLogger.logMilestone('bridge_state_loaded', { startRevision });

    const args = buildDirectorCodexExecArgs({
      codexWorkdir: directorCodexWorkdir,
      mcpUrl: directorMcpUrl,
      prompt,
      modelId,
    });
    eventLogger.logMilestone('codex_args_built', { argCount: args.length, codexWorkdir: directorCodexWorkdir });
    const child = spawnCodex(codexCommand, args, {
      cwd: directorCodexWorkdir,
      env: { ...process.env, CODEX_HOME: directorCodexHome },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const timeoutId = setTimeout(() => {
      if (activeDirectorRequest?.id !== runId) return;
      console.error(`[pose-studio director] codex exec timed out after ${directorRequestTimeoutMs}ms`);
      child.kill('SIGTERM');
      setTimeout(() => {
        if (activeDirectorRequest?.id === runId) child.kill('SIGKILL');
      }, 1_500).unref?.();
    }, directorRequestTimeoutMs);

    activeDirectorRequest = { id: runId, child, prompt, modelId, startedAt, startRevision, timeoutId };
    lastDirectorRequestResult = { requestId: runId, active: true, errorText: '' };

    console.log('[pose-studio director] accepted local Codex request', {
      runId, modelId, prompt, model: DIRECTOR_CODEX_MODEL, reasoningEffort: DIRECTOR_CODEX_REASONING_EFFORT,
      codexHome: directorCodexHome, cwd: directorCodexWorkdir, stateFilePath: bridgeStore.stateFilePath,
    });
    eventLogger.logMilestone('spawned');
    forwardChildOutput(child.stdout, '[pose-studio director stdout]', { onLine: (line) => eventLogger.onStdoutLine(line) });
    forwardChildOutput(child.stderr, '[pose-studio director stderr]', { onLine: (line) => eventLogger.onStderrLine(line) });

    child.once('error', () => {
      lastDirectorRequestResult = { requestId: runId, active: false, errorText: 'Failed to start the local Codex request.' };
      clearActiveDirectorRequest(runId);
    });
    child.once('exit', async (code, signal) => {
      console.log('[pose-studio director] codex exec finished', { code, signal, runId });
      eventLogger.logMilestone('process.exit', { code, signal });
      const completed = activeDirectorRequest?.id === runId ? { ...activeDirectorRequest } : { id: runId, prompt, modelId, startedAt, startRevision: 0 };
      try {
        const state = await bridgeStore.getState();
        const matchedSequence = [state?.director?.activeSequence, state?.director?.lastSequence].find((sequence) =>
          sequence && Number(sequence.revision || 0) > Number(completed.startRevision || 0) && sequence.prompt === completed.prompt && sequence.modelId === completed.modelId);
        const lastError = state?.director?.lastError || null;
        const matchedError = lastError && Number(lastError.revision || 0) > Number(completed.startRevision || 0) && lastError.prompt === completed.prompt && lastError.modelId === completed.modelId ? lastError : null;
        lastDirectorRequestResult = matchedSequence
          ? { requestId: runId, active: false, errorText: '' }
          : { requestId: runId, active: false, errorText: matchedError ? normalizeString(matchedError.message) : signal === 'SIGTERM' ? 'Local Codex timed out before staging a sequence.' : 'Local Codex finished without staging a sequence.' };
      } catch {
        lastDirectorRequestResult = { requestId: runId, active: false, errorText: 'Local Codex finished, but pose-studio could not verify the staged sequence.' };
      } finally {
        clearActiveDirectorRequest(runId);
      }
    });

    return { requestId: runId, startedAt: new Date(activeDirectorRequest.startedAt).toISOString() };
  }

  return {
    launchDirectorRequest,
    getRequestState() {
      return activeDirectorRequest ? serializeActiveDirectorRequest(activeDirectorRequest) : lastDirectorRequestResult;
    },
  };
}
