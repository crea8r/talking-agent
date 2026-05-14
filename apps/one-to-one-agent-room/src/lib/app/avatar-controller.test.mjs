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
    refreshUi() {},
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

test('smooth transition flag is forwarded to the avatar layer and can be updated', () => {
  globalThis.document = {
    createElement() {
      return {
        value: '',
        textContent: '',
        title: '',
      };
    },
  };

  const featureFlagCalls = [];
  const avatarLayer = {
    getSnapshot() {
      return {
        modelId: 'bhf-1-2',
        modelLabel: 'Red Tinker Bell',
        gestureId: 'Pose',
        emoteId: 'neutral',
        mouthCue: 'rest',
        lookTargetLabel: 'center',
      };
    },
    loadModel() {
      return Promise.resolve(this.getSnapshot());
    },
    setStage() {},
    setEmote() {},
    setGesture() {},
    setMouthCue() {},
    setSpeaking() {},
    setFeatureFlags(flags) {
      featureFlagCalls.push(flags);
    },
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

  const state = {
    preferences: {
      bundledModelId: 'bhf-1-2',
      stageId: 'neon-loft',
      emoteId: 'neutral',
      gestureId: 'Pose',
      smoothGestureTransitions: true,
    },
    modelLoading: false,
  };

  const controller = createAvatarController({
    dom,
    state,
    createAvatarLayer(options) {
      featureFlagCalls.push(options.featureFlags);
      return avatarLayer;
    },
    bundledModelMap: new Map([
      ['bhf-1-2', { id: 'bhf-1-2', label: 'Red Tinker Bell', path: '/models/Bhf_1_2.vrm' }],
    ]),
    stageMap: new Map([['neon-loft', { id: 'neon-loft', note: '' }]]),
    emoteMap: new Map([['neutral', { id: 'neutral', label: 'Neutral', note: '' }]]),
    getGesturePresets() {
      return [{ id: 'Pose', label: 'Pose' }];
    },
    resolveGesturePreset() {
      return { id: 'Pose', label: 'Pose', note: '' };
    },
    defaultModel: { id: 'bhf-1-2', label: 'Red Tinker Bell', path: '/models/Bhf_1_2.vrm' },
    getSelectedBundledModel() {
      return { id: 'bhf-1-2', label: 'Red Tinker Bell', path: '/models/Bhf_1_2.vrm' };
    },
    persistState() {},
    formatError(error) {
      return error;
    },
    addLog() {},
    refreshUi() {},
  });

  controller.setSmoothGestureTransitions(false);

  assert.deepEqual(featureFlagCalls[0], {
    smoothGestureTransitions: true,
  });
  assert.deepEqual(featureFlagCalls[1], {
    smoothGestureTransitions: false,
  });
  assert.equal(state.preferences.smoothGestureTransitions, false);
});

test('camera distance preference is forwarded to the avatar layer and can be updated', () => {
  globalThis.document = {
    createElement() {
      return {
        value: '',
        textContent: '',
        title: '',
      };
    },
  };

  const cameraDistanceCalls = [];
  const avatarLayer = {
    getSnapshot() {
      return {
        modelId: 'bhf-1-2',
        modelLabel: 'Red Tinker Bell',
        gestureId: 'Pose',
        emoteId: 'neutral',
        mouthCue: 'rest',
        lookTargetLabel: 'center',
        cameraDistance: 1,
      };
    },
    loadModel() {
      return Promise.resolve(this.getSnapshot());
    },
    setStage() {},
    setEmote() {},
    setGesture() {},
    setMouthCue() {},
    setSpeaking() {},
    setFeatureFlags() {},
    setCameraDistance(distance) {
      cameraDistanceCalls.push(distance);
    },
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
    cameraDistanceInput: { value: '1' },
    cameraDistanceValue: { textContent: '' },
    activeAvatar: { textContent: '' },
    activeEmote: { textContent: '' },
    activeGesture: { textContent: '' },
    activeMouth: { textContent: '' },
    lookTarget: { textContent: '' },
    sceneNote: { textContent: '' },
  };

  const state = {
    preferences: {
      bundledModelId: 'bhf-1-2',
      stageId: 'neon-loft',
      emoteId: 'neutral',
      gestureId: 'Pose',
      cameraDistance: 1,
    },
    modelLoading: false,
  };

  const controller = createAvatarController({
    dom,
    state,
    createAvatarLayer(options) {
      cameraDistanceCalls.push(options.initialCameraDistance);
      return avatarLayer;
    },
    bundledModelMap: new Map([
      ['bhf-1-2', { id: 'bhf-1-2', label: 'Red Tinker Bell', path: '/models/Bhf_1_2.vrm' }],
    ]),
    stageMap: new Map([['neon-loft', { id: 'neon-loft', note: '' }]]),
    emoteMap: new Map([['neutral', { id: 'neutral', label: 'Neutral', note: '' }]]),
    getGesturePresets() {
      return [{ id: 'Pose', label: 'Pose' }];
    },
    resolveGesturePreset() {
      return { id: 'Pose', label: 'Pose', note: '' };
    },
    defaultModel: { id: 'bhf-1-2', label: 'Red Tinker Bell', path: '/models/Bhf_1_2.vrm' },
    getSelectedBundledModel() {
      return { id: 'bhf-1-2', label: 'Red Tinker Bell', path: '/models/Bhf_1_2.vrm' };
    },
    persistState() {},
    formatError(error) {
      return error;
    },
    addLog() {},
    refreshUi() {},
  });

  controller.setCameraDistance(1.15);

  assert.equal(cameraDistanceCalls[0], 1);
  assert.equal(cameraDistanceCalls[1], 1.15);
  assert.equal(state.preferences.cameraDistance, 1.15);
  assert.equal(dom.cameraDistanceInput.value, '1.15');
  assert.equal(dom.cameraDistanceValue.textContent, '115%');
});

test('loadModel surfaces phased loading progress for the setup overlay while the model and animations hydrate', async () => {
  globalThis.document = {
    createElement() {
      return {
        value: '',
        textContent: '',
        title: '',
      };
    },
  };

  const loadingSnapshots = [];
  const avatarLayer = {
    async loadModel(path, { label, modelId, onProgress }) {
      onProgress?.({
        phase: 'model',
        percent: 42,
      });
      onProgress?.({
        phase: 'hydrate',
        percent: 94,
      });
      return {
        ready: true,
        modelId,
        modelLabel: label,
        gestureId: 'Pose',
        emoteId: 'neutral',
        mouthCue: 'rest',
        lookTargetLabel: 'center',
      };
    },
    getSnapshot() {
      return {
        ready: true,
        modelId: 'fbf-1-0',
        modelLabel: 'Green Fairy',
        gestureId: 'Pose',
        emoteId: 'neutral',
        mouthCue: 'rest',
        lookTargetLabel: 'center',
      };
    },
    setStage() {},
    setEmote() {},
    setGesture() {},
    setMouthCue() {},
    setSpeaking() {},
    destroy() {},
  };

  const dom = {
    agentCanvas: {},
    stageShell: { style: { setProperty() {} } },
    bundledModelSelect: { value: 'fbf-1-0' },
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
    ['fbf-1-0', { id: 'fbf-1-0', label: 'Green Fairy', path: '/models/Fbf_1_0.vrm' }],
  ]);

  const state = {
    preferences: {
      bundledModelId: 'fbf-1-0',
      stageId: 'neon-loft',
      emoteId: 'neutral',
      gestureId: 'Pose',
    },
    modelLoading: false,
    loadingUi: {
      avatar: {
        active: false,
        phase: '',
        detail: '',
        percent: null,
      },
    },
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
    defaultModel: bundledModels.get('fbf-1-0'),
    getSelectedBundledModel() {
      return bundledModels.get(state.preferences.bundledModelId);
    },
    persistState() {},
    formatError(error) {
      return error;
    },
    addLog() {},
    refreshUi() {
      loadingSnapshots.push({ ...state.loadingUi.avatar });
    },
  });

  await controller.loadModel();

  assert.deepEqual(loadingSnapshots.slice(0, 4), [
    {
      active: true,
      phase: 'Loading 3D character',
      detail: 'Downloading the 3D model from your laptop.',
      percent: 0,
    },
    {
      active: true,
      phase: 'Loading 3D character',
      detail: 'Downloading the 3D model from your laptop.',
      percent: 42,
    },
    {
      active: true,
      phase: 'Loading character animations',
      detail: 'Streaming VRMA motion files from your laptop.',
      percent: 94,
    },
    {
      active: false,
      phase: '',
      detail: '',
      percent: null,
    },
  ]);
  assert.equal(state.modelLoading, false);
});
