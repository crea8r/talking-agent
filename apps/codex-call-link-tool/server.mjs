import os from 'node:os';
import path from 'node:path';

import { createForkedCallExecutor } from '../../packages/codex-exec/index.mjs';
import { createCallRecordStore } from '../../packages/call-record-store/index.mjs';
import { createProductionVoiceProfileStore } from '../../packages/production-voice/profile-store.mjs';
import { createWorkspaceSetupStore } from '../../packages/workspace-setup-store/index.mjs';

import { createCallLinkService } from './lib/service.mjs';

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const APP_BASE_URL = process.env.ONE_TO_ONE_AGENT_ROOM_BASE_URL || 'http://127.0.0.1:4384';
const CODEX_SOURCE_HOME =
  process.env.ONE_TO_ONE_AGENT_ROOM_SOURCE_CODEX_HOME ||
  process.env.CODEX_HOME ||
  path.join(process.env.HOME || os.homedir(), '.codex');
const CODEX_COMMAND = process.env.ONE_TO_ONE_AGENT_ROOM_CODEX_COMMAND || 'codex';
const CODEX_TIMEOUT_MS = Number.parseInt(
  process.env.ONE_TO_ONE_AGENT_ROOM_CODEX_TIMEOUT_MS || '45000',
  10,
);

const service = createCallLinkService({
  appBaseUrl: APP_BASE_URL,
  sourceCodexHome: CODEX_SOURCE_HOME,
  callRecordStore: createCallRecordStore({
    rootDir: path.join(REPO_ROOT, 'output', 'one-to-one-agent-room-calls'),
  }),
  workspaceSetupStore: createWorkspaceSetupStore({
    rootDir: path.join(REPO_ROOT, 'output', 'one-to-one-agent-room-setup'),
  }),
  productionVoiceProfileStore: createProductionVoiceProfileStore({
    rootDir: path.join(REPO_ROOT, 'output', 'one-to-one-agent-room-production-voice'),
  }),
  forkedCallExecutor: createForkedCallExecutor({
    rootDir: path.join(REPO_ROOT, 'output', 'one-to-one-agent-room-codex'),
    sourceCodexHome: CODEX_SOURCE_HOME,
    codexCommand: CODEX_COMMAND,
    timeoutMs: Number.isFinite(CODEX_TIMEOUT_MS) ? CODEX_TIMEOUT_MS : 45_000,
  }),
});

const TOOL_DEFINITIONS = [
  {
    name: 'create_call_link',
    description: 'Create a linked call for the current Codex work session and return a localhost URL that opens the call-ready room.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        originalSessionId: { type: 'string' },
        workspaceRoot: { type: 'string' },
        displayTitle: { type: 'string' },
        scopeKey: { type: 'string' },
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
  sendMessage({ jsonrpc: '2.0', id, result });
}

function sendError(id, code, message) {
  sendMessage({
    jsonrpc: '2.0',
    id,
    error: { code, message },
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

async function handleRequest(message) {
  switch (message.method) {
    case 'initialize':
      sendResult(message.id, {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: 'codex-call-link-tool',
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
      sendResult(message.id, { tools: TOOL_DEFINITIONS });
      return;
    case 'tools/call': {
      if (message.params?.name !== 'create_call_link') {
        throw new Error(`Unknown tool: ${message.params?.name || ''}`);
      }

      const payload = await service.createCallLink(message.params?.arguments || {});
      sendResult(message.id, toolResult(payload));
      return;
    }
    default:
      sendError(message.id ?? null, -32601, `Method not found: ${message.method}`);
  }
}

let buffer = Buffer.alloc(0);

function processFrames() {
  while (true) {
    const marker = buffer.indexOf('\r\n\r\n');
    if (marker === -1) {
      return;
    }

    const header = buffer.slice(0, marker).toString('utf8');
    const match = header.match(/Content-Length:\s*(\d+)/i);
    if (!match) {
      buffer = buffer.slice(marker + 4);
      continue;
    }

    const contentLength = Number.parseInt(match[1], 10);
    const frameLength = marker + 4 + contentLength;
    if (buffer.length < frameLength) {
      return;
    }

    const body = buffer.slice(marker + 4, frameLength).toString('utf8');
    buffer = buffer.slice(frameLength);

    let message;
    try {
      message = JSON.parse(body);
    } catch {
      continue;
    }

    Promise.resolve(handleRequest(message)).catch((error) => {
      sendError(message.id ?? null, -32000, error instanceof Error ? error.message : 'Internal error');
    });
  }
}

process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  processFrames();
});
