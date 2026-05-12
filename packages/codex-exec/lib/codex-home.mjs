import path from 'node:path';
import { copyFile, cp, mkdir, readFile, writeFile } from 'node:fs/promises';

import {
  DEFAULT_CAPABILITY_POLICY,
  FILES_TO_SEED,
  FORKABLE_CODEX_ITEMS,
} from './constants.mjs';
import { exists } from './fs-utils.mjs';
import { normalizeCapabilityPolicy } from './capability-policy.mjs';
import { buildCodexHomeConfig, listAvailablePlugins } from './plugins.mjs';

export async function ensureSourceCodexHome(sourceCodexHome) {
  for (const fileName of FILES_TO_SEED) {
    const filePath = path.join(sourceCodexHome, fileName);
    if (!(await exists(filePath))) {
      throw new Error(`Codex auth seed is missing ${fileName} in ${sourceCodexHome}.`);
    }
  }
}

async function syncSelectedPluginAssets({
  sourceCodexHome,
  codexHomeDir,
  availablePlugins = [],
  capabilityPolicy = DEFAULT_CAPABILITY_POLICY,
} = {}) {
  const normalizedPolicy = normalizeCapabilityPolicy(capabilityPolicy);
  const selectedPluginIds = new Set(normalizedPolicy.enabledPluginIds);
  if (!selectedPluginIds.size) {
    return;
  }

  const sourceCacheRoot = path.join(sourceCodexHome, 'plugins', 'cache');
  const targetCacheRoot = path.join(codexHomeDir, 'plugins', 'cache');
  await mkdir(targetCacheRoot, { recursive: true });

  await Promise.all(
    availablePlugins
      .filter((plugin) => selectedPluginIds.has(plugin.id))
      .map(async (plugin) => {
        const sourceRoot = path.dirname(plugin.rootDir);
        const relativeRoot = path.relative(sourceCacheRoot, sourceRoot);
        if (!relativeRoot || relativeRoot.startsWith('..')) {
          return;
        }
        await cp(sourceRoot, path.join(targetCacheRoot, relativeRoot), { recursive: true }).catch(() => {});
      }),
  );
}

export async function syncCodexHomeConfig({
  sourceCodexHome,
  codexHomeDir,
  capabilityPolicy = DEFAULT_CAPABILITY_POLICY,
} = {}) {
  const availablePlugins = await listAvailablePlugins({ sourceCodexHome });
  const targetConfigPath = path.join(codexHomeDir, 'config.toml');
  const existingTargetConfig = await readFile(targetConfigPath, 'utf8').catch(() => '');
  const sourceConfigToml =
    existingTargetConfig || (await readFile(path.join(sourceCodexHome, 'config.toml'), 'utf8').catch(() => ''));

  await syncSelectedPluginAssets({
    sourceCodexHome,
    codexHomeDir,
    availablePlugins,
    capabilityPolicy,
  });

  await writeFile(
    targetConfigPath,
    buildCodexHomeConfig({
      sourceConfigToml,
      availablePlugins,
      capabilityPolicy,
    }),
  );
}

export async function ensureCodexHome({
  sourceCodexHome,
  codexHomeDir,
  capabilityPolicy = DEFAULT_CAPABILITY_POLICY,
} = {}) {
  await ensureSourceCodexHome(sourceCodexHome);
  await mkdir(codexHomeDir, { recursive: true });

  await Promise.all(
    FILES_TO_SEED.map((fileName) =>
      copyFile(path.join(sourceCodexHome, fileName), path.join(codexHomeDir, fileName)),
    ),
  );

  await syncCodexHomeConfig({ sourceCodexHome, codexHomeDir, capabilityPolicy });
  await Promise.all([
    mkdir(path.join(codexHomeDir, 'memories'), { recursive: true }),
    mkdir(path.join(codexHomeDir, 'shell_snapshots'), { recursive: true }),
    mkdir(path.join(codexHomeDir, 'tmp'), { recursive: true }),
  ]);
}

export async function cloneForkableCodexHome({ sourceCodexHome, codexHomeDir } = {}) {
  await ensureSourceCodexHome(sourceCodexHome);
  await mkdir(codexHomeDir, { recursive: true });

  await Promise.all(
    FORKABLE_CODEX_ITEMS.map(async (entryName) => {
      const sourcePath = path.join(sourceCodexHome, entryName);
      if (!(await exists(sourcePath))) {
        return;
      }
      await cp(sourcePath, path.join(codexHomeDir, entryName), { recursive: true });
    }),
  );
}
