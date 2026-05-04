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
  notice: document.querySelector('#notice'),
  startSession: document.querySelector('#start-session'),
  copyMcpCommand: document.querySelector('#copy-mcp-command'),
  mcpCommand: document.querySelector('#mcp-command'),
  startSessionRequest: document.querySelector('#start-session-request'),
  startSessionResponse: document.querySelector('#start-session-response'),
  turnInput: document.querySelector('#turn-input'),
  sendTurn: document.querySelector('#send-turn'),
  lastEventRequest: document.querySelector('#last-event-request'),
  lastEventResponse: document.querySelector('#last-event-response'),
  replyText: document.querySelector('#reply-text'),
  replyGesture: document.querySelector('#reply-gesture'),
  replyMood: document.querySelector('#reply-mood'),
  replyNotes: document.querySelector('#reply-notes'),
  publishReply: document.querySelector('#publish-reply'),
  lastPublishRequest: document.querySelector('#last-publish-request'),
  latestAgentReply: document.querySelector('#latest-agent-reply'),
  refreshDebug: document.querySelector('#refresh-debug'),
  autoAck: document.querySelector('#auto-ack'),
  pendingActionControls: document.querySelector('#pending-action-controls'),
  pendingActionsJson: document.querySelector('#pending-actions-json'),
  recentEvents: document.querySelector('#recent-events'),
  recentTurns: document.querySelector('#recent-turns'),
  fullTranscript: document.querySelector('#full-transcript'),
  humanLog: document.querySelector('#human-log'),
};

const store = createAppStore();

const controller = createController({
  store,
  fetchJson,
  postJson,
  render,
  createRecognition: null,
});

function render() {
  renderApp(dom, store.state);
}

async function boot() {
  const runtimeConfig = await fetchRuntimeConfig();
  store.setRuntimeConfig(runtimeConfig);
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
  store.setNotice(error instanceof Error ? error.message : 'Unknown boot error.');
  store.pushHumanLog({
    kind: 'boot-error',
    payload: {
      error: error instanceof Error ? error.message : 'Unknown boot error.',
    },
  });
  render();
});
