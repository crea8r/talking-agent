import { normalizeString } from './strings.mjs';

export function normalizeCapabilityPolicy(policy = {}) {
  const enabledPluginIds = Array.from(
    new Set(
      (Array.isArray(policy.enabledPluginIds) ? policy.enabledPluginIds : [])
        .map((value) => normalizeString(value))
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right));

  return {
    enabledPluginIds,
    enableControlComputer: policy.enableControlComputer === true,
    enableComplexTasks: policy.enableComplexTasks === true,
  };
}

export function buildCapabilityDisableArgs(capabilityPolicy = {}) {
  const normalizedPolicy = normalizeCapabilityPolicy(capabilityPolicy);
  const args = [];

  if (normalizedPolicy.enabledPluginIds.length === 0) {
    args.push('--disable', 'plugins');
  }
  if (!normalizedPolicy.enableControlComputer) {
    args.push('--disable', 'shell_tool');
    args.push('--disable', 'shell_snapshot');
  }
  if (!normalizedPolicy.enableComplexTasks) {
    args.push('--disable', 'multi_agent');
    args.push('--disable', 'multi_agent_v2');
    args.push('--disable', 'enable_fanout');
  }

  return args;
}

export function resolveCapabilitySandbox(capabilityPolicy = {}) {
  const normalizedPolicy = normalizeCapabilityPolicy(capabilityPolicy);
  return normalizedPolicy.enableControlComputer ? 'workspace-write' : 'read-only';
}
