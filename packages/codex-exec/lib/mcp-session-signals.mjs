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

function pickConnectorName(payload = {}, params = {}) {
  return normalizeString(
    payload?.connector_name ||
      payload?._meta?.connector_name ||
      payload?.tool?._meta?.connector_name ||
      params?.connector_name ||
      params?._meta?.connector_name,
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

function inferConnectorNameFromTool(toolName = '') {
  const cleaned = normalizeString(toolName);
  if (!cleaned) {
    return '';
  }
  const inferred = cleaned.includes('_') ? cleaned.split('_')[0] : humanizeToolName(cleaned);
  return inferred
    .replace(/[._-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
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
  const toolName = pickToolName(payload);
  const authFailure =
    payload?._meta?._codex_apps?.connector_auth_failure ||
    params?._meta?._codex_apps?.connector_auth_failure ||
    null;
  if (authFailure?.is_auth_failure) {
    const connector =
      normalizeString(authFailure.connector_name) ||
      pickConnectorName(payload, params) ||
      inferConnectorNameFromTool(toolName) ||
      'Connected app';
    return {
      kind: 'auth-required',
      level: 'warn',
      text: `${connector} needs reconnecting.`,
      speakText: `${connector} needs reconnecting before I can keep going.`,
      source: 'mcp-notification',
      method,
      payloadType: payloadType || 'connector_auth_failure',
      toolName,
      connectorName: connector,
      connectorId: normalizeString(authFailure.connector_id),
      linkId: normalizeString(authFailure.link_id),
      authReason: normalizeString(authFailure.auth_reason),
      errorAction: normalizeString(authFailure.error_action),
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
      toolName,
    };
  }

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
