import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const APP_DIR = path.resolve(process.cwd(), 'apps/vrma-studio/src');

test('vrma-studio exposes the desktop editor shell', async () => {
  const [html, script] = await Promise.all([
    readFile(path.join(APP_DIR, 'index.html'), 'utf8'),
    readFile(path.join(APP_DIR, 'app.js'), 'utf8'),
  ]);

  assert.match(html, /id="menu-file"/);
  assert.match(html, /id="viewport-canvas"/);
  assert.match(html, /id="timeline-shell"/);
  assert.match(html, /id="inspector-panel"/);
  assert.match(html, /id="status-bar"/);
  assert.match(html, /id="vrm-file-input"[^>]*class="file-picker-input"/);
  assert.match(html, /id="vrma-file-input"[^>]*class="file-picker-input"/);
  assert.match(html, /id="action-pause"/);
  assert.match(script, /createVrmaStudioApp/);
});
