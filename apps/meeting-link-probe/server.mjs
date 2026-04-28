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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number.parseInt(process.env.PORT || '4381', 10);
const HOST = '127.0.0.1';

const SRC_DIR = path.join(__dirname, 'src');
const MEDIA_DIR = path.join(__dirname, 'media');
const ROOM_LAYER_DIR = path.resolve(__dirname, '../../packages/room-layer');
const NODE_MODULES_DIR = path.resolve(__dirname, '../../node_modules');
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

const ROOM_LAYER_DEFAULTS = loadRoomLayerDefaults(process.env);

const MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.mov', 'video/quicktime'],
  ['.mp3', 'audio/mpeg'],
]);

const STATIC_ROUTES = new Map([
  ['/', path.join(SRC_DIR, 'index.html')],
  ['/app.js', path.join(SRC_DIR, 'app.js')],
  ['/smoke.html', path.join(SRC_DIR, 'smoke.html')],
  ['/styles.css', path.join(SRC_DIR, 'styles.css')],
  ['/media/sample.mov', path.join(MEDIA_DIR, 'sample.mov')],
  ['/media/sample.mp3', path.join(MEDIA_DIR, 'sample.mp3')],
  ['/vendor/room-layer-client.mjs', path.join(ROOM_LAYER_DIR, 'client.mjs')],
  ['/vendor/livekit-client.mjs', LIVEKIT_CLIENT_DIST],
  ['/vendor/livekit-client.mjs.map', LIVEKIT_CLIENT_MAP],
]);

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(payload, null, 2));
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(text);
}

async function serveStatic(res, filePath) {
  try {
    const body = await readFile(filePath);
    const extension = path.extname(filePath);
    res.writeHead(200, {
      'content-type': MIME_TYPES.get(extension) || 'application/octet-stream',
      'cache-control': extension === '.map' ? 'public, max-age=300' : 'no-store',
    });
    res.end(body);
  } catch (error) {
    console.error('Failed to serve static asset', { filePath, error });
    sendText(res, 404, 'Not found');
  }
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

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);

  if (req.method === 'GET' && STATIC_ROUTES.has(url.pathname)) {
    await serveStatic(res, STATIC_ROUTES.get(url.pathname));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/healthz') {
    sendJson(res, 200, {
      ok: true,
      host: HOST,
      port: PORT,
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/runtime-config') {
    sendJson(
      res,
      200,
      createRoomLayerRuntimeConfig({
        defaults: ROOM_LAYER_DEFAULTS,
        appName: 'meeting-link-probe',
        appMode: 'livekit-self-host-probe',
        port: PORT,
      }),
    );
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

  sendText(res, 404, 'Not found');
});

server.on('error', (error) => {
  if (error?.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use on ${HOST}. Kill the process on that port and rerun.`);
    process.exit(1);
  }

  console.error('Server failed to start', error);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`meeting-link-probe livekit server listening at http://${HOST}:${PORT}`);
});
