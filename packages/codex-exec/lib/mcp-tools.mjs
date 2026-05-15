import { buildCodexBaseArgs } from './args.mjs';
import {
  normalizeCapabilityPolicy,
  resolveCapabilitySandbox,
} from './capability-policy.mjs';
import { normalizeString } from './strings.mjs';

export function buildMcpServerArgs({
  capabilityPolicy,
  workdir,
} = {}) {
  return [...buildCodexBaseArgs({ workdir, capabilityPolicy }), 'mcp-server'];
}

export function buildCodexToolArguments({
  prompt,
  workdir,
  model,
  reasoningEffort,
  capabilityPolicy,
} = {}) {
  const normalizedPolicy = normalizeCapabilityPolicy(capabilityPolicy);
  return {
    prompt: normalizeString(prompt),
    cwd: normalizeString(workdir),
    model: normalizeString(model),
    'approval-policy': 'never',
    sandbox: resolveCapabilitySandbox(normalizedPolicy),
    config: {
      model_reasoning_effort: normalizeString(reasoningEffort),
    },
  };
}

export function buildCodexReplyToolArguments({
  prompt,
  threadId,
} = {}) {
  return {
    prompt: normalizeString(prompt),
    threadId: normalizeString(threadId),
  };
}

export function parseCodexToolResult(result = {}) {
  const threadId = normalizeString(result?.structuredContent?.threadId || result?.threadId);
  const content = normalizeString(
    result?.structuredContent?.content ||
      result?.content?.find?.((part) => part?.type === 'text')?.text ||
      result?.content,
  );

  if (!content) {
    throw new Error('Codex MCP tool returned no text content.');
  }

  return {
    threadId,
    content,
  };
}
