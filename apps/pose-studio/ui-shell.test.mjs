import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const APP_DIR = path.resolve(process.cwd(), 'apps/pose-studio/src');

test('pose-studio exposes the grouped mode-based panel shell', async () => {
  const [html, script] = await Promise.all([
    readFile(path.join(APP_DIR, 'index.html'), 'utf8'),
    readFile(path.join(APP_DIR, 'app.js'), 'utf8'),
  ]);

  assert.match(html, /id="panel-mode-manual"/, 'expected a manual mode switch');
  assert.match(html, /id="panel-mode-direct"/, 'expected a direct mode switch');
  assert.match(html, />\s*Photo\s*</, 'expected the photo mode label');
  assert.match(html, />\s*Action\s*</, 'expected the action mode label');
  assert.match(html, /id="director-prompt"/, 'expected a long-form pre-director prompt textarea');
  assert.match(html, /class="prompt-composer"/, 'expected a codex-style embedded prompt composer shell');
  assert.match(html, /id="director-prompt-elapsed"/, 'expected a live elapsed timer next to the send control');
  assert.match(html, /id="director-prompt-send"/, 'expected a send-to-codex button');
  assert.match(html, /id="director-response"/, 'expected a visible slot for Codex reply text');
  assert.match(html, /id="manual-transport-group"/, 'expected a manual transport group');
  assert.match(html, /id="manual-utility-group"/, 'expected a manual utility group');
  assert.match(html, /id="director-playback-group"/, 'expected a director playback group');
  assert.ok(
    html.indexOf('id="model-select"') < html.indexOf('id="screen-preset"') &&
      html.indexOf('id="screen-preset"') < html.indexOf('id="director-prompt"'),
    'expected action mode fields to render in model -> screensize -> direct order',
  );
  assert.match(script, /#panel-mode-manual/, 'expected app.js to wire the manual mode switch');
  assert.match(script, /#panel-mode-direct/, 'expected app.js to wire the direct mode switch');
  assert.match(script, /#director-prompt/, 'expected app.js to wire the prompt input');
  assert.match(script, /#director-prompt-send/, 'expected app.js to wire the prompt send action');
  assert.match(script, /\/api\/director\/request/, 'expected app.js to submit prompts to the local director request endpoint');
});
