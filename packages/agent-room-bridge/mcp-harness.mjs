import { spawn } from 'node:child_process';
import path from 'node:path';

function frameMessage(message) {
  const body = JSON.stringify(message);
  return `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\nContent-Type: application/json\r\n\r\n${body}`;
}

function parseFrames(buffer, onFrame) {
  let nextBuffer = buffer;

  while (nextBuffer.length) {
    const headerEnd = nextBuffer.indexOf('\r\n\r\n');
    if (headerEnd === -1) {
      return nextBuffer;
    }

    const header = nextBuffer.slice(0, headerEnd).toString('utf8');
    const lengthMatch = header.match(/Content-Length:\s*(\d+)/i);
    if (!lengthMatch) {
      nextBuffer = nextBuffer.slice(headerEnd + 4);
      continue;
    }

    const contentLength = Number.parseInt(lengthMatch[1], 10);
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + contentLength;
    if (nextBuffer.length < bodyEnd) {
      return nextBuffer;
    }

    const body = nextBuffer.slice(bodyStart, bodyEnd).toString('utf8');
    nextBuffer = nextBuffer.slice(bodyEnd);

    onFrame(JSON.parse(body));
  }

  return nextBuffer;
}

export function createMcpHarness({
  stateFilePath,
  cwd = process.cwd(),
  mcpServerPath = path.join(cwd, 'packages', 'agent-room-bridge', 'mcp-server.mjs'),
} = {}) {
  if (!`${stateFilePath || ''}`.trim()) {
    throw new Error('createMcpHarness requires stateFilePath.');
  }

  let child = null;
  let buffer = Buffer.alloc(0);
  let nextId = 1;
  let lastError = null;
  const pending = new Map();
  let transcript = [];

  function record(direction, payload) {
    transcript = [
      ...transcript,
      {
        ts: new Date().toISOString(),
        direction,
        payload,
      },
    ];
  }

  function settlePendingWithError(error) {
    for (const entry of pending.values()) {
      entry.reject(error);
    }
    pending.clear();
  }

  function onChildExit(code, signal) {
    const exitError = new Error(
      `MCP server exited${code !== null ? ` with code ${code}` : ''}${signal ? ` via ${signal}` : ''}.`,
    );
    lastError = exitError.message;
    child = null;
    buffer = Buffer.alloc(0);
    record('process.exit', { code, signal });
    settlePendingWithError(exitError);
  }

  function ensureConnected() {
    if (!child || child.killed) {
      throw new Error('MCP harness is not connected.');
    }
  }

  async function connect() {
    if (child && !child.killed) {
      return getState();
    }

    lastError = null;
    child = spawn(process.execPath, [mcpServerPath], {
      cwd,
      env: {
        ...process.env,
        AGENT_ROOM_BRIDGE_STATE_PATH: stateFilePath,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    child.stdout.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      try {
        buffer = parseFrames(buffer, (message) => {
          record('response', message);
          if (typeof message.id === 'undefined') {
            return;
          }

          const entry = pending.get(message.id);
          if (!entry) {
            return;
          }

          pending.delete(message.id);
          if (message.error) {
            entry.reject(message.error);
            return;
          }

          entry.resolve(message);
        });
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Failed to parse MCP frame.';
        record('parse.error', {
          error: lastError,
        });
      }
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString('utf8');
      if (!text.trim()) {
        return;
      }

      lastError = text.trim();
      record('stderr', {
        text,
      });
    });

    child.on('error', (error) => {
      lastError = error instanceof Error ? error.message : 'MCP process error.';
      record('process.error', {
        error: lastError,
      });
      settlePendingWithError(error instanceof Error ? error : new Error(lastError));
    });

    child.on('exit', onChildExit);

    return getState();
  }

  async function request(message) {
    ensureConnected();

    const payload = { ...(message || {}) };
    if (payload.jsonrpc !== '2.0') {
      payload.jsonrpc = '2.0';
    }

    if (typeof payload.id === 'undefined' && payload.method !== 'notifications/initialized') {
      payload.id = nextId++;
    }

    record('request', payload);
    child.stdin.write(frameMessage(payload));

    if (typeof payload.id === 'undefined') {
      return null;
    }

    return new Promise((resolve, reject) => {
      pending.set(payload.id, { resolve, reject });
    });
  }

  async function close() {
    if (!child || child.killed) {
      child = null;
      buffer = Buffer.alloc(0);
      pending.clear();
      return;
    }

    const proc = child;
    child = null;
    buffer = Buffer.alloc(0);
    proc.stdin.end();
    proc.kill();
    settlePendingWithError(new Error('MCP harness closed.'));
  }

  async function reset() {
    await close();
    transcript = [];
    nextId = 1;
    lastError = null;
    return getState();
  }

  function getTranscript() {
    return transcript.slice();
  }

  function getState() {
    return {
      connected: Boolean(child && !child.killed),
      pid: child?.pid || null,
      transcriptCount: transcript.length,
      pendingCount: pending.size,
      stateFilePath,
      lastError,
    };
  }

  return {
    connect,
    request,
    close,
    reset,
    getTranscript,
    getState,
  };
}
