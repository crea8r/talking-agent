import test from 'node:test';
import assert from 'node:assert/strict';

import { bindAppEvents } from './events.js';

class FakeElement extends EventTarget {
  constructor({ value = '', files = null, tagName = 'INPUT' } = {}) {
    super();
    this.value = value;
    this.files = files;
    this.disabled = false;
    this.textContent = '';
    this.open = false;
    this.hidden = false;
    this.tagName = tagName;
    this.dataset = {};
  }

  showModal() {
    this.open = true;
  }

  close() {
    this.open = false;
  }
}

function createDom() {
  const bundledModelSelect = new FakeElement({ value: 'bhf-1-2' });
  bundledModelSelect.selectedOptions = [{ textContent: 'BHF 1.2' }];
  return {
    joinCall: new FakeElement(),
    callCameraToggle: new FakeElement(),
    callSpeakerToggle: new FakeElement(),
    callMicToggle: new FakeElement(),
    refreshInspector: new FakeElement(),
    typedInput: new FakeElement(),
    sendTyped: new FakeElement(),
    clearTyped: new FakeElement(),
    bundledModelSelect,
    stageSelect: new FakeElement(),
    emoteSelect: new FakeElement(),
    gestureSelect: new FakeElement(),
    voiceSampleFile: new FakeElement(),
    previewVoiceSample: new FakeElement(),
    previewCharacterAnimation: new FakeElement(),
    continuitySettingsDialog: new FakeElement(),
    continuitySettingsOpen: new FakeElement(),
    continuitySettingsClose: new FakeElement(),
    callHistoryToggle: new FakeElement(),
    callDeferredList: new FakeElement(),
    manualWorkspaceRootSelect: new FakeElement(),
    agentModeSelect: new FakeElement({ value: 'standard', tagName: 'SELECT' }),
    manualWorkspaceRootInput: new FakeElement(),
    agentSelfName: new FakeElement(),
    agentSelfPronouns: new FakeElement(),
    agentSelfPersonality: new FakeElement(),
    agentSelfInterests: new FakeElement(),
    agentSelfPrompt: new FakeElement(),
    continuitySettingsSave: new FakeElement(),
    continuitySettingsDirty: new FakeElement(),
    smoothGestureTransitionsToggle: new FakeElement(),
    cameraDistanceInput: new FakeElement({ value: '1' }),
    cameraDistanceValue: new FakeElement(),
    pluginSettingsDialog: new FakeElement({ tagName: 'DIALOG' }),
    pluginSettingsOpen: new FakeElement(),
    pluginSettingsClose: new FakeElement(),
    pluginSettingsSave: new FakeElement(),
    pluginSettingsAuthHint: new FakeElement(),
    codexPluginList: Object.assign(new FakeElement(), {
      replaceChildren(...children) {
        this.children = children;
      },
      querySelectorAll() {
        return [];
      },
    }),
    codexPluginEmpty: new FakeElement(),
    advancedSettingsDialog: new FakeElement({ tagName: 'DIALOG' }),
    advancedSettingsOpen: new FakeElement(),
    advancedSettingsClose: new FakeElement(),
    advancedSettingsSave: new FakeElement(),
    advancedControlComputer: Object.assign(new FakeElement(), { checked: false }),
    advancedComplexTasks: Object.assign(new FakeElement(), { checked: false }),
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

test('bindAppEvents opens and closes the continuity popup', () => {
  globalThis.window = Object.assign(new EventTarget(), {
    confirm() {
      return true;
    },
  });

  const dom = createDom();

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
      syncSessionSetup() {},
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

  dom.continuitySettingsOpen.dispatchEvent(new Event('click'));
  assert.equal(dom.continuitySettingsDialog.open, true);
  assert.equal(dom.continuitySettingsSave.disabled, true);

  dom.continuitySettingsClose.dispatchEvent(new Event('click'));
  assert.equal(dom.continuitySettingsDialog.open, false);
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

test('bindAppEvents updates camera distance from the setup control and persists it', async () => {
  globalThis.window = new EventTarget();

  const dom = createDom();
  const state = {
    preferences: {
      cameraDistance: 1,
    },
  };
  let persistedCount = 0;
  let appliedDistance = 0;

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
      setCameraDistance(distance) {
        appliedDistance = distance;
        state.preferences.cameraDistance = distance;
        dom.cameraDistanceValue.textContent = `${Math.round(distance * 100)}%`;
      },
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
    },
    persistState() {
      persistedCount += 1;
    },
    addLog() {},
    formatError(error) {
      return error;
    },
  });

  dom.cameraDistanceInput.value = '1.15';
  dom.cameraDistanceInput.dispatchEvent(new Event('input'));
  await Promise.resolve();

  assert.equal(appliedDistance, 1.15);
  assert.equal(state.preferences.cameraDistance, 1.15);
  assert.equal(dom.cameraDistanceValue.textContent, '115%');
  assert.equal(persistedCount, 1);
});

test('bindAppEvents saves continuity settings only when the save button is pressed', async () => {
  globalThis.window = Object.assign(new EventTarget(), {
    confirm() {
      return true;
    },
  });

  const dom = createDom();
  let savedSettings = null;

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
      saveAgentSelfSettings: async (settings) => {
        savedSettings = settings;
      },
      syncSessionSetup() {},
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

  dom.continuitySettingsOpen.dispatchEvent(new Event('click'));
  dom.agentModeSelect.value = 'continuity';
  dom.agentSelfName.value = 'Moth';
  dom.agentSelfPronouns.value = 'they/them';
  dom.agentSelfPersonality.value = 'quietly observant';
  dom.agentSelfInterests.value = 'memory, bridges';
  dom.agentSelfPrompt.value = 'notice repetition';
  dom.agentModeSelect.dispatchEvent(new Event('change'));
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(savedSettings, null);
  assert.equal(dom.continuitySettingsSave.disabled, false);
  assert.equal(dom.continuitySettingsDirty.hidden, false);

  dom.continuitySettingsSave.dispatchEvent(new Event('click'));
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(savedSettings, {
    agentMode: 'continuity',
    manualMode: {
      workspaceRoot: '',
    },
    selfProfile: {
      name: 'Moth',
      pronouns: 'they/them',
      personality: 'quietly observant',
      interests: 'memory, bridges',
      selfPrompt: 'notice repetition',
    },
  });
  assert.equal(dom.continuitySettingsDialog.open, false);
  assert.equal(dom.continuitySettingsSave.disabled, true);
  assert.equal(dom.continuitySettingsDirty.hidden, true);
});

test('bindAppEvents chooses and saves the manual workspace root from the continuity dialog', async () => {
  globalThis.window = Object.assign(new EventTarget(), {
    confirm() {
      return true;
    },
  });

  const dom = createDom();
  let savedSettings = null;

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
      selectManualWorkspaceRoot: async () => '/tmp/workspace-beta',
      saveAgentSelfSettings: async (settings) => {
        savedSettings = settings;
      },
      syncSessionSetup() {},
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

  dom.continuitySettingsOpen.dispatchEvent(new Event('click'));
  dom.manualWorkspaceRootSelect.dispatchEvent(new Event('click'));
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(dom.manualWorkspaceRootInput.value, '/tmp/workspace-beta');
  assert.deepEqual(savedSettings, {
    agentMode: 'standard',
    manualMode: {
      workspaceRoot: '/tmp/workspace-beta',
    },
    selfProfile: {
      name: '',
      pronouns: '',
      personality: '',
      interests: '',
      selfPrompt: '',
    },
  });
});

test('bindAppEvents warns before closing dirty continuity settings without saving', () => {
  let confirmCount = 0;
  globalThis.window = Object.assign(new EventTarget(), {
    confirm() {
      confirmCount += 1;
      return false;
    },
  });

  const dom = createDom();

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
      syncSessionSetup() {},
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

  dom.continuitySettingsOpen.dispatchEvent(new Event('click'));
  dom.agentSelfName.value = 'Unsaved';
  dom.agentSelfName.dispatchEvent(new Event('input'));
  dom.continuitySettingsClose.dispatchEvent(new Event('click'));

  assert.equal(confirmCount, 1);
  assert.equal(dom.continuitySettingsDialog.open, true);
});

test('bindAppEvents restores the saved continuity values when discard is confirmed', async () => {
  globalThis.window = Object.assign(new EventTarget(), {
    confirm() {
      return true;
    },
  });

  const dom = createDom();

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
      saveAgentSelfSettings: async () => {},
      syncSessionSetup() {},
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

  dom.continuitySettingsOpen.dispatchEvent(new Event('click'));
  dom.agentSelfName.value = 'Saved';
  dom.agentSelfName.dispatchEvent(new Event('input'));
  dom.continuitySettingsSave.dispatchEvent(new Event('click'));
  await Promise.resolve();
  await Promise.resolve();

  dom.continuitySettingsOpen.dispatchEvent(new Event('click'));
  dom.agentSelfName.value = 'Discard me';
  dom.agentSelfName.dispatchEvent(new Event('input'));
  dom.continuitySettingsClose.dispatchEvent(new Event('click'));

  assert.equal(dom.continuitySettingsDialog.open, false);
  assert.equal(dom.agentSelfName.value, 'Saved');
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

test('bindAppEvents loads live Codex plugins when opening the plugin dialog and persists the selection', async () => {
  globalThis.window = new EventTarget();

  const dom = createDom();
  const state = {
    callHistoryCollapsed: true,
    preferences: {
      bundledModelId: 'bhf-1-2',
      enabledPluginIds: [],
      enableControlComputer: false,
      enableComplexTasks: false,
    },
    codex: {
      availablePlugins: [],
    },
  };
  let loadCount = 0;
  let persistCount = 0;
  let syncedWorkspaceSetup = null;
  let syncSessionSetupCount = 0;

  dom.codexPluginList.querySelectorAll = () => [
    { dataset: { pluginId: 'figma@openai-curated' } },
    { dataset: { pluginId: 'github@openai-curated' } },
  ];

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
      loadAvailablePlugins: async () => {
        loadCount += 1;
        state.codex.availablePlugins = [
          {
            id: 'github@openai-curated',
            displayName: 'GitHub',
            marketplace: 'openai-curated',
            version: '1.0.0',
            description: 'GitHub access',
          },
          {
            id: 'figma@openai-curated',
            displayName: 'Figma',
            marketplace: 'openai-curated',
            version: '1.0.0',
            description: 'Figma access',
          },
        ];
      },
      syncWorkspaceSetup: async (payload) => {
        syncedWorkspaceSetup = payload;
      },
      syncSessionSetup: async () => {
        syncSessionSetupCount += 1;
      },
      destroy() {},
    },
    presenter: {
      refreshActionButtons() {},
      renderDebugSnapshot() {},
      renderTranscriptList() {},
    },
    persistState() {
      persistCount += 1;
    },
    addLog() {},
    formatError(error) {
      return error;
    },
  });

  dom.pluginSettingsOpen.dispatchEvent(new Event('click'));
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(loadCount, 1);
  assert.equal(dom.pluginSettingsDialog.open, true);
  assert.match(dom.codexPluginList.textContent, /GitHub/);
  assert.match(dom.codexPluginList.textContent, /Figma/);

  dom.pluginSettingsSave.dispatchEvent(new Event('click'));
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(state.preferences.enabledPluginIds, [
    'figma@openai-curated',
    'github@openai-curated',
  ]);
  assert.equal(persistCount, 1);
  assert.equal(syncSessionSetupCount, 1);
  assert.equal(dom.pluginSettingsDialog.open, false);
  assert.deepEqual(syncedWorkspaceSetup, {
    activeModelId: 'bhf-1-2',
    activeModelLabel: 'BHF 1.2',
    enabledPluginIds: ['figma@openai-curated', 'github@openai-curated'],
    enableControlComputer: false,
    enableComplexTasks: false,
  });
});

