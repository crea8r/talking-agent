import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import {
  BUNDLED_MODELS,
  DEFAULT_MODEL,
  EMOTES,
  GESTURES,
  STAGES,
  getGesturePresets,
} from '../../packages/avatar-layer-browser/index.js';
import {
  createForkedCallExecutor,
  createIsolatedCodexExecutor,
  listAvailablePlugins,
  resolveDefaultSourceCodexHome,
} from '../../packages/codex-exec/index.mjs';
import { createCallRecordStore } from '../../packages/call-record-store/index.mjs';
import { createCallLinkService } from '../../packages/call-link/index.mjs';
import { createCallLinkMcpHttpHandler } from '../../packages/call-link/mcp-http.mjs';
import { createAgentSelf } from '../../packages/agent-self/index.mjs';
import { createProductionVoiceClient } from '../../packages/production-voice/client.mjs';
import { createProductionVoiceProfileStore } from '../../packages/production-voice/profile-store.mjs';
import { createWorkspaceSetupStore } from '../../packages/workspace-setup-store/index.mjs';

import { createDirectCodexAgent } from './lib/server/direct-codex-agent.mjs';
import { createDirectSessionRuntime } from './lib/server/direct-session-runtime.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HOST = '127.0.0.1';
const PORT = Number.parseInt(process.env.PORT || '4384', 10);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CODEX_PROJECT_NAME = path.basename(REPO_ROOT);
const SRC_DIR = path.join(__dirname, 'src');
const NODE_MODULES_DIR = path.join(REPO_ROOT, 'node_modules');
const PACKAGES_DIR = path.join(REPO_ROOT, 'packages');
const MODELS_DIR = path.join(PACKAGES_DIR, 'avatar-layer-browser', 'models');
const ANIMATIONS_DIR = path.join(PACKAGES_DIR, 'avatar-layer-browser', 'animations');
const VOICE_LAYER_DIR = path.join(PACKAGES_DIR, 'voice-layer-browser');
const AVATAR_LAYER_DIR = path.join(PACKAGES_DIR, 'avatar-layer-browser');
const AVATAR_SPEECH_DIR = path.join(PACKAGES_DIR, 'avatar-speech-browser');
const PRODUCTION_VOICE_DIR = path.join(PACKAGES_DIR, 'production-voice');
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
const PRODUCTION_VOICE_STATE_DIR = path.join(
  REPO_ROOT,
  'output',
  'one-to-one-agent-room-production-voice',
);
const WORKSPACE_SETUP_STATE_DIR = path.join(
  REPO_ROOT,
  'output',
  'one-to-one-agent-room-setup',
);
const CALL_RECORD_STATE_DIR = path.join(
  REPO_ROOT,
  'output',
  'one-to-one-agent-room-calls',
);
const AGENT_SELF_STATE_DIR = path.join(
  REPO_ROOT,
  'output',
  'agent-self',
);
const CODEX_SESSION_ROOT = path.join(
  REPO_ROOT,
  'output',
  'one-to-one-agent-room-codex',
);
const DEFAULT_PRODUCTION_VOICE_BASE_URL = 'http://127.0.0.1:50003';
const PRODUCTION_VOICE_BASE_URL =
  process.env.ONE_TO_ONE_AGENT_ROOM_PRODUCTION_VOICE_BASE_URL ||
  process.env.VOICE_CAST_PRODUCTION_BASE_URL ||
  DEFAULT_PRODUCTION_VOICE_BASE_URL;
const PRODUCTION_VOICE_DEFAULT_SPEAKER_ID =
  process.env.ONE_TO_ONE_AGENT_ROOM_PRODUCTION_VOICE_SPEAKER_ID || 'EN-US';
const CODEX_COMMAND = process.env.ONE_TO_ONE_AGENT_ROOM_CODEX_COMMAND || 'codex';
const CODEX_SOURCE_HOME =
  process.env.ONE_TO_ONE_AGENT_ROOM_SOURCE_CODEX_HOME ||
  resolveDefaultSourceCodexHome();
const CODEX_MODEL = process.env.ONE_TO_ONE_AGENT_ROOM_CODEX_MODEL || 'gpt-5.4';
const CODEX_REASONING_EFFORT =
  process.env.ONE_TO_ONE_AGENT_ROOM_CODEX_REASONING_EFFORT || 'low';
