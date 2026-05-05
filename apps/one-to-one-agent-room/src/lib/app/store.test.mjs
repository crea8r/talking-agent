import test from 'node:test';
import assert from 'node:assert/strict';

import { createAppStore } from './store.js';

test('createAppStore seeds visible call defaults when local storage is empty', () => {
  globalThis.window = {
    localStorage: {
      getItem() {
        return null;
      },
      setItem() {},
    },
  };

  const bundledModel = {
    id: 'bhf-1-2',
  };
  const store = createAppStore({
    storageKey: 'test-call-form',
    bundledModels: [bundledModel],
    defaultModel: bundledModel,
    stages: [{ id: 'stage-1' }],
    emotes: [{ id: 'neutral' }],
    getGesturePresets() {
      return [{ id: 'Pose' }];
    },
    resolveGesturePreset() {
      return { id: 'Pose' };
    },
    clampNumber(value, _min, _max, fallback) {
      return Number.isFinite(value) ? value : fallback;
    },
  });

  assert.equal(store.state.preferences.livekitUrl, 'ws://127.0.0.1:7880');
  assert.equal(store.state.preferences.roomName, 'codex-project-call');
  assert.equal(store.state.preferences.identity, 'human-room-host');
  assert.equal(store.state.preferences.participantName, 'Human Caller');
  assert.equal(store.state.preferences.enableCamera, true);
  assert.equal(store.state.preferences.enableMicrophone, true);
});
