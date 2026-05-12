# VRMA Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser-first VRMA Studio app that can load a `.vrm`, create or open a single-clip `.vrma`, edit humanoid body motion, preview it, and save a valid `.vrma` while preserving unsupported expression and look-at payload.

**Architecture:** Add a new shared package, `packages/vrma-core`, that owns GLB parsing, VRMA normalization, unsupported payload preservation, and serialization. Build `apps/vrma-studio` on top of that package and the existing browser VRM runtime pieces so the app stays responsible for UI, editor state, IK posing, and timeline behavior instead of raw file mutations.

**Tech Stack:** Node.js ESM, `node:test`, Three.js, `@pixiv/three-vrm`, `@pixiv/three-vrm-animation`, plain HTML/CSS/JS, existing monorepo static-server patterns.

---

### Task 1: Create `vrma-core` package skeleton and binary GLB parser

**Files:**
- Create: `packages/vrma-core/package.json`
- Create: `packages/vrma-core/index.mjs`
- Create: `packages/vrma-core/index.test.mjs`
- Test: `packages/vrma-core/index.test.mjs`

- [ ] **Step 1: Write the failing tests for GLB and VRMA parsing**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { parseVrmaBinary } from './index.mjs';

const FIXTURE = new URL('../avatar-layer-browser/animations/Greeting.vrma', import.meta.url);

test('parseVrmaBinary reads a GLB-backed VRMA payload', async () => {
  const source = await readFile(FIXTURE);
  const parsed = parseVrmaBinary(source);

  assert.equal(parsed.magic, 'glTF');
  assert.equal(parsed.json.asset.version, '2.0');
  assert.equal(parsed.json.extensionsUsed.includes('VRMC_vrm_animation'), true);
  assert.equal(Array.isArray(parsed.json.animations), true);
  assert.equal(parsed.json.animations.length, 1);
});

