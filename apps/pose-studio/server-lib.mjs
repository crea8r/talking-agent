import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
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

export const DEFAULT_HOST = '127.0.0.1';
export const DEFAULT_PORT = Number.parseInt(process.env.PORT || '4387', 10);
export const DIRECTOR_REQUEST_TIMEOUT_MS = Number.parseInt(
  process.env.POSE_STUDIO_DIRECTOR_REQUEST_TIMEOUT_MS || '120000',
  10,
);

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

function createTypedError(code, message, data = undefined) {
  const error = new Error(message);
  error.code = code;
  if (typeof data !== 'undefined') {
    error.data = data;
  }
  return error;
}

function resolvePrefixedPath(urlPathname, prefixRoutes) {
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

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function buildDirectorCodexPrompt({ prompt, modelId }) {
  return [
    'You have access to an MCP server named pose-studio.',
    // 'Do not read or edit repository files.',
    // 'Do not run shell commands.',
    'First read pose://catalog.',
    `Target modelId: ${modelId}.`,
    // 'Choose a short sequence of valid catalog gestures that fits the request and stays within 60 seconds total.',
    'If you can build a valid sequence, call stage_pose_sequence exactly once with { modelId, prompt, steps }.',
    'If you cannot build a valid sequence, call report_pose_sequence_error exactly once with { modelId, prompt, message }.',
    // 'Use only gesture ids from the catalog.',
    'Do not explain your reasoning or print a plan.',
    'Do not reply with plain text to the user unless a tool requires it.',
    `User request: ${prompt}`,
  ].join('\n');
}

export function buildDirectorCodexExecArgs({
  repoRoot,
  stateFilePath,
  prompt,
  modelId,
  codexPrompt = buildDirectorCodexPrompt({ prompt, modelId }),
} = {}) {
  const poseStudioMcpServerPath = path.join(repoRoot, 'packages', 'pose-studio-bridge', 'mcp-server.mjs');
  const configOverrides = [
    ['mcp_servers.pose-studio.command', 'node'],
    ['mcp_servers.pose-studio.args', [poseStudioMcpServerPath]],
    ['mcp_servers.pose-studio.enabled', true],
    ['mcp_servers.pose-studio.env.POSE_STUDIO_BRIDGE_STATE_PATH', stateFilePath],
    ['mcp_servers.pose-studio.tools.get_pose_state.approval_mode', 'approve'],
    ['mcp_servers.pose-studio.tools.stage_pose_sequence.approval_mode', 'approve'],
    ['mcp_servers.pose-studio.tools.report_pose_sequence_error.approval_mode', 'approve'],
    ['mcp_servers.pose-studio.tools.stop_pose_sequence.approval_mode', 'approve'],
  ];

  const args = [
    'exec',
    '--json',
    '--ephemeral',
    '--skip-git-repo-check',
    '-s',
    'read-only',
    '-C',
    repoRoot,
  ];

  for (const [key, value] of configOverrides) {
    args.push('-c', `${key}=${JSON.stringify(value)}`);
  }

  args.push(codexPrompt);
  return args;
}

function createDefaultBridgeStore(repoRoot) {
  return createPoseStudioBridgeStore({
    stateFilePath: resolveDefaultPoseStudioBridgeStatePath({
      cwd: repoRoot,
      env: process.env,
    }),
  });
}

function createStaticRoutes({ srcDir, avatarLayerDir }) {
  return new Map([
    ['/', path.join(srcDir, 'index.html')],
    ['/app.js', path.join(srcDir, 'app.js')],
    ['/styles.css', path.join(srcDir, 'styles.css')],
    ['/vendor/avatar-layer-browser.js', path.join(avatarLayerDir, 'index.js')],
    ['/vendor/animation-manifest.js', path.join(avatarLayerDir, 'animation-manifest.js')],
  ]);
}

function createPrefixRoutes({ assetsDir, modelsDir, animationsDir, nodeModulesDir }) {
  return [
    {
      prefix: '/assets/',
      rootDir: assetsDir,
    },
    {
      prefix: '/models/',
      rootDir: modelsDir,
    },
    {
      prefix: '/animations/',
      rootDir: animationsDir,
    },
    {
      prefix: '/vendor/three/',
      rootDir: path.join(nodeModulesDir, 'three'),
    },
    {
      prefix: '/vendor/@pixiv/three-vrm/',
      rootDir: path.join(nodeModulesDir, '@pixiv', 'three-vrm', 'lib'),
    },
    {
      prefix: '/vendor/@pixiv/three-vrm-animation/',
      rootDir: path.join(nodeModulesDir, '@pixiv', 'three-vrm-animation', 'lib'),
    },
  ];
}

async function validateDirectorRequest(body, bridgeStore) {
  const prompt = normalizeString(body?.prompt);
  const modelId = normalizeString(body?.modelId);

  if (!prompt) {
    throw createTypedError('DIRECTOR_REQUEST_INVALID', 'Prompt is required.');
  }

  if (!modelId) {
    throw createTypedError('DIRECTOR_REQUEST_INVALID', 'Model id is required.');
  }

  const catalog = await bridgeStore.getCatalog();
  const knownModelIds = new Set((catalog.models || []).map((model) => model.id));

  if (!knownModelIds.has(modelId)) {
    throw createTypedError('DIRECTOR_REQUEST_INVALID', `Unknown model id: ${modelId}.`);
  }
  console.log('prompt: ', prompt)
  return { prompt, modelId };
}

function forwardChildOutput(stream, prefix, { onLine } = {}) {
  if (!stream?.on) {
    return;
  }

  stream.on('data', (chunk) => {
    const text = chunk.toString('utf8');
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) {
        continue;
      }
      console.log(`${prefix} ${line}`);
      onLine?.(line);
    }
  });
}

