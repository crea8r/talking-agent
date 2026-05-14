import test from 'node:test';
import assert from 'node:assert/strict';

import { resolvePublicBaseUrl } from './server-config.mjs';

test('resolvePublicBaseUrl prefers an explicit public base URL and trims a trailing slash', () => {
  const publicBaseUrl = resolvePublicBaseUrl({
    env: {
      ONE_TO_ONE_AGENT_ROOM_PUBLIC_BASE_URL: 'https://laptop.tail1234.ts.net:4384/',
    },
    host: '127.0.0.1',
    port: 4384,
  });

  assert.equal(publicBaseUrl, 'https://laptop.tail1234.ts.net:4384');
});

test('resolvePublicBaseUrl falls back to the local room app URL', () => {
  const publicBaseUrl = resolvePublicBaseUrl({
    env: {},
    host: '127.0.0.1',
    port: 4384,
  });

  assert.equal(publicBaseUrl, 'http://127.0.0.1:4384');
});
