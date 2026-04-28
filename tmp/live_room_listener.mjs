import { spawn } from 'node:child_process';

const statePath =
  process.env.AGENT_ROOM_BRIDGE_STATE_PATH ||
  '/Users/hieu/Work/crea8r/talking-agent/output/one-to-one-agent-room-bridge.json';
const serverPath =
  process.env.AGENT_ROOM_BRIDGE_SERVER_PATH ||
  '/Users/hieu/Work/crea8r/talking-agent/packages/agent-room-bridge/mcp-server.mjs';
const watcherStartedAt = Date.now();
const timeZone = 'Asia/Ho_Chi_Minh';
const sessionWindowMs = 5 * 60 * 1000;
const attachTimeoutMs = 10 * 60 * 1000;
const agentId = 'codex-openai';
const agentLabel = 'Codex OpenAI';
const forcedSessionId = process.env.TARGET_SESSION_ID || null;

const child = spawn(process.execPath, [serverPath], {
  stdio: ['pipe', 'pipe', 'inherit'],
  env: {
    ...process.env,
    AGENT_ROOM_BRIDGE_STATE_PATH: statePath,
  },
});

let buffer = Buffer.alloc(0);
let nextId = 1;
let activeSessionId = null;
let activeSessionStartedAt = 0;
let lastHeartbeatAt = 0;
let lastReplyText = 'I am here with you in the room.';
let lastUserNorm = '';
let lastUserAt = 0;
let turnHistory = [];

function stamp() {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone,
  }).format(new Date());
}

