import { createServer } from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { performance } from 'node:perf_hooks';

const MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
]);

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
    },
  });
}

function textResponse(status, text) {
  return new Response(text, {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'text/plain; charset=utf-8',
    },
  });
}

function getErrorStatus(error) {
  const message = `${error?.message || ''}`.toLowerCase();
  if (message.includes('not configured')) {
    return 503;
  }
  if (
    message.includes('prompt transcript') ||
    message.includes('instruct text') ||
    message.includes('prompt wav') ||
    message.includes('transcript') ||
    message.includes('reference wav') ||
    message.includes('melo')
  ) {
    return 400;
  }
  return 500;
}

async function serveStaticFile(filePath) {
  try {
    const body = await readFile(filePath);
    return new Response(body, {
      status: 200,
      headers: {
        'cache-control': 'no-store',
        'content-type': MIME_TYPES.get(path.extname(filePath)) || 'application/octet-stream',
      },
    });
  } catch {
    return textResponse(404, 'Not found');
  }
}

function getStaticRoute(srcDir, pathname) {
  const staticRoutes = new Map([
    ['/', path.join(srcDir, 'index.html')],
    ['/app.js', path.join(srcDir, 'app.js')],
    ['/styles.css', path.join(srcDir, 'styles.css')],
  ]);

  if (staticRoutes.has(pathname)) {
    return staticRoutes.get(pathname);
  }

  if (pathname.startsWith('/lib/')) {
    const relativePath = pathname.slice('/lib/'.length);
    const rootDir = path.resolve(srcDir, 'lib');
    const candidate = path.resolve(rootDir, relativePath);
    const safeRoot = `${rootDir}${path.sep}`;
    if (candidate.startsWith(safeRoot)) {
      return candidate;
    }
  }

  return null;
}

function normalizeBoolean(value) {
  return `${value}`.toLowerCase() === 'true';
}

function normalizeString(value) {
  return `${value || ''}`.trim();
}

