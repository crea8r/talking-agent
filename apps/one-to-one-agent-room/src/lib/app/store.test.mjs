import test from 'node:test';
import assert from 'node:assert/strict';

import { createAppStore } from './store.js';

test('createAppStore seeds session-first defaults and production voice placeholders when local storage is empty', () => {
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
  });

  assert.equal(store.state.preferences.humanIdentity, 'human-caller');
  assert.equal(store.state.preferences.participantName, 'Human Caller');
  assert.equal(store.state.preferences.humanLocale, 'en-US');
  assert.equal(store.state.preferences.voiceSampleFileName, '');
  assert.equal(store.state.preferences.voiceSampleProfileId, '');
  assert.equal(store.state.preferences.voiceSampleStatus, 'missing');
  assert.equal(store.state.preferences.bundledModelId, 'bhf-1-2');
  assert.deepEqual(store.state.productionVoice.profile, null);
});

test('createAppStore persists preferences per workspace scope', () => {
  const storage = new Map();
  globalThis.window = {
    localStorage: {
      getItem(key) {
        return storage.has(key) ? storage.get(key) : null;
      },
      setItem(key, value) {
        storage.set(key, value);
      },
    },
  };

  const bundledModels = [
    { id: 'bhf-1-2' },
    { id: 'fbf-1-0' },
  ];
  const store = createAppStore({
    storageKey: 'test-call-form',
    bundledModels,
    defaultModel: bundledModels[0],
    stages: [{ id: 'stage-1' }],
    emotes: [{ id: 'neutral' }],
    getGesturePresets(modelId) {
      return [{ id: modelId === 'fbf-1-0' ? 'Wave' : 'Pose' }];
    },
    resolveGesturePreset(modelId, gestureId) {
      return gestureId ? { id: gestureId } : { id: modelId === 'fbf-1-0' ? 'Wave' : 'Pose' };
    },
  });

  store.activateScope('workspace-alpha');
  store.state.preferences.bundledModelId = 'fbf-1-0';
  store.state.preferences.voiceSampleFileName = 'alpha.wav';
  store.persistState();

  store.activateScope('workspace-beta');
  assert.equal(store.state.preferences.bundledModelId, 'bhf-1-2');
  assert.equal(store.state.preferences.voiceSampleFileName, '');

  store.state.preferences.voiceSampleFileName = 'beta.wav';
  store.persistState();

  store.activateScope('workspace-alpha');
  assert.equal(store.state.preferences.bundledModelId, 'fbf-1-0');
  assert.equal(store.state.preferences.voiceSampleFileName, 'alpha.wav');

  store.activateScope('workspace-beta');
  assert.equal(store.state.preferences.voiceSampleFileName, 'beta.wav');
});
