export function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
  });
  res.end(JSON.stringify(payload, null, 2));
}

export function sendText(res, statusCode, text) {
  res.writeHead(statusCode, {
    'cache-control': 'no-store',
    'content-type': 'text/plain; charset=utf-8',
  });
  res.end(text);
}

export function sendError(res, statusCode, code, message, data = undefined) {
  sendJson(res, statusCode, {
    ok: false,
    error: {
      code,
      message,
      ...(data ? { data } : {}),
    },
  });
}

export async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const rawBody = Buffer.concat(chunks).toString('utf8').trim();
  return rawBody ? JSON.parse(rawBody) : {};
}

export function createTypedError(code, message, data = undefined) {
  const error = new Error(message);
  error.code = code;
  if (typeof data !== 'undefined') {
    error.data = data;
  }
  return error;
}

export function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}
