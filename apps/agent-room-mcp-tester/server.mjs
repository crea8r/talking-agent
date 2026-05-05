import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createAgentRoomBridgeStore } from '../../packages/agent-room-bridge/index.mjs';
import { createMcpHarness } from '../../packages/agent-room-bridge/mcp-harness.mjs';
import {
  buildAvatarCatalogUri,
  buildAvatarCatalogVersion,
} from '../../packages/agent-room-bridge/resources.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HOST = '127.0.0.1';
const PORT = Number.parseInt(process.env.PORT || '4386', 10);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SRC_DIR = path.join(__dirname, 'src');
const BRIDGE_STATE_PATH = path.join(REPO_ROOT, 'output', 'agent-room-mcp-tester-bridge.json');
const MCP_SERVER_PATH = path.join(REPO_ROOT, 'packages', 'agent-room-bridge', 'mcp-server.mjs');
const DEFAULT_MODEL_ID = 'bhf-1-2';

const bridgeStore = createAgentRoomBridgeStore({
  stateFilePath: BRIDGE_STATE_PATH,
});
const mcpHarness = createMcpHarness({
  stateFilePath: BRIDGE_STATE_PATH,
  cwd: REPO_ROOT,
});

const MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
]);

const STATIC_ROUTES = new Map([
  ['/', path.join(SRC_DIR, 'index.html')],
  ['/app.js', path.join(SRC_DIR, 'app.js')],
  ['/styles.css', path.join(SRC_DIR, 'styles.css')],
]);

const PREFIX_ROUTES = [
  {
    prefix: '/lib/',
    rootDir: path.join(SRC_DIR, 'lib'),
  },
];

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
  });
  res.end(JSON.stringify(payload, null, 2));
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, {
    'cache-control': 'no-store',
    'content-type': 'text/plain; charset=utf-8',
  });
  res.end(text);
}

async function serveStatic(req, res, filePath) {
  try {
    const body = await readFile(filePath);
    const extension = path.extname(filePath);
    res.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': MIME_TYPES.get(extension) || 'application/octet-stream',
    });

    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    res.end(body);
  } catch (error) {
    console.error('Failed to serve static asset', { filePath, error });
    sendText(res, 404, 'Not found');
  }
}

function resolvePrefixedPath(urlPathname) {
  for (const route of PREFIX_ROUTES) {
    if (!urlPathname.startsWith(route.prefix)) {
      continue;
    }

    const relativePath = decodeURIComponent(urlPathname.slice(route.prefix.length));
    const candidatePath = path.resolve(route.rootDir, relativePath);
    const safeRoot = `${route.rootDir}${path.sep}`;

    if (candidatePath === route.rootDir || candidatePath.startsWith(safeRoot)) {
      return candidatePath;
    }

    return null;
  }

  return undefined;
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) {
    return {};
  }

  return JSON.parse(raw);
}

function buildSessionMetadata(body = {}) {
  return {
    ...(body.metadata && typeof body.metadata === 'object' ? body.metadata : {}),
    app: 'agent-room-mcp-tester',
    activeModelId: DEFAULT_MODEL_ID,
    avatarCatalogUri: buildAvatarCatalogUri(DEFAULT_MODEL_ID),
    avatarCatalogVersion: buildAvatarCatalogVersion(DEFAULT_MODEL_ID),
  };
}

