import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createPoseStudioBridgeStore,
  resolveDefaultPoseStudioBridgeStatePath,
} from '../../packages/pose-studio-bridge/index.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HOST = '127.0.0.1';
const PORT = Number.parseInt(process.env.PORT || '4387', 10);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SRC_DIR = path.join(__dirname, 'src');
const ASSETS_DIR = path.join(SRC_DIR, 'assets');
const NODE_MODULES_DIR = path.join(REPO_ROOT, 'node_modules');
const AVATAR_LAYER_DIR = path.join(REPO_ROOT, 'packages', 'avatar-layer-browser');
const MODELS_DIR = path.join(AVATAR_LAYER_DIR, 'models');
const ANIMATIONS_DIR = path.join(AVATAR_LAYER_DIR, 'animations');
const bridgeStore = createPoseStudioBridgeStore({
  stateFilePath: resolveDefaultPoseStudioBridgeStatePath({
    cwd: REPO_ROOT,
    env: process.env,
  }),
});

const MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.vrma', 'model/gltf-binary'],
  ['.vrm', 'model/gltf-binary'],
  ['.webp', 'image/webp'],
]);

const STATIC_ROUTES = new Map([
  ['/', path.join(SRC_DIR, 'index.html')],
  ['/app.js', path.join(SRC_DIR, 'app.js')],
  ['/styles.css', path.join(SRC_DIR, 'styles.css')],
  ['/vendor/avatar-layer-browser.js', path.join(AVATAR_LAYER_DIR, 'index.js')],
  ['/vendor/animation-manifest.js', path.join(AVATAR_LAYER_DIR, 'animation-manifest.js')],
]);

const PREFIX_ROUTES = [
  {
    prefix: '/assets/',
    rootDir: ASSETS_DIR,
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

function sendError(res, statusCode, code, message, data = undefined) {
  sendJson(res, statusCode, {
    ok: false,
    error: {
      code,
      message,
      ...(data ? { data } : {}),
    },
  });
}

async function readJsonBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const rawBody = Buffer.concat(chunks).toString('utf8').trim();
  if (!rawBody) {
    return {};
  }

  return JSON.parse(rawBody);
}

async function serveStatic(req, res, filePath) {
  try {
    const body = await readFile(filePath);
    const extension = path.extname(filePath);
    res.writeHead(200, {
      'cache-control': extension === '.map' ? 'public, max-age=300' : 'no-store',
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

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);

  if ((req.method === 'GET' || req.method === 'HEAD') && STATIC_ROUTES.has(url.pathname)) {
    await serveStatic(req, res, STATIC_ROUTES.get(url.pathname));
    return;
  }

  if ((req.method === 'GET' || req.method === 'HEAD') && url.pathname === '/healthz') {
    sendJson(res, 200, {
      ok: true,
      app: 'pose-studio',
      host: HOST,
      port: PORT,
      bridgeStatePath: bridgeStore.stateFilePath,
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/director/state') {
    try {
      const state = await bridgeStore.getState();
      sendJson(res, 200, {
        ok: true,
        state,
      });
    } catch (error) {
      console.error('Failed to read pose-studio director state', error);
      sendError(res, 500, error.code || 'DIRECTOR_STATE_ERROR', error.message);
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/director/runtime') {
    try {
      const body = await readJsonBody(req);
      const runtime = await bridgeStore.syncRuntime({
        modelId: body.modelId,
        modelLabel: body.modelLabel,
        availableGestures: body.availableGestures,
      });

      sendJson(res, 200, {
        ok: true,
        runtime,
      });
    } catch (error) {
      console.error('Failed to sync pose-studio runtime', error);
      sendError(res, 400, error.code || 'DIRECTOR_RUNTIME_ERROR', error.message, error.data);
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/director/playback') {
    try {
      const body = await readJsonBody(req);
      const playback = await bridgeStore.updatePlayback({
        sequenceId: body.sequenceId,
        status: body.status,
        currentStepIndex: body.currentStepIndex,
        currentGestureId: body.currentGestureId,
      });

      sendJson(res, 200, {
        ok: true,
        playback,
      });
    } catch (error) {
      console.error('Failed to update pose-studio playback', error);
      sendError(res, 400, error.code || 'DIRECTOR_PLAYBACK_ERROR', error.message, error.data);
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/director/stop') {
    try {
      const body = await readJsonBody(req);
      const playback = await bridgeStore.stopSequence({
        sequenceId: body.sequenceId,
      });

      sendJson(res, 200, {
        ok: true,
        playback,
      });
    } catch (error) {
      console.error('Failed to stop pose-studio director sequence', error);
      sendError(res, 400, error.code || 'DIRECTOR_STOP_ERROR', error.message, error.data);
    }
    return;
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    const assetPath = resolvePrefixedPath(url.pathname);
    if (assetPath) {
      await serveStatic(req, res, assetPath);
      return;
    }
  }

  sendText(res, 404, 'Not found');
});

server.on('error', (error) => {
  if (error?.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use on ${HOST}. Kill the process on that port and rerun.`);
    process.exit(1);
  }

  console.error('pose-studio failed to start', error);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`pose-studio listening at http://${HOST}:${PORT}`);
});
