import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createRoomLayerRuntimeConfig,
  createRoomLayerToken,
  loadRoomLayerDefaults,
  validateRoomLayerTokenRequest,
} from '../../packages/room-layer/server.mjs';
import { createAgentRoomBridgeStore } from '../../packages/agent-room-bridge/index.mjs';
import {
  BUNDLED_MODELS,
  DEFAULT_MODEL,
  EMOTES,
  GESTURES,
  getGesturePresets,
  STAGES,
} from '../../packages/avatar-layer-browser/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HOST = '127.0.0.1';
const PORT = Number.parseInt(process.env.PORT || '4384', 10);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SRC_DIR = path.join(__dirname, 'src');
const NODE_MODULES_DIR = path.join(REPO_ROOT, 'node_modules');
const PACKAGES_DIR = path.join(REPO_ROOT, 'packages');
const MODELS_DIR = path.join(PACKAGES_DIR, 'avatar-layer-browser', 'models');
const ANIMATIONS_DIR = path.join(PACKAGES_DIR, 'avatar-layer-browser', 'animations');
const ROOM_LAYER_DIR = path.join(PACKAGES_DIR, 'room-layer');
const VOICE_LAYER_DIR = path.join(PACKAGES_DIR, 'voice-layer-browser');
const AVATAR_LAYER_DIR = path.join(PACKAGES_DIR, 'avatar-layer-browser');
const AVATAR_SPEECH_DIR = path.join(PACKAGES_DIR, 'avatar-speech-browser');
const LIVEKIT_CLIENT_DIST = path.join(
  NODE_MODULES_DIR,
  'livekit-client',
  'dist',
  'livekit-client.esm.mjs',
);
const LIVEKIT_CLIENT_MAP = path.join(
  NODE_MODULES_DIR,
  'livekit-client',
  'dist',
  'livekit-client.esm.mjs.map',
);
const BRIDGE_STATE_PATH = path.join(REPO_ROOT, 'output', 'one-to-one-agent-room-bridge.json');
const MCP_SERVER_PATH = path.join(PACKAGES_DIR, 'agent-room-bridge', 'mcp-server.mjs');
const ROOM_LAYER_DEFAULTS = loadRoomLayerDefaults(process.env);
const bridgeStore = createAgentRoomBridgeStore({
  stateFilePath: BRIDGE_STATE_PATH,
});

const MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.vrma', 'model/gltf-binary'],
  ['.vrm', 'model/gltf-binary'],
]);

const STATIC_ROUTES = new Map([
  ['/', path.join(SRC_DIR, 'index.html')],
  ['/app.js', path.join(SRC_DIR, 'app.js')],
  ['/styles.css', path.join(SRC_DIR, 'styles.css')],
  ['/vendor/room-layer-client.mjs', path.join(ROOM_LAYER_DIR, 'client.mjs')],
  ['/vendor/voice-layer-browser.js', path.join(VOICE_LAYER_DIR, 'index.js')],
  ['/vendor/avatar-layer-browser.js', path.join(AVATAR_LAYER_DIR, 'index.js')],
  ['/vendor/animation-manifest.js', path.join(AVATAR_LAYER_DIR, 'animation-manifest.js')],
  ['/vendor/avatar-speech-browser.js', path.join(AVATAR_SPEECH_DIR, 'index.js')],
  ['/vendor/livekit-client.mjs', LIVEKIT_CLIENT_DIST],
  ['/vendor/livekit-client.mjs.map', LIVEKIT_CLIENT_MAP],
]);

const PREFIX_ROUTES = [
  {
    prefix: '/ui/',
    rootDir: path.join(SRC_DIR, 'ui'),
  },
  {
    prefix: '/lib/',
    rootDir: path.join(SRC_DIR, 'lib'),
  },
  {
    prefix: '/models/',
    rootDir: MODELS_DIR,
  },
  {
    prefix: '/animations/',
    rootDir: ANIMATIONS_DIR,
  },
  {
    prefix: '/vendor/three/',
    rootDir: path.join(NODE_MODULES_DIR, 'three'),
  },
  {
    prefix: '/vendor/@pixiv/three-vrm/',
    rootDir: path.join(NODE_MODULES_DIR, '@pixiv', 'three-vrm', 'lib'),
  },
  {
    prefix: '/vendor/@pixiv/three-vrm-animation/',
    rootDir: path.join(NODE_MODULES_DIR, '@pixiv', 'three-vrm-animation', 'lib'),
  },
];

function renderMcpBootstrapCommand() {
  return `AGENT_ROOM_BRIDGE_STATE_PATH="${BRIDGE_STATE_PATH}" node "${MCP_SERVER_PATH}"`;
}

