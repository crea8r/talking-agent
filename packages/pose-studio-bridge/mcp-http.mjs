import { randomUUID } from 'node:crypto';

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { createDefaultPoseStudioBridgeStore, createPoseStudioMcpServer, logMcp } from './mcp-core.mjs';

function formatElapsedMs(startedAtMs) {
  return Math.round((performance.now() - startedAtMs) * 1000) / 1000;
}

function isInitializeRequest(body) {
  return body && typeof body === 'object' && body.method === 'initialize';
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }
  if (!chunks.length) return null;
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function sendJsonRpcError(res, statusCode, message) {
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({
    jsonrpc: '2.0',
    error: { code: -32000, message },
    id: null,
  }));
}

export function createPoseStudioMcpHttpHandler({
  store = createDefaultPoseStudioBridgeStore(),
  pathname = '/mcp',
  surface = 'full',
} = {}) {
  const sessions = new Map();

  async function closeSession(sessionId) {
    const entry = sessions.get(sessionId);
    if (!entry) return;
    sessions.delete(sessionId);
    try { await entry.transport.close(); } catch {}
    try { await entry.server.close(); } catch {}
  }

  async function connectSession() {
    const { server } = createPoseStudioMcpServer({ store, surface });
    let transport;
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        sessions.set(sessionId, { server, transport });
        logMcp('http.session.initialized', { sessionId });
      },
    });
    transport.onclose = () => {
      const sessionId = transport.sessionId;
      if (sessionId) closeSession(sessionId);
    };
    await server.connect(transport);
    return transport;
  }

  return {
    async handle(req, res, urlPath = req.url || '/') {
      if (!urlPath.startsWith(pathname)) return false;
      const method = req.method || 'GET';
      const sessionId = req.headers['mcp-session-id'];

      if (method === 'POST') {
        const startedAtMs = performance.now();
        const body = await readJsonBody(req);
        const rpcMethod = typeof body?.method === 'string' ? body.method : '';
        const tool = rpcMethod === 'tools/call' ? body?.params?.name || '' : '';
        logMcp('http.request.start', { sessionId: sessionId || '', rpcMethod, tool, surface });
        let transport = sessionId ? sessions.get(sessionId)?.transport : null;
        if (!transport && isInitializeRequest(body)) {
          transport = await connectSession();
        }
        if (!transport) {
          sendJsonRpcError(res, 400, 'Bad Request: No valid session ID provided');
          return true;
        }
        await transport.handleRequest(req, res, body);
        logMcp('http.request.end', {
          sessionId: transport.sessionId || sessionId || '',
          rpcMethod,
          tool,
          surface,
          elapsedMs: formatElapsedMs(startedAtMs),
        });
        return true;
      }

      if (method === 'GET' || method === 'DELETE') {
        const transport = sessionId ? sessions.get(sessionId)?.transport : null;
        if (!transport) {
          sendJsonRpcError(res, 400, 'Invalid or missing session ID');
          return true;
        }
        await transport.handleRequest(req, res);
        return true;
      }

      sendJsonRpcError(res, 405, 'Method not allowed.');
      return true;
    },
    async close() {
      await Promise.all([...sessions.keys()].map((sessionId) => closeSession(sessionId)));
    },
  };
}