test('bindAppEvents can open plugin settings from a blocked connector task with an auth hint', async () => {
  globalThis.window = new EventTarget();

  const dom = createDom();
  const state = {
    callHistoryCollapsed: true,
    preferences: {
      bundledModelId: 'bhf-1-2',
      enabledPluginIds: ['google-calendar@openai-curated'],
      enableControlComputer: false,
      enableComplexTasks: false,
    },
    codex: {
      availablePlugins: [],
    },
  };

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
      loadAvailablePlugins: async () => {
        state.codex.availablePlugins = [
          {
            id: 'google-calendar@openai-curated',
            displayName: 'Google Calendar',
            marketplace: 'openai-curated',
            version: '1.0.0',
            description: 'Look up events and availability.',
          },
        ];
      },
      syncWorkspaceSetup: async () => {},
      syncSessionSetup: async () => {},
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

  dom.callDeferredList.dataset.action = 'open-plugin-settings';
  dom.callDeferredList.dataset.connectorName = 'Google Calendar';
  dom.callDeferredList.dispatchEvent(new Event('click'));
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(dom.pluginSettingsDialog.open, true);
  assert.equal(dom.pluginSettingsAuthHint.hidden, false);
  assert.match(dom.pluginSettingsAuthHint.textContent, /Google Calendar needs reconnecting/);
});

