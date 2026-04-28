import { randomUUID } from 'node:crypto';
import { mkdir, open as openFile, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_SESSION_TTL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_MAX_TURNS = 120;
const LOCK_RETRY_MS = 25;
const LOCK_TIMEOUT_MS = 5000;

export function resolveDefaultBridgeStatePath({
  cwd = process.cwd(),
  env = process.env,
} = {}) {
  return env.AGENT_ROOM_BRIDGE_STATE_PATH || path.join(cwd, 'output', 'agent-room-bridge-state.json');
}

function createEmptyState() {
  return {
    version: 1,
    updatedAt: null,
    sessions: {},
  };
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeAgent(agent = {}) {
  return {
    id: typeof agent.id === 'string' ? agent.id : null,
    label: typeof agent.label === 'string' ? agent.label : 'Codex OpenAI',
    lastSeenAt: typeof agent.lastSeenAt === 'string' ? agent.lastSeenAt : null,
  };
}

function normalizeTurn(turn = {}) {
  const transcript = `${turn.transcript || ''}`.trim();
  if (!transcript) {
    return null;
  }

  return {
    id: typeof turn.id === 'string' ? turn.id : randomUUID(),
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
            typeof turn.agentReply.gestureId === 'string' ? turn.agentReply.gestureId : 'explain',
          stageId: typeof turn.agentReply.stageId === 'string' ? turn.agentReply.stageId : '',
          voiceMode: turn.agentReply.voiceMode === 'silent' ? 'silent' : 'speak',
          notes: typeof turn.agentReply.notes === 'string' ? turn.agentReply.notes : '',
        }
      : null,
  };
}

function normalizeSession(session = {}) {
  const turns = Array.isArray(session.turns)
    ? session.turns
        .map((turn) => normalizeTurn(turn))
        .filter(Boolean)
        .slice(-DEFAULT_MAX_TURNS)
    : [];

  return {
    id: typeof session.id === 'string' ? session.id : randomUUID(),
    title: typeof session.title === 'string' ? session.title : 'Human x Codex',
    roomName: typeof session.roomName === 'string' ? session.roomName : '',
    livekitUrl: typeof session.livekitUrl === 'string' ? session.livekitUrl : '',
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
    turns,
  };
}

function sanitizeState(raw) {
  const state = raw && typeof raw === 'object' ? raw : createEmptyState();
  const sessions = {};

  for (const [sessionId, session] of Object.entries(state.sessions || {})) {
    sessions[sessionId] = normalizeSession(session);
  }

  return {
    version: 1,
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

function buildMetrics(turns) {
  const pendingTurns = turns.filter((turn) => turn.status === 'pending').length;
  const claimedTurns = turns.filter((turn) => turn.status === 'claimed').length;
  const repliedTurns = turns.filter((turn) => turn.status === 'replied').length;
  const unplayedReplies = turns.filter((turn) => turn.agentReply && !turn.agentReply.playedAt).length;

  return {
    pendingTurns,
    claimedTurns,
    repliedTurns,
    unplayedReplies,
    totalTurns: turns.length,
  };
}

function buildSessionSnapshot(session) {
  const turns = session.turns.map((turn) => cloneJson(turn));
  const lastHumanTurn = [...turns].reverse().find((turn) => turn.transcript) || null;
  const lastAgentReply = [...turns]
    .reverse()
    .map((turn) => turn.agentReply)
    .find(Boolean) || null;

  return {
    id: session.id,
    title: session.title,
    roomName: session.roomName,
    livekitUrl: session.livekitUrl,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    lastSeenAt: session.lastSeenAt,
    human: cloneJson(session.human),
    agent: cloneJson(session.agent),
    metadata: cloneJson(session.metadata),
    metrics: buildMetrics(turns),
    lastHumanTurn,
    lastAgentReply,
    turns,
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

  return {
    stateFilePath,
    async getBridgeStatus() {
      return read((state) => {
        const sessions = Object.values(state.sessions);
        return {
          stateFilePath,
          sessionCount: sessions.length,
          pendingTurnCount: sessions.reduce(
            (sum, session) => sum + buildMetrics(session.turns).pendingTurns,
            0,
          ),
          updatedAt: state.updatedAt,
        };
      });
    },
    async createSession({
      roomName,
      livekitUrl,
      humanIdentity,
      humanName,
      title,
      metadata = {},
    }) {
      return mutate((state) => {
        const now = new Date().toISOString();
        const sessionId = randomUUID();
        const session = normalizeSession({
          id: sessionId,
          title: title || `${humanName || humanIdentity || 'Human'} x Codex`,
          roomName: `${roomName || ''}`.trim(),
          livekitUrl: `${livekitUrl || ''}`.trim(),
          createdAt: now,
          updatedAt: now,
          lastSeenAt: now,
          human: {
            identity: `${humanIdentity || ''}`.trim(),
            name: `${humanName || ''}`.trim(),
          },
          agent: {
            id: null,
            label: 'Codex OpenAI',
            lastSeenAt: null,
          },
          metadata,
          turns: [],
        });

        state.sessions[session.id] = session;
        return buildSessionSnapshot(session);
      });
    },
    async listSessions() {
      return read((state) =>
        Object.values(state.sessions)
          .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
          .map((session) => buildSessionSnapshot(session)),
      );
    },
    async getSession(sessionId, { touch = false } = {}) {
      if (touch) {
        return mutate((state) => {
          const session = getSessionOrThrow(state, sessionId);
          touchSession(session, new Date().toISOString());
          return buildSessionSnapshot(session);
        });
      }

      return read((state) => buildSessionSnapshot(getSessionOrThrow(state, sessionId)));
    },
    async heartbeatAgent({ sessionId, agentId, agentLabel }) {
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
    },
    async enqueueHumanTurn({
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

      return mutate((state) => {
        const session = getSessionOrThrow(state, sessionId);
        const now = new Date().toISOString();

        session.turns.push(
          normalizeTurn({
            id: randomUUID(),
            source,
            transcript: cleanedTranscript,
            createdAt: now,
            status: 'pending',
            human: {
              identity: `${humanIdentity || session.human.identity || ''}`.trim(),
              name: `${humanName || session.human.name || ''}`.trim(),
            },
          }),
        );

        touchSession(session, now);

        return buildSessionSnapshot(session);
      });
    },
    async claimNextTurn({
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
    },
    async submitAgentReply({
      sessionId,
      turnId,
      agentId = 'codex-openai',
      agentLabel = 'Codex OpenAI',
      reply,
      emoteId = 'warm',
      gestureId = 'explain',
      stageId = '',
      voiceMode = 'speak',
      notes = '',
    }) {
      const cleanedReply = `${reply || ''}`.trim();
      if (!cleanedReply) {
        throw new Error('Reply text is required.');
      }

      return mutate((state) => {
        const session = getSessionOrThrow(state, sessionId);
        const turn = session.turns.find((item) => item.id === turnId);
        if (!turn) {
          throw new Error(`Unknown turn: ${turnId}`);
        }

        const now = new Date().toISOString();
        turn.status = 'replied';
        turn.agentClaim = {
          agentId: `${agentId || ''}`.trim(),
          agentLabel: `${agentLabel || 'Codex OpenAI'}`.trim(),
          claimedAt: turn.agentClaim?.claimedAt || now,
        };
        turn.agentReply = {
          id: randomUUID(),
          text: cleanedReply,
          createdAt: now,
          playedAt: null,
          agentId: `${agentId || ''}`.trim(),
          agentLabel: `${agentLabel || 'Codex OpenAI'}`.trim(),
          emoteId: `${emoteId || 'warm'}`.trim() || 'warm',
          gestureId: `${gestureId || 'explain'}`.trim() || 'explain',
          stageId: `${stageId || ''}`.trim(),
          voiceMode: voiceMode === 'silent' ? 'silent' : 'speak',
          notes: `${notes || ''}`.trim(),
        };

        session.agent = {
          id: `${agentId || ''}`.trim(),
          label: `${agentLabel || 'Codex OpenAI'}`.trim(),
          lastSeenAt: now,
        };
        touchSession(session, now);

        return buildSessionSnapshot(session);
      });
    },
    async markReplyPlayed({ sessionId, replyId }) {
      return mutate((state) => {
        const session = getSessionOrThrow(state, sessionId);
        const turn = session.turns.find((item) => item.agentReply?.id === replyId);
        if (!turn?.agentReply) {
          throw new Error(`Unknown reply: ${replyId}`);
        }

        if (!turn.agentReply.playedAt) {
          turn.agentReply.playedAt = new Date().toISOString();
          touchSession(session, turn.agentReply.playedAt);
        }

        return buildSessionSnapshot(session);
      });
    },
  };
}
