import test from 'node:test';
import assert from 'node:assert/strict';

import { createEditorStore } from './store.js';
import { createEmptyVrmaDocument } from '../../../../packages/vrma-core/index.mjs';

test('new clip workflow marks the editor dirty and creates a single empty clip', () => {
  const store = createEditorStore({ createEmptyDocument: createEmptyVrmaDocument });

  store.createEmptyClip({
    clipName: 'Clip',
    humanoidSkeleton: {
      hips: { translation: [0, 1, 0], children: ['head'] },
      head: { translation: [0, 0.5, 0], children: [] },
    },
  });

  assert.equal(store.getState().document.clip.name, 'Clip');
  assert.equal(store.getState().dirty, true);
});

test('loadDocument resets dirty state and keeps the loaded clip', () => {
  const store = createEditorStore({ createEmptyDocument: createEmptyVrmaDocument });
  const document = createEmptyVrmaDocument({
    clipName: 'Loaded Clip',
    humanoidSkeleton: {
      hips: { translation: [0, 1, 0], children: [] },
    },
  });

  store.loadDocument(document);

  assert.equal(store.getState().document.clip.name, 'Loaded Clip');
  assert.equal(store.getState().dirty, false);
});

test('auto-key updates the current keyframe for the selected chain', () => {
  const store = createEditorStore({ createEmptyDocument: createEmptyVrmaDocument });
  store.createEmptyClip({
    clipName: 'Clip',
    humanoidSkeleton: {
      hips: { translation: [0, 1, 0], children: ['rightUpperArm'] },
      rightUpperArm: { translation: [0.2, 0.9, 0], children: [] },
    },
  });
  store.setAutoKey(true);
  store.selectControl({ type: 'ik', id: 'right-hand' });
  store.applyPoseAtTime({
    time: 0.5,
    scope: 'selected-chain',
    rotations: { rightUpperArm: [0, 0, 0, 1] },
  });

  assert.equal(store.getState().timeline.currentTime, 0.5);
  assert.equal(store.getState().document.clip.rotationTracks.has('rightUpperArm'), true);
  assert.deepEqual(store.getState().document.clip.rotationTracks.get('rightUpperArm').times, [0.5]);
});

test('setCurrentTime updates the timeline playhead without keying', () => {
  const store = createEditorStore({ createEmptyDocument: createEmptyVrmaDocument });
  store.createEmptyClip({
    clipName: 'Clip',
    humanoidSkeleton: {
      hips: { translation: [0, 1, 0], children: [] },
    },
  });

  store.setCurrentTime(1.25);

  assert.equal(store.getState().timeline.currentTime, 1.25);
  assert.equal(store.getState().document.clip.rotationTracks.size, 0);
});