test('bindAppEvents persists advanced Codex tool toggles', async () => {
  globalThis.window = new EventTarget();

  const dom = createDom();
  const state = {
    callHistoryCollapsed: true,
    preferences: {
      bundledModelId: 'bhf-1-2',
      enabledPluginIds: ['github@openai-curated'],
      enableControlComputer: false,
      enableComplexTasks: false,
    },
    codex: {
      availablePlugins: [],
    },
  };
  let persistCount = 0;
  let syncedWorkspaceSetup = null;
  let syncSessionSetupCount = 0;

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
      syncWorkspaceSetup: async (payload) => {
        syncedWorkspaceSetup = payload;
      },
      syncSessionSetup: async () => {
        syncSessionSetupCount += 1;
      },
      destroy() {},
    },
    presenter: {
      refreshActionButtons() {},
      renderDebugSnapshot() {},
      renderTranscriptList() {},
    },
    persistState() {
      persistCount += 1;
    },
    addLog() {},
    formatError(error) {
      return error;
    },
  });

  dom.advancedSettingsOpen.dispatchEvent(new Event('click'));
  assert.equal(dom.advancedSettingsDialog.open, true);
  assert.equal(dom.advancedControlComputer.checked, false);
  assert.equal(dom.advancedComplexTasks.checked, false);

  dom.advancedControlComputer.checked = true;
  dom.advancedComplexTasks.checked = true;
  dom.advancedSettingsSave.dispatchEvent(new Event('click'));
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(state.preferences.enableControlComputer, true);
  assert.equal(state.preferences.enableComplexTasks, true);
  assert.equal(persistCount, 1);
  assert.equal(syncSessionSetupCount, 1);
  assert.equal(dom.advancedSettingsDialog.open, false);
  assert.deepEqual(syncedWorkspaceSetup, {
    activeModelId: 'bhf-1-2',
    activeModelLabel: 'BHF 1.2',
    enabledPluginIds: ['github@openai-curated'],
    enableControlComputer: true,
    enableComplexTasks: true,
  });
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