const CODEX_TIMEOUT_MS = Number.parseInt(
  process.env.ONE_TO_ONE_AGENT_ROOM_CODEX_TIMEOUT_MS || '600000',
  10,
);
const SOFT_TURN_TIMEOUT_MS = Number.parseInt(
  process.env.ONE_TO_ONE_AGENT_ROOM_SOFT_TURN_TIMEOUT_MS || '30000',
  10,
);

const MODELS_BY_ID = new Map(BUNDLED_MODELS.map((model) => [model.id, model]));
const GESTURE_CATALOG_BY_MODEL = Object.fromEntries(
  BUNDLED_MODELS.map((model) => [model.id, getGesturePresets(model.id)]),
);

const productionVoiceClient = createProductionVoiceClient({
  baseUrl: PRODUCTION_VOICE_BASE_URL,
  baseUrlEnvVarName: 'ONE_TO_ONE_AGENT_ROOM_PRODUCTION_VOICE_BASE_URL',
});
const productionVoiceProfileStore = createProductionVoiceProfileStore({
  rootDir: PRODUCTION_VOICE_STATE_DIR,
});
const workspaceSetupStore = createWorkspaceSetupStore({
  rootDir: WORKSPACE_SETUP_STATE_DIR,
});
const callRecordStore = createCallRecordStore({
  rootDir: CALL_RECORD_STATE_DIR,
});
const agentSelf = createAgentSelf({
  rootDir: AGENT_SELF_STATE_DIR,
  appId: 'one-to-one-agent-room',
});
const isolatedCodexExecutor = createIsolatedCodexExecutor({
  rootDir: CODEX_SESSION_ROOT,
  sourceCodexHome: CODEX_SOURCE_HOME,
  codexCommand: CODEX_COMMAND,
  model: CODEX_MODEL,
  reasoningEffort: CODEX_REASONING_EFFORT,
  timeoutMs: Number.isFinite(CODEX_TIMEOUT_MS) ? CODEX_TIMEOUT_MS : 600_000,
});
const forkedCallExecutor = createForkedCallExecutor({
  rootDir: CODEX_SESSION_ROOT,
  sourceCodexHome: CODEX_SOURCE_HOME,
  codexCommand: CODEX_COMMAND,
  timeoutMs: Number.isFinite(CODEX_TIMEOUT_MS) ? CODEX_TIMEOUT_MS : 600_000,
});
const directCodexAgent = createDirectCodexAgent({
  executor: isolatedCodexExecutor,
  linkedCallExecutor: {
    startCallPrompt: forkedCallExecutor.startCallPrompt,
    runCallPrompt: forkedCallExecutor.runCallPrompt,
    writeBackSummary: forkedCallExecutor.writeBackSummary,
    destroyCallSession: forkedCallExecutor.destroyCallSession,
  },
});
const callLinkService = createCallLinkService({
  appBaseUrl: `http://${HOST}:${PORT}`,
  sourceCodexHome: CODEX_SOURCE_HOME,
  callRecordStore,
  workspaceSetupStore,
  productionVoiceProfileStore,
  forkedCallExecutor,
});
const callLinkMcpHandler = createCallLinkMcpHttpHandler({
  service: callLinkService,
  pathname: '/mcp',
});
const sessionRuntime = createDirectSessionRuntime({
  agentRunner: directCodexAgent,
  callRecordStore,
  modelsById: MODELS_BY_ID,
  gestureCatalogByModel: GESTURE_CATALOG_BY_MODEL,
  defaultModelId: DEFAULT_MODEL.id,
  projectTitle: CODEX_PROJECT_NAME,
});

function getSessionCapabilityPolicy(session = {}) {
  const policy = session?.metadata?.agentSetup?.codexCapabilityPolicy;
  return {
    enabledPluginIds: Array.isArray(policy?.enabledPluginIds) ? policy.enabledPluginIds : [],
    enableControlComputer: policy?.enableControlComputer === true,
    enableComplexTasks: policy?.enableComplexTasks === true,
  };
}

