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
    audioBase64: Buffer.from(arrayBuffer).toString('base64'),
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

export function createTtsClient({
  fetchImpl = globalThis.fetch,
  textOnlyBaseUrl = '',
  productionBaseUrl = '',
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('createTtsClient requires a fetch implementation.');
  }

  async function listTextOnlySpeakers() {
    const baseUrl = ensureBaseUrl(textOnlyBaseUrl, 'VOICE_CAST_TEXT_ONLY_BASE_URL');
    const response = await fetchImpl(`${baseUrl}/speakers`);
    await expectOk(response);
    return normalizeSpeakers(await response.json());
  }

  async function generateTextOnly(payload) {
    const baseUrl = ensureBaseUrl(textOnlyBaseUrl, 'VOICE_CAST_TEXT_ONLY_BASE_URL');
    const response = await fetchImpl(`${baseUrl}/generate`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(payload),
    });
    await expectOk(response);
    return normalizeAudioResponse(response);
  }

  async function listProductionSpeakers() {
    const baseUrl = ensureBaseUrl(productionBaseUrl, 'VOICE_CAST_PRODUCTION_BASE_URL');
    const response = await fetchImpl(`${baseUrl}/speakers`);
    await expectOk(response);
    return normalizeSpeakers(await response.json());
  }

  async function generateProductionTurn({
    replyText,
    meloBaseSpeakerId,
    referenceWavPath,
  }) {
    const baseUrl = ensureBaseUrl(productionBaseUrl, 'VOICE_CAST_PRODUCTION_BASE_URL');
    const response = await fetchImpl(`${baseUrl}/generate`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        replyText,
        meloBaseSpeakerId,
        referenceWavPath,
      }),
    });
    await expectOk(response);
    return normalizeAudioResponse(response);
  }

  return {
    generateProductionTurn,
    generateTextOnly,
    listTextOnlySpeakers,
    listProductionSpeakers,
  };
}
