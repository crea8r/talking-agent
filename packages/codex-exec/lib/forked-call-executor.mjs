import { spawn } from 'node:child_process';

import { DEFAULT_CAPABILITY_POLICY, DEFAULT_TIMEOUT_MS } from './constants.mjs';
import { createForkedSessionManager } from './forked-session-manager.mjs';
import { createForkedResumeRunner } from './forked-resume-runner.mjs';
import { runCodexHealthCheck } from './health-check.mjs';
import { createLaunchPaths } from './paths.mjs';
import { resolveDefaultSourceCodexHome } from './source-home.mjs';
import { normalizeString } from './strings.mjs';

export function createForkedCallExecutor({
  rootDir,
  sourceCodexHome = resolveDefaultSourceCodexHome(),
  codexCommand = 'codex',
  timeoutMs = DEFAULT_TIMEOUT_MS,
  bootstrapTimeoutMs = Math.max(timeoutMs, 120_000),
  finalizeTimeoutMs = Math.max(timeoutMs, 90_000),
  spawnCodex = spawn,
} = {}) {
  if (!rootDir) {
    throw new Error('createForkedCallExecutor requires a rootDir.');
  }

  const warmups = new Map();
  const sessions = createForkedSessionManager({ rootDir, sourceCodexHome });
  const resumeRunner = createForkedResumeRunner({ sourceCodexHome, codexCommand, timeoutMs, spawnCodex });

  function clearWarmup(launchId, expectedEntry = null) {
    const activeEntry = warmups.get(normalizeString(launchId));
    if (activeEntry && (!expectedEntry || activeEntry === expectedEntry)) {
      warmups.delete(normalizeString(launchId));
    }
  }

  async function waitForWarmup(launchId = '') {
    const entry = warmups.get(normalizeString(launchId));
    if (entry) {
      await entry.promise;
    }
  }

  async function startWarmup({
    launchId,
    codexHomeDir,
    sessionId,
    prompt,
    capabilityPolicy = DEFAULT_CAPABILITY_POLICY,
    workspaceRoot = '',
  } = {}) {
    const cleanedLaunchId = normalizeString(launchId);
    const cleanedPrompt = normalizeString(prompt);
    if (!cleanedLaunchId || !cleanedPrompt) {
      return;
    }

    const handle = await resumeRunner.startForkedResume({
      codexHomeDir,
      sessionId,
      prompt: cleanedPrompt,
      capabilityPolicy,
      workspaceRoot,
      timeoutMsOverride: bootstrapTimeoutMs,
    });
    const entry = {
      abort: handle.abort,
      promise: handle.promise.finally(() => clearWarmup(cleanedLaunchId, entry)),
    };
    warmups.set(cleanedLaunchId, entry);
    void entry.promise.catch(() => {});
  }

  async function checkHealth() {
    return runCodexHealthCheck({ rootDir, sourceCodexHome, codexCommand, timeoutMs, spawnCodex });
  }

  async function createCallSession(options = {}) {
    const created = await sessions.createCallSession(options);
    await startWarmup({
      launchId: created.launchId,
      codexHomeDir: created.callCodexHomeDir,
      sessionId: created.callSessionId,
      prompt: options.bootstrapPrompt,
      capabilityPolicy: options.capabilityPolicy,
      workspaceRoot: options.workspaceRoot,
    });
    return created;
  }

  async function destroyCallSession({ launchId } = {}) {
    const entry = warmups.get(normalizeString(launchId));
    entry?.abort?.('Linked call bootstrap stopped because the call session was destroyed.');
    clearWarmup(launchId, entry || null);
    await sessions.destroyCallSession({ launchId });
  }

  async function runCallPrompt({ launchId, callSessionId, prompt, capabilityPolicy, workspaceRoot } = {}) {
    await waitForWarmup(launchId);
    const paths = createLaunchPaths(rootDir, launchId);
    return resumeRunner.runForkedResume({
      codexHomeDir: paths.codexHomeDir,
      sessionId: callSessionId,
      prompt,
      capabilityPolicy,
      workspaceRoot,
    });
  }

  async function startCallPrompt({ launchId, callSessionId, prompt, capabilityPolicy, workspaceRoot } = {}) {
    await waitForWarmup(launchId);
    const paths = createLaunchPaths(rootDir, launchId);
    return resumeRunner.startForkedResume({
      codexHomeDir: paths.codexHomeDir,
      sessionId: callSessionId,
      prompt,
      capabilityPolicy,
      workspaceRoot,
    });
  }

  async function writeBackSummary({ originalSessionId, prompt, capabilityPolicy, workspaceRoot } = {}) {
    return resumeRunner.runForkedResume({
      codexHomeDir: sourceCodexHome,
      sessionId: originalSessionId,
      prompt,
      capabilityPolicy,
      workspaceRoot,
      timeoutMsOverride: finalizeTimeoutMs,
    });
  }

  return {
    checkHealth,
    createCallSession,
    destroyCallSession,
    runCallPrompt,
    startCallPrompt,
    writeBackSummary,
    syncLaunchCapabilities: sessions.syncLaunchCapabilities,
  };
}
