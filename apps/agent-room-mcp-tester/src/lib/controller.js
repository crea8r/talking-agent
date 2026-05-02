function buildToolRequest(name, args = {}) {
  return {
    jsonrpc: '2.0',
    method: 'tools/call',
    params: {
      name,
      arguments: args,
    },
  };
}

function extractStructuredContent(response) {
  return response?.result?.structuredContent || null;
}

export function createController({
  store,
  fetchJson,
  postJson,
  render,
  createRecognition = null,
} = {}) {
  const state = store.state;
  let recognition = null;
  let pollId = 0;

  function rerender() {
    render();
  }

  function pushBridgeLog(kind, payload) {
    store.pushHumanLog({
      kind,
      payload,
    });
    rerender();
  }

  async function loadRuntimeConfig() {
    const payload = await fetchJson('/api/runtime-config');
    store.setRuntimeConfig(payload);
    rerender();
    return payload;
  }

  async function refreshMcpState() {
    const [statePayload, transcriptPayload] = await Promise.all([
      fetchJson('/api/mcp/state'),
      fetchJson('/api/mcp/transcript'),
    ]);
    store.setMcpSnapshot({
      state: statePayload.state,
      transcript: transcriptPayload.transcript,
    });
    rerender();
  }

  async function refreshBridge() {
    if (!state.session?.id) {
      return;
    }

    const payload = await fetchJson(`/api/bridge/sessions/${encodeURIComponent(state.session.id)}`);
    store.setBridgePayload(payload);
    rerender();
    await consumePendingActions();
  }

  async function createCall({ title, humanIdentity, humanName }) {
    const payload = await postJson('/api/bridge/sessions', {
      title,
      humanIdentity,
      humanName,
    });
    store.setBridgePayload(payload);
    pushBridgeLog('create-call', { title, humanIdentity, humanName });
    rerender();
  }

  async function updateCallState(nextState, reason = '') {
    if (!state.session?.id) {
      throw new Error('Create a call first.');
    }

    const payload = await postJson(
      `/api/bridge/sessions/${encodeURIComponent(state.session.id)}/state`,
      {
        state: nextState,
        reason,
      },
    );
    store.setBridgePayload(payload);
    pushBridgeLog('call-state', { state: nextState, reason });
    rerender();
  }

  async function beginUtterance(utteranceId = globalThis.crypto?.randomUUID?.() || `utt-${Date.now()}`) {
    if (!state.session?.id) {
      throw new Error('Create a call first.');
    }

    const payload = await postJson(
      `/api/bridge/sessions/${encodeURIComponent(state.session.id)}/utterances/start`,
      {
        utteranceId,
      },
    );
    state.activeUtteranceId = utteranceId;
    state.activeUtteranceText = '';
    store.setBridgePayload(payload);
    pushBridgeLog('utterance-start', { utteranceId });
    rerender();
    return utteranceId;
  }

  async function syncInterimTranscript(text) {
    const nextText = `${text || ''}`.trim();
    if (!nextText) {
      return;
    }

    const utteranceId = state.activeUtteranceId || (await beginUtterance());
    const previousText = `${state.activeUtteranceText || ''}`;
    if (previousText && !nextText.startsWith(previousText)) {
      state.activeUtteranceText = nextText;
      rerender();
      return utteranceId;
    }

    const delta = previousText ? nextText.slice(previousText.length) : nextText;
    if (!delta) {
      return utteranceId;
    }

    const payload = await postJson(
      `/api/bridge/sessions/${encodeURIComponent(state.session.id)}/utterances/partial`,
      {
        utteranceId,
        delta,
      },
    );
    state.activeUtteranceId = utteranceId;
    state.activeUtteranceText = nextText;
    store.setBridgePayload(payload);
    pushBridgeLog('utterance-partial', { utteranceId, delta, text: nextText });
    rerender();
    return utteranceId;
  }

  async function finalizeTranscript(text, { source = 'typed', humanIdentity, humanName } = {}) {
    const cleanedText = `${text || ''}`.trim();
    if (!cleanedText) {
      return;
    }
    if (!state.session?.id) {
      throw new Error('Create a call first.');
    }

    const utteranceId = state.activeUtteranceId || (await beginUtterance());
    const payload = await postJson(
      `/api/bridge/sessions/${encodeURIComponent(state.session.id)}/utterances/final`,
      {
        utteranceId,
        text: cleanedText,
        source,
        humanIdentity,
        humanName,
      },
    );
    state.activeUtteranceId = null;
    state.activeUtteranceText = '';
    store.setBridgePayload(payload);
    pushBridgeLog('utterance-final', { utteranceId, text: cleanedText, source });
    rerender();
    await consumePendingActions();
  }

  async function sendMcpRequest(message) {
    const payload = await postJson('/api/mcp/request', message);
    store.setMcpSnapshot({
      transcript: payload.transcript,
      state: payload.state,
      response: payload.response,
    });

    const structured = extractStructuredContent(payload.response);
    if (structured?.cursor) {
      pushBridgeLog('mcp-cursor', { cursor: structured.cursor });
    }
    if (structured?.nextCursor) {
      pushBridgeLog('mcp-next-cursor', { nextCursor: structured.nextCursor });
    }

    rerender();
    await refreshBridge().catch(() => {});
    return payload.response;
  }

  async function connectMcp() {
    const payload = await postJson('/api/mcp/connect', {});
    store.setMcpSnapshot({
      transcript: payload.transcript,
      state: payload.state,
    });
    rerender();
  }

  async function resetMcp() {
    const payload = await postJson('/api/mcp/reset', {});
    store.setMcpSnapshot({
      transcript: payload.transcript,
      state: payload.state,
      response: null,
    });
    rerender();
  }

  async function ackAction(actionId, phase) {
    if (!state.session?.id) {
      throw new Error('Create a call first.');
    }

    const payload = await postJson(
      `/api/bridge/sessions/${encodeURIComponent(state.session.id)}/actions/${encodeURIComponent(actionId)}/${phase}`,
      {},
    );
    store.setBridgePayload(payload);
    pushBridgeLog('action-ack', { actionId, phase });
    rerender();
  }

  async function consumePendingActions() {
    if (!state.autoAck || state.processingActions || !state.session?.id || !state.pendingActions.length) {
      return;
    }

    state.processingActions = true;
    try {
      for (const action of state.pendingActions) {
        if (action.type === 'speech') {
          await ackAction(action.actionId, 'started');
          await ackAction(action.actionId, 'finished');
          continue;
        }

        await ackAction(action.actionId, 'completed');
      }
    } finally {
      state.processingActions = false;
    }
  }

  function startPolling() {
    stopPolling();
    pollId = window.setInterval(() => {
      void Promise.allSettled([refreshBridge(), refreshMcpState()]);
    }, 1500);
  }

  function stopPolling() {
    if (!pollId) {
      return;
    }

    clearInterval(pollId);
    pollId = 0;
  }

  async function startListening({ humanIdentity, humanName }) {
    if (typeof createRecognition !== 'function') {
      throw new Error('Speech recognition is unavailable in this browser.');
    }

    if (!state.session?.id) {
      throw new Error('Create a call first.');
    }

    recognition = createRecognition();
    if (!recognition) {
      throw new Error('Speech recognition is unavailable in this browser.');
    }
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.onresult = async (event) => {
      let interimText = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = `${result?.[0]?.transcript || ''}`.trim();
        if (!transcript) {
          continue;
        }

        if (result.isFinal) {
          await finalizeTranscript(transcript, {
            source: 'speech',
            humanIdentity,
            humanName,
          });
        } else {
          interimText = transcript;
        }
      }

      if (interimText) {
        await syncInterimTranscript(interimText);
      }
    };
    recognition.onend = () => {
      store.setSpeechActive(false);
      rerender();
    };
    recognition.onerror = () => {
      store.setSpeechActive(false);
      rerender();
    };
    store.setSpeechActive(true);
    rerender();
    recognition.start();
  }

  function stopListening() {
    recognition?.stop?.();
    recognition = null;
    store.setSpeechActive(false);
    rerender();
  }

  return {
    loadRuntimeConfig,
    refreshBridge,
    refreshMcpState,
    createCall,
    updateCallState,
    beginUtterance,
    syncInterimTranscript,
    finalizeTranscript,
    sendMcpRequest,
    connectMcp,
    resetMcp,
    ackAction,
    consumePendingActions,
    startPolling,
    stopPolling,
    startListening,
    stopListening,
    buildToolRequest,
  };
}
