import path from 'node:path';
import { readFile } from 'node:fs/promises';

import { DEFAULT_CAPABILITY_POLICY } from './constants.mjs';
import { listFilesRecursive } from './fs-utils.mjs';
import { resolveDefaultSourceCodexHome } from './source-home.mjs';
import { normalizeCapabilityPolicy } from './capability-policy.mjs';
import { normalizeString } from './strings.mjs';

function stripPluginSections(configToml = '') {
  const output = [];
  let skippingPluginSection = false;

  for (const line of `${configToml || ''}`.split('\n')) {
    const trimmed = line.trim();
    if (/^\[plugins\."[^"]+"\]\s*$/.test(trimmed)) {
      skippingPluginSection = true;
      continue;
    }
    if (skippingPluginSection) {
      if (trimmed.startsWith('[')) {
        skippingPluginSection = false;
        output.push(line);
      }
      continue;
    }
    output.push(line);
  }

  return output.join('\n').trim();
}

function readPluginEnabledMap(configToml = '') {
  const enabledMap = new Map();
  let activePluginId = '';

  for (const line of `${configToml || ''}`.split('\n')) {
    const trimmed = line.trim();
    const pluginMatch = trimmed.match(/^\[plugins\."([^"]+)"\]\s*$/);
    if (pluginMatch) {
      activePluginId = normalizeString(pluginMatch[1]);
      continue;
    }
    if (trimmed.startsWith('[')) {
      activePluginId = '';
      continue;
    }
    if (!activePluginId) {
      continue;
    }
    const enabledMatch = trimmed.match(/^enabled\s*=\s*(true|false)\s*$/i);
    if (enabledMatch) {
      enabledMap.set(activePluginId, enabledMatch[1].toLowerCase() === 'true');
    }
  }

  return enabledMap;
}

async function readConfigToml(sourceCodexHome) {
  return readFile(path.join(sourceCodexHome, 'config.toml'), 'utf8').catch(() => '');
}

export async function listAvailablePlugins({
  sourceCodexHome = resolveDefaultSourceCodexHome(),
} = {}) {
  const cacheRoot = path.join(sourceCodexHome, 'plugins', 'cache');
  const enabledMap = readPluginEnabledMap(await readConfigToml(sourceCodexHome));
  const pluginPaths = (await listFilesRecursive(cacheRoot))
    .filter((filePath) => filePath.endsWith(path.join('.codex-plugin', 'plugin.json')))
    .sort((left, right) => left.localeCompare(right));

  const pluginById = new Map();
  for (const filePath of pluginPaths) {
    const relativePath = path.relative(cacheRoot, filePath);
    const parts = relativePath.split(path.sep);
    if (parts.length < 5) {
      continue;
    }
    const [marketplace, pluginName, version] = parts;
    let parsed;
    try {
      parsed = JSON.parse(await readFile(filePath, 'utf8'));
    } catch {
      continue;
    }

    const name = normalizeString(parsed?.name || pluginName);
    const marketplaceName = normalizeString(marketplace);
    const id = `${name}@${marketplaceName}`;
    pluginById.set(id, {
      id,
      name,
      marketplace: marketplaceName,
      version: normalizeString(parsed?.version || version),
      displayName: normalizeString(parsed?.interface?.displayName || parsed?.name || pluginName),
      description: normalizeString(parsed?.description),
      rootDir: path.dirname(filePath),
      enabled: enabledMap.get(id) === true,
    });
  }

  return [...pluginById.values()].sort((left, right) => left.id.localeCompare(right.id));
}

export function buildCodexHomeConfig({
  sourceConfigToml = '',
  availablePlugins = [],
  capabilityPolicy = DEFAULT_CAPABILITY_POLICY,
} = {}) {
  const normalizedPolicy = normalizeCapabilityPolicy(capabilityPolicy);
  const enabledPlugins = new Set(normalizedPolicy.enabledPluginIds);
  const pluginIds = Array.from(
    new Set(
      (Array.isArray(availablePlugins) ? availablePlugins : [])
        .map((plugin) => normalizeString(plugin?.id))
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right));

  const strippedConfig = stripPluginSections(sourceConfigToml);
  const baseSections = strippedConfig
    ? [strippedConfig]
    : ['notify = []', '', '[shell_environment_policy]', 'inherit = "core"'];
  const pluginSections = pluginIds.flatMap((pluginId) => [
    `[plugins."${pluginId}"]`,
    `enabled = ${enabledPlugins.has(pluginId) ? 'true' : 'false'}`,
    '',
  ]);

  return [...baseSections, '', ...pluginSections].join('\n').trimEnd().concat('\n');
}
