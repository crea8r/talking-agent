import test from 'node:test';
import assert from 'node:assert/strict';

import { createRuntimeController } from './runtime.js';

test('runtime controller derives preview clips from the editable clip', () => {
  const runtime = createRuntimeController();
  const preview = runtime.buildPreviewClip({
    name: 'Clip',
    duration: 1,
    rotationTracks: new Map([['hips', { times: [0], values: [0, 0, 0, 1] }]]),
    translationTracks: new Map(),
  });

  assert.equal(preview.name, 'Clip');
});

test('runtime controller tracks display mode, camera snap, and IK handles', () => {
  const runtime = createRuntimeController();

  runtime.setDisplayMode('bones');
  runtime.setCameraSnap(true);
  runtime.setIkTarget('right-hand', { x: 0.2, y: 1.4, z: 0.1 });
  runtime.setPoleTarget('right-elbow', { x: 0.4, y: 1.2, z: -0.3 });

  assert.equal(runtime.getState().displayMode, 'bones');
  assert.equal(runtime.getState().cameraSnap, true);
  assert.deepEqual(runtime.getState().ikTargets.get('right-hand'), { x: 0.2, y: 1.4, z: 0.1 });
  assert.deepEqual(runtime.getState().poleTargets.get('right-elbow'), { x: 0.4, y: 1.2, z: -0.3 });
});

test('runtime controller delegates preview pause, resume, and playback state', async () => {
  const calls = [];
  const avatarLayer = {
    async loadModel() {},
    playPreviewClip(clip, options) {
      calls.push(['play', clip.name, options]);
    },
    pausePreviewClip() {
      calls.push(['pause']);
    },
    resumePreviewClip() {
      calls.push(['resume']);
    },
    getPreviewPlaybackState() {
      return { active: true, paused: true, timeSeconds: 0.75, durationSeconds: 2 };
    },
  };

  const runtime = createRuntimeController({
    avatarLayerFactory: () => avatarLayer,
    canvas: {},
  });

  await runtime.initialize();
  runtime.playClip({ name: 'Clip', duration: 2, rotationTracks: new Map(), translationTracks: new Map() }, { paused: false });
  runtime.pauseClip();
  runtime.resumeClip();

  assert.deepEqual(calls, [
    ['play', 'Clip', { paused: false }],
    ['pause'],
    ['resume'],
  ]);
  assert.deepEqual(runtime.getPlaybackState(), {
    active: true,
    paused: true,
    timeSeconds: 0.75,
    durationSeconds: 2,
  });
});
