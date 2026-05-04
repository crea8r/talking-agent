import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('index.html exposes Call, Agent Setup, and Diagnostics screens', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

  assert.match(html, /id="screen-tab-setup"/);
  assert.match(html, /id="screen-tab-agent-setup"/);
  assert.match(html, /data-screen-target="agent-setup"/);
  assert.match(html, /id="screen-agent-setup"/);
  assert.match(html, /data-screen="agent-setup"/);
  assert.match(html, /id="screen-tab-diagnostics"/);
  assert.doesNotMatch(html, /id="call-backstage"/);
  assert.doesNotMatch(html, /class="call-lobby-preview"/);
});

test('screen navigator recognizes the agent setup screen id', () => {
  const source = readFileSync(new URL('./screens.js', import.meta.url), 'utf8');

  assert.match(source, /new Set\(\['setup', 'agent-setup', 'diagnostics'\]\)/);
});
