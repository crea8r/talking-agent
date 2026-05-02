import { fetchJson, fetchRuntimeConfig, postJson } from '/lib/http.js';
import { createAppStore } from '/lib/store.js';
import { render as renderApp } from '/lib/presenter.js';
import { createController } from '/lib/controller.js';
import { bindEvents } from '/lib/events.js';

const dom = {
  callState: document.querySelector('#call-state'),
  callDetail: document.querySelector('#call-detail'),
  mcpState: document.querySelector('#mcp-state'),
  mcpDetail: document.querySelector('#mcp-detail'),
  speechSupport: document.querySelector('#speech-support'),
  callTitle: document.querySelector('#call-title'),
  humanIdentity: document.querySelector('#human-identity'),
  humanName: document.querySelector('#human-name'),
  createCall: document.querySelector('#create-call'),
  markLive: document.querySelector('#mark-live'),
  endCall: document.querySelector('#end-call'),
  typedInput: document.querySelector('#typed-input'),
  sendTyped: document.querySelector('#send-typed'),
  startMic: document.querySelector('#start-mic'),
  stopMic: document.querySelector('#stop-mic'),
  interimTranscript: document.querySelector('#interim-transcript'),
  humanLog: document.querySelector('#human-log'),
  connectMcp: document.querySelector('#connect-mcp'),
  resetMcp: document.querySelector('#reset-mcp'),
  mcpInitialize: document.querySelector('#mcp-initialize'),
  mcpTools: document.querySelector('#mcp-tools'),
  mcpResources: document.querySelector('#mcp-resources'),
  mcpPrompts: document.querySelector('#mcp-prompts'),
  agentId: document.querySelector('#agent-id'),
  agentLabel: document.querySelector('#agent-label'),
  mcpJoinCall: document.querySelector('#mcp-join-call'),
  mcpWaitEvents: document.querySelector('#mcp-wait-events'),
  mcpRecentTurns: document.querySelector('#mcp-recent-turns'),
  mcpLeaveCall: document.querySelector('#mcp-leave-call'),
  waitCursor: document.querySelector('#wait-cursor'),
  waitMs: document.querySelector('#wait-ms'),
  waitMaxEvents: document.querySelector('#wait-max-events'),
  publishText: document.querySelector('#publish-text'),
  publishGesture: document.querySelector('#publish-gesture'),
  publishEmote: document.querySelector('#publish-emote'),
  publishStage: document.querySelector('#publish-stage'),
  publishMood: document.querySelector('#publish-mood'),
  publishNotes: document.querySelector('#publish-notes'),
  mcpPublishActions: document.querySelector('#mcp-publish-actions'),
  rawMcpRequest: document.querySelector('#raw-mcp-request'),
  sendRawMcp: document.querySelector('#send-raw-mcp'),
  mcpLastResponse: document.querySelector('#mcp-last-response'),
  mcpTranscript: document.querySelector('#mcp-transcript'),
  autoAck: document.querySelector('#auto-ack'),
  refreshBridge: document.querySelector('#refresh-bridge'),
  bridgeSummary: document.querySelector('#bridge-summary'),
  bridgeEvents: document.querySelector('#bridge-events'),
  pendingActionControls: document.querySelector('#pending-action-controls'),
  pendingActionsJson: document.querySelector('#pending-actions-json'),
  recentTurns: document.querySelector('#recent-turns'),
};

const store = createAppStore();

const recognitionFactory = () => {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  return Recognition ? new Recognition() : null;
};

const controller = createController({
  store,
  fetchJson,
  postJson,
  render,
  createRecognition: recognitionFactory,
});

function render() {
  renderApp(dom, store.state);
}

async function boot() {
  const runtimeConfig = await fetchRuntimeConfig();
  store.setRuntimeConfig(runtimeConfig);
  dom.callTitle.value = runtimeConfig.defaults.callTitle;
  dom.humanIdentity.value = runtimeConfig.defaults.humanIdentity;
  dom.humanName.value = runtimeConfig.defaults.humanName;
  dom.rawMcpRequest.value = JSON.stringify(
    {
      jsonrpc: '2.0',
      method: 'tools/list',
      params: {},
    },
    null,
    2,
  );

  store.setSpeechSupported(Boolean(window.SpeechRecognition || window.webkitSpeechRecognition));
  bindEvents({
    dom,
    store,
    controller,
    render,
  });
  render();
  controller.startPolling();
  await controller.refreshMcpState().catch(() => {});
}

boot().catch((error) => {
  store.pushHumanLog({
    kind: 'boot-error',
    payload: {
      error: error instanceof Error ? error.message : 'Unknown boot error.',
    },
  });
  render();
});
