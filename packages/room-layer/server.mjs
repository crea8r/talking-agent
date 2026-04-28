import { createHmac, randomUUID } from 'node:crypto';

export function loadRoomLayerDefaults(env = process.env) {
  return {
    livekitUrl: env.LIVEKIT_URL || 'ws://127.0.0.1:7880',
    apiKey: env.LIVEKIT_API_KEY || 'devkey',
    apiSecret: env.LIVEKIT_API_SECRET || 'secret',
  };
}

function toBase64Url(input) {
  const value = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return value
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/g, '');
}

export function createRoomLayerToken({
  apiKey,
  apiSecret,
  roomName,
  identity,
  participantName,
  metadata,
  ttlMinutes,
  canPublish,
  canSubscribe,
  canPublishData,
}) {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + ttlMinutes * 60;

  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };

  const claims = {
    iss: apiKey,
    sub: identity,
    nbf: now,
    exp: expiresAt,
    jti: randomUUID(),
    metadata: metadata || '',
    video: {
      room: roomName,
      roomJoin: true,
      canPublish,
      canSubscribe,
      canPublishData,
    },
  };

  if (participantName) {
    claims.name = participantName;
  }

  const encodedHeader = toBase64Url(JSON.stringify(header));
  const encodedClaims = toBase64Url(JSON.stringify(claims));
  const signature = createHmac('sha256', apiSecret)
    .update(`${encodedHeader}.${encodedClaims}`)
    .digest();

  return {
    token: `${encodedHeader}.${encodedClaims}.${toBase64Url(signature)}`,
    claims,
  };
}

export function validateRoomLayerTokenRequest(body = {}, defaults = loadRoomLayerDefaults()) {
  const apiKey = `${body.apiKey || defaults.apiKey}`.trim();
  const apiSecret = `${body.apiSecret || defaults.apiSecret}`.trim();
  const roomName = `${body.roomName || ''}`.trim();
  const identity = `${body.identity || ''}`.trim();
  const participantName = `${body.participantName || ''}`.trim();
  const metadata = typeof body.metadata === 'string' ? body.metadata : '';
  const ttlMinutesRaw = Number.parseInt(`${body.ttlMinutes || '60'}`, 10);
  const ttlMinutes = Number.isFinite(ttlMinutesRaw) ? ttlMinutesRaw : 60;

  if (!apiKey) {
    throw new Error('Missing LiveKit API key. Set LIVEKIT_API_KEY or enter it in the form.');
  }

  if (!apiSecret) {
    throw new Error(
      'Missing LiveKit API secret. Set LIVEKIT_API_SECRET on the local server or enter it in the form.',
    );
  }

  if (!roomName) {
    throw new Error('Room name is required.');
  }

  if (!identity) {
    throw new Error('Participant identity is required.');
  }

  if (ttlMinutes < 1 || ttlMinutes > 24 * 60) {
    throw new Error('TTL must be between 1 and 1440 minutes.');
  }

  return {
    apiKey,
    apiSecret,
    roomName,
    identity,
    participantName,
    metadata,
    ttlMinutes,
    canPublish: body.canPublish !== false,
    canSubscribe: body.canSubscribe !== false,
    canPublishData: body.canPublishData !== false,
  };
}

export function createRoomLayerRuntimeConfig({
  defaults,
  appName,
  appMode,
  port,
}) {
  return {
    livekitUrl: defaults.livekitUrl,
    apiKey: defaults.apiKey,
    hasApiSecret: Boolean(defaults.apiSecret),
    appName,
    appMode,
    port,
  };
}
