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
    lastMcpResponse: null,
    activeUtteranceId: null,
    activeUtteranceText: '',
    autoAck: true,
    processingActions: false,
    speechSupported: false,
    speechActive: false,
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
  };
}