function toHttpProbeUrl(livekitUrl) {
  const parsed = new URL(livekitUrl);
  const protocol = parsed.protocol === 'wss:' ? 'https:' : 'http:';
  parsed.protocol = protocol;

  if (!parsed.pathname || parsed.pathname === '') {
    parsed.pathname = '/';
  }

  return parsed.toString();
}

async function probeLivekitUrl(livekitUrl) {
  const cleanedUrl = `${livekitUrl || ''}`.trim();
  if (!cleanedUrl) {
    throw new Error('LiveKit URL is required.');
  }

  let probeUrl;
  try {
    probeUrl = toHttpProbeUrl(cleanedUrl);
  } catch {
    throw new Error(`LiveKit URL is invalid: ${cleanedUrl}`);
  }

  try {
    const response = await fetch(probeUrl, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(1200),
    });

    return {
      reachable: true,
      probeUrl,
      status: response.status,
      statusText: response.statusText,
    };
  } catch (error) {
    return {
      reachable: false,
      probeUrl,
      error: error instanceof Error ? error.message : 'Unknown probe failure.',
    };
  }
}

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

async function serveStatic(res, filePath) {
  try {
    const body = await readFile(filePath);
    res.writeHead(200, {
      'cache-control': path.extname(filePath) === '.map' ? 'public, max-age=300' : 'no-store',
      'content-type': MIME_TYPES.get(path.extname(filePath)) || 'application/octet-stream',
    });
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

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('Request body must be valid JSON.');
  }
}

function createDemoReplyText(transcript) {
  const cleaned = `${transcript || ''}`.trim();
  const lower = cleaned.toLowerCase();

  if (lower.includes('hello') || lower.includes('hi')) {
    return 'Hello. The one-to-one room is active, the avatar is listening, and the MCP bridge is ready for Codex.';
  }

  if (lower.includes('status')) {
    return 'Room transport is local LiveKit, the human turn is persisted in the bridge state file, and the avatar speech layer is ready to play my reply.';
  }

  if (lower.includes('mcp')) {
    return 'This spike exposes human turns through an MCP server so Codex can claim them and submit structured replies back into the room session.';
  }

  if (lower.endsWith('?')) {
    return `My short answer is: ${cleaned.replace(/\?+$/g, '')}. This is the local demo agent path, so the real Codex reasoning loop can replace me later.`;
  }

  return `I heard: ${cleaned}. The bridge has the turn, the avatar package can speak the response, and the app shell stays thin around those reusable pieces.`;
}