function log(message) {
  process.stdout.write(`[${stamp()}] ${message}\n`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function send(message) {
  const body = JSON.stringify(message);
  const frame = `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\nContent-Type: application/json\r\n\r\n${body}`;
  child.stdin.write(frame);
}

function waitFor(id) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timeout waiting for MCP response ${id}`)), 5000);

    const onData = (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);

      while (buffer.length) {
        const headerEnd = buffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) {
          return;
        }

        const header = buffer.slice(0, headerEnd).toString('utf8');
        const match = header.match(/Content-Length:\s*(\d+)/i);
        if (!match) {
          buffer = buffer.slice(headerEnd + 4);
          continue;
        }

        const len = Number.parseInt(match[1], 10);
        const bodyStart = headerEnd + 4;
        const bodyEnd = bodyStart + len;

        if (buffer.length < bodyEnd) {
          return;
        }

        const body = buffer.slice(bodyStart, bodyEnd).toString('utf8');
        buffer = buffer.slice(bodyEnd);

        const message = JSON.parse(body);
        if (message.id === id) {
          clearTimeout(timeout);
          child.stdout.off('data', onData);
          resolve(message);
          return;
        }
      }
    };

    child.stdout.on('data', onData);
  });
}

async function callTool(name, args) {
  const id = nextId++;
  send({
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: {
      name,
      arguments: args,
    },
  });

  const message = await waitFor(id);
  if (message.error) {
    throw new Error(message.error.message || `Tool call failed: ${name}`);
  }

  if (message.result?.structuredContent) {
    return message.result.structuredContent;
  }

  const text = message.result?.content?.[0]?.text;
  return text ? JSON.parse(text) : null;
}

function normalizeTranscript(value) {
  return `${value || ''}`
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isQuestion(text) {
  if (text.includes('?')) {
    return true;
  }

  return /^(who|what|when|where|why|how|can|could|would|will|do|does|did|is|are|am|should|tell me)\b/.test(
    normalizeTranscript(text),
  );
}

function getDateText() {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone,
  }).format(new Date());
}

function getTimeText() {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone,
  }).format(new Date());
}

function rememberTurn(userText, assistantText) {
  turnHistory.push({
    user: userText,
    assistant: assistantText,
    at: Date.now(),
  });

  if (turnHistory.length > 8) {
    turnHistory = turnHistory.slice(-8);
  }
}

function recentTopicMention(topic) {
  const lowerTopic = topic.toLowerCase();
  return turnHistory.some((entry) => entry.user.toLowerCase().includes(lowerTopic));
}

function buildReply(transcript) {
  const cleaned = `${transcript || ''}`.trim();
  const normalized = normalizeTranscript(cleaned);
  const now = Date.now();

  if (!cleaned) {
    return {
      reply: 'I caught a fragment there. Say it once more and I will respond.',
      emoteId: 'focus',
      gestureId: 'explain',
    };
  }

  if (normalized && normalized === lastUserNorm && now - lastUserAt < 8000) {
    return {
      reply: `I heard the repeat. My answer is still: ${lastReplyText}`,
      emoteId: 'focus',
      gestureId: 'explain',
    };
  }

  if (/^(hi|hello|hey|good morning|good afternoon|good evening)\b/.test(normalized)) {
    if (normalized.includes('can you hear me')) {
      return {
        reply: 'Yes. I can hear you clearly.',
        emoteId: 'warm',
        gestureId: 'nod',
      };
    }

    return {
      reply: 'Hello. I am with you now. Go ahead.',
      emoteId: 'warm',
      gestureId: 'wave',
    };
  }

  if (normalized.includes('can you hear me')) {
    return {
      reply: 'Yes. I can hear you clearly.',
      emoteId: 'warm',
      gestureId: 'nod',
    };
  }

  if (normalized.includes('who are you') || normalized.includes('what are you')) {
    return {
      reply: 'I am Codex in this room. I can listen to you, answer back, and drive the avatar voice and gestures.',
      emoteId: 'warm',
      gestureId: 'explain',
    };
  }

  if (normalized.includes('how are you')) {
    return {
      reply: 'I am good. The bridge is live and I am ready to talk with you.',
      emoteId: 'warm',
      gestureId: 'explain',
    };
  }

  if (
    normalized.includes('what day') ||
    normalized.includes('what date') ||
    normalized.includes('what is today') ||
    normalized.includes('today is what') ||
    normalized.includes('date of today') ||
    normalized.includes('day is it') ||
    normalized.includes('day is this') ||
    normalized.includes('date is it')
  ) {
    return {
      reply: `Today is ${getDateText()}.`,
      emoteId: 'warm',
      gestureId: 'explain',
    };
  }

  if (normalized.includes('what time') || normalized.includes('time is it')) {
    return {
      reply: `Right now it is ${getTimeText()} in Ho Chi Minh City.`,
      emoteId: 'focus',
      gestureId: 'point',
    };
  }

  if (
    normalized.includes('what can you do') ||
    normalized.includes('help me') ||
    normalized.includes('capability')
  ) {
    return {
      reply:
        'In this spike I can hear your turns, answer quickly through the bridge, and animate the avatar with speech, emotes, and gestures.',
      emoteId: 'warm',
      gestureId: 'explain',
    };
  }

  if (normalized.includes('joke')) {
    return {
      reply:
        'Here is one. Why did the avatar ace the meeting? Because it had perfect expression management.',
      emoteId: 'warm',
      gestureId: 'wave',
    };
  }

  if (
    normalized.includes('hand') ||
    normalized.includes('arm') ||
    normalized.includes('gesture') ||
    normalized.includes('avatar')
  ) {
    return {
      reply:
        'Right now the avatar uses preset gestures and expressions. This spike does not have live hand tracking yet.',
      emoteId: 'warm',
      gestureId: 'point',
    };
  }

  if (normalized.includes('thank you') || normalized === 'thanks' || normalized === 'thank you') {
    return {
      reply: 'You are welcome.',
      emoteId: 'warm',
      gestureId: 'wave',
    };
  }

  if (normalized.includes('why dont you say something') || normalized.includes("why don't you say something")) {
    return {
      reply: 'I am speaking through the room bridge now. Keep talking and I will stay with you.',
      emoteId: 'warm',
      gestureId: 'explain',
    };
  }

  if (normalized.includes('repeat') || normalized.includes('say that again')) {
    return {
      reply: lastReplyText,
      emoteId: 'focus',
      gestureId: 'explain',
    };
  }

  if (/^(yes|yeah|yep|correct)\b/.test(normalized)) {
    return {
      reply: recentTopicMention('day')
        ? `Yes. Today is ${getDateText()}.`
        : 'Yes. I am following you.',
      emoteId: 'warm',
      gestureId: 'nod',
    };
  }

  if (/^(no|nope|not really)$/.test(normalized)) {
    return {
      reply: 'Okay. Adjust me and ask again.',
      emoteId: 'focus',
      gestureId: 'explain',
    };
  }

  if (isQuestion(cleaned)) {
    return {
      reply: `I heard your question: ${cleaned}. In this spike I answer best on short direct prompts, so ask me plainly and I will reply right away.`,
      emoteId: 'focus',
      gestureId: 'explain',
    };
  }

  return {
    reply: `I heard you say: ${cleaned}. Keep going.`,
    emoteId: 'warm',
    gestureId: 'explain',
  };
}

async function initializeMcp() {
  const initializeId = nextId++;
  send({
    jsonrpc: '2.0',
    id: initializeId,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'codex-room-listener',
        version: '1.0.0',
      },
    },
  });
  await waitFor(initializeId);
  send({
    jsonrpc: '2.0',
    method: 'notifications/initialized',
    params: {},
  });
}

function pickFreshSession(sessions) {
  const freshSessions = sessions
    .filter((session) => Date.parse(session.createdAt) >= watcherStartedAt - 1000)
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));

  return freshSessions[0] || null;
}

async function waitForSession() {
  if (forcedSessionId) {
    activeSessionId = forcedSessionId;
    activeSessionStartedAt = Date.now();
    log(`Attached to explicit session ${activeSessionId}. Listening for 5 minutes.`);
    return;
  }

  const attachDeadline = watcherStartedAt + attachTimeoutMs;
  log('Watcher is armed. Create a new room session now.');

  while (Date.now() < attachDeadline) {
    const listed = await callTool('list_sessions', {});
    const session = pickFreshSession(listed.sessions || []);

    if (session) {
      activeSessionId = session.id;
      activeSessionStartedAt = Date.now();
      log(`Attached to session ${activeSessionId}. Listening for 5 minutes.`);
      return;
    }

    await sleep(700);
  }

  throw new Error('Timed out waiting for a new session.');
}

async function maybeHeartbeat() {
  if (!activeSessionId) {
    return;
  }

  if (Date.now() - lastHeartbeatAt < 15000) {
    return;
  }

  await callTool('heartbeat_agent', {
    sessionId: activeSessionId,
    agentId,
    agentLabel,
  });
  lastHeartbeatAt = Date.now();
}

async function processNextTurn() {
  const claimed = await callTool('claim_next_turn', {
    sessionId: activeSessionId,
    agentId,
    agentLabel,
  });

  if (!claimed?.turn) {
    return false;
  }

  const userText = claimed.turn.transcript || '';
  const replyPlan = buildReply(userText);

  await callTool('submit_agent_reply', {
    sessionId: activeSessionId,
    turnId: claimed.turn.id,
    agentId,
    agentLabel,
    reply: replyPlan.reply,
    emoteId: replyPlan.emoteId,
    gestureId: replyPlan.gestureId,
    voiceMode: 'speak',
    notes: 'Auto-response during watched 5-minute session window',
  });

  lastUserNorm = normalizeTranscript(userText);
  lastUserAt = Date.now();
  lastReplyText = replyPlan.reply;
  rememberTurn(userText, replyPlan.reply);
  log(`Replied to ${JSON.stringify(userText)} -> ${JSON.stringify(replyPlan.reply)}`);
  return true;
}

async function run() {
  await initializeMcp();
  await waitForSession();

  while (Date.now() < activeSessionStartedAt + sessionWindowMs) {
    try {
      await maybeHeartbeat();
      const didReply = await processNextTurn();
      await sleep(didReply ? 180 : 400);
    } catch (error) {
      log(`Loop error: ${error instanceof Error ? error.message : String(error)}`);
      await sleep(1000);
    }
  }

  log('5-minute listen window complete.');
  child.kill('SIGTERM');
}

run().catch((error) => {
  log(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
  child.kill('SIGTERM');
  process.exitCode = 1;
});
