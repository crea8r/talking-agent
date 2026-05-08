import { randomUUID } from 'node:crypto';

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
  session.events = session.events.slice(0, 40);
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

function isLinkedCallLaunch(launch = {}) {
  return normalizeString(launch?.mode) === 'linked-call' && normalizeString(launch?.launchId);
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

  function markTurnInterrupted(turn, reason) {
    if (!turn) {
      return;
    }

    turn.status = 'interrupted';
    turn.interruptedAt ||= new Date().toISOString();
    turn.errorText ||= normalizeString(reason);
    if (turn.agentReply && !turn.agentReply.interruptedAt) {
      turn.agentReply.interruptedAt = turn.interruptedAt;
    }
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
      lastAgentReply: null,
    };

    sessions.set(session.id, session);
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

  async function setCallState({ sessionId, state, reason = '' } = {}) {
    const session = getRequiredSession(sessionId);
    session.state = normalizeString(state) || session.state;
    session.updatedAt = new Date().toISOString();
    recordEvent(session, 'session.state', {
      state: session.state,
      reason: normalizeString(reason),
    });
    return buildPayload(session, activeRequests.get(session.id) || null);
  }

  async function interrupt({ sessionId, reason = 'human interrupted the agent' } = {}) {
    const session = getRequiredSession(sessionId);
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
    }

    session.agent.status = session.state === 'live' ? 'listening' : 'idle';
    session.agent.currentTurnId = null;
    session.updatedAt = new Date().toISOString();
    recordEvent(session, 'agent.interrupted', {
      reason: normalizeString(reason),
      hadActiveRequest: Boolean(activeRequest),
    });
    return buildPayload(session);
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
    recordEvent(session, 'codex.started', {
      turnId: turn.id,
      requestId: replyHandle.requestId,
    });

    try {
      const reply = await replyHandle.promise;
      const latestRequest = activeRequests.get(session.id);
      if (!latestRequest || latestRequest.requestId !== replyHandle.requestId || turn.status === 'interrupted') {
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
        rawText: reply.rawText,
        playedAt: null,
        interruptedAt: null,
      };
      session.agent.status = 'idle';
      session.agent.currentTurnId = null;
      session.agent.lastReplyAt = turn.agentReply.createdAt;
      session.agent.lastError = '';
      session.updatedAt = new Date().toISOString();
      clearActiveRequest(session.id, replyHandle.requestId);
      recordEvent(session, 'codex.completed', {
        turnId: turn.id,
        requestId: replyHandle.requestId,
        mode: reply.runMode,
      });
      return buildPayload(session, null, {
        turn: clone(turn),
      });
    } catch (error) {
      clearActiveRequest(session.id, replyHandle.requestId);
      if (error?.name === 'AbortError') {
        markTurnInterrupted(turn, error.message);
        session.agent.status = session.state === 'live' ? 'listening' : 'idle';
        session.agent.currentTurnId = null;
        session.updatedAt = new Date().toISOString();
        recordEvent(session, 'codex.aborted', {
          turnId: turn.id,
          requestId: replyHandle.requestId,
        });
        return buildPayload(session, null, {
          turn: clone(turn),
          interrupted: true,
        });
      }

      turn.status = 'error';
      turn.errorText = error instanceof Error ? error.message : 'Codex reply failed.';
      session.agent.status = 'error';
      session.agent.currentTurnId = null;
      session.agent.lastError = turn.errorText;
      session.updatedAt = new Date().toISOString();
      recordEvent(session, 'codex.failed', {
        turnId: turn.id,
        requestId: replyHandle.requestId,
        error: turn.errorText,
      });
      throw error;
    }
  }

  async function markReplyPlayed({ sessionId, turnId } = {}) {
    const session = getRequiredSession(sessionId);
    const turn = session.turns.find((entry) => entry.id === normalizeString(turnId));
    if (!turn?.agentReply) {
      throw new Error(`Unknown turn reply: ${turnId}`);
    }

    turn.agentReply.playedAt ||= new Date().toISOString();
    session.updatedAt = new Date().toISOString();
    recordEvent(session, 'reply.played', {
      turnId: turn.id,
    });
    return buildPayload(session, activeRequests.get(session.id) || null, {
      turn: clone(turn),
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
    }
  }

  return {
    createSession,
    getSession,
    syncSetup,
    setCallState,
    interrupt,
    submitHumanTurn,
    markReplyPlayed,
    endSession,
  };
}
