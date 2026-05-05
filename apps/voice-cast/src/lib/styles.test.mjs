import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('styles preserve hidden panels by explicitly hiding [hidden] elements', async () => {
  const css = await readFile(new URL('../styles.css', import.meta.url), 'utf8');
  assert.match(css, /\[hidden\]\s*\{/);
  assert.match(css, /display:\s*none\s*!important\s*;/);
});
