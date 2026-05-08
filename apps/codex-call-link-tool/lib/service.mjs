import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

function normalizeString(value) {
  return `${value || ''}`.trim();
}

function slugifyWorkspaceKey(value = '') {
  const slug = normalizeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'default';
}

function deriveDisplayTitle(workspaceRoot = '') {
  const cleanedWorkspaceRoot = normalizeString(workspaceRoot);
  if (!cleanedWorkspaceRoot) {
    return 'Codex Project';
  }

  return cleanedWorkspaceRoot.split('/').filter(Boolean).at(-1) || cleanedWorkspaceRoot;
}

async function readSessionIndex(sourceCodexHome) {
  const sessionIndexPath = path.join(sourceCodexHome, 'session_index.jsonl');
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

function buildBootstrapPrompt({
  displayTitle = '',
  activeModelId = '',
  activeModelLabel = '',
} = {}) {
  const characterLabel = normalizeString(activeModelLabel || activeModelId || 'the selected avatar');
  return [
    `You are now the voice call version of Codex for the project ${normalizeString(displayTitle || 'Codex Project')}.`,
    `Your character identity is ${characterLabel}.`,
    'Keep replies concise, spoken, and natural for a one-to-one live call.',
    'You should behave like the same coding agent from the text session, use the same project context, and use the available tools when needed.',
    'Do not expose internal reasoning.',
  ].join(' ');
}

export function createCallLinkService({
  appBaseUrl = 'http://127.0.0.1:4384',
  sourceCodexHome = process.env.CODEX_HOME || path.join(process.env.HOME || os.homedir(), '.codex'),
  callRecordStore,
  workspaceSetupStore,
  productionVoiceProfileStore,
  forkedCallExecutor,
} = {}) {
  if (!callRecordStore) {
    throw new Error('createCallLinkService requires a callRecordStore.');
  }
  if (!workspaceSetupStore) {
    throw new Error('createCallLinkService requires a workspaceSetupStore.');
  }
  if (!productionVoiceProfileStore) {
    throw new Error('createCallLinkService requires a productionVoiceProfileStore.');
  }
  if (!forkedCallExecutor) {
    throw new Error('createCallLinkService requires a forkedCallExecutor.');
  }

  async function inferOriginalSessionId() {
    const entries = await readSessionIndex(sourceCodexHome);
    return normalizeString(entries.at(-1)?.id);
  }

  async function createCallLink({
    originalSessionId = '',
    workspaceRoot = process.cwd(),
    displayTitle = '',
    scopeKey = '',
  } = {}) {
    const cleanedWorkspaceRoot = normalizeString(workspaceRoot) || process.cwd();
    const cleanedScopeKey = normalizeString(scopeKey) || slugifyWorkspaceKey(cleanedWorkspaceRoot);
    const cleanedDisplayTitle = normalizeString(displayTitle) || deriveDisplayTitle(cleanedWorkspaceRoot);
    const resolvedOriginalSessionId =
      normalizeString(originalSessionId) || (await inferOriginalSessionId());
    if (!resolvedOriginalSessionId) {
      throw new Error('Unable to determine the original Codex session id.');
    }

    const setup = await workspaceSetupStore.loadSetup({ scopeKey: cleanedScopeKey });
    if (!setup?.activeModelId) {
      throw new Error('No saved character model exists for this workspace.');
    }

    const voiceProfile = await productionVoiceProfileStore.getProfileSummary({
      scopeKey: cleanedScopeKey,
    });
    if (!voiceProfile?.referenceAvailable) {
      throw new Error('No saved production voice sample exists for this workspace.');
    }

    const launchId = `launch-${randomUUID()}`;
    const bootstrapPrompt = buildBootstrapPrompt({
      displayTitle: cleanedDisplayTitle,
      activeModelId: setup.activeModelId,
      activeModelLabel: setup.activeModelLabel,
    });

    const forked = await forkedCallExecutor.createCallSession({
      launchId,
      originalSessionId: resolvedOriginalSessionId,
      workspaceRoot: cleanedWorkspaceRoot,
      displayTitle: cleanedDisplayTitle,
      bootstrapPrompt,
    });

    await callRecordStore.createRecord({
      launchId,
      originalSessionId: resolvedOriginalSessionId,
      callSessionId: forked.callSessionId,
      workspaceRoot: cleanedWorkspaceRoot,
      displayTitle: cleanedDisplayTitle,
      status: 'ready',
      scopeKey: cleanedScopeKey,
      activeModelId: setup.activeModelId,
      activeModelLabel: setup.activeModelLabel,
      sourceCodexHome,
      callCodexHomeDir: forked.callCodexHomeDir,
      callSessionFilePath: forked.callSessionFilePath,
    });

    return {
      ok: true,
      launchId,
      originalSessionId: resolvedOriginalSessionId,
      callSessionId: forked.callSessionId,
      url: `${appBaseUrl.replace(/\/$/, '')}/?mode=linked-call&launch=${encodeURIComponent(launchId)}`,
    };
  }

  return {
    createCallLink,
    inferOriginalSessionId,
  };
}
