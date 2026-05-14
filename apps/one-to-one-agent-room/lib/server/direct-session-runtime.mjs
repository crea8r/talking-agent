import { randomUUID } from 'node:crypto';

const MAX_SESSION_EVENTS = 500;
const PLAYBACK_EVENT_KINDS = new Set(['reply', 'speculative', 'thinking', 'hello', 'goodbye']);
const PLAYBACK_EVENT_PHASES = new Set(['started', 'ended']);
const DEFAULT_PLAYBACK_SOURCES = {
  reply: 'codex-turn',
  speculative: 'speculative-turn',
  thinking: 'local-thinking-prompt',
  hello: 'local-hello',
  goodbye: 'local-goodbye',
};

function normalizeString(value) {
  return `${value || ''}`.trim();
}

function clone(value) {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function mergeMetadata(current = {}, next = {}) {
  return {
    ...current,
    ...next,
    agentSetup: {
      ...(current.agentSetup || {}),
      ...(next.agentSetup || {}),
    },
  };
}

function computeMetrics(session) {
  const turns = Array.isArray(session?.turns) ? session.turns : [];
  const pendingTurns = turns.filter((turn) => turn.status === 'processing').length;
  const unplayedReplies = turns.filter(
    (turn) => turn.agentReply && !turn.agentReply.playedAt && !turn.agentReply.interruptedAt,
  ).length;

  return {
    pendingTurns,
    turnCount: turns.length,
    unplayedReplies,
  };
}

function recordEvent(session, type, details = {}) {
  session.events.unshift({
    id: randomUUID(),
    at: new Date().toISOString(),
    type,
    details,
  });
  session.events = session.events.slice(0, MAX_SESSION_EVENTS);
}

function buildInspector(session, activeRequest = null) {
  return {
    sessionId: session.id,
    state: session.state,
    activeModelId: session.avatar.activeModelId,
    activeModelLabel: session.avatar.activeModelLabel,
    agentStatus: session.agent.status,
    currentTurnId: session.agent.currentTurnId,
    pendingTurns: session.metrics.pendingTurns,
    unplayedReplies: session.metrics.unplayedReplies,
    activeRequest: activeRequest
      ? {
          requestId: activeRequest.requestId,
          turnId: activeRequest.turnId,
          startedAt: activeRequest.startedAt,
        }
      : null,
    recentEvents: clone(session.events),
  };
}

function toClientSession(session) {
  const cloned = clone(session);
  cloned.metrics = computeMetrics(cloned);
  cloned.lastAgentReply =
    [...cloned.turns]
      .reverse()
      .find((turn) => turn.agentReply)?.agentReply || null;
  return cloned;
}

function buildPayload(session, activeRequest = null, extra = {}) {
  return {
    ok: true,
    session: toClientSession(session),
    inspector: buildInspector(session, activeRequest),
    ...extra,
  };
}

function createAvatarState({
  metadata = {},
  modelsById,
  gestureCatalogByModel,
  defaultModelId,
} = {}) {
  const requestedModelId =
    normalizeString(metadata?.agentSetup?.activeModelId) || normalizeString(defaultModelId);
  const model = modelsById.get(requestedModelId) || modelsById.get(defaultModelId);
  const activeModelId = model?.id || normalizeString(defaultModelId);

  return {
    activeModelId,
    activeModelLabel: model?.label || activeModelId || 'Avatar',
    gestureCatalog: clone(gestureCatalogByModel[activeModelId] || []),
  };
}

function createStandbyState({
  status = 'idle',
  requestId = '',
  preparedAt = '',
  updatedAt = '',
  error = '',
} = {}) {
  return {
    status: normalizeString(status) || 'idle',
    requestId: normalizeString(requestId),
    preparedAt: normalizeString(preparedAt),
    updatedAt: normalizeString(updatedAt) || new Date().toISOString(),
    error: normalizeString(error),
  };
}

function isLinkedCallLaunch(launch = {}) {
  return normalizeString(launch?.mode) === 'linked-call' && normalizeString(launch?.launchId);
}

const AFFIRMATIVE_TURN_TEXT = new Set([
  'yes',
  'yeah',
  'yep',
  'sure',
  'yes please',
  'sure please',
  'please do',
  'go ahead',
  'do it',
  'i want',
  'yes i want',
  'okay yes',
]);

function clipText(text = '', maxLength = 96) {
  const cleaned = normalizeString(text).replace(/\s+/g, ' ');
  if (!cleaned || cleaned.length <= maxLength) {
    return cleaned;
  }
  return `${cleaned.slice(0, maxLength - 1).trimEnd()}…`;
}

function isAffirmativeTurnText(text = '') {
  const cleaned = normalizeString(text)
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return AFFIRMATIVE_TURN_TEXT.has(cleaned);
}

function extractActionSummaryFromQuestion(text = '') {
  const cleaned = normalizeString(text).replace(/\s+/g, ' ');
  if (!cleaned) {
    return '';
  }

  const patterns = [
    /do you want me to\s+(.+?)\??$/i,
    /would you like me to\s+(.+?)\??$/i,
    /should I\s+(.+?)\??$/i,
    /shall I\s+(.+?)\??$/i,
    /want me to\s+(.+?)\??$/i,
  ];
  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match?.[1]) {
      return clipText(match[1].replace(/[.?!]+$/g, ''));
    }
  }
  return '';
}