test('parseVrmaBinary exposes the VRMC_vrm_animation humanoid mapping', async () => {
  const source = await readFile(FIXTURE);
  const parsed = parseVrmaBinary(source);

  assert.equal(parsed.extension.specVersion, '1.0');
  assert.equal(typeof parsed.extension.humanoid.humanBones.hips.node, 'number');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test /Users/hieu/Work/crea8r/talking-agent/packages/vrma-core/index.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` or missing `parseVrmaBinary`.

- [ ] **Step 3: Write the minimal package and parser implementation**

```js
function decodeJsonChunk(source) {
  const jsonChunkLength = source.readUInt32LE(12);
  const jsonChunkType = source.subarray(16, 20).toString('utf8');

  if (jsonChunkType !== 'JSON') {
    throw new Error(`Expected GLB JSON chunk, received ${jsonChunkType}.`);
  }

  return JSON.parse(source.subarray(20, 20 + jsonChunkLength).toString('utf8'));
}

export function parseVrmaBinary(source) {
  const buffer = Buffer.isBuffer(source) ? source : Buffer.from(source);
  const magic = buffer.subarray(0, 4).toString('utf8');

  if (magic !== 'glTF') {
    throw new Error('VRMA source must be a binary glTF (GLB) file.');
  }

  const json = decodeJsonChunk(buffer);
  const extension = json.extensions?.VRMC_vrm_animation;

  if (!extension?.humanoid?.humanBones) {
    throw new Error('VRMA file is missing VRMC_vrm_animation humanoid data.');
  }

  return {
    magic,
    version: buffer.readUInt32LE(4),
    totalLength: buffer.readUInt32LE(8),
    source: buffer,
    json,
    extension,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test /Users/hieu/Work/crea8r/talking-agent/packages/vrma-core/index.test.mjs`

Expected: PASS with `2 tests`.

- [ ] **Step 5: Commit**

```bash
git add packages/vrma-core/package.json packages/vrma-core/index.mjs packages/vrma-core/index.test.mjs
git commit -m "feat: add vrma core binary parser"
```

### Task 2: Add editable clip normalization, new document creation, and save serialization

**Files:**
- Modify: `packages/vrma-core/index.mjs`
- Modify: `packages/vrma-core/index.test.mjs`
- Test: `packages/vrma-core/index.test.mjs`

- [ ] **Step 1: Write failing tests for editable tracks and serialization**

```js
import {
  createEmptyVrmaDocument,
  createEditableClip,
  parseVrmaDocument,
  serializeVrmaDocument,
} from './index.mjs';

test('parseVrmaDocument exposes editable humanoid rotation and hips translation tracks', async () => {
  const source = await readFile(FIXTURE);
  const document = parseVrmaDocument(source);

  assert.equal(document.clip.name.length > 0, true);
  assert.equal(document.clip.rotationTracks.has('hips'), true);
  assert.equal(document.clip.translationTracks.has('hips'), true);
});

test('createEmptyVrmaDocument builds a single-clip VRMA from a humanoid mapping', () => {
  const document = createEmptyVrmaDocument({
    clipName: 'Clip',
    humanoidBones: { hips: { node: 1 }, head: { node: 2 } },
  });

  assert.equal(document.clip.name, 'Clip');
  assert.equal(document.clip.rotationTracks.size, 0);
  assert.equal(document.clip.translationTracks.size, 0);
});

test('serializeVrmaDocument preserves unsupported expression and look-at payload', async () => {
  const source = await readFile(FIXTURE);
  const document = parseVrmaDocument(source);
  document.preserved.expressionPayload = { preset: { happy: { node: 55 } } };
  document.preserved.lookAtPayload = { node: 88 };

  const roundTrip = parseVrmaDocument(serializeVrmaDocument(document));

  assert.deepEqual(roundTrip.preserved.expressionPayload, { preset: { happy: { node: 55 } } });
  assert.deepEqual(roundTrip.preserved.lookAtPayload, { node: 88 });
});
```

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run: `node --test /Users/hieu/Work/crea8r/talking-agent/packages/vrma-core/index.test.mjs`

Expected: FAIL with missing document helpers.

- [ ] **Step 3: Add the minimal document model and serializer**

```js
export function parseVrmaDocument(source) {
  const parsed = parseVrmaBinary(source);
  const animation = parsed.json.animations?.[0];
  if (!animation) {
    throw new Error('VRMA file must contain exactly one animation clip.');
  }

  return {
    source: parsed.source,
    json: structuredClone(parsed.json),
    extension: structuredClone(parsed.extension),
    clip: createEditableClip(parsed.json, parsed.extension),
    preserved: {
      expressionPayload: structuredClone(parsed.extension.expressions || null),
      lookAtPayload: structuredClone(parsed.extension.lookAt || null),
    },
  };
}

export function createEmptyVrmaDocument({ clipName, humanoidBones }) {
  return {
    source: null,
    json: createBaseVrmaJson({ clipName, humanoidBones }),
    extension: { specVersion: '1.0', humanoid: { humanBones: humanoidBones } },
    clip: {
      name: clipName,
      duration: 0,
      rotationTracks: new Map(),
      translationTracks: new Map(),
    },
    preserved: {
      expressionPayload: null,
      lookAtPayload: null,
    },
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test /Users/hieu/Work/crea8r/talking-agent/packages/vrma-core/index.test.mjs`

Expected: PASS with the new document-model coverage green.

- [ ] **Step 5: Commit**

```bash
git add packages/vrma-core/index.mjs packages/vrma-core/index.test.mjs
git commit -m "feat: add vrma document model and serializer"
```

### Task 3: Stand up the new `vrma-studio` app shell and static server

**Files:**
- Create: `apps/vrma-studio/package.json`
- Create: `apps/vrma-studio/server.mjs`
- Create: `apps/vrma-studio/ui-shell.test.mjs`
- Create: `apps/vrma-studio/src/index.html`
- Create: `apps/vrma-studio/src/styles.css`
- Create: `apps/vrma-studio/src/app.js`
- Test: `apps/vrma-studio/ui-shell.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write the failing shell test**

```js
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
  assert.match(script, /createVrmaStudioApp/);
});
```

- [ ] **Step 2: Run the shell test to verify it fails**

Run: `node --test /Users/hieu/Work/crea8r/talking-agent/apps/vrma-studio/ui-shell.test.mjs`

Expected: FAIL because the app files do not exist yet.

- [ ] **Step 3: Create the minimal app shell and server**

```js
const STATIC_ROUTES = new Map([
  ['/', path.join(SRC_DIR, 'index.html')],
  ['/app.js', path.join(SRC_DIR, 'app.js')],
  ['/styles.css', path.join(SRC_DIR, 'styles.css')],
  ['/vendor/avatar-layer-browser.js', path.join(AVATAR_LAYER_DIR, 'index.js')],
  ['/vendor/vrma-core.js', path.join(VRMA_CORE_DIR, 'index.mjs')],
]);
```

```html
<main class="studio-shell">
  <header class="menu-bar" id="menu-file"></header>
  <section class="workspace-shell">
    <aside class="tool-rail"></aside>
    <section class="viewport-shell">
      <canvas id="viewport-canvas"></canvas>
    </section>
    <aside id="inspector-panel" class="inspector-panel"></aside>
  </section>
  <section id="timeline-shell" class="timeline-shell"></section>
  <footer id="status-bar" class="status-bar"></footer>
</main>
```

- [ ] **Step 4: Run the shell test to verify it passes**

Run: `node --test /Users/hieu/Work/crea8r/talking-agent/apps/vrma-studio/ui-shell.test.mjs`

Expected: PASS with `1 test`.

- [ ] **Step 5: Commit**

```bash
git add package.json apps/vrma-studio/package.json apps/vrma-studio/server.mjs apps/vrma-studio/ui-shell.test.mjs apps/vrma-studio/src/index.html apps/vrma-studio/src/styles.css apps/vrma-studio/src/app.js
git commit -m "feat: add vrma studio app shell"
```

### Task 4: Add editor store, file workflow, and timeline state

**Files:**
- Create: `apps/vrma-studio/src/lib/store.js`
- Create: `apps/vrma-studio/src/lib/store.test.mjs`
- Modify: `apps/vrma-studio/src/app.js`
- Modify: `apps/vrma-studio/src/index.html`
- Test: `apps/vrma-studio/src/lib/store.test.mjs`

- [ ] **Step 1: Write the failing store tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { createEditorStore } from './store.js';

test('new clip workflow marks the editor dirty and creates a single empty clip', () => {
  const store = createEditorStore();

  store.createEmptyClip({ clipName: 'Clip', humanoidBones: { hips: { node: 1 } } });

  assert.equal(store.getState().document.clip.name, 'Clip');
  assert.equal(store.getState().dirty, true);
});

test('auto-key updates the current keyframe for the selected chain', () => {
  const store = createEditorStore();
  store.setAutoKey(true);
  store.selectControl({ type: 'ik', id: 'right-hand' });
  store.applyPoseAtTime({
    time: 0.5,
    scope: 'selected-chain',
    rotations: { rightUpperArm: [0, 5, 0] },
  });

  assert.equal(store.getState().timeline.currentTime, 0.5);
  assert.equal(store.getState().document.clip.rotationTracks.has('rightUpperArm'), true);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test /Users/hieu/Work/crea8r/talking-agent/apps/vrma-studio/src/lib/store.test.mjs`

Expected: FAIL due to missing store module.

- [ ] **Step 3: Implement the minimal store and wire it into the app**

```js
export function createEditorStore() {
  const state = {
    document: null,
    dirty: false,
    selection: null,
    autoKey: false,
    timeline: { currentTime: 0, fps: 30 },
  };

  return {
    getState: () => state,
    createEmptyClip({ clipName, humanoidBones }) {
      state.document = createEmptyVrmaDocument({ clipName, humanoidBones });
      state.dirty = true;
    },
    setAutoKey(value) {
      state.autoKey = Boolean(value);
    },
    selectControl(selection) {
      state.selection = selection;
    },
    applyPoseAtTime({ time, scope, rotations, translations = {} }) {
      state.timeline.currentTime = time;
      upsertKeyframe(state.document.clip, { time, scope, rotations, translations });
      state.dirty = true;
    },
  };
}
```

- [ ] **Step 4: Run the store tests to verify they pass**

Run: `node --test /Users/hieu/Work/crea8r/talking-agent/apps/vrma-studio/src/lib/store.test.mjs`

Expected: PASS with the new editor-state coverage green.

- [ ] **Step 5: Commit**

```bash
git add apps/vrma-studio/src/app.js apps/vrma-studio/src/index.html apps/vrma-studio/src/lib/store.js apps/vrma-studio/src/lib/store.test.mjs
git commit -m "feat: add vrma studio editor store"
```

### Task 5: Add viewport runtime, preview playback, and humanoid-only authoring controls

**Files:**
- Create: `apps/vrma-studio/src/lib/runtime.js`
- Create: `apps/vrma-studio/src/lib/runtime.test.mjs`
- Modify: `apps/vrma-studio/src/app.js`
- Modify: `apps/vrma-studio/src/styles.css`
- Test: `apps/vrma-studio/src/lib/runtime.test.mjs`

- [ ] **Step 1: Write the failing runtime tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { createRuntimeController } from './runtime.js';

test('runtime controller derives preview clips from the editable clip', () => {
  const runtime = createRuntimeController({ avatarLayer: { setGesture() {} } });
  const preview = runtime.buildPreviewClip({
    name: 'Clip',
    duration: 1,
    rotationTracks: new Map([['hips', { times: [0], values: [0, 0, 0, 1] }]]),
    translationTracks: new Map(),
  });

  assert.equal(preview.name, 'Clip');
});

test('runtime controller tracks display mode, camera snap, and IK handles', () => {
  const runtime = createRuntimeController({ avatarLayer: { setGesture() {} } });

  runtime.setDisplayMode('bones');
  runtime.setCameraSnap(true);
  runtime.setIkTarget('right-hand', { x: 0.2, y: 1.4, z: 0.1 });
  runtime.setPoleTarget('right-elbow', { x: 0.4, y: 1.2, z: -0.3 });

  assert.equal(runtime.getState().displayMode, 'bones');
  assert.equal(runtime.getState().cameraSnap, true);
  assert.deepEqual(runtime.getState().ikTargets.get('right-hand'), { x: 0.2, y: 1.4, z: 0.1 });
  assert.deepEqual(runtime.getState().poleTargets.get('right-elbow'), { x: 0.4, y: 1.2, z: -0.3 });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test /Users/hieu/Work/crea8r/talking-agent/apps/vrma-studio/src/lib/runtime.test.mjs`

Expected: FAIL because `runtime.js` does not exist.

- [ ] **Step 3: Implement preview and authoring runtime helpers**

```js
import * as THREE from 'three';
import { createVRMAnimationClip } from '@pixiv/three-vrm-animation';

export function createRuntimeController({ avatarLayer }) {
  const state = {
    displayMode: 'mesh',
    cameraSnap: false,
    ikTargets: new Map(),
    poleTargets: new Map(),
  };

  return {
    buildPreviewClip(clip) {
      return new THREE.AnimationClip(clip.name, clip.duration, []);
    },
    setDisplayMode(mode) {
      state.displayMode = mode;
      avatarLayer?.setDisplayMode?.(mode);
    },
    setCameraSnap(enabled) {
      state.cameraSnap = Boolean(enabled);
    },
    setIkTarget(id, position) {
      state.ikTargets.set(id, position);
    },
    setPoleTarget(id, position) {
      state.poleTargets.set(id, position);
    },
    getState() {
      return state;
    },
  };
}
```

- [ ] **Step 4: Run the runtime tests to verify they pass**

Run: `node --test /Users/hieu/Work/crea8r/talking-agent/apps/vrma-studio/src/lib/runtime.test.mjs`

Expected: PASS with the preview helper covered.

- [ ] **Step 5: Commit**

```bash
git add apps/vrma-studio/src/app.js apps/vrma-studio/src/styles.css apps/vrma-studio/src/lib/runtime.js apps/vrma-studio/src/lib/runtime.test.mjs
git commit -m "feat: add vrma studio preview runtime"
```

### Task 6: Add save/load integration and end-to-end verification

**Files:**
- Modify: `apps/vrma-studio/src/app.js`
- Modify: `apps/vrma-studio/src/lib/store.js`
- Modify: `packages/vrma-core/index.mjs`
- Modify: `packages/vrma-core/index.test.mjs`
- Create: `apps/vrma-studio/server.test.mjs`
- Test: `packages/vrma-core/index.test.mjs`
- Test: `apps/vrma-studio/server.test.mjs`
- Test: `apps/vrma-studio/ui-shell.test.mjs`
- Test: `apps/vrma-studio/src/lib/store.test.mjs`
- Test: `apps/vrma-studio/src/lib/runtime.test.mjs`

- [ ] **Step 1: Write the failing integration tests**

```js
test('vrma-studio server exposes the new app shell and vendor routes', async () => {
  const response = await fetch(`http://127.0.0.1:${port}/`);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /VRMA Studio/);
});
```

- [ ] **Step 2: Run the full targeted suite to verify failures**

Run: `node --test /Users/hieu/Work/crea8r/talking-agent/packages/vrma-core/index.test.mjs /Users/hieu/Work/crea8r/talking-agent/apps/vrma-studio/ui-shell.test.mjs /Users/hieu/Work/crea8r/talking-agent/apps/vrma-studio/src/lib/store.test.mjs /Users/hieu/Work/crea8r/talking-agent/apps/vrma-studio/src/lib/runtime.test.mjs /Users/hieu/Work/crea8r/talking-agent/apps/vrma-studio/server.test.mjs`

Expected: FAIL until app/server save-load integration is wired.

- [ ] **Step 3: Implement save/load commands and app wiring**

```js
async function openVrmaFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  store.loadDocument(parseVrmaDocument(bytes));
}

async function saveCurrentDocument() {
  const bytes = serializeVrmaDocument(store.getState().document);
  downloadBlob(bytes, 'animation.vrma', 'model/gltf-binary');
}
```

- [ ] **Step 4: Run the full targeted suite to verify it passes**

Run: `node --test /Users/hieu/Work/crea8r/talking-agent/packages/vrma-core/index.test.mjs /Users/hieu/Work/crea8r/talking-agent/apps/vrma-studio/ui-shell.test.mjs /Users/hieu/Work/crea8r/talking-agent/apps/vrma-studio/src/lib/store.test.mjs /Users/hieu/Work/crea8r/talking-agent/apps/vrma-studio/src/lib/runtime.test.mjs /Users/hieu/Work/crea8r/talking-agent/apps/vrma-studio/server.test.mjs`

Expected: PASS with zero failures.

- [ ] **Step 5: Commit**

```bash
git add packages/vrma-core/index.mjs packages/vrma-core/index.test.mjs apps/vrma-studio/src/app.js apps/vrma-studio/src/lib/store.js apps/vrma-studio/server.test.mjs
git commit -m "feat: connect vrma studio load and save flows"
```
