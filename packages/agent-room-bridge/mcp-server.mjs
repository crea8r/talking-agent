import { createAgentRoomBridgeStore, resolveDefaultBridgeStatePath } from './index.mjs';

const store = createAgentRoomBridgeStore({
  stateFilePath: resolveDefaultBridgeStatePath(),
});

const TOOL_DEFINITIONS = [
  {
    name: 'bridge_status',
    description: 'Return the current bridge state file path, session count, and pending turn count.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
  },
  {
    name: 'list_sessions',
    description: 'List every active one-to-one agent room session waiting for an agent runtime.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
  },
  {
    name: 'get_session',
    description: 'Load one active session with its turns and latest reply state.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['sessionId'],
      properties: {
        sessionId: {
          type: 'string',
          description: 'Session id from list_sessions.',
        },
      },
    },
  },
  {
    name: 'heartbeat_agent',
    description: 'Mark the agent runtime as alive for one session before or during turn handling.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['sessionId', 'agentId'],
      properties: {
        sessionId: { type: 'string' },
        agentId: { type: 'string' },
        agentLabel: { type: 'string' },
      },
    },
  },
  {
    name: 'claim_next_turn',
    description:
      'Claim the next pending human turn. If the same agent already claimed a turn, that turn is returned again.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        sessionId: { type: 'string' },
        agentId: { type: 'string' },
        agentLabel: { type: 'string' },
      },
    },
  },
  {
    name: 'submit_agent_reply',
    description:
      'Submit the agent reply text plus simple avatar direction so the browser can animate and speak it. Use gesture ids from the app runtime gesture catalog when possible.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['sessionId', 'turnId', 'reply'],
      properties: {
        sessionId: { type: 'string' },
        turnId: { type: 'string' },
        reply: { type: 'string' },
        agentId: { type: 'string' },
        agentLabel: { type: 'string' },
        emoteId: { type: 'string' },
        gestureId: { type: 'string' },
        stageId: { type: 'string' },
        voiceMode: {
          type: 'string',
          enum: ['speak', 'silent'],
        },
        notes: { type: 'string' },
      },
    },
  },
];

function sendMessage(message) {
  const body = JSON.stringify(message);
  const frame = `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\nContent-Type: application/json\r\n\r\n${body}`;
  process.stdout.write(frame);
}

function sendResult(id, result) {
  sendMessage({
    jsonrpc: '2.0',
    id,
    result,
  });
}

function sendError(id, code, message) {
  sendMessage({
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
    },
  });
}

function toolResult(payload) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(payload, null, 2),
      },
    ],
    structuredContent: payload,
  };
}

async function handleToolCall(name, args = {}) {
  switch (name) {
    case 'bridge_status':
      return store.getBridgeStatus();
    case 'list_sessions':
      return {
        sessions: await store.listSessions(),
      };
    case 'get_session':
      return {
        session: await store.getSession(args.sessionId),
      };
    case 'heartbeat_agent':
      return {
        session: await store.heartbeatAgent(args),
      };
    case 'claim_next_turn':
      return store.claimNextTurn(args);
    case 'submit_agent_reply':
      return {
        session: await store.submitAgentReply(args),
      };
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function handleRequest(message) {
  switch (message.method) {
    case 'initialize':
      sendResult(message.id, {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: 'talking-agent-room-bridge',
          version: '0.1.0',
        },
      });
      return;
    case 'notifications/initialized':
      return;
    case 'ping':
      sendResult(message.id, {});
      return;
    case 'tools/list':
      sendResult(message.id, {
        tools: TOOL_DEFINITIONS,
      });
      return;
    case 'resources/list':
      sendResult(message.id, {
        resources: [],
      });
      return;
    case 'tools/call': {
      const payload = await handleToolCall(message.params?.name, message.params?.arguments || {});
      sendResult(message.id, toolResult(payload));
      return;
    }
    default:
      sendError(message.id ?? null, -32601, `Method not found: ${message.method}`);
  }
}

let buffer = Buffer.alloc(0);

function processFrames() {
  while (buffer.length) {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd === -1) {
      return;
    }

    const header = buffer.slice(0, headerEnd).toString('utf8');
    const lengthMatch = header.match(/Content-Length:\s*(\d+)/i);
    if (!lengthMatch) {
      buffer = buffer.slice(headerEnd + 4);
      continue;
    }

    const contentLength = Number.parseInt(lengthMatch[1], 10);
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + contentLength;

    if (buffer.length < bodyEnd) {
      return;
    }

    const body = buffer.slice(bodyStart, bodyEnd).toString('utf8');
    buffer = buffer.slice(bodyEnd);

    let message;
    try {
      message = JSON.parse(body);
    } catch {
      sendError(null, -32700, 'Parse error');
      continue;
    }

    handleRequest(message).catch((error) => {
      sendError(message.id ?? null, -32603, error instanceof Error ? error.message : 'Internal error');
    });
  }
}

process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  processFrames();
});

process.stdin.on('end', () => {
  process.exit(0);
});