async function syncSessionCodexHomeCapabilities(session = {}) {
  if (!session?.id) {
    return;
  }

  const capabilityPolicy = getSessionCapabilityPolicy(session);
  const launch = session?.metadata?.launch || {};
  if (`${launch.mode || ''}`.trim() === 'linked-call' && `${launch.launchId || ''}`.trim()) {
    await forkedCallExecutor.syncLaunchCapabilities({
      launchId: launch.launchId,
      capabilityPolicy,
    });
    return;
  }

  await isolatedCodexExecutor.syncSessionCapabilities({
    sessionId: session.id,
    capabilityPolicy,
  });
}

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
    prefix: '/vendor/voice-layer-browser/',
    rootDir: VOICE_LAYER_DIR,
  },
  {
    prefix: '/vendor/production-voice/',
    rootDir: PRODUCTION_VOICE_DIR,
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

async function persistSessionPayload(payload) {
  const sessionId = `${payload?.session?.id || ''}`.trim();
  if (!sessionId) {
    return;
  }

  const sessionDir = path.join(CODEX_SESSION_ROOT, sessionId);
  await mkdir(sessionDir, { recursive: true });
  await writeFile(
    path.join(sessionDir, 'session-report.json'),
    JSON.stringify(payload, null, 2),
    'utf8',
  );
}

async function persistCurrentSessionSnapshot(sessionId) {
  const payload = await sessionRuntime.getSession(sessionId);
  await persistSessionPayload(payload);
  return payload;
}

async function raceTurnAgainstSoftTimeout(turnPromise, timeoutMs) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return {
      kind: 'reply',
      payload: await turnPromise,
    };
  }

  let timeoutId = 0;
  try {
    return await Promise.race([
      turnPromise.then((payload) => ({
        kind: 'reply',
        payload,
      })),
      new Promise((resolve) => {
        timeoutId = setTimeout(() => {
          resolve({ kind: 'soft-timeout' });
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
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

async function readFormDataBody(req, url) {
  const request = new Request(url, {
    method: req.method,
    headers: req.headers,
    body: Readable.toWeb(req),
    duplex: 'half',
  });

  return request.formData();
}

function pickDefaultProductionSpeaker(speakers = []) {
  const configured = `${PRODUCTION_VOICE_DEFAULT_SPEAKER_ID || ''}`.trim();
  if (configured && speakers.includes(configured)) {
    return configured;
  }

  if (speakers.includes('EN-US')) {
    return 'EN-US';
  }

  if (speakers.length > 0) {
    return speakers[0];
  }

  return configured;
}

async function buildProductionVoiceState() {
  return buildProductionVoiceStateForScope({});
}

function resolveVoiceScopeKey(url) {
  return `${url.searchParams.get('scope') || ''}`.trim();
}

async function buildWorkspaceSetupState({ scopeKey = '' } = {}) {
  return {
    ok: true,
    setup: await workspaceSetupStore.loadSetup({ scopeKey }),
  };
}

async function buildLaunchState({ launchId = '' } = {}) {
  const record = await callRecordStore.loadRecord({ launchId });
  if (!record) {
    return null;
  }

  return {
    ok: true,
    launch: {
      launchId: `${record.launchId || ''}`.trim(),
      originalSessionId: `${record.originalSessionId || ''}`.trim(),
      callSessionId: `${record.callSessionId || ''}`.trim(),
      workspaceRoot: `${record.workspaceRoot || ''}`.trim(),
      workspaceKey: `${record.scopeKey || ''}`.trim(),
      displayTitle: `${record.displayTitle || ''}`.trim(),
      callStatus: `${record.status || ''}`.trim(),
      endedSummary: `${record.summary || ''}`.trim(),
      linkedSessionId: `${record.originalSessionId || ''}`.trim(),
    },
  };
}

async function buildProductionVoiceStateForScope({ scopeKey = '' } = {}) {
  const profile = await productionVoiceProfileStore.getProfileSummary({ scopeKey });

  try {
    const health = await productionVoiceClient.checkHealth();
    const speakers = await productionVoiceClient.listSpeakers().catch(() => []);
    const defaultSpeakerId = pickDefaultProductionSpeaker(speakers);

    return {
      ok: true,
      backend: {
        configured: true,
        running: true,
        app: `${health?.app || 'production-voice'}`.trim(),
        detail: '',
        speakers,
        defaultSpeakerId,
        defaultSpeakerLabel: defaultSpeakerId || '',
      },
      profile,
    };
  } catch (error) {
    const speakers = [];
    const defaultSpeakerId = pickDefaultProductionSpeaker(speakers);

    return {
      ok: true,
      backend: {
        configured: true,
        running: false,
        app: 'production-voice',
        detail: error instanceof Error ? error.message : 'Production voice health check failed.',
        speakers,
        defaultSpeakerId,
        defaultSpeakerLabel: defaultSpeakerId || '',
      },
      profile,
    };
  }
}

async function buildCodexState() {
  try {
    const health = await directCodexAgent.checkHealth();
    return {
      ok: true,
      backend: {
        configured: true,
        running: true,
        app: `${health?.app || 'codex-exec'}`.trim(),
        detail: `${health?.detail || ''}`.trim(),
        model: CODEX_MODEL,
        reasoningEffort: CODEX_REASONING_EFFORT,
        sessionRoot: CODEX_SESSION_ROOT,
        command: CODEX_COMMAND,
      },
    };
  } catch (error) {
    return {
      ok: true,
      backend: {
        configured: true,
        running: false,
        app: 'codex-exec',
        detail: error instanceof Error ? error.message : 'Unable to verify codex exec.',
        model: CODEX_MODEL,
        reasoningEffort: CODEX_REASONING_EFFORT,
        sessionRoot: CODEX_SESSION_ROOT,
        command: CODEX_COMMAND,
      },
    };
  }
}

function isWavFile(file) {
  const type = `${file?.type || ''}`.toLowerCase();
  const name = `${file?.name || ''}`.toLowerCase();
  return type.includes('wav') || name.endsWith('.wav');
}

function serializeGesture(gesture) {
  return {
    id: gesture.id,
    file: gesture.file || `${gesture.id}.vrma`,
    description: gesture.description || gesture.note,
    bestFor: gesture.bestFor || [],
    intent: gesture.intent,
  };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);

  if (await callLinkMcpHandler.handle(req, res, url.pathname)) {
    return;
  }

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
      codexSessionRoot: CODEX_SESSION_ROOT,
      productionVoiceStateDir: PRODUCTION_VOICE_STATE_DIR,
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/runtime-config') {
    sendJson(res, 200, {
      ok: true,
      appName: 'one-to-one-agent-room',
      appMode: 'app4-direct-codex-session',
      codexProjectName: CODEX_PROJECT_NAME,
      codexProjectPath: REPO_ROOT,
      avatar: {
        defaultModelId: DEFAULT_MODEL.id,
        defaultModel: path.basename(DEFAULT_MODEL.path),
        bundledModels: BUNDLED_MODELS.map((model) => model.id),
        stageIds: STAGES.map((stage) => stage.id),
        emoteIds: EMOTES.map((emote) => emote.id),
        gestureIds: GESTURES.map((gesture) => gesture.id),
        gestureCatalog: GESTURES.map(serializeGesture),
        gestureIdsByModel: Object.fromEntries(
          BUNDLED_MODELS.map((model) => [
            model.id,
            getGesturePresets(model.id).map((gesture) => gesture.id),
          ]),
        ),
        gestureCatalogByModel: Object.fromEntries(
          BUNDLED_MODELS.map((model) => [
            model.id,
            getGesturePresets(model.id).map(serializeGesture),
          ]),
        ),
      },
      codex: {
        sessionRoot: CODEX_SESSION_ROOT,
        command: CODEX_COMMAND,
        model: CODEX_MODEL,
        reasoningEffort: CODEX_REASONING_EFFORT,
        sessionRoute: '/api/call/sessions',
        stateRoute: '/api/codex/state',
        pluginsRoute: '/api/codex/plugins',
        turnFields: ['spokenText', 'subtitle', 'mood', 'animationSequence'],
      },
      workspaceSetup: {
        route: '/api/workspace-setup',
      },
      agentSelf: {
        settingsRoute: '/api/agent-self/settings',
        reserveRoute: '/api/agent-self/reserve',
        turnCompleteRoute: '/api/agent-self/turn-complete',
        modes: ['standard', 'continuity'],
      },
      launch: {
        resolveRouteTemplate: '/api/launch/:launchId',
      },
      mcp: {
        route: '/mcp',
        url: `http://${HOST}:${PORT}/mcp`,
        toolNames: ['create_call_link'],
      },
      productionVoice: {
        baseUrl: PRODUCTION_VOICE_BASE_URL,
        required: true,
        inputAccept: '.wav,audio/wav',
        setupRoute: '/api/production-voice/profile',
        stateRoute: '/api/production-voice/state',
        synthesizeRoute: '/api/production-voice/synthesize',
        backendEnvVars: [
          'ONE_TO_ONE_AGENT_ROOM_PRODUCTION_VOICE_BASE_URL',
          'VOICE_CAST_PRODUCTION_BASE_URL',
        ],
      },
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/codex/state') {
    sendJson(res, 200, await buildCodexState());
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/codex/plugins') {
    const plugins = await listAvailablePlugins({ sourceCodexHome: CODEX_SOURCE_HOME });
    sendJson(res, 200, {
      ok: true,
      plugins: plugins.map((plugin) => ({
        id: plugin.id,
        name: plugin.name,
        marketplace: plugin.marketplace,
        version: plugin.version,
        displayName: plugin.displayName,
        description: plugin.description,
        enabled: plugin.enabled,
      })),
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/workspace-setup') {
    sendJson(res, 200, await buildWorkspaceSetupState({
      scopeKey: resolveVoiceScopeKey(url),
    }));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/agent-self/settings') {
    sendJson(res, 200, {
      ok: true,
      settings: await agentSelf.getSettings(),
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/agent-self/settings') {
    try {
      const body = await readJsonBody(req);
      sendJson(res, 200, {
        ok: true,
        settings: await agentSelf.updateSettings(body),
      });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : 'Unable to save agent self settings.',
      });
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/agent-self/reserve') {
    try {
      const body = await readJsonBody(req);
      const scopeKey = resolveVoiceScopeKey(url);
      sendJson(res, 200, {
        ok: true,
        packet: await agentSelf.prepareReserve({
          scopeKey,
          turnId: body.turnId,
          text: body.text,
        }),
      });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : 'Unable to prepare continuity reserve.',
      });
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/agent-self/turn-complete') {
    try {
      const body = await readJsonBody(req);
      const scopeKey = resolveVoiceScopeKey(url);
      sendJson(res, 200, {
        ok: true,
        state: await agentSelf.completeTurn({
          scopeKey,
          turnId: body.turnId,
          userText: body.userText,
          agentText: body.agentText,
        }),
      });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : 'Unable to update continuity state.',
      });
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/workspace-setup') {
    try {
      const body = await readJsonBody(req);
      const scopeKey = resolveVoiceScopeKey(url);
      const setup = await workspaceSetupStore.saveSetup({
        scopeKey,
        activeModelId: body.activeModelId,
        activeModelLabel: body.activeModelLabel,
        enabledPluginIds: body.enabledPluginIds,
        enableControlComputer: body.enableControlComputer,
        enableComplexTasks: body.enableComplexTasks,
      });
      sendJson(res, 200, {
        ok: true,
        setup,
      });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : 'Unable to save workspace setup.',
      });
    }
    return;
  }

  const launchMatch = url.pathname.match(/^\/api\/launch\/([^/]+)$/);
  if (req.method === 'GET' && launchMatch) {
    const payload = await buildLaunchState({
      launchId: decodeURIComponent(launchMatch[1]),
    });
    if (!payload) {
      sendJson(res, 404, {
        ok: false,
        error: 'Unknown launch.',
      });
      return;
    }

    sendJson(res, 200, payload);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/production-voice/state') {
    sendJson(res, 200, await buildProductionVoiceStateForScope({
      scopeKey: resolveVoiceScopeKey(url),
    }));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/production-voice/profile') {
    try {
      const scopeKey = resolveVoiceScopeKey(url);
      const statePayload = await buildProductionVoiceStateForScope({ scopeKey });
      const formData = await readFormDataBody(req, url.toString());
      const referenceWav = formData.get('referenceWav');

      if (!(referenceWav instanceof File)) {
        throw new Error('A WAV voice sample is required.');
      }

      if (!isWavFile(referenceWav)) {
        throw new Error('The production voice sample must be a WAV file.');
      }

      const speakerId =
        `${formData.get('meloBaseSpeakerId') || ''}`.trim() ||
        statePayload.backend.defaultSpeakerId;
      if (!speakerId) {
        throw new Error('No production voice base speaker is available.');
      }

      await productionVoiceProfileStore.saveProfile({
        scopeKey,
        referenceOriginalFileName: referenceWav.name,
        referenceMimeType: referenceWav.type || 'audio/wav',
        referenceBuffer: Buffer.from(await referenceWav.arrayBuffer()),
        meloBaseSpeakerId: speakerId,
        meloBaseSpeakerLabel:
          `${formData.get('meloBaseSpeakerLabel') || ''}`.trim() || speakerId,
      });

      sendJson(res, 200, await buildProductionVoiceStateForScope({ scopeKey }));
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : 'Unable to save production voice sample.',
      });
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/production-voice/synthesize') {
    try {
      const scopeKey = resolveVoiceScopeKey(url);
      const body = await readJsonBody(req);
      const text = `${body.text || ''}`.trim();
      if (!text) {
        throw new Error('Speech text is required.');
      }

      const profile = await productionVoiceProfileStore.loadProfile({ scopeKey });
      if (!profile) {
        throw new Error('Upload a production voice sample before starting the call.');
      }

      const result = await productionVoiceClient.synthesize({
        text,
        setup: {
          meloBaseSpeakerId: profile.meloBaseSpeakerId,
          referenceWavPath: profile.referenceStoredPath,
        },
      });

      sendJson(res, 200, {
        ok: true,
        ...result,
        profile: await productionVoiceProfileStore.getProfileSummary({ scopeKey }),
      });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : 'Unable to synthesize production voice audio.',
      });
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/call/sessions') {
    try {
      const body = await readJsonBody(req);
      const payload = await sessionRuntime.createSession(body);
      await persistSessionPayload(payload);
      sendJson(res, 200, payload);
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : 'Unable to create a call session.',
      });
    }
    return;
  }

  const sessionMatch = url.pathname.match(/^\/api\/call\/sessions\/([^/]+)$/);
  if (req.method === 'GET' && sessionMatch) {
    try {
      const payload = await sessionRuntime.getSession(decodeURIComponent(sessionMatch[1]));
      await persistSessionPayload(payload);
      sendJson(res, 200, payload);
    } catch (error) {
      sendJson(res, 404, {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown session.',
      });
    }
    return;
  }

  const setupMatch = url.pathname.match(/^\/api\/call\/sessions\/([^/]+)\/setup$/);
  if (req.method === 'POST' && setupMatch) {
    try {
      const body = await readJsonBody(req);
      const payload = await sessionRuntime.syncSetup({
        sessionId: decodeURIComponent(setupMatch[1]),
        metadata: body.metadata,
      });
      await syncSessionCodexHomeCapabilities(payload.session);
      await persistSessionPayload(payload);
      sendJson(res, 200, payload);
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : 'Unable to sync call setup.',
      });
    }
    return;
  }

  const stateMatch = url.pathname.match(/^\/api\/call\/sessions\/([^/]+)\/state$/);
  if (req.method === 'POST' && stateMatch) {
    try {
      const body = await readJsonBody(req);
      const payload = await sessionRuntime.setCallState({
        sessionId: decodeURIComponent(stateMatch[1]),
        state: body.state,
        reason: body.reason,
      });
      await persistSessionPayload(payload);
      sendJson(res, 200, payload);
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : 'Unable to update the call state.',
      });
    }
    return;
  }

  const endMatch = url.pathname.match(/^\/api\/call\/sessions\/([^/]+)\/end$/);
  if (req.method === 'POST' && endMatch) {
    try {
      const body = await readJsonBody(req);
      const payload = await sessionRuntime.endSession({
        sessionId: decodeURIComponent(endMatch[1]),
        reason: body.reason,
        skipAgentFinalize: body.skipAgentFinalize === true,
      });
      await persistSessionPayload(payload);
      sendJson(res, 200, payload);
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : 'Unable to finalize the call.',
      });
    }
    return;
  }

  const interruptMatch = url.pathname.match(/^\/api\/call\/sessions\/([^/]+)\/interrupt$/);
  if (req.method === 'POST' && interruptMatch) {
    try {
      const body = await readJsonBody(req);
      const payload = await sessionRuntime.interrupt({
        sessionId: decodeURIComponent(interruptMatch[1]),
        reason: body.reason,
      });
      await persistSessionPayload(payload);
      sendJson(res, 200, payload);
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : 'Unable to interrupt the active reply.',
      });
    }
    return;
  }

  const speculativeTurnMatch = url.pathname.match(
    /^\/api\/call\/sessions\/([^/]+)\/speculative-turns$/,
  );
  if (req.method === 'POST' && speculativeTurnMatch) {
    try {
      const body = await readJsonBody(req);
      const payload = await sessionRuntime.startSpeculativeHumanTurn({
        sessionId: decodeURIComponent(speculativeTurnMatch[1]),
        text: body.text,
        source: body.source,
      });
      await persistSessionPayload(payload);
      sendJson(res, 200, payload);
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        error: error instanceof Error ? error.message : 'Unable to process the speculative human turn.',
      });
    }
    return;
  }

  const turnMatch = url.pathname.match(/^\/api\/call\/sessions\/([^/]+)\/turns$/);
  if (req.method === 'POST' && turnMatch) {
    try {
      const body = await readJsonBody(req);
      const sessionId = decodeURIComponent(turnMatch[1]);
      const turnPromise = sessionRuntime.submitHumanTurn({
        sessionId,
        text: body.text,
        source: body.source,
        humanIdentity: body.humanIdentity,
        humanName: body.humanName,
      });
      void turnPromise.catch(() => {});
      const outcome = await raceTurnAgainstSoftTimeout(turnPromise, SOFT_TURN_TIMEOUT_MS);
      if (outcome.kind === 'reply') {
        await persistSessionPayload(outcome.payload);
        sendJson(res, 200, outcome.payload);
        return;
      }

      const deferredPayload = await sessionRuntime.deferActiveTurn({
        sessionId,
        reason: 'The agent is still working after the soft timeout window.',
      });
      if (deferredPayload.deferred !== true) {
        const finalPayload = await turnPromise;
        await persistSessionPayload(finalPayload);
        sendJson(res, 200, finalPayload);
        return;
      }

      await persistSessionPayload(deferredPayload);
      void turnPromise
        .then(async (payload) => {
          await persistSessionPayload(payload);
        })
        .catch(async (error) => {
          try {
            await persistCurrentSessionSnapshot(sessionId);
          } catch (snapshotError) {
            console.error('Failed to persist deferred turn snapshot.', {
              sessionId,
              error: snapshotError,
            });
          }
          console.error('Deferred Codex turn failed.', {
            sessionId,
            error,
          });
        });
      sendJson(res, 200, deferredPayload);
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        error: error instanceof Error ? error.message : 'Unable to process the human turn.',
      });
    }
    return;
  }

  const replyPlayedMatch = url.pathname.match(
    /^\/api\/call\/sessions\/([^/]+)\/turns\/([^/]+)\/played$/,
  );
  if (req.method === 'POST' && replyPlayedMatch) {
    try {
      const payload = await sessionRuntime.markReplyPlayed({
        sessionId: decodeURIComponent(replyPlayedMatch[1]),
        turnId: decodeURIComponent(replyPlayedMatch[2]),
      });
      await persistSessionPayload(payload);
      sendJson(res, 200, payload);
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : 'Unable to mark the reply as played.',
      });
    }
    return;
  }

  const playbackEventMatch = url.pathname.match(
    /^\/api\/call\/sessions\/([^/]+)\/playback-events$/,
  );
  if (req.method === 'POST' && playbackEventMatch) {
    try {
      const body = await readJsonBody(req);
      const payload = await sessionRuntime.recordPlaybackEvent({
        sessionId: decodeURIComponent(playbackEventMatch[1]),
        phase: body.phase,
        kind: body.kind,
        source: body.source,
        turnId: body.turnId,
        text: body.text,
        turnCompleted: body.turnCompleted,
      });
      await persistSessionPayload(payload);
      sendJson(res, 200, payload);
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : 'Unable to record playback event.',
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

server.on('close', () => {
  callLinkMcpHandler.close().catch(() => {});
});

server.listen(PORT, HOST, () => {
  console.log(`one-to-one-agent-room listening at http://${HOST}:${PORT}`);
});
