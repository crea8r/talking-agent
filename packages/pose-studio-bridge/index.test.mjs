import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { createPoseStudioBridgeStore } from './index.mjs';

function createStateFilePath(name) {
  return path.join(
    '/private/tmp',
    `pose-studio-bridge-${name}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
  );
}

test('syncRuntime stores the live gesture catalog with durations', async () => {
  const store = createPoseStudioBridgeStore({
    stateFilePath: createStateFilePath('runtime'),
  });

  const runtime = await store.syncRuntime({
    modelId: 'bhf-1-2',
    modelLabel: 'Red Tinker Bell',
    availableGestures: [
      {
        id: 'Pose',
        label: 'Pose',
        description: 'Held neutral model pose.',
        bestFor: ['idle'],
        durationMs: 1800,
      },
      {
        id: 'Thinking',
        label: 'Thinking',
        description: 'Reflective pause motion.',
        bestFor: ['thinking'],
        durationMs: 2400,
      },
    ],
  });

  assert.equal(runtime.activeModelId, 'bhf-1-2');
  assert.equal(runtime.gestures[0].durationMs, 1800);
  assert.equal(runtime.gestures[1].id, 'Thinking');
  assert.match(runtime.catalogVersion, /^[a-f0-9]{12}$/);
});

test('stageSequence trims the sequence to the 60 second limit', async () => {
  const store = createPoseStudioBridgeStore({
    stateFilePath: createStateFilePath('trim'),
  });

  await store.syncRuntime({
    modelId: 'bhf-1-2',
    modelLabel: 'Red Tinker Bell',
    availableGestures: [
      {
        id: 'Pose',
        label: 'Pose',
        description: 'Held neutral model pose.',
        bestFor: ['idle'],
        durationMs: 9000,
      },
      {
        id: 'Thinking',
        label: 'Thinking',
        description: 'Reflective pause motion.',
        bestFor: ['thinking'],
        durationMs: 9000,
      },
      {
        id: 'Greeting',
        label: 'Greeting',
        description: 'Friendly hello.',
        bestFor: ['hello'],
        durationMs: 9000,
      },
      {
        id: 'Goodbye',
        label: 'Goodbye',
        description: 'Farewell motion.',
        bestFor: ['goodbye'],
        durationMs: 9000,
      },
    ],
  });

  const staged = await store.stageSequence({
    steps: [
      { gestureId: 'Pose' },
      { gestureId: 'Thinking' },
      { gestureId: 'Greeting' },
      { gestureId: 'Goodbye' },
      { gestureId: 'Pose' },
      { gestureId: 'Thinking' },
      { gestureId: 'Greeting' },
    ],
  });

  assert.equal(staged.steps.length, 6);
  assert.equal(staged.totalDurationMs, 54_000);
  assert.equal(staged.trimmed, true);
});

test('updatePlayback completed clears the active sequence', async () => {
  const store = createPoseStudioBridgeStore({
    stateFilePath: createStateFilePath('complete'),
  });

  await store.syncRuntime({
    modelId: 'bhf-1-2',
    modelLabel: 'Red Tinker Bell',
    availableGestures: [
      {
        id: 'Pose',
        label: 'Pose',
        description: 'Held neutral model pose.',
        bestFor: ['idle'],
        durationMs: 1800,
      },
    ],
  });

  const staged = await store.stageSequence({
    steps: [{ gestureId: 'Pose' }],
  });

  await store.updatePlayback({
    sequenceId: staged.sequenceId,
    status: 'completed',
    currentStepIndex: 0,
    currentGestureId: 'Pose',
  });

  const state = await store.getState();
  assert.equal(state.director.activeSequence, null);
  assert.equal(state.director.playback.status, 'idle');
  assert.equal(state.director.lastSequence.status, 'completed');
});
