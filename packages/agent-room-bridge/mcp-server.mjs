import { createAgentRoomBridgeStore, resolveDefaultBridgeStatePath } from './index.mjs';
import { BUNDLED_MODELS, getGesturePresets } from '../avatar-layer-browser/index.js';
import {
  getBridgePrompt,
  listBridgePrompts,
  listBridgeResources,
  readBridgeResource,
} from './resources.mjs';

const store = createAgentRoomBridgeStore({
  stateFilePath: resolveDefaultBridgeStatePath(),
});

function buildGestureCatalogDescription() {
  const defaultModelId = BUNDLED_MODELS[0]?.id || '';
  const seen = new Set();
  const gestures = getGesturePresets(defaultModelId).filter((gesture) => {
    if (!gesture?.id || seen.has(gesture.id)) {
      return false;
    }

    seen.add(gesture.id);
    return true;
  });

  return gestures
    .map((gesture) => {
      const bestFor = Array.isArray(gesture.bestFor) ? gesture.bestFor.join(', ') : '';
      return `- gestureId: ${gesture.id} | name: ${gesture.label || gesture.id} | description: ${gesture.description || ''} | bestFor: ${bestFor}`;
    })
    .join('\n');
}

const PUBLISH_ACTIONS_DESCRIPTION = [
  'Publish one or more agent-selected actions for the active call.',
  'Speech is inferred from `text`.',
  'Animation is inferred from `gestureId` only.',
  'Use only one of the following gesture choices when you want to animate:',
  buildGestureCatalogDescription(),
].join('\n');

const TOOL_DEFINITIONS = [
  {
    name: 'join_call',
    description: 'Attach the agent to the single active one-to-one call and receive the current event cursor plus avatar catalog metadata.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['agentId'],
      properties: {
        agentId: { type: 'string' },
        agentLabel: { type: 'string' },
        resumeFromCursor: { type: 'string' },
      },
    },
  },
  {
    name: 'wait_for_events',
    description: 'Block until new bridge events are available after the provided cursor, or until the timeout expires.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['callId', 'cursor'],
      properties: {
        callId: { type: 'string' },
        cursor: { type: 'string' },
        waitMs: { type: 'integer', minimum: 0 },
        maxEvents: { type: 'integer', minimum: 1 },
      },
    },
  },
  {
    name: 'publish_actions',
    description: PUBLISH_ACTIONS_DESCRIPTION,
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['callId', 'actions'],
      properties: {
        callId: { type: 'string' },
        inReplyToEventId: { type: 'string' },
        actions: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            additionalProperties: false,
            required: [],
            properties: {
              text: { type: 'string' },
              gestureId: { type: 'string' },
              mood: { type: 'string' },
              reason: { type: 'string' },
              notes: { type: 'string' },
            },
          },
        },
      },
    },
  },
  {
    name: 'leave_call',
    description: 'Detach the current agent from the active call, optionally ending the call.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['callId', 'agentId'],
      properties: {
        callId: { type: 'string' },
        agentId: { type: 'string' },
        reason: { type: 'string' },
        endCall: { type: 'boolean' },
      },
    },
  },
  {
    name: 'get_recent_turns',
    description: 'Return the most recent finalized turns for recovery or debugging.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['callId'],
      properties: {
        callId: { type: 'string' },
        limit: { type: 'integer', minimum: 1 },
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

function sendError(id, code, message, data = undefined) {
  sendMessage({
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
      ...(data ? { data } : {}),
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
    case 'join_call':
      return store.joinCall(args);
    case 'wait_for_events':
      return store.waitForEvents(args);
    case 'publish_actions':
      return store.publishActions(args);
    case 'leave_call':
      return store.leaveCall(args);
    case 'get_recent_turns':
      return store.getRecentTurns(args);
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
          resources: {},
          prompts: {},
        },
        serverInfo: {
          name: 'talking-agent-room-bridge',
          version: '0.2.0',
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
        resources: listBridgeResources(),
      });
      return;
    case 'resources/read':
      sendResult(message.id, {
        contents: [readBridgeResource(message.params?.uri || '')],
      });
      return;
    case 'prompts/list':
      sendResult(message.id, {
        prompts: listBridgePrompts(),
      });
      return;
    case 'prompts/get':
      sendResult(message.id, getBridgePrompt(message.params?.name || ''));
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
      const bridgeCode = error?.code && typeof error.code === 'string' ? error.code : null;
      sendError(
        message.id ?? null,
        -32603,
        error instanceof Error ? error.message : 'Internal error',
        bridgeCode ? { bridgeCode } : undefined,
      );
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
