import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  createEmptyVrmaDocument,
  parseVrmaBinary,
  parseVrmaDocument,
  serializeVrmaDocument,
} from './index.mjs';

const FIXTURE = new URL('../avatar-layer-browser/animations/Greeting.vrma', import.meta.url);

async function withBufferUnavailable(run) {
  const originalBuffer = globalThis.Buffer;
  globalThis.Buffer = undefined;

  try {
    return await run();
  } finally {
    globalThis.Buffer = originalBuffer;
  }
}

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

test('parseVrmaDocument exposes editable humanoid rotation and hips translation tracks', async () => {
  const source = await readFile(FIXTURE);
  const document = parseVrmaDocument(source);

  assert.equal(document.clip.name.length > 0, true);
  assert.equal(document.clip.rotationTracks.has('hips'), true);
  assert.equal(document.clip.translationTracks.has('hips'), true);
});

test('createEmptyVrmaDocument builds a single-clip VRMA from a humanoid skeleton', () => {
  const document = createEmptyVrmaDocument({
    clipName: 'Clip',
    humanoidSkeleton: {
      hips: { translation: [0, 1, 0], children: ['head'] },
      head: { translation: [0, 0.5, 0], children: [] },
    },
  });

  assert.equal(document.clip.name, 'Clip');
  assert.equal(document.clip.rotationTracks.size, 0);
  assert.equal(document.clip.translationTracks.size, 0);
  assert.equal(document.extension.humanoid.humanBones.hips.node, 0);
  assert.equal(document.json.nodes[1].name, 'head');
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

test('vrma-core parses and serializes VRMA payloads without global Buffer', async () => {
  const source = new Uint8Array(await readFile(FIXTURE));

  await withBufferUnavailable(async () => {
    const document = parseVrmaDocument(source);
    const serialized = serializeVrmaDocument(document);
    const roundTrip = parseVrmaDocument(serialized);

    assert.equal(serialized instanceof Uint8Array, true);
    assert.equal(document.clip.rotationTracks.has('hips'), true);
    assert.equal(roundTrip.clip.translationTracks.has('hips'), true);
  });
});
