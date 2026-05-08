function ensureBaseUrl(value, envVarName) {
  const trimmed = `${value || ''}`.trim().replace(/\/+$/g, '');
  if (!trimmed) {
    throw new Error(`${envVarName} is not configured.`);
  }
  return trimmed;
}

function normalizeSpeakers(payload) {
  const rawSpeakers = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.speakers)
      ? payload.speakers
      : [];

  return rawSpeakers
    .map((speaker) => {
      if (typeof speaker === 'string') {
        return speaker.trim();
      }

      if (speaker && typeof speaker === 'object') {
        return `${speaker.label || speaker.name || speaker.id || ''}`.trim();
      }

      return '';
    })
    .filter(Boolean);
}

async function normalizeAudioResponse(response) {
  const contentType = `${response.headers.get('content-type') || ''}`.toLowerCase();

  if (contentType.includes('application/json')) {
    const payload = await response.json();
    return {
      audioBase64: payload.audioBase64 || '',
      mimeType: payload.mimeType || 'audio/wav',
      timing: payload.timing || null,
      meta: payload.meta || null,
    };
  }

  const arrayBuffer = await response.arrayBuffer();
  return {
    audioBase64: encodeArrayBufferBase64(arrayBuffer),
    mimeType: contentType || 'audio/wav',
    timing: null,
    meta: null,
  };
}

async function expectOk(response) {
  if (response.ok) {
    return;
  }

  const errorText = await response.text();
  throw new Error(errorText || `Upstream request failed with ${response.status}.`);
}

function encodeArrayBufferBase64(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);

  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }

  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function decodeAudioBase64(audioBase64 = '') {
  if (typeof Buffer !== 'undefined') {
    return Uint8Array.from(Buffer.from(audioBase64, 'base64'));
  }

  const binary = atob(audioBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function createProductionVoicePlaybackArtifact(
  { audioBase64 = '', mimeType = 'audio/wav' } = {},
  {
    BlobImpl = globalThis.Blob,
    urlApi = globalThis.URL,
  } = {},
) {
  if (typeof BlobImpl !== 'function') {
    throw new Error('createProductionVoicePlaybackArtifact requires Blob support.');
  }

  const blob = new BlobImpl([decodeAudioBase64(audioBase64)], {
    type: mimeType || 'audio/wav',
  });
  const objectUrl = typeof urlApi?.createObjectURL === 'function'
    ? urlApi.createObjectURL(blob)
    : '';

  return {
    blob,
    objectUrl,
  };
}

export function createProductionVoiceClient({
  fetchImpl = globalThis.fetch,
  baseUrl = '',
  baseUrlEnvVarName = 'VOICE_CAST_PRODUCTION_BASE_URL',
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('createProductionVoiceClient requires a fetch implementation.');
  }

  async function checkHealth() {
    const resolvedBaseUrl = ensureBaseUrl(baseUrl, baseUrlEnvVarName);
    const response = await fetchImpl(`${resolvedBaseUrl}/healthz`);
    await expectOk(response);
    return response.json();
  }

  async function listSpeakers() {
    const resolvedBaseUrl = ensureBaseUrl(baseUrl, baseUrlEnvVarName);
    const response = await fetchImpl(`${resolvedBaseUrl}/speakers`);
    await expectOk(response);
    return normalizeSpeakers(await response.json());
  }

  async function synthesize({
    text,
    setup,
  } = {}) {
    const resolvedBaseUrl = ensureBaseUrl(baseUrl, baseUrlEnvVarName);
    const response = await fetchImpl(`${resolvedBaseUrl}/generate`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        replyText: `${text || ''}`.trim(),
        meloBaseSpeakerId: `${setup?.meloBaseSpeakerId || ''}`.trim(),
        referenceWavPath: `${setup?.referenceWavPath || ''}`.trim(),
      }),
    });
    await expectOk(response);
    return normalizeAudioResponse(response);
  }

  return {
    checkHealth,
    listSpeakers,
    synthesize,
  };
}