function serializeGesture(gesture) {
  return {
    id: gesture.id,
    file: gesture.file || `${gesture.id}.vrma`,
    description: gesture.description || gesture.note,
    bestFor: gesture.bestFor || [],
    avoidFor: gesture.avoidFor || [],
    cameraFit: gesture.cameraFit || 'either',
    intent: gesture.intent,
    aliases: gesture.aliases || [],
  };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);

  if (req.method === 'GET' && STATIC_ROUTES.has(url.pathname)) {
    await serveStatic(res, STATIC_ROUTES.get(url.pathname));
    return;
  }

  if (req.method === 'GET') {
    const prefixedPath = resolvePrefixedPath(url.pathname);

    if (prefixedPath === null) {
      sendText(res, 400, 'Bad request');
      return;
    }

    if (prefixedPath) {
      await serveStatic(res, prefixedPath);
      return;
    }
  }

  if (req.method === 'GET' && url.pathname === '/healthz') {
    sendJson(res, 200, {
      ok: true,
      host: HOST,
      port: PORT,
      app: 'one-to-one-agent-room',
      bridgeStatePath: BRIDGE_STATE_PATH,
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/runtime-config') {
    sendJson(res, 200, {
      ...createRoomLayerRuntimeConfig({
        defaults: ROOM_LAYER_DEFAULTS,
        appName: 'one-to-one-agent-room',
        appMode: 'app4-mcp-codex-bridge-spike',
        port: PORT,
      }),
      avatar: {
        defaultModel: path.basename(DEFAULT_MODEL.path),
        bundledModels: BUNDLED_MODELS.map((model) => model.id),
        stageIds: STAGES.map((stage) => stage.id),
        emoteIds: EMOTES.map((emote) => emote.id),
        gestureIds: GESTURES.map((gesture) => gesture.id),
        gestureCatalog: GESTURES.map(serializeGesture),
        gestureIdsByModel: Object.fromEntries(
          BUNDLED_MODELS.map((model) => [model.id, getGesturePresets(model.id).map((gesture) => gesture.id)]),
        ),
        gestureCatalogByModel: Object.fromEntries(
          BUNDLED_MODELS.map((model) => [model.id, getGesturePresets(model.id).map(serializeGesture)]),
        ),
      },
      bridge: {
        stateFilePath: BRIDGE_STATE_PATH,
        mcpServerPath: MCP_SERVER_PATH,
        mcpServerCommand: renderMcpBootstrapCommand(),
        tools: [
          'bridge_status',
          'list_sessions',
          'get_session',
          'heartbeat_agent',
          'claim_next_turn',
          'submit_agent_reply',
        ],
        demoReplyAvailable: true,
      },
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/probe-livekit') {
    try {
      const livekitUrl = url.searchParams.get('url') || '';
      const result = await probeLivekitUrl(livekitUrl);
      sendJson(res, 200, {
        ok: true,
        ...result,
      });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : 'Unable to probe LiveKit URL.',
      });
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/token') {
    try {
      const body = await readJsonBody(req);
      const tokenRequest = validateRoomLayerTokenRequest(body, ROOM_LAYER_DEFAULTS);
      const result = createRoomLayerToken(tokenRequest);

      sendJson(res, 200, {
        ok: true,
        token: result.token,
        claims: result.claims,
        transport: {
          livekitUrl:
            `${body.livekitUrl || ROOM_LAYER_DEFAULTS.livekitUrl}`.trim() ||
            ROOM_LAYER_DEFAULTS.livekitUrl,
          roomName: tokenRequest.roomName,
        },
      });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : 'Unable to mint token.',
      });
    }
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/bridge/status') {
    sendJson(res, 200, {
      ok: true,
      ...(await bridgeStore.getBridgeStatus()),
    });
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
      const session = await bridgeStore.createSession(body);
      sendJson(res, 200, {
        ok: true,
        session,
      });
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
      const session = await bridgeStore.getSession(decodeURIComponent(sessionMatch[1]), {
        touch: true,
      });
      sendJson(res, 200, {
        ok: true,
        session,
      });
    } catch (error) {
      sendJson(res, 404, {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown session.',
      });
    }
    return;
  }

  const humanTurnMatch = url.pathname.match(/^\/api\/bridge\/sessions\/([^/]+)\/human-turn$/);
  if (req.method === 'POST' && humanTurnMatch) {
    try {
      const body = await readJsonBody(req);
      const session = await bridgeStore.enqueueHumanTurn({
        sessionId: decodeURIComponent(humanTurnMatch[1]),
        ...body,
      });
      sendJson(res, 200, {
        ok: true,
        session,
      });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : 'Unable to enqueue turn.',
      });
    }
    return;
  }

  const playedReplyMatch = url.pathname.match(
    /^\/api\/bridge\/sessions\/([^/]+)\/replies\/([^/]+)\/played$/,
  );
  if (req.method === 'POST' && playedReplyMatch) {
    try {
      const session = await bridgeStore.markReplyPlayed({
        sessionId: decodeURIComponent(playedReplyMatch[1]),
        replyId: decodeURIComponent(playedReplyMatch[2]),
      });
      sendJson(res, 200, {
        ok: true,
        session,
      });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : 'Unable to mark reply played.',
      });
    }
    return;
  }

  const demoReplyMatch = url.pathname.match(/^\/api\/bridge\/sessions\/([^/]+)\/demo-reply$/);
  if (req.method === 'POST' && demoReplyMatch) {
    try {
      const sessionId = decodeURIComponent(demoReplyMatch[1]);
      const claim = await bridgeStore.claimNextTurn({
        sessionId,
        agentId: 'local-demo-agent',
        agentLabel: 'Local Demo Agent',
      });

      if (!claim.turn) {
        sendJson(res, 200, {
          ok: true,
          session: claim.session,
          message: 'No pending turns.',
        });
        return;
      }

      const session = await bridgeStore.submitAgentReply({
        sessionId,
        turnId: claim.turn.id,
        agentId: 'local-demo-agent',
        agentLabel: 'Local Demo Agent',
        reply: createDemoReplyText(claim.turn.transcript),
        emoteId: claim.turn.transcript.trim().endsWith('?') ? 'focused' : 'warm',
        gestureId:
          claim.turn.transcript.toLowerCase().includes('hello') ||
          claim.turn.transcript.toLowerCase().includes('hi')
            ? 'greet'
            : 'explain',
        voiceMode: 'speak',
        notes: 'Injected by the local fallback route for spike verification.',
      });

      sendJson(res, 200, {
        ok: true,
        session,
      });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : 'Unable to create demo reply.',
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

  console.error('one-to-one-agent-room failed to start', error);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`one-to-one-agent-room listening at http://${HOST}:${PORT}`);
});
