import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BUNDLED_MODELS,
  DEFAULT_MODEL,
  GESTURES,
  getGesturePresets,
} from '../../packages/avatar-layer-browser/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HOST = '127.0.0.1';
const PORT = Number.parseInt(process.env.PORT || '4383', 10);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SRC_DIR = path.join(__dirname, 'src');
const NODE_MODULES_DIR = path.join(REPO_ROOT, 'node_modules');
const PACKAGES_DIR = path.join(REPO_ROOT, 'packages');
const AVATAR_LAYER_DIR = path.join(PACKAGES_DIR, 'avatar-layer-browser');
const MODELS_DIR = path.join(AVATAR_LAYER_DIR, 'models');
const ANIMATIONS_DIR = path.join(AVATAR_LAYER_DIR, 'animations');
const VOICE_LAYER_DIR = path.join(PACKAGES_DIR, 'voice-layer-browser');

const MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.vrma', 'model/gltf-binary'],
  ['.vrm', 'model/gltf-binary'],
]);

const STATIC_ROUTES = new Map([
  ['/', path.join(SRC_DIR, 'index.html')],
  ['/app.js', path.join(SRC_DIR, 'app.js')],
  ['/styles.css', path.join(SRC_DIR, 'styles.css')],
  ['/vendor/avatar-layer-browser.js', path.join(AVATAR_LAYER_DIR, 'index.js')],
  ['/vendor/animation-manifest.js', path.join(AVATAR_LAYER_DIR, 'animation-manifest.js')],
  ['/vendor/voice-layer-browser.js', path.join(VOICE_LAYER_DIR, 'index.js')],
]);

const PREFIX_ROUTES = [
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

async function serveStatic(res, filePath) {
  try {
    const body = await readFile(filePath);
    res.writeHead(200, {
      'cache-control': 'no-store',
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
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/runtime-config') {
    sendJson(res, 200, {
      ok: true,
      appName: 'avatar-puppet-lab',
      appMode: 'vrm-bust-up-probe',
      renderer: 'webgl-vrm-1.0',
      defaultModel: path.basename(DEFAULT_MODEL.path),
      bundledModels: BUNDLED_MODELS.map((model) => model.id),
      supportedFormats: ['vrm-1.0', 'vrm-0.x'],
      mouthPresets: ['rest', 'aa', 'ih', 'ou', 'ee', 'oh'],
      gestureIds: GESTURES.map((gesture) => gesture.id),
      gestureCatalog: GESTURES.map(serializeGesture),
      gestureIdsByModel: Object.fromEntries(
        BUNDLED_MODELS.map((model) => [model.id, getGesturePresets(model.id).map((gesture) => gesture.id)]),
      ),
      gestureCatalogByModel: Object.fromEntries(
        BUNDLED_MODELS.map((model) => [model.id, getGesturePresets(model.id).map(serializeGesture)]),
      ),
      stagePresets: ['neon-loft', 'sunset-studio', 'midnight-hangar'],
      port: PORT,
    });
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
  console.log(`avatar-puppet-lab server listening at http://${HOST}:${PORT}`);
});
