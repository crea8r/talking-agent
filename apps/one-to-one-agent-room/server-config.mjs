function normalizeString(value) {
  return `${value || ''}`.trim();
}

function normalizePort(value, fallbackPort) {
  const port = Number.parseInt(normalizeString(value), 10);
  return Number.isFinite(port) ? port : fallbackPort;
}

export function resolvePublicBaseUrl({
  env = process.env,
  host = '127.0.0.1',
  port = 4384,
} = {}) {
  const explicitPublicBaseUrl = normalizeString(env.ONE_TO_ONE_AGENT_ROOM_PUBLIC_BASE_URL).replace(/\/$/, '');
  if (explicitPublicBaseUrl) {
    return explicitPublicBaseUrl;
  }

  const resolvedHost = normalizeString(host) || '127.0.0.1';
  const resolvedPort = normalizePort(port, 4384);
  return `http://${resolvedHost}:${resolvedPort}`;
}