test('bindAppEvents routes the call camera button to the local camera toggle', async () => {
  globalThis.window = new EventTarget();

  const dom = createDom();
  let toggleCount = 0;

  bindAppEvents({
    dom,
    humanVoiceLayer: {
      runTextTurn: async () => {},
    },
    agentVoiceLayer: {
      getSnapshot() {
        return { speakReplies: true };
      },
      updateConfig() {},
      cancelSpeech() {},
    },
    localCameraController: {
      toggleEnabled: async () => {
        toggleCount += 1;
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

  dom.callCameraToggle.dispatchEvent(new Event('click'));
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(toggleCount, 1);
});

test('bindAppEvents routes the call speaker button to the speaker toggle', async () => {
  globalThis.window = new EventTarget();

  const dom = createDom();
  const patches = [];
  let cancelled = 0;

  bindAppEvents({
    dom,
    humanVoiceLayer: {
      runTextTurn: async () => {},
    },
    agentVoiceLayer: {
      getSnapshot() {
        return { speakReplies: true };
      },
      updateConfig(patch) {
        patches.push(patch);
      },
      cancelSpeech() {
        cancelled += 1;
      },
    },
    localCameraController: {
      toggleEnabled: async () => {},
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
      renderCallSnapshot() {},
      renderAgentStatus() {},
    },
    persistState() {},
    addLog() {},
    formatError(error) {
      return error;
    },
  });

  dom.callSpeakerToggle.dispatchEvent(new Event('click'));
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(patches, [{ speakReplies: false }]);
  assert.equal(cancelled, 1);
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

test('bindAppEvents updates the smooth gesture transition flag from settings', () => {
  globalThis.window = new EventTarget();

  const dom = createDom();
  let nextEnabled = null;
  let persistCount = 0;
  dom.smoothGestureTransitionsToggle.checked = false;

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
      setSmoothGestureTransitions(enabled) {
        nextEnabled = enabled;
      },
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
    },
    persistState() {
      persistCount += 1;
    },
    addLog() {},
    formatError(error) {
      return error;
    },
  });

  dom.smoothGestureTransitionsToggle.dispatchEvent(new Event('change'));

  assert.equal(nextEnabled, false);
  assert.equal(persistCount, 1);
});
