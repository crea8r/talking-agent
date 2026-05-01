export const AGENT_READY_WINDOW_MS = 15_000;

const SESSION_REUSABLE_PACKAGES = [
  '@talking-agent/room-layer',
  '@talking-agent/avatar-layer-browser',
  '@talking-agent/voice-layer-browser',
  '@talking-agent/avatar-speech-browser',
  '@talking-agent/agent-room-bridge',
];

function normalizeRuntimeConfig(runtimeConfig) {
  return runtimeConfig && typeof runtimeConfig === 'object' ? runtimeConfig : {};
}

function parseHeartbeatTimestamp(value) {
  const parsed = Date.parse(`${value || ''}`.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeSessionForUi(session, now = Date.now()) {
  if (!session || typeof session !== 'object') {
    return null;
  }

  const normalized = {
    ...session,
    agent: {
      id: `${session.agent?.id || ''}`.trim() || null,
      label: `${session.agent?.label || 'Codex OpenAI'}`.trim() || 'Codex OpenAI',
      lastSeenAt: `${session.agent?.lastSeenAt || ''}`.trim() || null,
    },
  };

  if (!normalized.agent.id) {
    normalized.agent.id = null;
  }

  const lastSeenMs = parseHeartbeatTimestamp(normalized.agent.lastSeenAt);
  if (lastSeenMs === null || lastSeenMs > now) {
    if (lastSeenMs !== null && lastSeenMs > now) {
      normalized.agent.id = null;
    }
    normalized.agent.lastSeenAt = null;
  }

  return normalized;
}

export function getCodexProjectTitle(runtimeConfig = {}) {
  const config = normalizeRuntimeConfig(runtimeConfig);
  return `${config.codexProjectName || config.appName || 'Codex Project'}`.trim();
}

export function getCallTitle(session, runtimeConfig = {}) {
  return `${session?.title || getCodexProjectTitle(runtimeConfig)}`.trim();
}

export function buildCallSessionKey(formState = {}, runtimeConfig = {}) {
  return JSON.stringify({
    title: getCodexProjectTitle(runtimeConfig),
    livekitUrl: `${formState.livekitUrl || ''}`.trim(),
    roomName: `${formState.roomName || ''}`.trim(),
    identity: `${formState.identity || ''}`.trim(),
  });
}

export function buildCallSessionPayload(formState = {}, runtimeConfig = {}) {
  const config = normalizeRuntimeConfig(runtimeConfig);
  const bundledModelId = `${formState.bundledModelId || config.avatar?.defaultModelId || ''}`.trim();
  const avatarCatalog =
    config.bridge?.avatarCatalogByModel && bundledModelId
      ? config.bridge.avatarCatalogByModel[bundledModelId]
      : null;
  return {
    roomName: `${formState.roomName || ''}`.trim(),
    livekitUrl: `${formState.livekitUrl || config.livekitUrl || ''}`.trim(),
    humanIdentity: `${formState.identity || ''}`.trim(),
    humanName: `${formState.participantName || ''}`.trim(),
    title: getCodexProjectTitle(runtimeConfig),
    metadata: {
      app: 'one-to-one-agent-room',
      planEntry: 'docs/6-app-plan.md#4-one-to-one-agent-room',
      codexProjectName: getCodexProjectTitle(runtimeConfig),
      reusablePackages: SESSION_REUSABLE_PACKAGES,
      activeModelId: bundledModelId,
      avatarCatalogUri: avatarCatalog?.uri || '',
      avatarCatalogVersion: avatarCatalog?.version || '',
    },
  };
}

export function buildDefaultCallForm({ runtimeConfig = {} } = {}) {
  const config = normalizeRuntimeConfig(runtimeConfig);
  const projectSlug = `${getCodexProjectTitle(runtimeConfig)}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return {
    livekitUrl: `${config.livekitUrl || 'ws://127.0.0.1:7880'}`.trim(),
    roomName: `${projectSlug || 'codex-project'}-call`,
    identity: 'human-room-host',
    participantName: 'Human Caller',
    enableCamera: true,
    enableMicrophone: true,
  };
}

export function shouldReplaceLegacyCallValue(field, value) {
  const cleaned = `${value || ''}`.trim();

  if (field === 'roomName') {
    return cleaned === 'app4-one-to-one-room';
  }

  if (field === 'identity') {
    return /^human-[a-z0-9]{6}$/i.test(cleaned);
  }

  return false;
}

export function getCallPrimaryAction({
  session = null,
  room = null,
  sessionPreparing = false,
  modelLoading = false,
  formReady = false,
  now = Date.now(),
} = {}) {
  const heartbeat = getAgentHeartbeatState(session, now);

  if (room) {
    return {
      mode: 'in-room',
      label: 'In Room',
      disabled: true,
    };
  }

  if (!session?.id) {
    return {
      mode: 'connect-agent',
      label: 'Connect Agent',
      disabled: false,
    };
  }

  if (heartbeat.ready) {
    return {
      mode: 'start-room',
      label: 'Start Room',
      disabled: false,
    };
  }

  return {
    mode: 'connect-agent',
    label: 'Connect Agent',
    disabled: false,
  };
}

export function getAgentHeartbeatState(session, now = Date.now()) {
  const normalizedSession = normalizeSessionForUi(session, now);
  const label = `${normalizedSession?.agent?.label || 'Codex OpenAI'}`.trim();

  if (!normalizedSession?.id) {
    return {
      status: 'missing-session',
      ready: false,
      label,
      ageMs: null,
      lastSeenAt: null,
    };
  }

  const lastSeenAt = `${normalizedSession.agent?.lastSeenAt || ''}`.trim();
  if (!lastSeenAt) {
    return {
      status: 'waiting',
      ready: false,
      label,
      ageMs: null,
      lastSeenAt: null,
    };
  }

  const lastSeenMs = parseHeartbeatTimestamp(lastSeenAt);
  const ageMs = lastSeenMs === null ? null : Math.max(0, now - lastSeenMs);
  const agentId = `${normalizedSession.agent?.id || ''}`.trim();

  if (ageMs !== null && ageMs > AGENT_READY_WINDOW_MS) {
    return {
      status: 'stale',
      ready: false,
      label,
      ageMs,
      lastSeenAt,
    };
  }

  if (!agentId) {
    return {
      status: 'waiting',
      ready: false,
      label,
      ageMs,
      lastSeenAt: null,
    };
  }

  return {
    status: 'ready',
    ready: true,
    label,
    ageMs,
    lastSeenAt,
  };
}

export function formatHeartbeatAge(ageMs) {
  if (!Number.isFinite(ageMs) || ageMs === null) {
    return 'not seen yet';
  }

  if (ageMs < 1_500) {
    return 'just now';
  }

  if (ageMs < 60_000) {
    return `${Math.round(ageMs / 1_000)}s ago`;
  }

  return `${Math.round(ageMs / 60_000)}m ago`;
}

export function buildAgentConnectGuide({ session = null, runtimeConfig = {} } = {}) {
  const config = normalizeRuntimeConfig(runtimeConfig);
  const command = config.bridge?.mcpServerCommand || 'MCP command unavailable';
  const stateFilePath = config.bridge?.stateFilePath || 'unknown';
  const projectName = getCodexProjectTitle(runtimeConfig);
  const projectPath = config.codexProjectPath || 'unknown';
  const sessionId = session?.id || 'waiting for session';
  const callTitle = getCallTitle(session, runtimeConfig);
  const agentLabel = session?.agent?.label || 'Codex OpenAI';

  return [
    `Project: ${projectName}`,
    `Call title: ${callTitle}`,
    `Path: ${projectPath}`,
    `Session: ${sessionId}`,
    `Bridge state: ${stateFilePath}`,
    '',
    '1. Start the room bridge MCP server',
    command,
    '',
    '2. Attach that MCP server to your agent runtime',
    `   Then call join_call with agentId="codex-openai" and agentLabel="${agentLabel}".`,
    '',
    '3. Keep the event loop running',
    '   Use wait_for_events while the room is live so the agent keeps receiving transcript deltas and finals.',
    '',
    '4. After the room starts, the agent loop is',
    '   - join_call',
    '   - wait_for_events',
    '   - publish_actions',
    '   - leave_call',
  ].join('\n');
}

export function buildAgentChatPrompt({ session = null, runtimeConfig = {} } = {}) {
  const config = normalizeRuntimeConfig(runtimeConfig);
  const projectName = getCodexProjectTitle(runtimeConfig);
  const callTitle = getCallTitle(session, runtimeConfig);
  const sessionId = session?.id || 'waiting for session';
  const agentLabel = session?.agent?.label || 'Codex OpenAI';
  const command = config.bridge?.mcpServerCommand || 'MCP command unavailable';

  return [
    `You are connecting to the one-to-one agent room for project "${projectName}".`,
    `Call title: ${callTitle}`,
    `Session ID: ${sessionId}`,
    `Agent label: ${agentLabel}`,
    '',
    'Start this MCP server:',
    command,
    '',
    `Then call \`join_call\` with agentId="codex-openai" and agentLabel="${agentLabel}".`,
    'Use the returned callId and cursor as the start of your event loop.',
    '',
    'After the room starts, use this loop:',
    '- `wait_for_events`',
    '- `publish_actions`',
    '- `leave_call` when the call ends',
  ].join('\n');
}
