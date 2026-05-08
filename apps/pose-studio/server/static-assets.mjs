import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { sendText } from './http-utils.mjs';

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

export async function serveStatic(req, res, filePath) {
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

export function createStaticRoutes({ srcDir, avatarLayerDir }) {
  return new Map([
    ['/', path.join(srcDir, 'index.html')],
    ['/app.js', path.join(srcDir, 'app.js')],
    ['/styles.css', path.join(srcDir, 'styles.css')],
    ['/vendor/avatar-layer-browser.js', path.join(avatarLayerDir, 'index.js')],
    ['/vendor/animation-manifest.js', path.join(avatarLayerDir, 'animation-manifest.js')],
  ]);
}

export function createPrefixRoutes({ assetsDir, modelsDir, animationsDir, nodeModulesDir }) {
  return [
    { prefix: '/assets/', rootDir: assetsDir },
    { prefix: '/models/', rootDir: modelsDir },
    { prefix: '/animations/', rootDir: animationsDir },
    { prefix: '/vendor/three/', rootDir: path.join(nodeModulesDir, 'three') },
    { prefix: '/vendor/@pixiv/three-vrm/', rootDir: path.join(nodeModulesDir, '@pixiv', 'three-vrm', 'lib') },
    { prefix: '/vendor/@pixiv/three-vrm-animation/', rootDir: path.join(nodeModulesDir, '@pixiv', 'three-vrm-animation', 'lib') },
  ];
}

export function resolvePrefixedPath(urlPathname, prefixRoutes) {
  for (const route of prefixRoutes) {
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
