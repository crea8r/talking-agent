import { randomUUID } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';

import { DEFAULT_CAPABILITY_POLICY } from './constants.mjs';
import { cloneForkableCodexHome, ensureSourceCodexHome, syncCodexHomeConfig } from './codex-home.mjs';
import { exists } from './fs-utils.mjs';
import { createForkedSessionFilePath, createLaunchPaths } from './paths.mjs';
import {
  appendSessionIndexEntry,
  cloneSessionFile,
  findSessionFileById,
  readSessionIndexEntries,
} from './session-files.mjs';
import { normalizeString } from './strings.mjs';

export function createForkedSessionManager({
  rootDir,
  sourceCodexHome,
} = {}) {
  async function createCallSession({
    launchId,
    originalSessionId,
    workspaceRoot = '',
    capabilityPolicy = DEFAULT_CAPABILITY_POLICY,
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

    try {
      await mkdir(paths.launchDir, { recursive: true });
      await cloneForkableCodexHome({ sourceCodexHome, codexHomeDir: paths.codexHomeDir });
      await syncCodexHomeConfig({ sourceCodexHome, codexHomeDir: paths.codexHomeDir, capabilityPolicy });
      await mkdir(paths.workdir, { recursive: true });

      const sourceSessionFilePath = await findSessionFileById(paths.codexHomeDir, cleanedOriginalSessionId);
      if (!sourceSessionFilePath) {
        throw new Error(`Unable to locate source session ${cleanedOriginalSessionId}.`);
      }

      const originalEntries = await readSessionIndexEntries(paths.codexHomeDir);
      const originalEntry = originalEntries.find((entry) => entry.id === cleanedOriginalSessionId) || null;
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

      return {
        launchId: cleanedLaunchId,
        originalSessionId: cleanedOriginalSessionId,
        callSessionId,
        callCodexHomeDir: paths.codexHomeDir,
        callSessionFilePath,
      };
    } catch (error) {
      await rm(paths.launchDir, { recursive: true, force: true }).catch(() => {});
      throw error;
    }
  }

  async function destroyCallSession({ launchId } = {}) {
    await rm(createLaunchPaths(rootDir, launchId).launchDir, { recursive: true, force: true });
  }

  async function syncLaunchCapabilities({
    launchId,
    capabilityPolicy = DEFAULT_CAPABILITY_POLICY,
  } = {}) {
    const cleanedLaunchId = normalizeString(launchId);
    if (!cleanedLaunchId) {
      throw new Error('syncLaunchCapabilities requires a launchId.');
    }

    const paths = createLaunchPaths(rootDir, cleanedLaunchId);
    if (!(await exists(paths.codexHomeDir))) {
      return { launchId: cleanedLaunchId, codexHomeDir: paths.codexHomeDir, synced: false };
    }

    await mkdir(paths.workdir, { recursive: true });
    await syncCodexHomeConfig({ sourceCodexHome, codexHomeDir: paths.codexHomeDir, capabilityPolicy });
    return { launchId: cleanedLaunchId, codexHomeDir: paths.codexHomeDir, synced: true };
  }

  return { createCallSession, destroyCallSession, syncLaunchCapabilities };
}
