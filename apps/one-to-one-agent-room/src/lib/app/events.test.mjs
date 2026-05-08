import test from 'node:test';
import assert from 'node:assert/strict';

import { bindAppEvents } from './events.js';

class FakeElement extends EventTarget {
  constructor({ value = '', files = null } = {}) {
    super();
    this.value = value;
    this.files = files;
    this.disabled = false;
    this.textContent = '';
  }
}

function createDom() {
  return {
    joinCall: new FakeElement(),
    callMicToggle: new FakeElement(),
    refreshInspector: new FakeElement(),
    typedInput: new FakeElement(),
    sendTyped: new FakeElement(),
    clearTyped: new FakeElement(),
    bundledModelSelect: new FakeElement({ value: 'bhf-1-2' }),
    stageSelect: new FakeElement(),
    emoteSelect: new FakeElement(),
    gestureSelect: new FakeElement(),
    voiceSampleFile: new FakeElement(),
    previewVoiceSample: new FakeElement(),
    previewCharacterAnimation: new FakeElement(),
    callHistoryToggle: new FakeElement(),
  };
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

test('bindAppEvents uploads the selected production voice sample and clears the file input', async () => {
  globalThis.window = new EventTarget();

  const dom = createDom();
  let uploadedFileName = '';
  let persistCount = 0;

  dom.voiceSampleFile.files = [
    new File([Uint8Array.from([1, 2, 3])], 'reference.wav', { type: 'audio/wav' }),
  ];

  bindAppEvents({
    dom,
    humanVoiceLayer: {
      runTextTurn: async () => {},
    },
    avatarController: {
      selectBundledModel() {
        return Promise.resolve();
      },
      selectStage() {},
      selectEmote() {},
      selectGesture() {},
    },
    sessionController: {
      handlePrimaryCallAction: async () => {},
      ensureSessionReady: async () => {},
      refreshSession: async () => {},
      uploadVoiceSample: async (file) => {
        uploadedFileName = file.name;
      },
      syncSessionSetup() {},
      destroy() {},
    },
    presenter: {
      refreshActionButtons() {},
      renderDebugSnapshot() {},
    },
    persistState() {
      persistCount += 1;
    },
    addLog() {},
    formatError(error) {
      return error;
    },
  });

  dom.voiceSampleFile.dispatchEvent(new Event('change'));
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(uploadedFileName, 'reference.wav');
  assert.equal(dom.voiceSampleFile.value, '');
  assert.equal(persistCount, 1);
});

test('bindAppEvents rejects a non-wav voice sample and shows the voice requirement', async () => {
  globalThis.window = new EventTarget();

  const dom = createDom();
  let uploadAttemptCount = 0;
  let persistCount = 0;
  let validationMessage = '';

  dom.voiceSampleFile.files = [
    new File([Uint8Array.from([1, 2, 3])], 'reference.mp3', { type: 'audio/mpeg' }),
  ];

  bindAppEvents({
    dom,
    humanVoiceLayer: {
      runTextTurn: async () => {},
    },
    avatarController: {
      selectBundledModel() {
        return Promise.resolve();
      },
      selectStage() {},
      selectEmote() {},
      selectGesture() {},
    },
    sessionController: {
      handlePrimaryCallAction: async () => {},
      ensureSessionReady: async () => {},
      refreshSession: async () => {},
      uploadVoiceSample: async () => {
        uploadAttemptCount += 1;
      },
      setVoiceSampleValidationMessage(message) {
        validationMessage = message;
      },
      syncSessionSetup() {},
      destroy() {},
    },
    presenter: {
      refreshActionButtons() {},
      renderDebugSnapshot() {},
    },
    persistState() {
      persistCount += 1;
    },
    addLog() {},
    formatError(error) {
      return error;
    },
  });

  dom.voiceSampleFile.dispatchEvent(new Event('change'));
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(uploadAttemptCount, 0);
  assert.equal(validationMessage, 'missing voice reference, a 3+s wav file');
  assert.equal(dom.voiceSampleFile.value, '');
  assert.equal(persistCount, 0);
});

test('bindAppEvents routes setup preview buttons to the local preview controller', async () => {
  globalThis.window = new EventTarget();

  const dom = createDom();
  let voicePreviewCount = 0;
  let animationPreviewCount = 0;

  bindAppEvents({
    dom,
    humanVoiceLayer: {
      runTextTurn: async () => {},
    },
    avatarController: {
      selectBundledModel() {
        return Promise.resolve();
      },
      selectStage() {},
      selectEmote() {},
      selectGesture() {},
    },
    sessionController: {
      handlePrimaryCallAction: async () => {},
      ensureSessionReady: async () => {},
      refreshSession: async () => {},
      uploadVoiceSample: async () => {},
      setVoiceSampleValidationMessage() {},
      syncSessionSetup() {},
      destroy() {},
    },
    setupPreviewController: {
      playVoicePreview: async () => {
        voicePreviewCount += 1;
      },
      playCharacterAnimationPreview: async () => {
        animationPreviewCount += 1;
      },
    },
    presenter: {
      refreshActionButtons() {},
      renderDebugSnapshot() {},
    },
    persistState() {},
    addLog() {},
    formatError(error) {
      return error;
    },
  });

  dom.previewVoiceSample.dispatchEvent(new Event('click'));
  dom.previewCharacterAnimation.dispatchEvent(new Event('click'));
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(voicePreviewCount, 1);
  assert.equal(animationPreviewCount, 1);
});

test('bindAppEvents syncs the selected character model to the workspace setup store', async () => {
  globalThis.window = new EventTarget();

  const dom = createDom();
  let syncedModelId = '';

  bindAppEvents({
    dom,
    humanVoiceLayer: {
      runTextTurn: async () => {},
    },
    avatarController: {
      selectBundledModel(modelId) {
        return Promise.resolve(modelId);
      },
      selectStage() {},
      selectEmote() {},
      selectGesture() {},
    },
    sessionController: {
      handlePrimaryCallAction: async () => {},
      ensureSessionReady: async () => {},
      refreshSession: async () => {},
      uploadVoiceSample: async () => {},
      syncSessionSetup() {},
      syncWorkspaceSetup: async ({ activeModelId }) => {
        syncedModelId = activeModelId;
      },
      destroy() {},
    },
    presenter: {
      refreshActionButtons() {},
      renderDebugSnapshot() {},
    },
    persistState() {},
    addLog() {},
    formatError(error) {
      return error;
    },
  });

  dom.bundledModelSelect.value = 'fbf-1-0';
  dom.bundledModelSelect.dispatchEvent(new Event('change'));
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(syncedModelId, 'fbf-1-0');
});

test('bindAppEvents toggles call history from the subtitle action button', () => {
  globalThis.window = new EventTarget();

  const dom = createDom();
  const state = {
    callHistoryCollapsed: true,
  };
  let renderCount = 0;

  bindAppEvents({
    state,
    dom,
    humanVoiceLayer: {
      runTextTurn: async () => {},
    },
    avatarController: {
      selectBundledModel() {
        return Promise.resolve();
      },
      selectStage() {},
      selectEmote() {},
      selectGesture() {},
    },
    sessionController: {
      handlePrimaryCallAction: async () => {},
      ensureSessionReady: async () => {},
      refreshSession: async () => {},
      uploadVoiceSample: async () => {},
      syncSessionSetup() {},
      destroy() {},
    },
    presenter: {
      refreshActionButtons() {},
      renderDebugSnapshot() {},
      renderTranscriptList() {
        renderCount += 1;
      },
    },
    persistState() {},
    addLog() {},
    formatError(error) {
      return error;
    },
  });

  dom.callHistoryToggle.dispatchEvent(new Event('click'));

  assert.equal(state.callHistoryCollapsed, false);
  assert.equal(renderCount, 1);
});

test('bindAppEvents routes the call mic button to the microphone toggle', async () => {
  globalThis.window = new EventTarget();

  const dom = createDom();
  let toggleCount = 0;

  bindAppEvents({
    dom,
    humanVoiceLayer: {
      runTextTurn: async () => {},
    },
    avatarController: {
      selectBundledModel() {
        return Promise.resolve();
      },
      selectStage() {},
      selectEmote() {},
      selectGesture() {},
    },
    sessionController: {
      handlePrimaryCallAction: async () => {},
      toggleMicrophoneMuted: async () => {
        toggleCount += 1;
      },
      ensureSessionReady: async () => {},
      refreshSession: async () => {},
      uploadVoiceSample: async () => {},
      syncSessionSetup() {},
      destroy() {},
    },
    presenter: {
      refreshActionButtons() {},
      renderDebugSnapshot() {},
      renderTranscriptList() {},
    },
    persistState() {},
    addLog() {},
    formatError(error) {
      return error;
    },
  });

  dom.callMicToggle.dispatchEvent(new Event('click'));
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(toggleCount, 1);
});

test('bindAppEvents clears the typed chat box immediately when sending', async () => {
  globalThis.window = new EventTarget();

  const dom = createDom();
  const deferred = createDeferred();
  let sentText = '';

  dom.typedInput.value = 'Hello agent';

  bindAppEvents({
    dom,
    humanVoiceLayer: {
      runTextTurn: async (text) => {
        sentText = text;
        return deferred.promise;
      },
    },
    avatarController: {
      selectBundledModel() {
        return Promise.resolve();
      },
      selectStage() {},
      selectEmote() {},
      selectGesture() {},
    },
    sessionController: {
      handlePrimaryCallAction: async () => {},
      toggleMicrophoneMuted: async () => {},
      ensureSessionReady: async () => {},
      refreshSession: async () => {},
      uploadVoiceSample: async () => {},
      syncSessionSetup() {},
      destroy() {},
    },
    presenter: {
      refreshActionButtons() {},
      renderDebugSnapshot() {},
      renderTranscriptList() {},
    },
    persistState() {},
    addLog() {},
    formatError(error) {
      return error;
    },
  });

  dom.sendTyped.dispatchEvent(new Event('click'));
  await Promise.resolve();

  assert.equal(sentText, 'Hello agent');
  assert.equal(dom.typedInput.value, '');

  deferred.resolve();
  await Promise.resolve();
});