function buildTurnOperationSummary(session, transcript = '') {
  const cleanedTranscript = clipText(
    normalizeString(transcript)
      .replace(/[.?!]+$/g, '')
      .replace(/^(okay|ok|please|well)\s+/i, '')
      .replace(/^(can|could|would|will|do)\s+you\s+/i, '')
      .replace(/^i\s+want\s+you\s+to\s+/i, '')
      .replace(/^i\s+want\s+to\s+/i, ''),
  );
  if (!cleanedTranscript) {
    return '';
  }

  if (isAffirmativeTurnText(cleanedTranscript)) {
    const previousTurns = [...(session?.turns || [])].reverse();
    const previousSummary = previousTurns
      .map((turn) => normalizeString(turn?.operation?.summary))
      .find(Boolean);
    if (previousSummary) {
      return clipText(previousSummary);
    }

    const previousQuestion = previousTurns
      .map((turn) => extractActionSummaryFromQuestion(turn?.agentReply?.text || ''))
      .find(Boolean);
    if (previousQuestion) {
      return clipText(previousQuestion);
    }
  }

  const wordCount = cleanedTranscript.split(/\s+/).filter(Boolean).length;
  return wordCount >= 2 || cleanedTranscript.length >= 12 ? cleanedTranscript : '';
}

function createTurnOperation(session, transcript = '') {
  const summary = buildTurnOperationSummary(session, transcript);
  if (!summary) {
    return null;
  }

  const now = new Date().toISOString();
  return {
    summary,
    phase: 'accepted',
    statusText: '',
    toolName: '',
    auth: null,
    startedAt: now,
    updatedAt: now,
    deferredAt: null,
    completedAt: null,
    blockedAt: null,
    failedAt: null,
    interruptedAt: null,
  };
}

function touchTurnOperation(turn, patch = {}) {
  if (!turn?.operation || !patch || typeof patch !== 'object') {
    return;
  }

  Object.assign(turn.operation, patch, {
    updatedAt: patch.updatedAt || new Date().toISOString(),
  });
}

function getCurrentOperationTurn(session) {
  const currentTurnId = normalizeString(session?.agent?.currentTurnId);
  if (currentTurnId) {
    const currentTurn = session?.turns?.find((turn) => turn.id === currentTurnId) || null;
    if (currentTurn) {
      return currentTurn;
    }
  }

  return (
    [...(session?.turns || [])]
      .reverse()
      .find((turn) => turn?.status === 'processing' || (turn?.operation && !turn.operation.completedAt)) || null
  );
}

