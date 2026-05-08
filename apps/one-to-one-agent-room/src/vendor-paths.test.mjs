import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('browser app imports package-backed vendor directories instead of flattened files', () => {
  const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');

  assert.match(source, /from '\/vendor\/voice-layer-browser\/index\.js'/);
  assert.match(source, /from '\/vendor\/production-voice\/browser-layer\.mjs'/);
});

test('server exposes vendor directory prefixes for browser packages with relative imports', () => {
  const source = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');

  assert.match(source, /prefix: '\/vendor\/voice-layer-browser\/'/);
  assert.match(source, /rootDir: VOICE_LAYER_DIR/);
  assert.match(source, /prefix: '\/vendor\/production-voice\/'/);
  assert.match(source, /rootDir: PRODUCTION_VOICE_DIR/);
});