function serializeActiveDirectorRequest(activeDirectorRequest) {
  if (!activeDirectorRequest) {
    return {
      active: false,
    };
  }

  return {
    active: true,
    requestId: activeDirectorRequest.id,
    modelId: activeDirectorRequest.modelId,
    prompt: activeDirectorRequest.prompt,
    startedAt: new Date(activeDirectorRequest.startedAt).toISOString(),
  };
}

export function createPoseStudioRequestHandler({
  host = DEFAULT_HOST,
  port = DEFAULT_PORT,
  repoRoot = path.resolve(__dirname, '..', '..'),
  srcDir = path.join(__dirname, 'src'),
  assetsDir = path.join(srcDir, 'assets'),
  nodeModulesDir = path.join(repoRoot, 'node_modules'),
  avatarLayerDir = path.join(repoRoot, 'packages', 'avatar-layer-browser'),
  modelsDir = path.join(avatarLayerDir, 'models'),
  animationsDir = path.join(avatarLayerDir, 'animations'),
  bridgeStore = createDefaultBridgeStore(repoRoot),
  spawnCodex = spawn,
  codexCommand = 'codex',
  directorRequestTimeoutMs = DIRECTOR_REQUEST_TIMEOUT_MS,
} = {}) {
  const staticRoutes = createStaticRoutes({ srcDir, avatarLayerDir });
  const prefixRoutes = createPrefixRoutes({
    assetsDir,
    modelsDir,
    animationsDir,
    nodeModulesDir,
  });

  let activeDirectorRequest = null;
  let lastDirectorRequestResult = {
    requestId: '',
    active: false,
    errorText: '',
  };

  function clearActiveDirectorRequest(runId) {
    if (activeDirectorRequest?.id !== runId) {
      return;
    }

    if (activeDirectorRequest.timeoutId) {
      clearTimeout(activeDirectorRequest.timeoutId);
    }
    activeDirectorRequest = null;
  }

  async function launchDirectorRequest({ prompt, modelId }) {
    if (activeDirectorRequest) {
      throw createTypedError(
        'DIRECTOR_REQUEST_ACTIVE',
        'A local Codex director request is already running.',
        {
          request: serializeActiveDirectorRequest(activeDirectorRequest),
        },
      );
    }

    const initialState = await bridgeStore.getState();
    const startRevision = Number(initialState?.director?.revision || 0);

    const args = buildDirectorCodexExecArgs({
      repoRoot,
      stateFilePath: bridgeStore.stateFilePath,
      prompt,
      modelId,
    });
    const child = spawnCodex(codexCommand, args, {
      cwd: repoRoot,
      env: {
        ...process.env,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    child.stdin?.end();

    const runId = randomUUID();
    const startedAt = Date.now();
    const timeoutId = setTimeout(() => {
      if (activeDirectorRequest?.id !== runId) {
        return;
      }

      console.error(`[pose-studio director] codex exec timed out after ${directorRequestTimeoutMs}ms`);
      child.kill('SIGTERM');
      setTimeout(() => {
        if (activeDirectorRequest?.id === runId) {
          child.kill('SIGKILL');
        }
      }, 1_500).unref?.();
    }, directorRequestTimeoutMs);

    activeDirectorRequest = {
      id: runId,
      child,
      prompt,
      modelId,
      startedAt,
      startRevision,
      timeoutId,
    };
    lastDirectorRequestResult = {
      requestId: runId,
      active: true,
      errorText: '',
    };

    console.log('[pose-studio director] accepted local Codex request', {
      runId,
      modelId,
      prompt,
    });

    forwardChildOutput(child.stdout, '[pose-studio director stdout]');
    forwardChildOutput(child.stderr, '[pose-studio director stderr]');

    child.once('error', (error) => {
      console.error('[pose-studio director] codex exec failed to start', error);
      lastDirectorRequestResult = {
        requestId: runId,
        active: false,
        errorText: 'Failed to start the local Codex request.',
      };
      clearActiveDirectorRequest(runId);
    });

    child.once('exit', async (code, signal) => {
      console.log(`[pose-studio director] codex exec finished`, { code, signal, runId });

      const completedRequest = activeDirectorRequest?.id === runId
        ? { ...activeDirectorRequest }
        : {
            id: runId,
            prompt,
            modelId,
            startedAt,
            startRevision: 0,
          };

      try {
        const state = await bridgeStore.getState();
        const activeSequence = state?.director?.activeSequence || null;
        const lastSequence = state?.director?.lastSequence || null;
        const lastError = state?.director?.lastError || null;
        const startRevision = Number(completedRequest.startRevision || 0);

        const matchedSequence = [activeSequence, lastSequence].find((sequence) =>
          sequence &&
          Number(sequence.revision || 0) > startRevision &&
          sequence.prompt === completedRequest.prompt &&
          sequence.modelId === completedRequest.modelId,
        );
        const matchedError =
          lastError &&
          Number(lastError.revision || 0) > startRevision &&
          lastError.prompt === completedRequest.prompt &&
          lastError.modelId === completedRequest.modelId
            ? lastError
            : null;

        if (matchedSequence) {
          lastDirectorRequestResult = {
            requestId: runId,
            active: false,
            errorText: '',
          };
        } else if (matchedError) {
          lastDirectorRequestResult = {
            requestId: runId,
            active: false,
            errorText: normalizeString(matchedError.message),
          };
        } else {
          lastDirectorRequestResult = {
            requestId: runId,
            active: false,
            errorText:
              signal === 'SIGTERM'
                ? 'Local Codex timed out before staging a sequence.'
                : 'Local Codex finished without staging a sequence.',
          };
        }
      } catch (error) {
        console.warn('[pose-studio director] failed to inspect director result', error);
        lastDirectorRequestResult = {
          requestId: runId,
          active: false,
          errorText: 'Local Codex finished, but pose-studio could not verify the staged sequence.',
        };
      } finally {
        clearActiveDirectorRequest(runId);
      }
    });

    return {
      requestId: runId,
      startedAt: new Date(activeDirectorRequest.startedAt).toISOString(),
    };
  }

  return async (req, res) => {
    const url = new URL(req.url || '/', `http://${host}:${port}`);

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
          request: activeDirectorRequest
            ? serializeActiveDirectorRequest(activeDirectorRequest)
            : lastDirectorRequestResult,
        });
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
        const launch = await launchDirectorRequest({ prompt, modelId });

        sendJson(res, 202, {
          ok: true,
          requestId: launch.requestId,
          status: 'accepted',
          modelId,
          request: serializeActiveDirectorRequest(activeDirectorRequest),
        });
      } catch (error) {
        if (error?.code === 'DIRECTOR_REQUEST_ACTIVE') {
          sendError(res, 409, error.code, error.message, error.data);
          return;
        }

        if (error?.code === 'DIRECTOR_REQUEST_INVALID') {
          sendError(res, 400, error.code, error.message, error.data);
          return;
        }

        console.error('Failed to start pose-studio director request', error);
        sendError(res, 500, error.code || 'DIRECTOR_REQUEST_ERROR', error.message, error.data);
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
      const assetPath = resolvePrefixedPath(url.pathname, prefixRoutes);
      if (assetPath) {
        await serveStatic(req, res, assetPath);
        return;
      }
    }

    sendText(res, 404, 'Not found');
  };
}

export function createPoseStudioServer(options = {}) {
  return createServer(createPoseStudioRequestHandler(options));
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
