import test from 'node:test';
import assert from 'node:assert/strict';

import { createVrmaStudioServer } from './server.mjs';

test('vrma-studio server exposes the shell and health endpoint', async () => {
  const server = createVrmaStudioServer({ host: '127.0.0.1', port: 0 });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const address = server.address();
    const [
      htmlResponse,
      healthResponse,
      runtimeResponse,
      pickerResponse,
      avatarLayerResponse,
      animationManifestResponse,
    ] = await Promise.all([
      fetch(`http://127.0.0.1:${address.port}/`),
      fetch(`http://127.0.0.1:${address.port}/healthz`),
      fetch(`http://127.0.0.1:${address.port}/lib/runtime.js`),
      fetch(`http://127.0.0.1:${address.port}/lib/file-picker.js`),
      fetch(`http://127.0.0.1:${address.port}/vendor/avatar-layer-browser/index.js`),
      fetch(`http://127.0.0.1:${address.port}/vendor/avatar-layer-browser/animation-manifest.js`),
    ]);

    const html = await htmlResponse.text();
    const health = await healthResponse.json();
    const runtimeSource = await runtimeResponse.text();
    const pickerSource = await pickerResponse.text();
    const avatarLayerSource = await avatarLayerResponse.text();
    const animationManifestSource = await animationManifestResponse.text();

    assert.equal(htmlResponse.status, 200);
    assert.match(html, /VRMA Studio/);
    assert.equal(health.ok, true);
    assert.equal(runtimeResponse.status, 200);
    assert.match(runtimeSource, /createRuntimeController/);
    assert.equal(pickerResponse.status, 200);
    assert.match(pickerSource, /openFilePicker/);
    assert.equal(avatarLayerResponse.status, 200);
    assert.match(avatarLayerSource, /ANIMATION_MANIFEST/);
    assert.equal(animationManifestResponse.status, 200);
    assert.match(animationManifestSource, /export const ANIMATION_MANIFEST/);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
