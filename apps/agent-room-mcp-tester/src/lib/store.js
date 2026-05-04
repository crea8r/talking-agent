export function createAppStore() {
  const state = {
    runtimeConfig: null,
    session: null,
    inspector: null,
    pendingActions: [],
    humanLog: [],
    mcpTranscript: [],
    mcpState: {
      connected: false,
      pid: null,
      transcriptCount: 0,
      pendingCount: 0,
      stateFilePath: '',
      lastError: null,
    },
    bootstrapDebug: {
      initializeRequest: null,
      initializeResponse: null,
      initializedNotification: null,
      toolsListRequest: null,
      toolsListResponse: null,
      joinCallRequest: null,
      joinCallResponse: null,
    },
    lastEventDebug: {
      request: null,
      response: null,
    },
    lastPublishDebug: {
      request: null,
      response: null,
    },
    lastMcpResponse: null,
    localAgentCursor: '0',
    activeUtteranceId: null,
    activeUtteranceText: '',
    autoAck: true,
    processingActions: false,
    speechSupported: false,
    speechActive: false,
    notice: '',
  };

  return {
    state,
    setRuntimeConfig(config) {
      state.runtimeConfig = config;
    },
    setSpeechSupported(value) {
      state.speechSupported = Boolean(value);
    },
    setSpeechActive(value) {
      state.speechActive = Boolean(value);
    },
    setNotice(value) {
      state.notice = `${value || ''}`.trim();
    },
    setAutoAck(value) {
      state.autoAck = Boolean(value);
    },
    pushHumanLog(entry) {
      state.humanLog = [...state.humanLog, entry].slice(-80);
    },
    setBridgePayload(payload) {
      state.session = payload?.session || null;
      state.inspector = payload?.inspector || null;
      state.pendingActions = Array.isArray(payload?.pendingActions) ? payload.pendingActions : [];
    },
    setMcpSnapshot({ transcript = [], state: nextState = null, response = null } = {}) {
      state.mcpTranscript = Array.isArray(transcript) ? transcript : [];
      state.mcpState = nextState || state.mcpState;
      if (response !== null) {
        state.lastMcpResponse = response;
      }
    },
    setBootstrapDebug(payload = {}) {
      state.bootstrapDebug = {
        initializeRequest: payload.initializeRequest || null,
        initializeResponse: payload.initializeResponse || null,
        initializedNotification: payload.initializedNotification || null,
        toolsListRequest: payload.toolsListRequest || null,
        toolsListResponse: payload.toolsListResponse || null,
        joinCallRequest: payload.joinCallRequest || null,
        joinCallResponse: payload.joinCallResponse || null,
      };
    },
    setLastEventDebug(payload = {}) {
      state.lastEventDebug = {
        request: payload.request || null,
        response: payload.response || null,
      };
    },
    setLastPublishDebug(payload = {}) {
      state.lastPublishDebug = {
        request: payload.request || null,
        response: payload.response || null,
      };
    },
    setLocalAgentCursor(cursor) {
      state.localAgentCursor = `${cursor || '0'}`;
    },
  };
}