async function sendBridgePayload(res, sessionId, statusCode = 200) {
  const session = await bridgeStore.getSession(sessionId, { touch: true });
  const pendingActions = await bridgeStore.listPendingActions({
    sessionId,
  });
  const inspector = await bridgeStore.getInspectorSnapshot({
    sessionId,
  });

  sendJson(res, statusCode, {
    ok: true,
    session,
    pendingActions: pendingActions.actions,
    inspector,
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);

  if ((req.method === 'GET' || req.method === 'HEAD') && STATIC_ROUTES.has(url.pathname)) {
    await serveStatic(req, res, STATIC_ROUTES.get(url.pathname));
    return;
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    const assetPath = resolvePrefixedPath(url.pathname);
    if (assetPath) {
      await serveStatic(req, res, assetPath);
      return;
    }
  }

  if (req.method === 'GET' && url.pathname === '/healthz') {
    sendJson(res, 200, {
      ok: true,
      host: HOST,
      port: PORT,
      app: 'agent-room-mcp-tester',
      bridgeStatePath: BRIDGE_STATE_PATH,
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/runtime-config') {
    sendJson(res, 200, {
      ok: true,
      appName: 'agent-room-mcp-tester',
      appMode: 'mcp-debugger',
      port: PORT,
      defaults: {
        callTitle: 'MCP Tester',
        humanIdentity: 'tester-human',
        humanName: 'Tester Human',
      },
      bridge: {
        stateFilePath: BRIDGE_STATE_PATH,
        tools: ['join_call', 'wait_for_events', 'publish_actions', 'leave_call', 'get_recent_turns'],
        defaultModelId: DEFAULT_MODEL_ID,
        avatarCatalogUri: buildAvatarCatalogUri(DEFAULT_MODEL_ID),
        avatarCatalogVersion: buildAvatarCatalogVersion(DEFAULT_MODEL_ID),
      },
      mcp: {
        serverPath: MCP_SERVER_PATH,
        command: `AGENT_ROOM_BRIDGE_STATE_PATH="${BRIDGE_STATE_PATH}" node "${MCP_SERVER_PATH}"`,
      },
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/mcp/state') {
    sendJson(res, 200, {
      ok: true,
      state: mcpHarness.getState(),
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/mcp/transcript') {
    sendJson(res, 200, {
      ok: true,
      transcript: mcpHarness.getTranscript(),
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/mcp/connect') {
    try {
      const state = await mcpHarness.connect();
      sendJson(res, 200, {
        ok: true,
        state,
        transcript: mcpHarness.getTranscript(),
      });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : 'Unable to connect MCP harness.',
      });
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/mcp/reset') {
    try {
      const state = await mcpHarness.reset();
      sendJson(res, 200, {
        ok: true,
        state,
        transcript: mcpHarness.getTranscript(),
      });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : 'Unable to reset MCP harness.',
      });
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/mcp/request') {
    try {
      const body = await readJsonBody(req);
      const response = await mcpHarness.request(body);
      sendJson(res, 200, {
        ok: true,
        response,
        state: mcpHarness.getState(),
        transcript: mcpHarness.getTranscript(),
      });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : 'Unable to send MCP request.',
      });
    }
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/bridge/sessions') {
    sendJson(res, 200, {
      ok: true,
      sessions: await bridgeStore.listSessions(),
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/bridge/sessions') {
    try {
      const body = await readJsonBody(req);
      const session = await bridgeStore.createSession({
        title: body.title,
        roomName: body.roomName || 'agent-room-mcp-tester',
        livekitUrl: body.livekitUrl || 'debug://local',
        humanIdentity: body.humanIdentity,
        humanName: body.humanName,
        metadata: buildSessionMetadata(body),
      });
      await sendBridgePayload(res, session.id, 201);
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : 'Unable to create session.',
      });
    }
    return;
  }

  const sessionMatch = url.pathname.match(/^\/api\/bridge\/sessions\/([^/]+)$/);
  if (req.method === 'GET' && sessionMatch) {
    try {
      await sendBridgePayload(res, decodeURIComponent(sessionMatch[1]));
    } catch (error) {
      sendJson(res, 404, {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown session.',
      });
    }
    return;
  }

  const sessionStateMatch = url.pathname.match(/^\/api\/bridge\/sessions\/([^/]+)\/state$/);
  if (req.method === 'POST' && sessionStateMatch) {
    try {
      const body = await readJsonBody(req);
      const sessionId = decodeURIComponent(sessionStateMatch[1]);
      await bridgeStore.setCallState({
        sessionId,
        state: body.state,
        reason: body.reason,
      });
      await sendBridgePayload(res, sessionId);
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : 'Unable to update call state.',
      });
    }
    return;
  }

  const utteranceStartMatch = url.pathname.match(/^\/api\/bridge\/sessions\/([^/]+)\/utterances\/start$/);
  if (req.method === 'POST' && utteranceStartMatch) {
    try {
      const body = await readJsonBody(req);
      const sessionId = decodeURIComponent(utteranceStartMatch[1]);
      await bridgeStore.appendUserUtteranceStart({
        sessionId,
        utteranceId: body.utteranceId,
      });
      await sendBridgePayload(res, sessionId);
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : 'Unable to start utterance.',
      });
    }
    return;
  }

  const utterancePartialMatch = url.pathname.match(/^\/api\/bridge\/sessions\/([^/]+)\/utterances\/partial$/);
  if (req.method === 'POST' && utterancePartialMatch) {
    try {
      const body = await readJsonBody(req);
      const sessionId = decodeURIComponent(utterancePartialMatch[1]);
      await bridgeStore.appendUserUtterancePartial({
        sessionId,
        utteranceId: body.utteranceId,
        delta: body.delta,
      });
      await sendBridgePayload(res, sessionId);
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : 'Unable to append partial.',
      });
    }
    return;
  }

  const utteranceFinalMatch = url.pathname.match(/^\/api\/bridge\/sessions\/([^/]+)\/utterances\/final$/);
  if (req.method === 'POST' && utteranceFinalMatch) {
    try {
      const body = await readJsonBody(req);
      const sessionId = decodeURIComponent(utteranceFinalMatch[1]);
      await bridgeStore.appendUserUtteranceFinal({
        sessionId,
        utteranceId: body.utteranceId,
        text: body.text,
        source: body.source || 'typed',
        humanIdentity: body.humanIdentity,
        humanName: body.humanName,
      });
      await sendBridgePayload(res, sessionId);
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : 'Unable to finalize utterance.',
      });
    }
    return;
  }

  const actionStartedMatch = url.pathname.match(/^\/api\/bridge\/sessions\/([^/]+)\/actions\/([^/]+)\/started$/);
  if (req.method === 'POST' && actionStartedMatch) {
    try {
      const sessionId = decodeURIComponent(actionStartedMatch[1]);
      const actionId = decodeURIComponent(actionStartedMatch[2]);
      await bridgeStore.markActionPlaybackStarted({ sessionId, actionId });
      await sendBridgePayload(res, sessionId);
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : 'Unable to mark started.',
      });
    }
    return;
  }

  const actionFinishedMatch = url.pathname.match(/^\/api\/bridge\/sessions\/([^/]+)\/actions\/([^/]+)\/finished$/);
  if (req.method === 'POST' && actionFinishedMatch) {
    try {
      const sessionId = decodeURIComponent(actionFinishedMatch[1]);
      const actionId = decodeURIComponent(actionFinishedMatch[2]);
      await bridgeStore.markActionPlaybackFinished({ sessionId, actionId });
      await sendBridgePayload(res, sessionId);
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : 'Unable to mark finished.',
      });
    }
    return;
  }

  const actionCompletedMatch = url.pathname.match(/^\/api\/bridge\/sessions\/([^/]+)\/actions\/([^/]+)\/completed$/);
  if (req.method === 'POST' && actionCompletedMatch) {
    try {
      const sessionId = decodeURIComponent(actionCompletedMatch[1]);
      const actionId = decodeURIComponent(actionCompletedMatch[2]);
      await bridgeStore.markActionCompleted({ sessionId, actionId });
      await sendBridgePayload(res, sessionId);
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : 'Unable to mark completed.',
      });
    }
    return;
  }

  sendText(res, 404, 'Not found');
});

server.on('error', (error) => {
  if (error?.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use on ${HOST}. Kill the process on that port and rerun.`);
    process.exit(1);
  }

  console.error('agent-room-mcp-tester failed to start', error);
  process.exit(1);
});

async function shutdown() {
  await mcpHarness.close().catch(() => {});
}

process.on('SIGINT', async () => {
  await shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await shutdown();
  process.exit(0);
});

server.listen(PORT, HOST, () => {
  console.log(`agent-room-mcp-tester listening at http://${HOST}:${PORT}`);
});
