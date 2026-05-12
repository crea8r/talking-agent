import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SRC_DIR = path.join(__dirname, 'src');
const NODE_MODULES_DIR = path.join(REPO_ROOT, 'node_modules');
const PACKAGES_DIR = path.join(REPO_ROOT, 'packages');
const AVATAR_LAYER_DIR = path.join(PACKAGES_DIR, 'avatar-layer-browser');
const VRMA_CORE_DIR = path.join(PACKAGES_DIR, 'vrma-core');
const MODELS_DIR = path.join(AVATAR_LAYER_DIR, 'models');
const ANIMATIONS_DIR = path.join(AVATAR_LAYER_DIR, 'animations');

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
  ['/vendor/vrma-core.js', path.join(VRMA_CORE_DIR, 'index.mjs')],
]);

const PREFIX_ROUTES = [
  { prefix: '/lib/', rootDir: path.join(SRC_DIR, 'lib') },
  { prefix: '/vendor/avatar-layer-browser/', rootDir: AVATAR_LAYER_DIR },
  { prefix: '/models/', rootDir: MODELS_DIR },
  { prefix: '/animations/', rootDir: ANIMATIONS_DIR },
  { prefix: '/vendor/three/', rootDir: path.join(NODE_MODULES_DIR, 'three') },
  { prefix: '/vendor/@pixiv/three-vrm/', rootDir: path.join(NODE_MODULES_DIR, '@pixiv', 'three-vrm', 'lib') },
  {
    prefix: '/vendor/@pixiv/three-vrm-animation/',
    rootDir: path.join(NODE_MODULES_DIR, '@pixiv', 'three-vrm-animation', 'lib'),
  },
];

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
    res.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': MIME_TYPES.get(path.extname(filePath)) || 'application/octet-stream',
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

export function createVrmaStudioServer({
  host = '127.0.0.1',
  port = Number.parseInt(process.env.PORT || '4384', 10),
} = {}) {
  return createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${host}:${port}`);

    if ((req.method === 'GET' || req.method === 'HEAD') && STATIC_ROUTES.has(url.pathname)) {
      await serveStatic(req, res, STATIC_ROUTES.get(url.pathname));
      return;
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      const prefixedPath = resolvePrefixedPath(url.pathname);

      if (prefixedPath === null) {
        sendText(res, 400, 'Bad request');
        return;
      }

      if (prefixedPath) {
        await serveStatic(req, res, prefixedPath);
        return;
      }
    }

    if (req.method === 'GET' && url.pathname === '/healthz') {
      res.writeHead(200, {
        'cache-control': 'no-store',
        'content-type': 'application/json; charset=utf-8',
      });
      res.end(JSON.stringify({ ok: true, host, port }));
      return;
    }

    sendText(res, 404, 'Not found');
  });
}

export function startVrmaStudioServer({
  host = '127.0.0.1',
  port = Number.parseInt(process.env.PORT || '4384', 10),
} = {}) {
  const server = createVrmaStudioServer({ host, port });

  server.on('error', (error) => {
    if (error?.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use on ${host}.`);
      process.exit(1);
    }

    console.error('Server failed to start', error);
    process.exit(1);
  });

  server.listen(port, host, () => {
    console.log(`vrma-studio server listening at http://${host}:${port}`);
  });

  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  startVrmaStudioServer();
}
