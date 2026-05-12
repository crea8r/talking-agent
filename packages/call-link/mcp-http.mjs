import { randomUUID } from 'node:crypto';

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { createCallLinkMcpServer } from './index.mjs';

function isInitializeRequest(body) {
  return body && typeof body === 'object' && body.method === 'initialize';
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }
  if (!chunks.length) {
    return null;
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function sendJsonRpcError(res, statusCode, message) {
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  res.end(
    JSON.stringify({
      jsonrpc: '2.0',
      error: { code: -32000, message },
      id: null,
    }),
  );
}

export function createCallLinkMcpHttpHandler({
  service,
  pathname = '/mcp',
} = {}) {
  if (!service) {
    throw new Error('createCallLinkMcpHttpHandler requires a service.');
  }

  const sessions = new Map();

  async function closeSession(sessionId) {
    const entry = sessions.get(sessionId);
    if (!entry) {
      return;
    }

    sessions.delete(sessionId);
    try {
      await entry.transport.close();
    } catch {}
    try {
      await entry.server.close();
    } catch {}
  }

  async function connectSession() {
    const server = createCallLinkMcpServer({ service });
    let transport;
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        sessions.set(sessionId, { server, transport });
      },
    });
    transport.onclose = () => {
      const sessionId = transport.sessionId;
      if (sessionId) {
        closeSession(sessionId);
      }
    };
    await server.connect(transport);
    return transport;
  }

  return {
    async handle(req, res, urlPath = req.url || '/') {
      if (!urlPath.startsWith(pathname)) {
        return false;
      }

      const method = req.method || 'GET';
      const sessionId = req.headers['mcp-session-id'];

      if (method === 'POST') {
        const body = await readJsonBody(req);
        let transport = sessionId ? sessions.get(sessionId)?.transport : null;
        if (!transport && isInitializeRequest(body)) {
          transport = await connectSession();
        }
        if (!transport) {
          sendJsonRpcError(res, 400, 'Bad Request: No valid session ID provided');
          return true;
        }

        await transport.handleRequest(req, res, body);
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
