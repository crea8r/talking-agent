import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createPoseStudioMcpHttpHandler } from '../../../packages/pose-studio-bridge/mcp-http.mjs';

import {
  buildPoseStudioMcpUrl,
  DEFAULT_HOST,
  DEFAULT_MCP_PATH,
  DEFAULT_PORT,
  createDefaultBridgeStore,
} from './config.mjs';
import { createDirectorController, validateDirectorRequest } from './director-controller.mjs';
import { readJsonBody, sendError, sendJson, sendText } from './http-utils.mjs';
import { createPrefixRoutes, createStaticRoutes, resolvePrefixedPath, serveStatic } from './static-assets.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createPoseStudioRequestHandler({
  host = DEFAULT_HOST,
  port = DEFAULT_PORT,
  repoRoot = path.resolve(__dirname, '..', '..', '..'),
  srcDir = path.join(__dirname, '..', 'src'),
  assetsDir = path.join(srcDir, 'assets'),
  nodeModulesDir = path.join(repoRoot, 'node_modules'),
  avatarLayerDir = path.join(repoRoot, 'packages', 'avatar-layer-browser'),
  modelsDir = path.join(avatarLayerDir, 'models'),
  animationsDir = path.join(avatarLayerDir, 'animations'),
  bridgeStore = createDefaultBridgeStore(repoRoot),
  mcpPathname = DEFAULT_MCP_PATH,
  ...directorOptions
} = {}) {
  const staticRoutes = createStaticRoutes({ srcDir, avatarLayerDir });
  const prefixRoutes = createPrefixRoutes({ assetsDir, modelsDir, animationsDir, nodeModulesDir });
  const directorMcpUrl = directorOptions.directorMcpUrl || buildPoseStudioMcpUrl({
    host,
    port,
    pathname: mcpPathname,
  });
  const director = createDirectorController({ bridgeStore, directorMcpUrl, ...directorOptions });
  const mcpHandler = createPoseStudioMcpHttpHandler({
    store: bridgeStore,
    pathname: mcpPathname,
    surface: 'director',
  });

  const handler = async (req, res) => {
    const url = new URL(req.url || '/', `http://${host}:${port}`);
    if ((req.method === 'POST' || req.method === 'GET' || req.method === 'DELETE')
      && await mcpHandler.handle(req, res, url.pathname)) {
      return;
    }
    if ((req.method === 'GET' || req.method === 'HEAD') && staticRoutes.has(url.pathname)) {
      await serveStatic(req, res, staticRoutes.get(url.pathname));
      return;
    }
    if ((req.method === 'GET' || req.method === 'HEAD') && url.pathname === '/healthz') {
      sendJson(res, 200, {
        ok: true,
        app: 'pose-studio',
        host,
        port,
        mcpUrl: directorMcpUrl,
        bridgeStatePath: bridgeStore.stateFilePath,
      });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/director/state') {
      try {
        sendJson(res, 200, { ok: true, state: await bridgeStore.getState(), request: director.getRequestState() });
      } catch (error) {
        console.error('Failed to read pose-studio director state', error);
        sendError(res, 500, error.code || 'DIRECTOR_STATE_ERROR', error.message);
      }
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/director/request') {
      try {
        const body = await readJsonBody(req);
        const { prompt, modelId } = await validateDirectorRequest(body, bridgeStore);
        const launch = await director.launchDirectorRequest({ prompt, modelId });
        sendJson(res, 202, { ok: true, requestId: launch.requestId, status: 'accepted', modelId, request: director.getRequestState() });
      } catch (error) {
        const statusCode = error?.code === 'DIRECTOR_REQUEST_ACTIVE' ? 409 : error?.code === 'DIRECTOR_REQUEST_INVALID' ? 400 : 500;
        if (statusCode === 500) console.error('Failed to start pose-studio director request', error);
        sendError(res, statusCode, error.code || 'DIRECTOR_REQUEST_ERROR', error.message, error.data);
      }
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/director/runtime') {
      await handleDirectorWrite(req, res, bridgeStore.syncRuntime.bind(bridgeStore), 'runtime', ['modelId', 'modelLabel', 'availableGestures']);
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/director/playback') {
      await handleDirectorWrite(req, res, bridgeStore.updatePlayback.bind(bridgeStore), 'playback', ['sequenceId', 'status', 'currentStepIndex', 'currentGestureId']);
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/director/stop') {
      await handleDirectorWrite(req, res, bridgeStore.stopSequence.bind(bridgeStore), 'stop', ['sequenceId']);
      return;
    }
    if (req.method === 'GET' || req.method === 'HEAD') {
      const assetPath = resolvePrefixedPath(url.pathname, prefixRoutes);
      if (assetPath) {
        await serveStatic(req, res, assetPath);
        return;
      }
    }
    sendText(res, 404, 'Not found');
  };
  handler.close = () => mcpHandler.close();
  return handler;
}

async function handleDirectorWrite(req, res, writer, kind, keys) {
  try {
    const body = await readJsonBody(req);
    const payload = Object.fromEntries(keys.map((key) => [key, body[key]]));
    const result = await writer(payload);
    sendJson(res, 200, { ok: true, [kind === 'runtime' ? 'runtime' : 'playback']: result });
  } catch (error) {
    console.error(`Failed to ${kind === 'runtime' ? 'sync pose-studio runtime' : kind === 'playback' ? 'update pose-studio playback' : 'stop pose-studio director sequence'}`, error);
    sendError(res, 400, error.code || `DIRECTOR_${kind.toUpperCase()}_ERROR`, error.message, error.data);
  }
}

export function createPoseStudioServer(options = {}) {
  const handler = createPoseStudioRequestHandler(options);
  const server = createServer(handler);
  server.on('close', () => {
    handler.close?.();
  });
  return server;
}

export function startPoseStudioServer(options = {}) {
  const server = createPoseStudioServer(options);
  const host = options.host || DEFAULT_HOST;
  const port = options.port ?? DEFAULT_PORT;
  server.on('error', (error) => {
    if (error?.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use on ${host}. Kill the process on that port and rerun.`);
      process.exit(1);
    }
    console.error('pose-studio failed to start', error);
    process.exit(1);
  });
  server.listen(port, host, () => {
    console.log(`pose-studio listening at http://${host}:${port}`);
  });
  return server;
}
