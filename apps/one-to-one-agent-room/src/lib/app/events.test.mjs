import test from 'node:test';
import assert from 'node:assert/strict';

import { bindAppEvents } from './events.js';

class FakeElement extends EventTarget {
  constructor({ value = '', checked = false } = {}) {
    super();
    this.value = value;
    this.checked = checked;
    this.disabled = false;
    this.textContent = '';
  }
}

function createDom() {
  return {
    livekitUrl: new FakeElement(),
    roomName: new FakeElement(),
    identity: new FakeElement(),
    participantName: new FakeElement(),
    enableCamera: new FakeElement({ checked: true }),
    enableMicrophone: new FakeElement({ checked: true }),
    humanLocale: new FakeElement({ value: 'en-US' }),
    joinCall: new FakeElement(),
    disconnectCallLive: new FakeElement(),
    openConnectPrompt: new FakeElement(),
    copyMcpCommand: new FakeElement(),
    runDemoReply: new FakeElement(),
    mcpCommand: new FakeElement(),
    connectPromptDialog: new FakeElement(),
    connectPromptBody: new FakeElement(),
    copyConnectPrompt: new FakeElement(),
    closeConnectPrompt: new FakeElement(),
    startListening: new FakeElement(),
    stopListening: new FakeElement(),
    typedInput: new FakeElement(),
    sendTyped: new FakeElement(),
    clearTyped: new FakeElement(),
    bundledModelSelect: new FakeElement(),
    stageSelect: new FakeElement(),
    emoteSelect: new FakeElement(),
    gestureSelect: new FakeElement(),
    voiceSelect: new FakeElement(),
    speechRate: new FakeElement({ value: '1' }),
    speechPitch: new FakeElement({ value: '1' }),
  };
}

test('bindAppEvents refreshes the primary call button as required fields change', () => {
  globalThis.window = new EventTarget();

  const dom = createDom();
  let refreshCount = 0;
  let scheduleCount = 0;

  bindAppEvents({
    dom,
    state: {
      preferences: {
        humanLocale: 'en-US',
        voiceName: '',
        speechRate: 1,
        speechPitch: 1,
      },
    },
    humanVoiceLayer: {
      stopListening() {},
      updateConfig() {},
      startListening: async () => {},
      runTextTurn: async () => {},
    },
    avatarController: {
      selectBundledModel() {},
      selectStage() {},
      selectEmote() {},
      selectGesture() {},
    },
    sessionController: {
      scheduleLobbySessionPreparation() {
        scheduleCount += 1;
      },
      handlePrimaryCallAction: async () => {},
      disconnectCall: async () => {},
      openConnectPrompt() {},
      ensureSessionReady: async () => {},
      runDemoReply: async () => {},
      destroy() {},
    },
    presenter: {
      refreshActionButtons() {
        refreshCount += 1;
      },
      renderDebugSnapshot() {},
      renderHumanStatus() {},
    },
    persistState() {},
    syncAgentVoiceConfig() {},
    addLog() {},
    formatError(error) {
      return error;
    },
  });

  dom.livekitUrl.value = 'ws://127.0.0.1:7880';
  dom.livekitUrl.dispatchEvent(new Event('input'));

  assert.equal(refreshCount, 1);
  assert.equal(scheduleCount, 1);
});