export function createDirectSessionRuntime({
  agentRunner,
  callRecordStore = null,
  modelsById,
  gestureCatalogByModel,
  defaultModelId,
  projectTitle = 'talking-agent',
  agentId = 'codex-openai',
  agentLabel = 'Codex OpenAI',
} = {}) {
  if (!agentRunner) {
    throw new Error('createDirectSessionRuntime requires an agentRunner.');
  }

  const sessions = new Map();
  const activeRequests = new Map();
  const deferredRequests = new Map();
  const activeSpeculativeRequests = new Map();
  const sessionEventUnsubscribers = new Map();

  function getRequiredSession(sessionId) {
    const session = sessions.get(normalizeString(sessionId));
    if (!session) {
      throw new Error(`Unknown session: ${sessionId}`);
    }
    return session;
  }

  function clearActiveRequest(sessionId, requestId) {
    const active = activeRequests.get(sessionId);
    if (active && active.requestId === requestId) {
      activeRequests.delete(sessionId);
    }
  }

  function getDeferredRequestMap(sessionId, { create = false } = {}) {
    const key = normalizeString(sessionId);
    const existing = deferredRequests.get(key);
    if (existing || !create) {
      return existing || null;
    }

    const created = new Map();
    deferredRequests.set(key, created);
    return created;
  }

  function clearDeferredRequest(sessionId, requestId) {
    const requestMap = getDeferredRequestMap(sessionId);
    if (!requestMap) {
      return;
    }

    requestMap.delete(requestId);
    if (requestMap.size === 0) {
      deferredRequests.delete(normalizeString(sessionId));
    }
  }

  function clearActiveSpeculativeRequest(sessionId, requestId) {
    const active = activeSpeculativeRequests.get(sessionId);
    if (active && active.requestId === requestId) {
      activeSpeculativeRequests.delete(sessionId);
    }
  }

  function abortSpeculativeRequest(sessionId, reason) {
    const active = activeSpeculativeRequests.get(sessionId) || null;
    if (!active) {
      return false;
    }

    active.abort(normalizeString(reason) || 'Speculative reply aborted.');
    activeSpeculativeRequests.delete(sessionId);
    return true;
  }

function markTurnInterrupted(turn, reason) {
  if (!turn) {
    return;
  }

  turn.status = 'interrupted';
  turn.interruptedAt ||= new Date().toISOString();
  turn.errorText ||= normalizeString(reason);
  touchTurnOperation(turn, {
    phase: 'interrupted',
    statusText: normalizeString(reason),
    interruptedAt: turn.interruptedAt,
  });
  if (turn.agentReply && !turn.agentReply.interruptedAt) {
    turn.agentReply.interruptedAt = turn.interruptedAt;
  }
}

  function resolveRequestDisposition(sessionId, requestId) {
    const activeRequest = activeRequests.get(sessionId) || null;
    if (activeRequest?.requestId === requestId) {
      return 'active';
    }

    const deferredRequestMap = getDeferredRequestMap(sessionId);
    if (deferredRequestMap?.has(requestId)) {
      return 'deferred';
    }

    return 'missing';
  }

  function clearSessionEventSubscription(sessionId = '') {
    const key = normalizeString(sessionId);
    const unsubscribe = sessionEventUnsubscribers.get(key);
    if (typeof unsubscribe === 'function') {
      unsubscribe();
    }
    sessionEventUnsubscribers.delete(key);
  }

  function updateStandbyState(session, patch = {}) {
    if (!session) {
      return;
    }

    session.standby = createStandbyState({
      ...(session.standby || {}),
      ...(patch && typeof patch === 'object' ? patch : {}),
      updatedAt: patch?.updatedAt || new Date().toISOString(),
    });
  }

  function trackSessionWarmup(session, warmup, { origin = 'live' } = {}) {
    if (!session || !warmup?.requestId) {
      return;
    }

    updateStandbyState(session, {
      status: 'warming',
      requestId: warmup.requestId,
      preparedAt: '',
      error: '',
    });
    recordEvent(session, 'codex.warmup_started', {
      requestId: warmup.requestId,
      origin: normalizeString(origin) || 'live',
    });
    void warmup.promise
      .then(() => {
        const activeSession = sessions.get(session.id);
        if (!activeSession) {
          return;
        }
        activeSession.updatedAt = new Date().toISOString();
        updateStandbyState(activeSession, {
          status: 'ready',
          requestId: warmup.requestId,
          preparedAt: new Date().toISOString(),
          error: '',
        });
        recordEvent(activeSession, 'codex.warmup_completed', {
          requestId: warmup.requestId,
          origin: normalizeString(origin) || 'live',
        });
      })
      .catch((error) => {
        const activeSession = sessions.get(session.id);
        if (!activeSession) {
          return;
        }
        const status = error?.name === 'AbortError' ? 'aborted' : 'failed';
        activeSession.updatedAt = new Date().toISOString();
        updateStandbyState(activeSession, {
          status,
          requestId: warmup.requestId,
          preparedAt: '',
          error: error instanceof Error ? error.message : 'Session warmup failed.',
        });
        recordEvent(activeSession, error?.name === 'AbortError' ? 'codex.warmup_aborted' : 'codex.warmup_failed', {
          requestId: warmup.requestId,
          origin: normalizeString(origin) || 'live',
          error: error instanceof Error ? error.message : 'Session warmup failed.',
        });
      });
  }

  function normalizeCodexSignal(signal = {}) {
    const kind = normalizeString(signal.kind);
    const text = normalizeString(signal.text);
    if (!kind || !text) {
      return null;
    }

    const eventType =
      kind === 'notice'
        ? 'codex.notice'
        : kind === 'tool-start'
          ? 'codex.tool_started'
          : kind === 'tool-finish'
            ? 'codex.tool_finished'
            : kind === 'auth-required'
              ? 'codex.auth_required'
              : kind === 'log'
                ? 'codex.log'
                : 'codex.notification';

    return {
      eventType,
      details: {
        kind,
        level: normalizeString(signal.level) || 'info',
        text,
        speakText: normalizeString(signal.speakText),
        source: normalizeString(signal.source) || 'codex-worker',
        method: normalizeString(signal.method),
        payloadType: normalizeString(signal.payloadType),
        toolName: normalizeString(signal.toolName),
        connectorName: normalizeString(signal.connectorName),
        connectorId: normalizeString(signal.connectorId),
        linkId: normalizeString(signal.linkId),
        authReason: normalizeString(signal.authReason),
        errorAction: normalizeString(signal.errorAction),
      },
    };
  }

  function ensureSessionEventSubscription(session) {
    const sessionId = normalizeString(session?.id);
    if (!sessionId || sessionEventUnsubscribers.has(sessionId) || typeof agentRunner.subscribeSessionEvents !== 'function') {
      return;
    }

    const unsubscribe = agentRunner.subscribeSessionEvents({
      sessionId,
      listener: (signal) => {
        const activeSession = sessions.get(sessionId);
        const normalized = activeSession ? normalizeCodexSignal(signal) : null;
        if (!activeSession || !normalized) {
          return;
        }
        activeSession.updatedAt = new Date().toISOString();
        const operationTurn = getCurrentOperationTurn(activeSession);
        if (operationTurn?.operation) {
          if (normalized.eventType === 'codex.notice') {
            touchTurnOperation(operationTurn, {
              phase: 'working',
              statusText: normalizeString(normalized.details.text),
            });
          } else if (normalized.eventType === 'codex.tool_started') {
            touchTurnOperation(operationTurn, {
              phase: 'using-tool',
              statusText: normalizeString(normalized.details.text),
              toolName: normalizeString(normalized.details.toolName),
            });
          } else if (normalized.eventType === 'codex.tool_finished') {
            touchTurnOperation(operationTurn, {
              phase: 'working',
              statusText: normalizeString(normalized.details.text),
              toolName: normalizeString(normalized.details.toolName),
            });
          } else if (normalized.eventType === 'codex.auth_required') {
            touchTurnOperation(operationTurn, {
              phase: 'blocked',
              statusText: normalizeString(normalized.details.text),
              blockedAt: new Date().toISOString(),
              toolName: normalizeString(normalized.details.toolName),
              auth: {
                connectorName: normalizeString(normalized.details.connectorName),
                connectorId: normalizeString(normalized.details.connectorId),
                linkId: normalizeString(normalized.details.linkId),
                authReason: normalizeString(normalized.details.authReason),
                errorAction: normalizeString(normalized.details.errorAction),
              },
            });
          }
        }
        recordEvent(activeSession, normalized.eventType, normalized.details);
      },
    });
    sessionEventUnsubscribers.set(sessionId, typeof unsubscribe === 'function' ? unsubscribe : () => {});
  }

  async function recordPlaybackEvent({
    sessionId,
    phase,
    kind,
    source = '',
    turnId = '',
    text = '',
    turnCompleted,
  } = {}) {
    const session = getRequiredSession(sessionId);
    const normalizedPhase = normalizeString(phase).toLowerCase();
    const normalizedKind = normalizeString(kind).toLowerCase();
    if (!PLAYBACK_EVENT_PHASES.has(normalizedPhase)) {
      throw new Error(`Unsupported playback phase: ${phase}`);
    }
    if (!PLAYBACK_EVENT_KINDS.has(normalizedKind)) {
      throw new Error(`Unsupported playback kind: ${kind}`);
    }

    const now = new Date().toISOString();
    const normalizedSource =
      normalizeString(source) || DEFAULT_PLAYBACK_SOURCES[normalizedKind] || 'audio';
    const details = {
      kind: normalizedKind,
      source: normalizedSource,
    };
    const normalizedText = normalizeString(text);
    if (normalizedText) {
      details.text = normalizedText;
    }

    let turn = null;
    if (normalizedKind === 'reply') {
      turn = session.turns.find((entry) => entry.id === normalizeString(turnId)) || null;
      if (!turn?.agentReply) {
        throw new Error(`Unknown turn reply: ${turnId}`);
      }

      details.turnId = turn.id;
      if (!details.text) {
        details.text = normalizeString(turn.agentReply.text);
      }

      const shouldMarkTurnCompleted =
        normalizedPhase === 'ended' && turnCompleted !== false;
      if (normalizedPhase === 'started') {
        turn.agentReply.playbackStartedAt ||= now;
        touchTurnOperation(turn, {
          phase: 'speaking',
          statusText: details.text || 'Speaking reply.',
        });
      } else if (shouldMarkTurnCompleted) {
        turn.agentReply.playedAt ||= now;
        touchTurnOperation(turn, {
          phase: 'completed',
          statusText: '',
          completedAt: now,
        });
      }
    }

    session.updatedAt = now;
    recordEvent(session, `audio.${normalizedPhase}`, details);
    if (
      normalizedKind === 'reply' &&
      normalizedPhase === 'ended' &&
      turn &&
      turnCompleted !== false
    ) {
      recordEvent(session, 'reply.played', {
        turnId: turn.id,
      });
    }

    return buildPayload(session, activeRequests.get(session.id) || null, turn ? {
      turn: clone(turn),
    } : {});
  }

  async function createSession(payload = {}) {
    const metadata = mergeMetadata({}, payload.metadata || {});
    const launch = metadata?.launch || {};
    if (isLinkedCallLaunch(launch) && callRecordStore?.loadRecord) {
      const linkedRecord = await callRecordStore.loadRecord({
        launchId: launch.launchId,
      });
      if (!linkedRecord) {
        throw new Error(`Unknown linked call: ${launch.launchId}`);
      }
      if (linkedRecord.status === 'active') {
        throw new Error('This call is already active in another tab.');
      }
      if (linkedRecord.status === 'ended') {
        throw new Error('This call has already ended.');
      }
    }

    const session = {
      id: randomUUID(),
      title: normalizeString(payload.title || projectTitle) || projectTitle,
      state: 'ready',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata,
      human: {
        identity: normalizeString(payload.humanIdentity) || 'human-caller',
        name: normalizeString(payload.humanName) || 'Human Caller',
      },
      agent: {
        id: agentId,
        label: agentLabel,
        status: 'idle',
        currentTurnId: null,
        lastReplyAt: null,
        lastError: '',
      },
      avatar: createAvatarState({
        metadata,
        modelsById,
        gestureCatalogByModel,
        defaultModelId,
      }),
      turns: [],
      events: [],
      metrics: {
        pendingTurns: 0,
        turnCount: 0,
        unplayedReplies: 0,
      },
      standby: createStandbyState(),
      lastAgentReply: null,
    };

    sessions.set(session.id, session);
    ensureSessionEventSubscription(session);
    if (!isLinkedCallLaunch(launch)) {
      await agentRunner.resetSession({ sessionId: session.id }).catch(() => {});
    }
    if (isLinkedCallLaunch(launch) && callRecordStore?.updateRecord) {
      await callRecordStore.updateRecord({
        launchId: launch.launchId,
        patch: {
          status: 'active',
          activeAppSessionId: session.id,
        },
      });
    }
    recordEvent(session, 'session.created', {
      title: session.title,
      modelId: session.avatar.activeModelId,
    });
    return buildPayload(session);
  }

  async function getSession(sessionId) {
    const session = getRequiredSession(sessionId);
    session.updatedAt = new Date().toISOString();
    return buildPayload(session, activeRequests.get(session.id) || null);
  }

  async function syncSetup({ sessionId, metadata = {} } = {}) {
    const session = getRequiredSession(sessionId);
    session.metadata = mergeMetadata(session.metadata, metadata);
    session.avatar = createAvatarState({
      metadata: session.metadata,
      modelsById,
      gestureCatalogByModel,
      defaultModelId,
    });
    session.updatedAt = new Date().toISOString();
    recordEvent(session, 'setup.synced', {
      modelId: session.avatar.activeModelId,
      voiceSample: session.metadata.agentSetup?.voiceSampleFileName || '',
    });
    return buildPayload(session, activeRequests.get(session.id) || null);
  }

  async function prepareSessionStandby({ sessionId } = {}) {
    const session = getRequiredSession(sessionId);
    if (session.state === 'ended') {
      throw new Error('Cannot prepare standby for an ended session.');
    }

    const launch = session?.metadata?.launch || {};
    if (isLinkedCallLaunch(launch) || typeof agentRunner.startSessionWarmup !== 'function') {
      updateStandbyState(session, {
        status: 'ready',
        requestId: '',
        preparedAt: session.standby?.preparedAt || new Date().toISOString(),
        error: '',
      });
      return buildPayload(session, activeRequests.get(session.id) || null);
    }

    const status = normalizeString(session.standby?.status).toLowerCase();
    if (status === 'warming' || status === 'ready') {
      return buildPayload(session, activeRequests.get(session.id) || null);
    }

    try {
      const warmup = await agentRunner.startSessionWarmup({ session });
      if (!warmup?.requestId) {
        updateStandbyState(session, {
          status: 'ready',
          requestId: '',
          preparedAt: new Date().toISOString(),
          error: '',
        });
        return buildPayload(session, activeRequests.get(session.id) || null);
      }

      trackSessionWarmup(session, warmup, { origin: 'standby' });
    } catch (error) {
      updateStandbyState(session, {
        status: 'failed',
        requestId: '',
        preparedAt: '',
        error: error instanceof Error ? error.message : 'Session warmup failed.',
      });
      recordEvent(session, 'codex.warmup_failed', {
        requestId: '',
        origin: 'standby',
        error: error instanceof Error ? error.message : 'Session warmup failed.',
      });
    }

    return buildPayload(session, activeRequests.get(session.id) || null);
  }

  async function setCallState({ sessionId, state, reason = '', skipWarmup = false } = {}) {
    const session = getRequiredSession(sessionId);
    session.state = normalizeString(state) || session.state;
    session.updatedAt = new Date().toISOString();
    recordEvent(session, 'session.state', {
      state: session.state,
      reason: normalizeString(reason),
    });

    if (!skipWarmup && session.state === 'live' && typeof agentRunner.startSessionWarmup === 'function') {
      try {
        const warmup = await agentRunner.startSessionWarmup({ session });
        if (warmup?.requestId) {
          trackSessionWarmup(session, warmup, { origin: 'live' });
        }
      } catch (error) {
        updateStandbyState(session, {
          status: 'failed',
          requestId: '',
          preparedAt: '',
          error: error instanceof Error ? error.message : 'Session warmup failed.',
        });
        recordEvent(session, 'codex.warmup_failed', {
          requestId: '',
          origin: 'live',
          error: error instanceof Error ? error.message : 'Session warmup failed.',
        });
      }
    }

    return buildPayload(session, activeRequests.get(session.id) || null);
  }

  async function discardSession({
    sessionId,
    reason = 'Session discarded before the call started.',
  } = {}) {
    const session = getRequiredSession(sessionId);
    const activeRequest = activeRequests.get(session.id) || null;
    if (activeRequest) {
      activeRequest.abort(reason);
      activeRequests.delete(session.id);
      const activeTurn = session.turns.find((turn) => turn.id === activeRequest.turnId) || null;
      markTurnInterrupted(activeTurn, reason);
    }

    const deferredRequestMap = getDeferredRequestMap(session.id);
    if (deferredRequestMap) {
      for (const request of deferredRequestMap.values()) {
        request.abort(reason);
      }
      deferredRequests.delete(session.id);
    }
    abortSpeculativeRequest(session.id, reason);
    await agentRunner.abortSessionWarmup?.({
      sessionId: session.id,
      reason,
    }).catch(() => {});
    await agentRunner.resetSession?.({
      sessionId: session.id,
    }).catch(() => {});
    clearSessionEventSubscription(session.id);
    sessions.delete(session.id);
    activeRequests.delete(session.id);
    deferredRequests.delete(session.id);
    activeSpeculativeRequests.delete(session.id);
    return {
      ok: true,
      sessionId: session.id,
    };
  }

  async function deferActiveTurn({
    sessionId,
    reason = 'The agent is still working on this request.',
  } = {}) {
    const session = getRequiredSession(sessionId);
    const activeRequest = activeRequests.get(session.id) || null;
    if (!activeRequest) {
      return buildPayload(session, null, {
        deferred: false,
        softTimedOut: false,
      });
    }

    activeRequests.delete(session.id);
    const requestMap = getDeferredRequestMap(session.id, { create: true });
    requestMap.set(activeRequest.requestId, {
      ...activeRequest,
      deferredAt: new Date().toISOString(),
    });

    const activeTurn = session.turns.find((turn) => turn.id === activeRequest.turnId) || null;
    touchTurnOperation(activeTurn, {
      phase: 'background',
      statusText: normalizeString(reason) || 'Still working in the background.',
      deferredAt: new Date().toISOString(),
    });
    session.agent.status = session.state === 'live' ? 'listening' : 'idle';
    session.agent.currentTurnId = null;
    session.updatedAt = new Date().toISOString();
    recordEvent(session, 'codex.deferred', {
      turnId: activeRequest.turnId,
      requestId: activeRequest.requestId,
      reason: normalizeString(reason),
    });

    return buildPayload(session, null, {
      deferred: true,
      softTimedOut: true,
      deferredTurnId: activeRequest.turnId,
      deferredRequestId: activeRequest.requestId,
      turn: activeTurn ? clone(activeTurn) : null,
    });
  }

  async function interrupt({ sessionId, reason = 'human interrupted the agent' } = {}) {
    const session = getRequiredSession(sessionId);
    const hadSpeculativeRequest = abortSpeculativeRequest(
      session.id,
      reason || 'human interrupted the speculative reply',
    );
    const activeRequest = activeRequests.get(session.id) || null;
    if (activeRequest) {
      activeRequest.abort(reason);
      activeRequests.delete(session.id);
      const activeTurn = session.turns.find((turn) => turn.id === activeRequest.turnId) || null;
      markTurnInterrupted(activeTurn, reason);
    }

    const speakingTurn = [...session.turns]
      .reverse()
      .find((turn) => turn.agentReply && !turn.agentReply.playedAt && !turn.agentReply.interruptedAt);
    if (speakingTurn) {
      speakingTurn.agentReply.interruptedAt = new Date().toISOString();
      touchTurnOperation(speakingTurn, {
        phase: 'interrupted',
        statusText: normalizeString(reason),
        interruptedAt: speakingTurn.agentReply.interruptedAt,
      });
    }

    session.agent.status = session.state === 'live' ? 'listening' : 'idle';
    session.agent.currentTurnId = null;
    session.updatedAt = new Date().toISOString();
    recordEvent(session, 'agent.interrupted', {
      reason: normalizeString(reason),
      hadActiveRequest: Boolean(activeRequest),
      hadSpeculativeRequest,
    });
    return buildPayload(session);
  }

  async function startSpeculativeHumanTurn({
    sessionId,
    text,
    source = 'voice-sentence',
  } = {}) {
    if (typeof agentRunner.startSpeculativeReply !== 'function') {
      throw new Error('This agent runner does not support speculative replies.');
    }

    const session = getRequiredSession(sessionId);
    const transcript = normalizeString(text);
    if (!transcript) {
      throw new Error('Transcript text is required.');
    }
    if (session.state !== 'live') {
      throw new Error('Start the call before sending a speculative human turn.');
    }

    abortSpeculativeRequest(session.id, 'A newer sentence superseded the speculative reply.');
    session.updatedAt = new Date().toISOString();
    recordEvent(session, 'speculative.accepted', {
      source: normalizeString(source) || 'voice-sentence',
    });

    const replyHandle = await agentRunner.startSpeculativeReply({
      session,
      transcript,
      source,
    });
    activeSpeculativeRequests.set(session.id, {
      requestId: replyHandle.requestId,
      startedAt: new Date().toISOString(),
      abort: replyHandle.abort,
    });
    recordEvent(session, 'codex.speculative_started', {
      requestId: replyHandle.requestId,
      source: normalizeString(source) || 'voice-sentence',
    });

    try {
      const reply = await replyHandle.promise;
      const latestRequest = activeSpeculativeRequests.get(session.id);
      if (!latestRequest || latestRequest.requestId !== replyHandle.requestId) {
        recordEvent(session, 'codex.speculative_superseded', {
          requestId: replyHandle.requestId,
        });
        return buildPayload(session, activeRequests.get(session.id) || null, {
          interrupted: true,
        });
      }

      clearActiveSpeculativeRequest(session.id, replyHandle.requestId);
      session.updatedAt = new Date().toISOString();
      recordEvent(session, 'codex.speculative_completed', {
        requestId: replyHandle.requestId,
        mode: reply.runMode,
      });
      return buildPayload(session, activeRequests.get(session.id) || null, {
        speculativeReply: clone(reply),
      });
    } catch (error) {
      clearActiveSpeculativeRequest(session.id, replyHandle.requestId);
      if (error?.name === 'AbortError') {
        recordEvent(session, 'codex.speculative_aborted', {
          requestId: replyHandle.requestId,
        });
        return buildPayload(session, activeRequests.get(session.id) || null, {
          interrupted: true,
        });
      }

      recordEvent(session, 'codex.speculative_failed', {
        requestId: replyHandle.requestId,
        error: error instanceof Error ? error.message : 'Speculative reply failed.',
      });
      throw error;
    }
  }

  async function submitHumanTurn({
    sessionId,
    text,
    source = 'voice',
    humanIdentity = '',
    humanName = '',
  } = {}) {
    const session = getRequiredSession(sessionId);
    const transcript = normalizeString(text);
    if (!transcript) {
      throw new Error('Transcript text is required.');
    }
    if (session.state !== 'live') {
      throw new Error('Start the call before sending a human turn.');
    }

    const abortedSpeculative = abortSpeculativeRequest(
      session.id,
      'Final turn superseded the speculative reply.',
    );
    if (abortedSpeculative) {
      recordEvent(session, 'speculative.interrupted', {
        reason: 'Final turn superseded the speculative reply.',
      });
    }

    const turn = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      source: normalizeString(source) || 'voice',
      transcript,
      human: {
        identity: normalizeString(humanIdentity) || session.human.identity,
        name: normalizeString(humanName) || session.human.name,
      },
      status: 'processing',
      interruptedAt: null,
      errorText: '',
      operation: createTurnOperation(session, transcript),
      agentReply: null,
    };

    session.turns.push(turn);
    session.updatedAt = new Date().toISOString();
    session.agent.status = 'thinking';
    session.agent.currentTurnId = turn.id;
    recordEvent(session, 'turn.accepted', {
      turnId: turn.id,
      source: turn.source,
    });

    const replyHandle = await agentRunner.startReply({
      session,
      turn,
    });
    const activeRequest = {
      requestId: replyHandle.requestId,
      turnId: turn.id,
      startedAt: new Date().toISOString(),
      abort: replyHandle.abort,
    };
    activeRequests.set(session.id, activeRequest);
    touchTurnOperation(turn, {
      phase: 'thinking',
      statusText: 'Thinking about the request.',
    });
    recordEvent(session, 'codex.started', {
      turnId: turn.id,
      requestId: replyHandle.requestId,
    });

    try {
      const reply = await replyHandle.promise;
      const disposition = resolveRequestDisposition(session.id, replyHandle.requestId);
      if (disposition === 'missing' || turn.status === 'interrupted') {
        markTurnInterrupted(turn, 'A newer utterance superseded this reply.');
        session.agent.status = session.state === 'live' ? 'listening' : 'idle';
        session.agent.currentTurnId = null;
        session.updatedAt = new Date().toISOString();
        recordEvent(session, 'codex.superseded', {
          turnId: turn.id,
          requestId: replyHandle.requestId,
        });
        return buildPayload(session, null, {
          turn: clone(turn),
          interrupted: true,
        });
      }

      turn.status = 'replied';
      turn.agentReply = {
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        agentId: session.agent.id,
        agentLabel: session.agent.label,
        text: reply.text,
        subtitle: reply.subtitle,
        mood: reply.mood,
        emoteId: reply.emoteId,
        gestureId: reply.gestureId,
        animationSequence: clone(reply.animationSequence || []),
        followUps: clone(reply.followUps || []),
        rawText: reply.rawText,
        playbackStartedAt: null,
        playedAt: null,
        interruptedAt: null,
      };
      session.agent.lastReplyAt = turn.agentReply.createdAt;
      session.agent.lastError = '';
      if (disposition === 'active') {
        session.agent.status = 'idle';
        session.agent.currentTurnId = null;
        clearActiveRequest(session.id, replyHandle.requestId);
      } else {
        clearDeferredRequest(session.id, replyHandle.requestId);
      }
      session.updatedAt = new Date().toISOString();
      touchTurnOperation(turn, {
        phase: disposition === 'deferred' ? 'background' : 'reply-ready',
        statusText: disposition === 'deferred' ? 'Reply ready in the background.' : 'Reply ready.',
      });
      recordEvent(session, 'codex.completed', {
        turnId: turn.id,
        requestId: replyHandle.requestId,
        mode: reply.runMode,
        deferred: disposition === 'deferred',
      });
      return buildPayload(session, activeRequests.get(session.id) || null, {
        turn: clone(turn),
        turnCompletedInBackground: disposition === 'deferred',
      });
    } catch (error) {
      const disposition = resolveRequestDisposition(session.id, replyHandle.requestId);
      clearActiveRequest(session.id, replyHandle.requestId);
      clearDeferredRequest(session.id, replyHandle.requestId);
      if (error?.name === 'AbortError') {
        markTurnInterrupted(turn, error.message);
        if (disposition === 'active') {
          session.agent.status = session.state === 'live' ? 'listening' : 'idle';
          session.agent.currentTurnId = null;
        }
        session.updatedAt = new Date().toISOString();
        recordEvent(session, 'codex.aborted', {
          turnId: turn.id,
          requestId: replyHandle.requestId,
          deferred: disposition === 'deferred',
        });
        return buildPayload(session, activeRequests.get(session.id) || null, {
          turn: clone(turn),
          interrupted: true,
        });
      }

      turn.status = 'error';
      turn.errorText = error instanceof Error ? error.message : 'Codex reply failed.';
      touchTurnOperation(turn, {
        phase: 'failed',
        statusText: turn.errorText,
        failedAt: new Date().toISOString(),
      });
      if (disposition === 'active') {
        session.agent.status = 'error';
        session.agent.currentTurnId = null;
      }
      session.agent.lastError = turn.errorText;
      session.updatedAt = new Date().toISOString();
      recordEvent(session, 'codex.failed', {
        turnId: turn.id,
        requestId: replyHandle.requestId,
        error: turn.errorText,
        deferred: disposition === 'deferred',
      });
      throw error;
    }
  }

  async function markReplyPlayed({ sessionId, turnId } = {}) {
    return recordPlaybackEvent({
      sessionId,
      phase: 'ended',
      kind: 'reply',
      turnId,
    });
  }

  async function endSession({
    sessionId,
    reason = 'human ended call',
    skipAgentFinalize = false,
  } = {}) {
    const session = getRequiredSession(sessionId);
    const launch = session?.metadata?.launch || {};
    const endedAt = new Date().toISOString();

    const activeRequest = activeRequests.get(session.id) || null;
    if (activeRequest) {
      activeRequest.abort(reason);
      activeRequests.delete(session.id);
      const activeTurn = session.turns.find((turn) => turn.id === activeRequest.turnId) || null;
      markTurnInterrupted(activeTurn, reason);
    }
    const deferredRequestMap = getDeferredRequestMap(session.id);
    if (deferredRequestMap) {
      for (const request of deferredRequestMap.values()) {
        request.abort(reason);
        const deferredTurn = session.turns.find((turn) => turn.id === request.turnId) || null;
        markTurnInterrupted(deferredTurn, reason);
      }
      deferredRequests.delete(session.id);
    }
    abortSpeculativeRequest(session.id, reason);
    await agentRunner.abortSessionWarmup?.({
      sessionId: session.id,
      reason,
    });

    session.state = 'ended';
    session.agent.status = 'idle';
    session.agent.currentTurnId = null;
    session.updatedAt = endedAt;

    if (skipAgentFinalize) {
      session.summary = '';

      if (isLinkedCallLaunch(launch) && callRecordStore?.updateRecord) {
        await callRecordStore.updateRecord({
          launchId: launch.launchId,
          patch: {
            status: 'ended',
            summary: '',
            endedAt,
            failureReason: '',
            activeAppSessionId: '',
          },
        });
      }

      recordEvent(session, 'session.ended', {
        reason: normalizeString(reason),
        summary: '',
        skippedAgentFinalize: true,
      });

      return buildPayload(session, null, {
        summary: '',
      });
    }

    try {
      const finalized = await agentRunner.finalizeSession?.({ session, reason });
      const summary = normalizeString(finalized?.summary);
      session.summary = summary;

      if (isLinkedCallLaunch(launch) && callRecordStore?.updateRecord) {
        await callRecordStore.updateRecord({
          launchId: launch.launchId,
          patch: {
            status: 'ended',
            summary,
            endedAt,
            failureReason: '',
            activeAppSessionId: '',
          },
        });
      }

      recordEvent(session, 'session.ended', {
        reason: normalizeString(reason),
        summary,
      });

      return buildPayload(session, null, {
        summary,
      });
    } catch (error) {
      const failureReason = error instanceof Error ? error.message : 'Unable to finalize the call.';
      session.summary = normalizeString(session.summary);

      if (isLinkedCallLaunch(launch) && callRecordStore?.updateRecord) {
        await callRecordStore.updateRecord({
          launchId: launch.launchId,
          patch: {
            status: 'retry-needed',
            summary: session.summary || '',
            endedAt,
            failureReason,
            activeAppSessionId: '',
          },
        });
      }

      recordEvent(session, 'session.finalize_failed', {
        reason: normalizeString(reason),
        error: failureReason,
      });

      return buildPayload(session, null, {
        summary: session.summary || '',
        retryNeeded: true,
        failureReason,
      });
    } finally {
      clearSessionEventSubscription(session.id);
    }
  }

  return {
    createSession,
    getSession,
    syncSetup,
    prepareSessionStandby,
    setCallState,
    discardSession,
    interrupt,
    deferActiveTurn,
    startSpeculativeHumanTurn,
    submitHumanTurn,
    recordPlaybackEvent,
    markReplyPlayed,
    endSession,
  };
}
