import { randomUUID } from 'node:crypto';
import { mkdir, open as openFile, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_SESSION_TTL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_MAX_TURNS = 120;
const DEFAULT_MAX_EVENTS = 400;
const DEFAULT_MAX_ACTIONS = 180;
const LOCK_RETRY_MS = 25;
const LOCK_TIMEOUT_MS = 5000;
const ACTIVE_AGENT_WINDOW_MS = 15_000;
const WAIT_POLL_MS = 50;
const CAPABILITIES_VERSION = '2026-05-01';

export function resolveDefaultBridgeStatePath({
  cwd = process.cwd(),
  env = process.env,
} = {}) {
  return env.AGENT_ROOM_BRIDGE_STATE_PATH || path.join(cwd, 'output', 'agent-room-bridge-state.json');
}

function createTypedError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function createEmptyState() {
  return {
    version: 2,
    updatedAt: null,
    sessions: {},
  };
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function limitItems(items, limit) {
  return items.slice(Math.max(items.length - limit, 0));
}

function normalizeCursor(value) {
  const parsed = Number.parseInt(`${value || '0'}`, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function normalizeAgent(agent = {}) {
  return {
    id: typeof agent.id === 'string' ? agent.id : null,
    label: typeof agent.label === 'string' ? agent.label : 'Codex OpenAI',
    lastSeenAt: typeof agent.lastSeenAt === 'string' ? agent.lastSeenAt : null,
  };
}

function normalizeAvatar(avatar = {}) {
  return {
    activeModelId: typeof avatar.activeModelId === 'string' ? avatar.activeModelId : '',
    catalogUri: typeof avatar.catalogUri === 'string' ? avatar.catalogUri : '',
    catalogVersion: typeof avatar.catalogVersion === 'string' ? avatar.catalogVersion : '',
    updatedAt: typeof avatar.updatedAt === 'string' ? avatar.updatedAt : null,
  };
}

function normalizeTurn(turn = {}) {
  const transcript = `${turn.transcript || ''}`.trim();
  if (!transcript) {
    return null;
  }

  return {
    id: typeof turn.id === 'string' ? turn.id : randomUUID(),
    utteranceId: typeof turn.utteranceId === 'string' ? turn.utteranceId : '',
    source: typeof turn.source === 'string' ? turn.source : 'voice',
    transcript,
    createdAt: typeof turn.createdAt === 'string' ? turn.createdAt : new Date().toISOString(),
    status: ['pending', 'claimed', 'replied'].includes(turn.status) ? turn.status : 'pending',
    human: {
      identity: typeof turn.human?.identity === 'string' ? turn.human.identity : '',
      name: typeof turn.human?.name === 'string' ? turn.human.name : '',
    },
    agentClaim: turn.agentClaim
      ? {
          agentId: typeof turn.agentClaim.agentId === 'string' ? turn.agentClaim.agentId : '',
          agentLabel: typeof turn.agentClaim.agentLabel === 'string' ? turn.agentClaim.agentLabel : '',
          claimedAt:
            typeof turn.agentClaim.claimedAt === 'string'
              ? turn.agentClaim.claimedAt
              : new Date().toISOString(),
        }
      : null,
    agentReply: turn.agentReply
      ? {
          id: typeof turn.agentReply.id === 'string' ? turn.agentReply.id : randomUUID(),
          actionId: typeof turn.agentReply.actionId === 'string' ? turn.agentReply.actionId : '',
          text: typeof turn.agentReply.text === 'string' ? turn.agentReply.text : '',
          createdAt:
            typeof turn.agentReply.createdAt === 'string'
              ? turn.agentReply.createdAt
              : new Date().toISOString(),
          playedAt: typeof turn.agentReply.playedAt === 'string' ? turn.agentReply.playedAt : null,
          agentId: typeof turn.agentReply.agentId === 'string' ? turn.agentReply.agentId : '',
          agentLabel: typeof turn.agentReply.agentLabel === 'string' ? turn.agentReply.agentLabel : '',
          emoteId: typeof turn.agentReply.emoteId === 'string' ? turn.agentReply.emoteId : 'warm',
          gestureId:
            typeof turn.agentReply.gestureId === 'string' ? turn.agentReply.gestureId : 'Pose',
          stageId: typeof turn.agentReply.stageId === 'string' ? turn.agentReply.stageId : '',
          characterId:
            typeof turn.agentReply.characterId === 'string' ? turn.agentReply.characterId : '',
          mood: typeof turn.agentReply.mood === 'string' ? turn.agentReply.mood : 'neutral',
          voiceMode: turn.agentReply.voiceMode === 'silent' ? 'silent' : 'speak',
          notes: typeof turn.agentReply.notes === 'string' ? turn.agentReply.notes : '',
        }
      : null,
  };
}

function normalizeEvent(event = {}) {
  if (typeof event.type !== 'string' || !event.type.trim()) {
    return null;
  }

  const normalized = {
    id: typeof event.id === 'string' ? event.id : randomUUID(),
    seq: Number.isFinite(event.seq) ? Number(event.seq) : 0,
    type: `${event.type}`.trim(),
    ts: typeof event.ts === 'string' ? event.ts : new Date().toISOString(),
  };

  for (const [key, value] of Object.entries(event)) {
    if (key === 'id' || key === 'seq' || key === 'type' || key === 'ts') {
      continue;
    }

    normalized[key] = cloneJson(value);
  }

  return normalized;
}

function normalizeAction(action = {}) {
  return {
    actionId: typeof action.actionId === 'string' && action.actionId.trim() ? action.actionId.trim() : randomUUID(),
    type: typeof action.type === 'string' ? action.type : 'speech',
    createdAt: typeof action.createdAt === 'string' ? action.createdAt : new Date().toISOString(),
    startedAt: typeof action.startedAt === 'string' ? action.startedAt : null,
    completedAt: typeof action.completedAt === 'string' ? action.completedAt : null,
    status: ['pending', 'playing', 'completed'].includes(action.status) ? action.status : 'pending',
    inReplyToEventId:
      typeof action.inReplyToEventId === 'string' && action.inReplyToEventId.trim()
        ? action.inReplyToEventId.trim()
        : null,
    text: typeof action.text === 'string' ? action.text : '',
    gestureId: typeof action.gestureId === 'string' ? action.gestureId : '',
    emoteId: typeof action.emoteId === 'string' ? action.emoteId : '',
    stageId: typeof action.stageId === 'string' ? action.stageId : '',
    characterId: typeof action.characterId === 'string' ? action.characterId : '',
    mood: typeof action.mood === 'string' ? action.mood : 'neutral',
    voiceMode: action.voiceMode === 'silent' ? 'silent' : 'speak',
    reason: typeof action.reason === 'string' ? action.reason : '',
    notes: typeof action.notes === 'string' ? action.notes : '',
    replyId: typeof action.replyId === 'string' ? action.replyId : '',
  };
}

function normalizeSession(session = {}) {
  const turns = Array.isArray(session.turns)
    ? limitItems(
        session.turns
          .map((turn) => normalizeTurn(turn))
          .filter(Boolean),
        DEFAULT_MAX_TURNS,
      )
    : [];
  const events = Array.isArray(session.events)
    ? limitItems(
        session.events
          .map((event) => normalizeEvent(event))
          .filter(Boolean)
          .sort((left, right) => left.seq - right.seq),
        DEFAULT_MAX_EVENTS,
      )
    : [];
  const actions = Array.isArray(session.actions)
    ? limitItems(
        session.actions
          .map((action) => normalizeAction(action))
          .filter(Boolean),
        DEFAULT_MAX_ACTIONS,
      )
    : [];
  const maxSeq = events.reduce((highest, event) => Math.max(highest, event.seq), 0);

  return {
    id: typeof session.id === 'string' ? session.id : randomUUID(),
    title: typeof session.title === 'string' ? session.title : 'Human x Codex',
    roomName: typeof session.roomName === 'string' ? session.roomName : '',
    livekitUrl: typeof session.livekitUrl === 'string' ? session.livekitUrl : '',
    state: ['waiting', 'live', 'ending', 'ended'].includes(session.state) ? session.state : 'waiting',
    createdAt: typeof session.createdAt === 'string' ? session.createdAt : new Date().toISOString(),
    updatedAt: typeof session.updatedAt === 'string' ? session.updatedAt : new Date().toISOString(),
    lastSeenAt:
      typeof session.lastSeenAt === 'string' ? session.lastSeenAt : new Date().toISOString(),
    human: {
      identity: typeof session.human?.identity === 'string' ? session.human.identity : '',
      name: typeof session.human?.name === 'string' ? session.human.name : '',
    },
    agent: normalizeAgent(session.agent),
    metadata: session.metadata && typeof session.metadata === 'object' ? session.metadata : {},
    avatar: normalizeAvatar(session.avatar),
    nextEventSeq:
      Number.isFinite(session.nextEventSeq) && Number(session.nextEventSeq) > maxSeq
        ? Number(session.nextEventSeq)
        : maxSeq + 1,
    turns,
    events,
    actions,
  };
}

function sanitizeState(raw) {
  const state = raw && typeof raw === 'object' ? raw : createEmptyState();
  const sessions = {};

  for (const [sessionId, session] of Object.entries(state.sessions || {})) {
    sessions[sessionId] = normalizeSession(session);
  }

  return {
    version: 2,
    updatedAt: typeof state.updatedAt === 'string' ? state.updatedAt : null,
    sessions,
  };
}

async function ensureStateFile(stateFilePath) {
  await mkdir(path.dirname(stateFilePath), { recursive: true });

  try {
    await readFile(stateFilePath, 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }

    await writeFile(stateFilePath, JSON.stringify(createEmptyState(), null, 2));
  }
}

async function sleep(ms) {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function withFileLock(stateFilePath, task) {
  const lockFilePath = `${stateFilePath}.lock`;
  const startedAt = Date.now();
  let handle = null;

  await mkdir(path.dirname(lockFilePath), { recursive: true });

  while (!handle) {
    try {
      handle = await openFile(lockFilePath, 'wx');
    } catch (error) {
      if (error?.code !== 'EEXIST') {
        throw error;
      }

      if (Date.now() - startedAt > LOCK_TIMEOUT_MS) {
        throw new Error(`Timed out waiting for bridge lock: ${lockFilePath}`);
      }

      await sleep(LOCK_RETRY_MS);
    }
  }

  try {
    return await task();
  } finally {
    await handle.close().catch(() => {});
    await unlink(lockFilePath).catch(() => {});
  }
}

async function readState(stateFilePath) {
  await ensureStateFile(stateFilePath);
  const raw = await readFile(stateFilePath, 'utf8');

  try {
    return sanitizeState(JSON.parse(raw));
  } catch {
    return createEmptyState();
  }
}

async function writeState(stateFilePath, state) {
  state.updatedAt = new Date().toISOString();
  await writeFile(stateFilePath, JSON.stringify(state, null, 2));
}

function isAgentHeartbeatFresh(agent, now = Date.now()) {
  const seenAt = Date.parse(agent?.lastSeenAt || '');
  return Number.isFinite(seenAt) && now - seenAt <= ACTIVE_AGENT_WINDOW_MS;
}

function currentCursor(session) {
  return String(Math.max(0, Number(session.nextEventSeq || 1) - 1));
}

function buildMetrics(turns, actions = []) {
  const pendingTurns = turns.filter((turn) => turn.status === 'pending').length;
  const claimedTurns = turns.filter((turn) => turn.status === 'claimed').length;
  const repliedTurns = turns.filter((turn) => turn.status === 'replied').length;
  const unplayedReplies = turns.filter((turn) => turn.agentReply && !turn.agentReply.playedAt).length;
  const pendingActions = actions.filter((action) => action.status === 'pending').length;
  const playingActions = actions.filter((action) => action.status === 'playing').length;

  return {
    pendingTurns,
    claimedTurns,
    repliedTurns,
    unplayedReplies,
    totalTurns: turns.length,
    pendingActions,
    playingActions,
  };
}

function buildAgentSnapshot(agent) {
  const normalized = cloneJson(normalizeAgent(agent));
  if (isAgentHeartbeatFresh(normalized)) {
    return normalized;
  }

  return {
    id: null,
    label: normalized.label || 'Codex OpenAI',
    lastSeenAt: null,
  };
}

function buildSessionSnapshot(session) {
  const turns = session.turns.map((turn) => cloneJson(turn));
  const lastHumanTurn = [...turns].reverse().find((turn) => turn.transcript) || null;
  const lastAgentReply = [...turns]
    .reverse()
    .map((turn) => turn.agentReply)
    .find(Boolean) || null;
  const actions = session.actions.map((action) => cloneJson(action));

  return {
    id: session.id,
    title: session.title,
    roomName: session.roomName,
    livekitUrl: session.livekitUrl,
    state: session.state,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    lastSeenAt: session.lastSeenAt,
    human: cloneJson(session.human),
    agent: buildAgentSnapshot(session.agent),
    metadata: cloneJson(session.metadata),
    avatar: cloneJson(session.avatar),
    currentCursor: currentCursor(session),
    metrics: buildMetrics(turns, actions),
    lastHumanTurn,
    lastAgentReply,
    turns,
    pendingActions: actions.filter((action) => action.status === 'pending'),
  };
}

function buildInspectorSnapshot(session) {
  const actions = session.actions.map((action) => cloneJson(action));
  const events = session.events.map((event) => cloneJson(event));

  return {
    callId: session.id,
    title: session.title,
    state: session.state,
    currentCursor: currentCursor(session),
    agent: buildAgentSnapshot(session.agent),
    avatar: cloneJson(session.avatar),
    metrics: buildMetrics(session.turns, actions),
    recentEvents: limitItems(events, 30),
    pendingActions: actions.filter((action) => action.status === 'pending'),
    recentActions: limitItems(actions, 20),
  };
}

function pruneExpiredSessions(state, sessionTtlMs) {
  const cutoff = Date.now() - sessionTtlMs;
  let changed = false;

  for (const [sessionId, session] of Object.entries(state.sessions)) {
    const lastSeenAt = Date.parse(session.lastSeenAt || session.updatedAt || session.createdAt);
    if (Number.isFinite(lastSeenAt) && lastSeenAt < cutoff) {
      delete state.sessions[sessionId];
      changed = true;
    }
  }

  return changed;
}

function getSessionOrThrow(state, sessionId) {
  const session = state.sessions[sessionId];
  if (!session) {
    throw new Error(`Unknown session: ${sessionId}`);
  }

  return session;
}

function getActiveSession(state) {
  return (
    Object.values(state.sessions)
      .filter((session) => session.state !== 'ended')
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0] || null
  );
}

function getActiveSessionOrThrow(state) {
  const session = getActiveSession(state);
  if (!session) {
    throw createTypedError('no_active_call', 'No active call is currently available.');
  }

  return session;
}

function pickTurnForClaim(session, agentId) {
  const reclaimedTurn = session.turns.find(
    (turn) => turn.status === 'claimed' && turn.agentClaim?.agentId === agentId && !turn.agentReply,
  );

  if (reclaimedTurn) {
    return reclaimedTurn;
  }

  return session.turns.find((turn) => turn.status === 'pending') || null;
}

function touchSession(session, at) {
  session.updatedAt = at;
  session.lastSeenAt = at;
}

function sameSessionKey(session, { title, roomName, livekitUrl, humanIdentity, metadataApp }) {
  return (
    `${session.title || ''}`.trim() === `${title || ''}`.trim() &&
    `${session.roomName || ''}`.trim() === `${roomName || ''}`.trim() &&
    `${session.livekitUrl || ''}`.trim() === `${livekitUrl || ''}`.trim() &&
    `${session.human?.identity || ''}`.trim() === `${humanIdentity || ''}`.trim() &&
    `${session.metadata?.app || ''}`.trim() === `${metadataApp || ''}`.trim()
  );
}

function getSessionRecency(session) {
  const agentSeenAt = Date.parse(session.agent?.lastSeenAt || '');
  if (Number.isFinite(agentSeenAt) && isAgentHeartbeatFresh(session.agent)) {
    return {
      hasAgent: true,
      at: agentSeenAt,
    };
  }

  const updatedAt = Date.parse(session.updatedAt || session.lastSeenAt || session.createdAt || '');
  return {
    hasAgent: false,
    at: Number.isFinite(updatedAt) ? updatedAt : 0,
  };
}

function findReusableSession(state, reuseKey) {
  const matches = Object.values(state.sessions).filter((session) => sameSessionKey(session, reuseKey));
  if (!matches.length) {
    return null;
  }

  matches.sort((left, right) => {
    const leftRecency = getSessionRecency(left);
    const rightRecency = getSessionRecency(right);

    if (leftRecency.hasAgent !== rightRecency.hasAgent) {
      return Number(rightRecency.hasAgent) - Number(leftRecency.hasAgent);
    }

    return rightRecency.at - leftRecency.at;
  });

  return matches[0] || null;
}

function appendEvent(session, type, payload = {}, at = new Date().toISOString()) {
  if (!type) {
    throw new Error('Event type is required.');
  }

  const seq = Number(session.nextEventSeq || 1);
  const event = normalizeEvent({
    id: `evt-${seq}`,
    seq,
    type,
    ts: at,
    ...payload,
  });

  session.events = limitItems([...session.events, event], DEFAULT_MAX_EVENTS);
  session.nextEventSeq = seq + 1;
  touchSession(session, at);
  return cloneJson(event);
}

function findTurnByUtteranceId(session, utteranceId) {
  return session.turns.find((turn) => turn.utteranceId === utteranceId) || null;
}

function findTurnForSpeechReply(session, inReplyToEventId = null) {
  if (inReplyToEventId) {
    const event = session.events.find((entry) => entry.id === inReplyToEventId);
    if (event?.uttId) {
      const match = findTurnByUtteranceId(session, event.uttId);
      if (match) {
        return match;
      }
    }
  }

  return [...session.turns].reverse().find((turn) => !turn.agentReply) || null;
}

function applyReplyDirection(reply, context = {}) {
  if (!reply || !context) {
    return;
  }

  if (typeof context.gestureId === 'string' && context.gestureId.trim()) {
    reply.gestureId = context.gestureId.trim();
  }
  if (typeof context.emoteId === 'string' && context.emoteId.trim()) {
    reply.emoteId = context.emoteId.trim();
  }
  if (typeof context.stageId === 'string') {
    reply.stageId = context.stageId.trim();
  }
}

function buildJoinPayload(session, cursor, recentFinalTurns = null) {
  const payload = {
    callId: session.id,
    title: session.title,
    state: session.state,
    cursor,
    leaseMs: ACTIVE_AGENT_WINDOW_MS,
    capabilitiesVersion: CAPABILITIES_VERSION,
    activeModelId: session.avatar.activeModelId || null,
    avatarCatalogUri: session.avatar.catalogUri || 'avatar://catalog',
    avatarCatalogVersion: session.avatar.catalogVersion || null,
  };

  if (recentFinalTurns) {
    payload.recentFinalTurns = recentFinalTurns;
  }

  return payload;
}

export function createAgentRoomBridgeStore({
  stateFilePath = resolveDefaultBridgeStatePath(),
  sessionTtlMs = DEFAULT_SESSION_TTL_MS,
} = {}) {
  async function mutate(mutator) {
    return withFileLock(stateFilePath, async () => {
      const state = await readState(stateFilePath);
      pruneExpiredSessions(state, sessionTtlMs);
      const result = await mutator(state);
      await writeState(stateFilePath, state);
      return result;
    });
  }

  async function read(readFn) {
    return withFileLock(stateFilePath, async () => {
      const state = await readState(stateFilePath);
      const changed = pruneExpiredSessions(state, sessionTtlMs);
      const result = await readFn(state);

      if (changed) {
        await writeState(stateFilePath, state);
      }

      return result;
    });
  }

  async function createSession({
    roomName,
    livekitUrl,
    humanIdentity,
    humanName,
    title,
    metadata = {},
  }) {
    return mutate((state) => {
      const now = new Date().toISOString();
      const normalizedTitle = `${title || `${humanName || humanIdentity || 'Human'} x Codex`}`.trim();
      const normalizedRoomName = `${roomName || ''}`.trim();
      const normalizedLivekitUrl = `${livekitUrl || ''}`.trim();
      const normalizedHumanIdentity = `${humanIdentity || ''}`.trim();
      const normalizedHumanName = `${humanName || ''}`.trim();
      const normalizedMetadata = metadata && typeof metadata === 'object' ? metadata : {};
      const reusableSession = findReusableSession(state, {
        title: normalizedTitle,
        roomName: normalizedRoomName,
        livekitUrl: normalizedLivekitUrl,
        humanIdentity: normalizedHumanIdentity,
        metadataApp: `${normalizedMetadata.app || ''}`.trim(),
      });

      if (reusableSession) {
        reusableSession.title = normalizedTitle;
        reusableSession.roomName = normalizedRoomName;
        reusableSession.livekitUrl = normalizedLivekitUrl;
        reusableSession.human = {
          identity: normalizedHumanIdentity,
          name: normalizedHumanName,
        };
        reusableSession.metadata = {
          ...reusableSession.metadata,
          ...cloneJson(normalizedMetadata),
        };
        touchSession(reusableSession, now);
        return buildSessionSnapshot(reusableSession);
      }

      const sessionId = randomUUID();
      const session = normalizeSession({
        id: sessionId,
        title: normalizedTitle,
        roomName: normalizedRoomName,
        livekitUrl: normalizedLivekitUrl,
        state: 'waiting',
        createdAt: now,
        updatedAt: now,
        lastSeenAt: now,
        human: {
          identity: normalizedHumanIdentity,
          name: normalizedHumanName,
        },
        agent: {
          id: null,
          label: 'Codex OpenAI',
          lastSeenAt: null,
        },
        metadata: normalizedMetadata,
        avatar: {
          activeModelId: typeof normalizedMetadata.activeModelId === 'string' ? normalizedMetadata.activeModelId : '',
          catalogUri: typeof normalizedMetadata.avatarCatalogUri === 'string' ? normalizedMetadata.avatarCatalogUri : '',
          catalogVersion:
            typeof normalizedMetadata.avatarCatalogVersion === 'string'
              ? normalizedMetadata.avatarCatalogVersion
              : '',
          updatedAt: null,
        },
        turns: [],
        events: [],
        actions: [],
      });

      state.sessions[session.id] = session;
      return buildSessionSnapshot(session);
    });
  }

  async function listSessions() {
    return read((state) =>
      Object.values(state.sessions)
        .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
        .map((session) => buildSessionSnapshot(session)),
    );
  }

  async function getSession(sessionId, { touch = false } = {}) {
    if (touch) {
      return mutate((state) => {
        const session = getSessionOrThrow(state, sessionId);
        touchSession(session, new Date().toISOString());
        return buildSessionSnapshot(session);
      });
    }

    return read((state) => buildSessionSnapshot(getSessionOrThrow(state, sessionId)));
  }

  async function getBridgeStatus() {
    return read((state) => {
      const sessions = Object.values(state.sessions);
      return {
        stateFilePath,
        sessionCount: sessions.length,
        pendingTurnCount: sessions.reduce(
          (sum, session) => sum + buildMetrics(session.turns, session.actions).pendingTurns,
          0,
        ),
        pendingActionCount: sessions.reduce(
          (sum, session) => sum + buildMetrics(session.turns, session.actions).pendingActions,
          0,
        ),
        updatedAt: state.updatedAt,
      };
    });
  }

  async function heartbeatAgent({ sessionId, agentId, agentLabel }) {
    if (!`${agentId || ''}`.trim()) {
      throw new Error('agentId is required.');
    }

    return mutate((state) => {
      const session = getSessionOrThrow(state, sessionId);
      const now = new Date().toISOString();

      session.agent = {
        id: `${agentId}`.trim(),
        label: `${agentLabel || 'Codex OpenAI'}`.trim(),
        lastSeenAt: now,
      };
      touchSession(session, now);

      return buildSessionSnapshot(session);
    });
  }

  async function syncAvatarCatalog({ sessionId, activeModelId, catalogVersion, catalogUri }) {
    return mutate((state) => {
      const session = getSessionOrThrow(state, sessionId);
      const now = new Date().toISOString();
      const nextAvatar = {
        activeModelId: `${activeModelId || ''}`.trim(),
        catalogVersion: `${catalogVersion || ''}`.trim(),
        catalogUri: `${catalogUri || ''}`.trim(),
        updatedAt: now,
      };
      const hasPrevious = Boolean(session.avatar.activeModelId || session.avatar.catalogVersion || session.avatar.catalogUri);
      const changed =
        session.avatar.activeModelId !== nextAvatar.activeModelId ||
        session.avatar.catalogVersion !== nextAvatar.catalogVersion ||
        session.avatar.catalogUri !== nextAvatar.catalogUri;

      session.avatar = nextAvatar;
      touchSession(session, now);

      if (hasPrevious && changed) {
        appendEvent(session, 'avatar.catalog.changed', {
          activeModelId: nextAvatar.activeModelId,
          avatarCatalogUri: nextAvatar.catalogUri,
          avatarCatalogVersion: nextAvatar.catalogVersion,
        }, now);
      }

      return buildSessionSnapshot(session);
    });
  }

  async function setCallState({ sessionId, state: nextState, reason = '' }) {
    return mutate((rawState) => {
      const session = getSessionOrThrow(rawState, sessionId);
      const now = new Date().toISOString();
      const normalizedState = ['waiting', 'live', 'ending', 'ended'].includes(nextState)
        ? nextState
        : 'waiting';
      const previousState = session.state;
      session.state = normalizedState;
      touchSession(session, now);

      if (normalizedState !== previousState) {
        if (normalizedState === 'live') {
          appendEvent(session, 'call.ready', {}, now);
        } else if (normalizedState === 'ending') {
          appendEvent(session, 'call.ending', { reason: `${reason || ''}`.trim() }, now);
        } else if (normalizedState === 'ended') {
          appendEvent(session, 'call.ended', { reason: `${reason || ''}`.trim() }, now);
        }
      }

      return buildSessionSnapshot(session);
    });
  }

  async function appendUserUtteranceStart({ sessionId, utteranceId }) {
    const cleanedUtteranceId = `${utteranceId || ''}`.trim();
    if (!cleanedUtteranceId) {
      throw new Error('utteranceId is required.');
    }

    return mutate((state) => {
      const session = getSessionOrThrow(state, sessionId);
      const existing = session.events.find(
        (event) => event.type === 'utt.start' && event.uttId === cleanedUtteranceId,
      );
      if (!existing) {
        appendEvent(session, 'utt.start', { uttId: cleanedUtteranceId });
      }

      return buildSessionSnapshot(session);
    });
  }

  async function appendUserUtterancePartial({ sessionId, utteranceId, delta }) {
    const cleanedUtteranceId = `${utteranceId || ''}`.trim();
    const cleanedDelta = `${delta || ''}`;
    if (!cleanedUtteranceId) {
      throw new Error('utteranceId is required.');
    }
    if (!cleanedDelta) {
      throw new Error('delta is required.');
    }

    return mutate((state) => {
      const session = getSessionOrThrow(state, sessionId);
      const lastPartial = [...session.events]
        .reverse()
        .find((event) => event.type === 'utt.partial' && event.uttId === cleanedUtteranceId);
      if (!lastPartial || lastPartial.delta !== cleanedDelta) {
        appendEvent(session, 'utt.partial', {
          uttId: cleanedUtteranceId,
          delta: cleanedDelta,
        });
      }

      return buildSessionSnapshot(session);
    });
  }

  async function appendUserUtteranceFinal({
    sessionId,
    utteranceId,
    text,
    humanIdentity = '',
    humanName = '',
    source = 'voice',
  }) {
    const cleanedUtteranceId = `${utteranceId || ''}`.trim();
    const cleanedText = `${text || ''}`.trim();
    if (!cleanedUtteranceId) {
      throw new Error('utteranceId is required.');
    }
    if (!cleanedText) {
      throw new Error('text is required.');
    }

    return mutate((state) => {
      const session = getSessionOrThrow(state, sessionId);
      const now = new Date().toISOString();
      const existingFinal = session.events.find(
        (event) => event.type === 'utt.final' && event.uttId === cleanedUtteranceId,
      );
      if (!existingFinal) {
        appendEvent(session, 'utt.final', {
          uttId: cleanedUtteranceId,
          text: cleanedText,
        }, now);
      }

      if (!findTurnByUtteranceId(session, cleanedUtteranceId)) {
        session.turns = limitItems(
          [
            ...session.turns,
            normalizeTurn({
              id: randomUUID(),
              utteranceId: cleanedUtteranceId,
              source,
              transcript: cleanedText,
              createdAt: now,
              status: 'pending',
              human: {
                identity: `${humanIdentity || session.human.identity || ''}`.trim(),
                name: `${humanName || session.human.name || ''}`.trim(),
              },
            }),
          ],
          DEFAULT_MAX_TURNS,
        );
        touchSession(session, now);
      }

      return buildSessionSnapshot(session);
    });
  }

  async function enqueueHumanTurn({
    sessionId,
    transcript,
    source = 'voice',
    humanIdentity = '',
    humanName = '',
  }) {
    const cleanedTranscript = `${transcript || ''}`.trim();
    if (!cleanedTranscript) {
      throw new Error('Transcript is required.');
    }

    const utteranceId = randomUUID();
    await appendUserUtteranceStart({ sessionId, utteranceId });
    return appendUserUtteranceFinal({
      sessionId,
      utteranceId,
      text: cleanedTranscript,
      humanIdentity,
      humanName,
      source,
    });
  }

  async function joinCall({ agentId, agentLabel, resumeFromCursor = null }) {
    if (!`${agentId || ''}`.trim()) {
      throw new Error('agentId is required.');
    }

    return mutate((state) => {
      const session = getActiveSessionOrThrow(state);
      const now = new Date().toISOString();
      session.agent = {
        id: `${agentId}`.trim(),
        label: `${agentLabel || 'Codex OpenAI'}`.trim(),
        lastSeenAt: now,
      };
      touchSession(session, now);
      appendEvent(
        session,
        'call.joined',
        {
          agentId: session.agent.id,
          agentLabel: session.agent.label,
        },
        now,
      );

      const recoveryTurns =
        resumeFromCursor !== null
          ? limitItems(
              session.turns
                .filter((turn) => turn.transcript)
                .map((turn) => ({
                  utteranceId: turn.utteranceId,
                  transcript: turn.transcript,
                  createdAt: turn.createdAt,
                  source: turn.source,
                  reply: turn.agentReply ? cloneJson(turn.agentReply) : null,
                })),
              8,
            )
          : null;

      return buildJoinPayload(session, currentCursor(session), recoveryTurns);
    });
  }

  async function waitForEvents({ callId, cursor = '0', maxEvents = 20, waitMs = 0 }) {
    const normalizedMaxEvents = Math.max(1, Number.parseInt(`${maxEvents || 20}`, 10) || 20);
    const normalizedWaitMs = Math.max(0, Number.parseInt(`${waitMs || 0}`, 10) || 0);
    const normalizedCursor = normalizeCursor(cursor);
    const deadline = Date.now() + normalizedWaitMs;

    while (true) {
      const result = await read((state) => {
        const session = getSessionOrThrow(state, callId);
        const events = session.events.filter((event) => event.seq > normalizedCursor).slice(0, normalizedMaxEvents);
        return {
          callId: session.id,
          nextCursor: events.length ? String(events[events.length - 1].seq) : String(normalizedCursor),
          events: cloneJson(events),
        };
      });

      if (result.events.length || normalizedWaitMs === 0 || Date.now() >= deadline) {
        return result;
      }

      await sleep(Math.min(WAIT_POLL_MS, Math.max(deadline - Date.now(), 5)));
    }
  }

  async function publishActions({ callId, actions = [], inReplyToEventId = null }) {
    if (!Array.isArray(actions) || !actions.length) {
      throw new Error('actions are required.');
    }

    return mutate((state) => {
      const session = getSessionOrThrow(state, callId);
      const now = new Date().toISOString();
      const acceptedActionIds = [];
      let batchDirection = null;
      let lastReply = null;

      for (const rawAction of actions) {
        const action = normalizeAction({
          ...rawAction,
          inReplyToEventId,
          createdAt: now,
        });
        const existing = session.actions.find((entry) => entry.actionId === action.actionId);
        if (existing) {
          acceptedActionIds.push(existing.actionId);
          if (existing.type === 'speech') {
            const turn = session.turns.find((entry) => entry.agentReply?.actionId === existing.actionId);
            if (turn?.agentReply) {
              lastReply = turn.agentReply;
            }
          }
          continue;
        }

        if (action.type === 'anim') {
          batchDirection = {
            gestureId: action.gestureId,
            emoteId: action.emoteId,
            stageId: action.stageId,
          };
        }

        const storedAction = normalizeAction(action);
        session.actions = limitItems([...session.actions, storedAction], DEFAULT_MAX_ACTIONS);
        acceptedActionIds.push(storedAction.actionId);

        if (storedAction.type === 'speech') {
          const turn = findTurnForSpeechReply(session, inReplyToEventId);
          if (turn) {
            turn.status = 'replied';
            turn.agentClaim = {
              agentId: session.agent.id || 'codex-openai',
              agentLabel: session.agent.label || 'Codex OpenAI',
              claimedAt: turn.agentClaim?.claimedAt || now,
            };
            turn.agentReply = {
              id: randomUUID(),
              actionId: storedAction.actionId,
              text: storedAction.text,
              createdAt: now,
              playedAt: null,
              agentId: session.agent.id || 'codex-openai',
              agentLabel: session.agent.label || 'Codex OpenAI',
              emoteId: storedAction.emoteId || batchDirection?.emoteId || 'warm',
              gestureId: storedAction.gestureId || batchDirection?.gestureId || 'Pose',
              stageId: storedAction.stageId || batchDirection?.stageId || '',
              characterId: storedAction.characterId,
              mood: storedAction.mood,
              voiceMode: storedAction.voiceMode,
              notes: storedAction.notes,
            };
            storedAction.replyId = turn.agentReply.id;
            lastReply = turn.agentReply;
          }
        } else if (storedAction.type === 'anim' && lastReply) {
          applyReplyDirection(lastReply, storedAction);
        }
      }

      session.agent.lastSeenAt = now;
      touchSession(session, now);

      return {
        acceptedActionIds,
        nextCursor: currentCursor(session),
      };
    });
  }

  async function listPendingActions({ sessionId }) {
    return read((state) => {
      const session = getSessionOrThrow(state, sessionId);
      return {
        callId: session.id,
        actions: cloneJson(
          session.actions.filter((action) => action.status === 'pending' || action.status === 'playing'),
        ),
      };
    });
  }

  async function markActionPlaybackStarted({ sessionId, actionId }) {
    return mutate((state) => {
      const session = getSessionOrThrow(state, sessionId);
      const action = session.actions.find((entry) => entry.actionId === actionId);
      if (!action) {
        throw new Error(`Unknown action: ${actionId}`);
      }

      if (action.status === 'pending') {
        const now = new Date().toISOString();
        action.status = 'playing';
        action.startedAt = now;
        appendEvent(session, 'agent.playback.started', {
          actionId: action.actionId,
          actionType: action.type,
        }, now);
      }

      return buildSessionSnapshot(session);
    });
  }

  async function markActionPlaybackFinished({ sessionId, actionId }) {
    return mutate((state) => {
      const session = getSessionOrThrow(state, sessionId);
      const action = session.actions.find((entry) => entry.actionId === actionId);
      if (!action) {
        throw new Error(`Unknown action: ${actionId}`);
      }

      if (action.status !== 'completed') {
        const now = new Date().toISOString();
        action.status = 'completed';
        action.completedAt = now;
        appendEvent(session, 'agent.playback.finished', {
          actionId: action.actionId,
          actionType: action.type,
        }, now);

        if (action.replyId) {
          const turn = session.turns.find((entry) => entry.agentReply?.id === action.replyId);
          if (turn?.agentReply && !turn.agentReply.playedAt) {
            turn.agentReply.playedAt = now;
          }
        }
      }

      return buildSessionSnapshot(session);
    });
  }

  async function markActionCompleted({ sessionId, actionId }) {
    return mutate((state) => {
      const session = getSessionOrThrow(state, sessionId);
      const action = session.actions.find((entry) => entry.actionId === actionId);
      if (!action) {
        throw new Error(`Unknown action: ${actionId}`);
      }

      if (action.status !== 'completed') {
        const now = new Date().toISOString();
        action.status = 'completed';
        action.completedAt = now;
        touchSession(session, now);
      }

      return buildSessionSnapshot(session);
    });
  }

  async function leaveCall({ callId, agentId, reason = '', endCall = false }) {
    return mutate((state) => {
      const session = getSessionOrThrow(state, callId);
      const now = new Date().toISOString();

      if (endCall) {
        session.state = 'ending';
        appendEvent(session, 'call.ending', { reason: `${reason || ''}`.trim() }, now);
        session.state = 'ended';
        appendEvent(session, 'call.ended', { reason: `${reason || ''}`.trim() }, now);
      }

      if (!agentId || session.agent.id === agentId) {
        session.agent = {
          id: null,
          label: session.agent.label || 'Codex OpenAI',
          lastSeenAt: null,
        };
      }
      touchSession(session, now);

      return {
        callId: session.id,
        state: session.state,
      };
    });
  }

  async function getRecentTurns({ callId, limit = 10 }) {
    return read((state) => {
      const session = getSessionOrThrow(state, callId);
      return {
        callId: session.id,
        turns: cloneJson(
          limitItems(
            session.turns.map((turn) => ({
              utteranceId: turn.utteranceId,
              transcript: turn.transcript,
              createdAt: turn.createdAt,
              source: turn.source,
              human: turn.human,
              reply: turn.agentReply,
            })),
            Math.max(1, Number.parseInt(`${limit || 10}`, 10) || 10),
          ),
        ),
      };
    });
  }

  async function getInspectorSnapshot({ sessionId }) {
    return read((state) => {
      const session = sessionId ? getSessionOrThrow(state, sessionId) : getActiveSessionOrThrow(state);
      return buildInspectorSnapshot(session);
    });
  }

  async function claimNextTurn({
    sessionId = '',
    agentId = 'codex-openai',
    agentLabel = 'Codex OpenAI',
  } = {}) {
    const cleanedAgentId = `${agentId || ''}`.trim();
    if (!cleanedAgentId) {
      throw new Error('agentId is required.');
    }

    return mutate((state) => {
      const now = new Date().toISOString();
      const sessions = sessionId
        ? [getSessionOrThrow(state, sessionId)]
        : Object.values(state.sessions).sort(
            (left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt),
          );

      let claimedSession = null;
      let claimedTurn = null;

      for (const session of sessions) {
        const candidateTurn = pickTurnForClaim(session, cleanedAgentId);
        if (!candidateTurn) {
          continue;
        }

        if (candidateTurn.status === 'pending') {
          candidateTurn.status = 'claimed';
          candidateTurn.agentClaim = {
            agentId: cleanedAgentId,
            agentLabel: `${agentLabel || 'Codex OpenAI'}`.trim(),
            claimedAt: now,
          };
        }

        session.agent = {
          id: cleanedAgentId,
          label: `${agentLabel || 'Codex OpenAI'}`.trim(),
          lastSeenAt: now,
        };
        touchSession(session, now);
        claimedSession = session;
        claimedTurn = candidateTurn;
        break;
      }

      return {
        session: claimedSession ? buildSessionSnapshot(claimedSession) : null,
        turn: claimedTurn ? cloneJson(claimedTurn) : null,
      };
    });
  }

  async function submitAgentReply({
    sessionId,
    turnId,
    agentId = 'codex-openai',
    agentLabel = 'Codex OpenAI',
    reply,
    emoteId = 'warm',
    gestureId = 'Pose',
    stageId = '',
    characterId = '',
    mood = 'neutral',
    voiceMode = 'speak',
    notes = '',
  }) {
    const cleanedReply = `${reply || ''}`.trim();
    if (!cleanedReply) {
      throw new Error('Reply text is required.');
    }

    const session = await getSession(sessionId);
    const turn = session.turns.find((item) => item.id === turnId);
    if (!turn) {
      throw new Error(`Unknown turn: ${turnId}`);
    }

    await heartbeatAgent({
      sessionId,
      agentId,
      agentLabel,
    });

    await publishActions({
      callId: sessionId,
      actions: [
        {
          actionId: `${turnId}:anim`,
          type: 'anim',
          gestureId,
          emoteId,
          stageId,
          notes,
        },
        {
          actionId: `${turnId}:speech`,
          type: 'speech',
          text: cleanedReply,
          characterId,
          mood,
          voiceMode,
          notes,
        },
      ],
    });

    return getSession(sessionId);
  }

  async function markReplyPlayed({ sessionId, replyId }) {
    return mutate((state) => {
      const session = getSessionOrThrow(state, sessionId);
      const turn = session.turns.find((item) => item.agentReply?.id === replyId);
      if (!turn?.agentReply) {
        throw new Error(`Unknown reply: ${replyId}`);
      }

      if (!turn.agentReply.playedAt) {
        const now = new Date().toISOString();
        turn.agentReply.playedAt = now;
        const action = session.actions.find((entry) => entry.replyId === replyId);
        if (action) {
          action.status = 'completed';
          action.completedAt = now;
        }
        touchSession(session, now);
      }

      return buildSessionSnapshot(session);
    });
  }

  return {
    stateFilePath,
    getBridgeStatus,
    createSession,
    listSessions,
    getSession,
    heartbeatAgent,
    enqueueHumanTurn,
    claimNextTurn,
    submitAgentReply,
    markReplyPlayed,
    syncAvatarCatalog,
    setCallState,
    appendUserUtteranceStart,
    appendUserUtterancePartial,
    appendUserUtteranceFinal,
    joinCall,
    waitForEvents,
    publishActions,
    listPendingActions,
    markActionPlaybackStarted,
    markActionPlaybackFinished,
    markActionCompleted,
    leaveCall,
    getRecentTurns,
    getInspectorSnapshot,
  };
}

export {
  ACTIVE_AGENT_WINDOW_MS,
  CAPABILITIES_VERSION,
};