function sleep(milliseconds, sleepImpl) {
  if (typeof sleepImpl === 'function') {
    return sleepImpl(milliseconds);
  }
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function buildProductionReplyAudioUrl(replyAudioPath = '') {
  const fileName = path.basename(`${replyAudioPath || ''}`);
  return fileName ? `/api/production-test/replies/${encodeURIComponent(fileName)}` : '';
}

function toPublicTurn(turn = {}) {
  return {
    id: turn.id,
    createdAt: turn.createdAt,
    profileId: turn.profileId,
    userTranscript: turn.userTranscript,
    replyText: turn.replyText,
    generationTimeMs: turn.generationTimeMs,
    replyAudioMimeType: turn.replyAudioMimeType || 'audio/wav',
    replyAudioUrl: buildProductionReplyAudioUrl(turn.replyAudioPath),
    pipeline: turn.pipeline || 'browser-stt -> melotts -> openvoice-v2',
  };
}

export function createVoiceCastRequestHandler({
  srcDir,
  promptAssetStore,
  productionTestStore,
  ttsClient,
  runtimeConfig = {},
  pickProductionReply = null,
  sleepImpl = null,
} = {}) {
  if (!srcDir) {
    throw new Error('createVoiceCastRequestHandler requires srcDir.');
  }
  if (!promptAssetStore) {
    throw new Error('createVoiceCastRequestHandler requires promptAssetStore.');
  }
  if (!productionTestStore) {
    throw new Error('createVoiceCastRequestHandler requires productionTestStore.');
  }
  if (!ttsClient) {
    throw new Error('createVoiceCastRequestHandler requires ttsClient.');
  }

  return async function handleRequest(request) {
    const requestUrl = new URL(request.url);

    if (request.method === 'GET') {
      const staticFile = getStaticRoute(srcDir, requestUrl.pathname);
      if (staticFile) {
        return serveStaticFile(staticFile);
      }
    }

    try {
      if (request.method === 'GET' && requestUrl.pathname === '/healthz') {
        return jsonResponse(200, {
          ok: true,
          app: 'voice-cast',
        });
      }

      if (request.method === 'GET' && requestUrl.pathname === '/api/runtime-config') {
        return jsonResponse(200, {
          ok: true,
          appName: 'Voice Cast',
          appSlug: 'voice-cast',
          tabs: ['Text-Only Casting', 'Production Test'],
          models: {
            casting: ['CosyVoice-300M-Instruct'],
          },
          ...runtimeConfig,
        });
      }

      if (request.method === 'GET' && requestUrl.pathname === '/api/casting/speakers') {
        const speakers = await ttsClient.listTextOnlySpeakers();
        return jsonResponse(200, { ok: true, speakers });
      }

      if (request.method === 'POST' && requestUrl.pathname === '/api/casting/generate') {
        const payload = await request.json();
        const result = await ttsClient.generateTextOnly(payload);
        return jsonResponse(200, result);
      }

      if (request.method === 'POST' && requestUrl.pathname === '/api/prompt-assets/save') {
        const payload = await request.json();
        const audioBuffer = Buffer.from(payload.audioBase64 || '', 'base64');
        const result = await promptAssetStore.savePromptAsset({
          fileNameStem: payload.fileNameStem,
          audioBuffer,
          promptText: payload.promptText,
          characterPrompt: payload.characterPrompt,
          instructText: payload.instructText,
          presetSpeaker: payload.presetSpeaker,
          model: payload.model,
          speed: payload.speed,
        });
        return jsonResponse(200, { ok: true, ...result });
      }

      if (request.method === 'GET' && requestUrl.pathname === '/api/production-test/state') {
        const [savedState, speakers] = await Promise.all([
          productionTestStore.loadState(),
          ttsClient.listProductionSpeakers(),
        ]);
        return jsonResponse(200, {
          ok: true,
          profile: savedState.profile,
          history: savedState.history.map(toPublicTurn),
          speakers,
        });
      }

      if (request.method === 'POST' && requestUrl.pathname === '/api/production-test/profile') {
        const formData = await request.formData();
        const referenceWav = formData.get('referenceWav');
        const referenceBuffer =
          referenceWav instanceof File ? Buffer.from(await referenceWav.arrayBuffer()) : null;
        const profile = await productionTestStore.saveProfile({
          referenceOriginalFileName: referenceWav instanceof File ? referenceWav.name : '',
          referenceMimeType: referenceWav instanceof File ? referenceWav.type || 'audio/wav' : 'audio/wav',
          referenceBuffer,
          meloBaseSpeakerId: normalizeString(formData.get('meloBaseSpeakerId')),
          meloBaseSpeakerLabel: normalizeString(formData.get('meloBaseSpeakerLabel')),
        });
        return jsonResponse(200, {
          ok: true,
          profile,
        });
      }

      if (request.method === 'POST' && requestUrl.pathname === '/api/production-test/turn') {
        const payload = await request.json();
        const transcript = normalizeString(payload?.transcript);
        if (!transcript) {
          throw new Error('A transcript is required.');
        }

        const profile = await productionTestStore.loadProfile();
        if (!profile) {
          throw new Error('An active production profile is required.');
        }

        const startedAt = performance.now();
        const replyText =
          typeof pickProductionReply === 'function'
            ? pickProductionReply()
            : 'All set.';
        await sleep(100, sleepImpl);
        const result = await ttsClient.generateProductionTurn({
          replyText,
          meloBaseSpeakerId: profile.meloBaseSpeakerId,
          referenceWavPath: profile.referenceStoredPath,
        });
        const replyAudioBuffer = Buffer.from(result.audioBase64 || '', 'base64');
        const generationTimeMs = Math.round(performance.now() - startedAt);
        const persisted = await productionTestStore.appendTurn({
          userTranscript: transcript,
          replyText,
          generationTimeMs,
          replyAudioBuffer,
          replyAudioMimeType: result.mimeType || 'audio/wav',
        });

        return jsonResponse(200, {
          ok: true,
          turn: toPublicTurn(persisted.turn),
          history: persisted.history.map(toPublicTurn),
        });
      }

      if (request.method === 'GET' && requestUrl.pathname.startsWith('/api/production-test/replies/')) {
        const fileName = decodeURIComponent(requestUrl.pathname.split('/').at(-1) || '');
        const replyAudioPath = productionTestStore.resolveReplyAudioPath(fileName);
        if (!replyAudioPath) {
          return textResponse(404, 'Not found');
        }

        try {
          const body = await readFile(replyAudioPath);
          return new Response(body, {
            status: 200,
            headers: {
              'cache-control': 'no-store',
              'content-type': 'audio/wav',
            },
          });
        } catch {
          return textResponse(404, 'Not found');
        }
      }
    } catch (error) {
      return jsonResponse(getErrorStatus(error), {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error.',
      });
    }

    return textResponse(404, 'Not found');
  };
}

function buildWebRequest(req, host, port) {
  const url = `http://${host}:${port || 80}${req.url || '/'}`;
  const init = {
    method: req.method,
    headers: req.headers,
  };

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = Readable.toWeb(req);
    init.duplex = 'half';
  }

  return new Request(url, init);
}

export function createVoiceCastServer({
  host = '127.0.0.1',
  port = 0,
  srcDir,
  promptAssetStore,
  productionTestStore,
  ttsClient,
  runtimeConfig = {},
  pickProductionReply = null,
  sleepImpl = null,
} = {}) {
  const handleRequest = createVoiceCastRequestHandler({
    srcDir,
    promptAssetStore,
    productionTestStore,
    ttsClient,
    runtimeConfig,
    pickProductionReply,
    sleepImpl,
  });

  return createServer(async (req, res) => {
    const response = await handleRequest(buildWebRequest(req, host, port));
    const headers = Object.fromEntries(response.headers.entries());
    res.writeHead(response.status, headers);

    if (!response.body) {
      res.end();
      return;
    }

    const body = Buffer.from(await response.arrayBuffer());
    res.end(body);
  });
}
