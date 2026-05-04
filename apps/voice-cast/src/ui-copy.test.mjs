import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('text-only casting copy uses voice-direction wording and removes character prompt label', async () => {
  const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');

  assert.match(html, /Voice Direction/);
  assert.match(html, /Line to Speak/);
  assert.match(html, /Production Test/);
  assert.match(html, /Speech generation time/);
  assert.match(html, /Reference WAV/);
  assert.match(html, /MeloTTS English Base Speaker/);
  assert.doesNotMatch(html, /Character Prompt/);
  assert.doesNotMatch(html, /CV3 Production Test/);
});
