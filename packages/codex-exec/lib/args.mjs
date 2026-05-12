import {
  DEFAULT_CAPABILITY_POLICY,
  DEFAULT_CODEX_MODEL,
  DEFAULT_REASONING_EFFORT,
} from './constants.mjs';
import { buildCapabilityDisableArgs } from './capability-policy.mjs';

export function buildCodexBaseArgs({ workdir, capabilityPolicy } = {}) {
  return [
    '-a', 'never',
    '-s', 'read-only',
    ...buildCapabilityDisableArgs(capabilityPolicy),
    '-C', workdir,
  ];
}

export function buildExecArgs({
  mode = 'initial',
  model = DEFAULT_CODEX_MODEL,
  reasoningEffort = DEFAULT_REASONING_EFFORT,
  capabilityPolicy = DEFAULT_CAPABILITY_POLICY,
  workdir,
  outputFilePath,
  prompt,
} = {}) {
  const base = [...buildCodexBaseArgs({ workdir, capabilityPolicy }), 'exec'];
  if (mode === 'resume') {
    base.push('resume', '--last');
  }

  base.push(
    '--skip-git-repo-check',
    '-m', model,
    '-c', `model_reasoning_effort=${JSON.stringify(reasoningEffort)}`,
    '-o', outputFilePath,
    prompt,
  );

  return base;
}

export function buildForkedCallExecArgs({
  sessionId,
  capabilityPolicy = DEFAULT_CAPABILITY_POLICY,
  workdir,
  outputFilePath,
  prompt,
} = {}) {
  return [
    '-a', 'never',
    '-C', workdir,
    ...buildCapabilityDisableArgs(capabilityPolicy),
    'exec',
    'resume',
    sessionId,
    '--skip-git-repo-check',
    '-o', outputFilePath,
    prompt,
  ];
}
