import test from 'node:test';
import assert from 'node:assert/strict';

import { createAvatarController } from './avatar-controller.js';

test('selectBundledModel queues the last requested model while an earlier load is still in flight', async () => {
  globalThis.document = {
    createElement() {
      return {
        value: '',
        textContent: '',
        title: '',
      };
    },
  };

  let resolveFirstLoad = null;
  const loadCalls = [];
  const snapshot = {
    modelId: 'bhf-1-2',
    modelLabel: 'Red Tinker Bell',
    gestureId: 'Pose',
    emoteId: 'neutral',
    mouthCue: 'rest',
    lookTargetLabel: 'center',
  };

  const avatarLayer = {
    async loadModel(path, { label, modelId }) {
      loadCalls.push({ path, label, modelId });
      snapshot.modelId = modelId;
      snapshot.modelLabel = label;

      if (loadCalls.length === 1) {
        await new Promise((resolve) => {
          resolveFirstLoad = resolve;
        });
      }

      return snapshot;
    },
    getSnapshot() {
      return { ...snapshot };
    },
    setStage() {},
    setEmote() {},
    setGesture(gestureId) {
      snapshot.gestureId = gestureId;
    },
    setMouthCue() {},
    setSpeaking() {},
    destroy() {},
  };

  const dom = {
    agentCanvas: {},
    stageShell: { style: { setProperty() {} } },
    bundledModelSelect: { value: 'bhf-1-2' },
    stageSelect: { value: 'neon-loft' },
    emoteSelect: { value: 'neutral' },
    gestureSelect: {
      value: 'Pose',
      replaceChildren() {},
      append() {},
    },
    activeAvatar: { textContent: '' },
    activeEmote: { textContent: '' },
    activeGesture: { textContent: '' },
    activeMouth: { textContent: '' },
    lookTarget: { textContent: '' },
    sceneNote: { textContent: '' },
  };

  const bundledModels = new Map([
    ['bhf-1-2', { id: 'bhf-1-2', label: 'Red Tinker Bell', path: '/models/Bhf_1_2.vrm' }],
    ['fbf-1-0', { id: 'fbf-1-0', label: 'Green Fairy', path: '/models/Fbf_1_0.vrm' }],
  ]);

  const state = {
    preferences: {
      bundledModelId: 'bhf-1-2',
      stageId: 'neon-loft',
      emoteId: 'neutral',
      gestureId: 'Pose',
    },
    modelLoading: false,
  };

  const controller = createAvatarController({
    dom,
    state,
    createAvatarLayer() {
      return avatarLayer;
    },
    bundledModelMap: bundledModels,
    stageMap: new Map([['neon-loft', { id: 'neon-loft', note: '' }]]),
    emoteMap: new Map([['neutral', { id: 'neutral', label: 'Neutral', note: '' }]]),
    getGesturePresets() {
      return [{ id: 'Pose', label: 'Pose' }];
    },
    resolveGesturePreset() {
      return { id: 'Pose', label: 'Pose', note: '' };
    },
    defaultModel: bundledModels.get('bhf-1-2'),
    getSelectedBundledModel() {
      return bundledModels.get(state.preferences.bundledModelId);
    },
    persistState() {},
    formatError(error) {
      return error;
    },
    addLog() {},
    refreshActionButtons() {},
  });

  const firstLoadPromise = controller.loadModel();
  await Promise.resolve();

  const queuedSelectionPromise = controller.selectBundledModel('fbf-1-0');
  await Promise.resolve();
  resolveFirstLoad();

  await firstLoadPromise;
  await queuedSelectionPromise;

  assert.equal(loadCalls.length, 2);
  assert.deepEqual(loadCalls.map((entry) => entry.modelId), ['bhf-1-2', 'fbf-1-0']);
  assert.equal(state.preferences.bundledModelId, 'fbf-1-0');
  assert.equal(dom.activeAvatar.textContent, 'Green Fairy');
});
