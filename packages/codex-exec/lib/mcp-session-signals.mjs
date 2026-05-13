import { readFile } from 'node:fs/promises';

import { normalizeString } from './strings.mjs';

const TOOL_START_TYPES = new Set(['mcp_tool_call', 'collab_tool_call', 'tool_call', 'tool_started']);
const TOOL_FINISH_TYPES = new Set([
  'mcp_tool_result',
  'collab_tool_result',
  'tool_result',
  'tool_finished',
  'function_call_output',
]);

function pickPayload(params = {}) {
  return params?.event || params?.payload || params?.data || params?.item || params || {};
}

function pickText(value) {
  if (typeof value === 'string') {
    return normalizeString(value);
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const candidate = pickText(entry);
      if (candidate) {
        return candidate;
      }
    }
    return '';
  }
  if (value && typeof value === 'object') {
    return (
      pickText(value.text) ||
      pickText(value.message) ||
      pickText(value.content) ||
      pickText(value.output)
    );
  }
  return '';
}

function pickToolName(payload = {}) {
  return normalizeString(
    payload?.toolName ||
      payload?.tool?.name ||
      payload?.call?.name ||
      payload?.name,
  );
}

function humanizeToolName(toolName = '') {
  const cleaned = normalizeString(toolName);
  if (!cleaned) {
    return '';
  }
  return cleaned
    .replace(/^_+/, '')
    .replace(/[._-]+/g, ' ')
    .trim();
}

export async function readThreadState(sessionReadyPath) {
  const raw = await readFile(sessionReadyPath, 'utf8').catch(() => '');
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function normalizeWorkerNotification(message = {}) {
  const method = normalizeString(message?.method);
  if (!method) {
    return null;
  }

  const params = message?.params || {};
  const payload = pickPayload(params);
  const payloadType = normalizeString(payload?.type || params?.type);
  const authFailure =
    payload?._meta?._codex_apps?.connector_auth_failure ||
    params?._meta?._codex_apps?.connector_auth_failure ||
    null;
  if (authFailure?.is_auth_failure) {
    const connector = normalizeString(authFailure.connector_name) || 'Connected app';
    return {
      kind: 'auth-required',
      level: 'warn',
      text: `${connector} needs reconnecting.`,
      speakText: `${connector} needs reconnecting before I can keep going.`,
      source: 'mcp-notification',
      method,
      payloadType: payloadType || 'connector_auth_failure',
      toolName: pickToolName(payload),
    };
  }

  const agentMessage =
    pickText(payload?.message) ||
    pickText(payload?.text) ||
    pickText(payload?.content) ||
    pickText(params?.message) ||
    pickText(params?.text);
  if (payloadType === 'agent_message' && agentMessage) {
    return {
      kind: 'notice',
      level: 'info',
      text: agentMessage,
      speakText: agentMessage,
      source: 'mcp-notification',
      method,
      payloadType,
      toolName: pickToolName(payload),
    };
  }

  const toolName = pickToolName(payload);
  const readableToolName = humanizeToolName(toolName);
  if (toolName && TOOL_START_TYPES.has(payloadType)) {
    return {
      kind: 'tool-start',
      level: 'info',
      text: `Using ${readableToolName || toolName}.`,
      source: 'mcp-notification',
      method,
      payloadType,
      toolName,
    };
  }
  if (toolName && TOOL_FINISH_TYPES.has(payloadType)) {
    return {
      kind: 'tool-finish',
      level: 'info',
      text: `Finished ${readableToolName || toolName}.`,
      source: 'mcp-notification',
      method,
      payloadType,
      toolName,
    };
  }

  const statusText = agentMessage || normalizeString(payload?.status || params?.status);
  if (!statusText) {
    return null;
  }
  return {
    kind: 'notification',
    level: 'info',
    text: statusText,
    source: 'mcp-notification',
    method,
    payloadType,
    toolName,
  };
}

export function normalizeWorkerStderrLine(line = '') {
  const text = normalizeString(line);
  if (!text) {
    return null;
  }

  return {
    kind: 'log',
    level: /error/i.test(text) ? 'error' : /warn/i.test(text) ? 'warn' : 'info',
    text,
    source: 'mcp-stderr',
    method: 'stderr',
    payloadType: 'stderr',
    toolName: '',
  };
}
