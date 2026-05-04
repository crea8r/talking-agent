import {
  getCallPrimaryAction,
  buildCallSessionKey,
  buildCallSessionPayload,
  getAgentHeartbeatState,
  normalizeSessionForUi,
} from './call-session.js';

export function createSessionController({
  state,
  roomLayer,
  roomClass,
  videoPresets,
  logLevel,
  screenNavigator,
  humanVoiceLayer,
  agentVoiceLayer,
  avatarSpeech,
  avatarLayer,
  dom,
  stageMap,
  emoteMap,
  selectStage,
  selectEmote,
  selectGesture,
  collectFormState,
  fetchJson,
  postJson,
  addLog,
  formatError,
  renderLocalStage,
  renderRoomSnapshot,
  renderBridgeSnapshot,
  renderTranscriptList,
  renderDebugSnapshot,
  renderAgentStatus,
  refreshActionButtons,
  updateRoomStatus,
}) {
  let prepareDebounceId = 0;
  let prepareRequestId = 0;
  let heartbeatUiTickId = 0;

  function createUtteranceId() {
    return globalThis.crypto?.randomUUID?.()
      ? globalThis.crypto.randomUUID()
      : `utt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function applyBridgePayload(payload) {
    if (payload?.session) {
      state.session = normalizeSessionForUi(payload.session);
    }

    if (payload?.inspector) {
      state.inspectorSnapshot = payload.inspector;
    }
  }

  function buildPendingActionsFromLegacyReplies(session) {
    if (!session?.turns?.length) {
      return [];
    }

    return session.turns
      .filter((turn) => turn.agentReply && !turn.agentReply.playedAt)
      .sort(
        (left, right) =>
          Date.parse(left.agentReply.createdAt) - Date.parse(right.agentReply.createdAt),
      )
      .map((turn) => ({
        actionId: turn.agentReply.id,
        type: 'speech',
        text: turn.agentReply.text,
        gestureId: turn.agentReply.gestureId,
        emoteId: turn.agentReply.emoteId,
        stageId: turn.agentReply.stageId,
        mood: turn.agentReply.mood,
        legacyReplyId: turn.agentReply.id,
      }));
  }

  function resolveActiveCharacterId() {
    return (
      `${state.session?.avatar?.activeModelId || ''}`.trim() ||
      `${collectFormState().bundledModelId || ''}`.trim() ||
      `${state.preferences?.bundledModelId || ''}`.trim()
    );
  }

  async function syncAvatarCatalogForSession() {
    if (!state.session?.id) {
      return;
    }

    const modelId =
      `${collectFormState().bundledModelId || state.preferences?.bundledModelId || ''}`.trim();
    const catalog = state.runtimeConfig?.bridge?.avatarCatalogByModel?.[modelId];
    if (!modelId || !catalog) {
      return;
    }

    const payload = await postJson(
      `/api/bridge/sessions/${encodeURIComponent(state.session.id)}/avatar-catalog`,
      {
        activeModelId: modelId,
        avatarCatalogUri: catalog.uri,
        avatarCatalogVersion: catalog.version,
      },
    );

    applyBridgePayload(payload);
    renderBridgeSnapshot();
    renderDebugSnapshot();
  }

  function installSdkLogging() {
    roomLayer.installSdkLogging(({ message, context }) => {
      addLog('info', `LiveKit SDK · ${message}`, context);
    }, logLevel);
  }

  async function ensureSessionReady() {
    if (!state.session?.id) {
      throw new Error('Create the call before sending turns to the agent.');
    }
  }

  async function mintToken() {
    const form = collectFormState();
    const tokenResponse = await roomLayer.mintToken({
      roomName: form.roomName,
      identity: form.identity,
      participantName: form.participantName,
      metadata: JSON.stringify(
        {
          role: 'human',
          app: 'one-to-one-agent-room',
        },
        null,
        2,
      ),
    });

    return tokenResponse.token;
  }

  async function prepareLobbySession({ force = false } = {}) {
    if (state.room || !state.runtimeConfig) {
      return state.session;
    }

    const form = collectFormState();
    if (!form.livekitUrl || !form.roomName || !form.identity) {
      state.session = null;
      state.sessionKey = '';
      state.sessionPreparing = false;
      stopSessionPolling();
      renderRoomSnapshot();
      renderBridgeSnapshot();
      renderTranscriptList();
      renderDebugSnapshot();
      return null;
    }

    const sessionKey = buildCallSessionKey(form, state.runtimeConfig);
    if (!force && state.session?.id && state.sessionKey === sessionKey) {
      if (!state.sessionPollId) {
        startSessionPolling();
      }
      return state.session;
    }

    const requestId = ++prepareRequestId;
    state.sessionPreparing = true;
    renderRoomSnapshot();
    renderBridgeSnapshot();
    renderDebugSnapshot();

    try {
      const sessionResponse = await postJson(
        '/api/bridge/sessions',
        buildCallSessionPayload(form, state.runtimeConfig),
      );

      if (requestId !== prepareRequestId) {
        return state.session;
      }

      applyBridgePayload(sessionResponse);
      state.sessionKey = sessionKey;
      await syncAvatarCatalogForSession();
      renderBridgeSnapshot();
      renderTranscriptList();
      renderDebugSnapshot();
      startSessionPolling();
      addLog('info', 'Prepared call session.', {
        sessionId: state.session.id,
        title: state.session.title,
      });
      return state.session;
    } finally {
      if (requestId === prepareRequestId) {
        state.sessionPreparing = false;
        renderRoomSnapshot();
        renderBridgeSnapshot();
        renderAgentStatus();
        renderDebugSnapshot();
      }
    }
  }

  function scheduleLobbySessionPreparation({ force = false, immediate = false } = {}) {
    if (prepareDebounceId) {
      clearTimeout(prepareDebounceId);
      prepareDebounceId = 0;
    }

    const run = async () => {
      try {
        await prepareLobbySession({ force });
      } catch (error) {
        addLog('error', 'Prepare call session failed.', formatError(error));
      }
    };

    if (immediate) {
      void run();
      return;
    }

    prepareDebounceId = window.setTimeout(() => {
      prepareDebounceId = 0;
      void run();
    }, 450);
  }

  function openConnectPrompt() {
    if (!dom.connectPromptDialog) {
      return;
    }

    if (!dom.connectPromptDialog.open) {
      dom.connectPromptDialog.showModal?.();
    }

    window.requestAnimationFrame(() => {
      dom.connectPromptBody?.focus?.();
      dom.connectPromptBody?.select?.();
    });
  }

  async function probeLivekitBeforeConnect(livekitUrl) {
    const probe = await fetchJson(`/api/probe-livekit?url=${encodeURIComponent(livekitUrl)}`);

    if (!probe.reachable) {
      throw new Error(
        `No LiveKit server is reachable at ${livekitUrl}. Start LiveKit or change the URL. Probe target: ${probe.probeUrl}.`,
      );
    }

    addLog('info', 'LiveKit endpoint is reachable.', {
      probeUrl: probe.probeUrl,
      status: probe.status,
      statusText: probe.statusText,
    });
  }

  async function connectRoomWithTimeout(options, timeoutMs = 8000) {
    const timeoutPromise = new Promise((_, reject) => {
      window.setTimeout(() => {
        reject(new Error(`LiveKit room connect timed out after ${timeoutMs} ms.`));
      }, timeoutMs);
    });

    return Promise.race([roomLayer.connectRoom(options), timeoutPromise]);
  }

  async function joinCall() {
    await prepareLobbySession();
    const form = collectFormState();
    const heartbeat = getAgentHeartbeatState(state.session);
    if (!form.livekitUrl) {
      throw new Error('LiveKit URL is required.');
    }

    if (!form.roomName) {
      throw new Error('Room name is required.');
    }

    if (!form.identity) {
      throw new Error('Human identity is required.');
    }

    if (!state.session?.id) {
      throw new Error('The bridge session is still preparing. Wait a moment and try again.');
    }

    if (!heartbeat.ready) {
      throw new Error('Start Room is locked until the system sees a fresh agent heartbeat.');
    }

    if (state.room) {
      await disconnectCall();
    }

    updateRoomStatus('loading', 'Connecting…', 'Minting a token and bridge session.');
    await probeLivekitBeforeConnect(form.livekitUrl);

    const token = await mintToken();
    const room = new roomClass({
      adaptiveStream: true,
      dynacast: true,
      videoCaptureDefaults: {
        resolution: videoPresets.h720.resolution,
      },
    });

    installRoomListeners(room);
    state.room = room;
    renderRoomSnapshot();
    refreshActionButtons();

    try {
      await connectRoomWithTimeout({
        room,
        livekitUrl: form.livekitUrl,
        token,
        enableCamera: form.enableCamera,
        enableMicrophone: form.enableMicrophone,
      });

      renderLocalStage();
      renderRoomSnapshot();
      await postJson(`/api/bridge/sessions/${encodeURIComponent(state.session.id)}/state`, {
        state: 'live',
      }).catch(() => {});
      updateRoomStatus('ready', 'Connected', 'Room and bridge are ready.');
      screenNavigator.show('setup');
      addLog('info', 'Call created.', {
        room: room.name,
        identity: room.localParticipant.identity,
        sessionId: state.session.id,
      });
    } catch (error) {
      addLog('error', 'Call creation failed.', formatError(error));
      await disconnectCall({ preserveRoomStatus: true });
      updateRoomStatus(
        'error',
        'Connection failed',
        error instanceof Error ? error.message : 'Unable to connect to the LiveKit room.',
      );
      throw error;
    }
  }

  async function handlePrimaryCallAction() {
    const form = collectFormState();
    const action = getCallPrimaryAction({
      session: state.session,
      room: state.room,
      sessionPreparing: state.sessionPreparing,
      modelLoading: state.modelLoading,
      formReady: Boolean(form.livekitUrl && form.roomName && form.identity),
    });

    if (action.mode === 'start-room') {
      await joinCall();
      return;
    }

    openConnectPrompt();

    if (!state.runtimeConfig) {
      updateRoomStatus(
        'loading',
        'Loading project',
        'Runtime config is still loading. Try Connect Agent again in a moment.',
      );
      addLog('warn', 'Connect Agent clicked before runtime config finished loading.');
      return;
    }

    updateRoomStatus(
      'loading',
      'Agent setup',
      'Opening the bridge steps and preparing a call session for the agent.',
    );

    try {
      await prepareLobbySession({ force: true });
      addLog('info', 'Opened agent connection steps.', {
        sessionId: state.session?.id || null,
      });
    } catch (error) {
      updateRoomStatus(
        'error',
        'Agent setup failed',
        error instanceof Error ? error.message : 'Unable to prepare the call session.',
      );
      throw error;
    }
  }

  async function disconnectCall({ preserveRoomStatus = false } = {}) {
    stopSessionPolling();
    humanVoiceLayer.stopListening();
    avatarSpeech.stop({ cancelVoice: true });
    const disconnectSessionId = state.session?.id || null;

    if (state.room) {
      try {
        await roomLayer.disconnectRoom(state.room);
      } catch (error) {
        addLog('error', 'Room disconnect failed.', formatError(error));
      }
    }

    state.room = null;
    if (!preserveRoomStatus) {
      state.session = null;
      state.sessionKey = '';
      renderBridgeSnapshot();
      renderTranscriptList();
    }
    renderLocalStage();
    renderRoomSnapshot();
    if (!preserveRoomStatus) {
      screenNavigator.show('setup');
    } else {
      dom.localIdentity.textContent = collectFormState().identity || 'none';
      dom.remoteCount.textContent = '0';
    }
    refreshActionButtons();
    renderAgentStatus();
    renderDebugSnapshot();

    if (preserveRoomStatus && state.session?.id) {
      startSessionPolling();
      return;
    }

    if (!preserveRoomStatus && disconnectSessionId) {
      await postJson(`/api/bridge/sessions/${encodeURIComponent(disconnectSessionId)}/state`, {
        state: 'ended',
        reason: 'human disconnected room',
      }).catch(() => {});
    }

    if (!preserveRoomStatus) {
      scheduleLobbySessionPreparation({ force: true, immediate: true });
    }
  }

  function installRoomListeners(room) {
    roomLayer.attachRoomListeners(room, (event) => {
      switch (event.type) {
        case 'connected':
          addLog('info', 'LiveKit room connected.', {
            room: room.name,
            identity: room.localParticipant.identity,
          });
          renderRoomSnapshot();
          break;
        case 'connection-state-changed':
          addLog('info', 'Connection state changed.', {
            connectionState: event.connectionState,
          });
          renderRoomSnapshot();
          break;
        case 'participant-connected':
        case 'participant-disconnected':
        case 'active-speakers-changed':
          renderRoomSnapshot();
          break;
        case 'local-track-published':
        case 'local-track-unpublished':
          renderLocalStage();
          renderRoomSnapshot();
          break;
        case 'disconnected':
          addLog('warn', 'Room disconnected.', { reason: event.reason });
          renderRoomSnapshot();
          break;
        case 'media-devices-error':
          addLog('error', 'Media device error.', formatError(event.error));
          break;
        default:
          break;
      }

      renderDebugSnapshot();
    });
  }

  function startSessionPolling() {
    stopSessionPolling();
    if (!state.session?.id) {
      return;
    }

    startHeartbeatFreshnessTicker();
    state.sessionPollId = window.setInterval(() => {
      void pollSession();
    }, 1500);

    void pollSession();
  }

  function stopSessionPolling() {
    if (state.sessionPollId) {
      clearInterval(state.sessionPollId);
      state.sessionPollId = 0;
    }
    stopHeartbeatFreshnessTicker();
  }

  function startHeartbeatFreshnessTicker() {
    stopHeartbeatFreshnessTicker();
    heartbeatUiTickId = window.setInterval(() => {
      renderRoomSnapshot();
      renderBridgeSnapshot();
      renderAgentStatus();
    }, 1000);
  }

  function stopHeartbeatFreshnessTicker() {
    if (heartbeatUiTickId) {
      clearInterval(heartbeatUiTickId);
      heartbeatUiTickId = 0;
    }
  }

  async function pollSession() {
    if (!state.session?.id) {
      return;
    }

    try {
      const payload = await fetchJson(`/api/bridge/sessions/${encodeURIComponent(state.session.id)}`);
      applyBridgePayload(payload);
      renderBridgeSnapshot();
      renderTranscriptList();
      renderDebugSnapshot();
      await consumePendingActions(
        payload.pendingActions ||
          state.session?.pendingActions ||
          buildPendingActionsFromLegacyReplies(state.session),
      );
    } catch (error) {
      addLog('error', 'Bridge poll failed.', formatError(error));
    }
  }

  async function consumePendingActions(pendingActions = []) {
    if (state.processingReplies || !state.session || !pendingActions.length) {
      return;
    }

    state.processingReplies = true;
    renderAgentStatus();

    try {
      for (const action of pendingActions) {
        if (!action) {
          continue;
        }

        if (action.type === 'anim') {
          if (action.stageId && stageMap.has(action.stageId)) {
            selectStage(action.stageId, { persist: false });
          }

          if (action.emoteId && emoteMap.has(action.emoteId)) {
            selectEmote(action.emoteId, { persist: false });
          }

          if (action.gestureId) {
            selectGesture(action.gestureId, { persist: false });
          }

          const payload = await postJson(
            `/api/bridge/sessions/${encodeURIComponent(state.session.id)}/actions/${encodeURIComponent(action.actionId)}/completed`,
            {},
          );
          applyBridgePayload(payload);
          renderBridgeSnapshot();
          renderTranscriptList();
          renderDebugSnapshot();
          continue;
        }

        if (action.type !== 'speech') {
          continue;
        }

        const applySpeechScene = () => {
          if (action.stageId && stageMap.has(action.stageId)) {
            selectStage(action.stageId, { persist: false });
          }

          if (action.emoteId && emoteMap.has(action.emoteId)) {
            selectEmote(action.emoteId, { persist: false });
          }

          if (action.gestureId) {
            selectGesture(action.gestureId, { persist: false });
          }

          dom.lastAgentReply.textContent = action.text;
        };

        if (!action.legacyReplyId) {
          const started = await postJson(
            `/api/bridge/sessions/${encodeURIComponent(state.session.id)}/actions/${encodeURIComponent(action.actionId)}/started`,
            {},
          );
          applyBridgePayload(started);
          renderBridgeSnapshot();
          renderTranscriptList();
          renderDebugSnapshot();
        }

        const withVoice = agentVoiceLayer.getSnapshot().speechSynthesisSupported;
        await avatarSpeech.speakText(action.text, {
          withVoice,
          source: `bridge-action:${action.actionId}`,
          locale: 'en-US',
          preferredVoiceName: state.preferences.voiceName,
          speechRate: state.preferences.speechRate,
          speechPitch: state.preferences.speechPitch,
          characterId: resolveActiveCharacterId(),
          mood: action.mood,
          onPlaybackStart: applySpeechScene,
        });

        const payload = await postJson(
          action.legacyReplyId
            ? `/api/bridge/sessions/${encodeURIComponent(state.session.id)}/replies/${encodeURIComponent(action.legacyReplyId)}/played`
            : `/api/bridge/sessions/${encodeURIComponent(state.session.id)}/actions/${encodeURIComponent(action.actionId)}/finished`,
          {},
        );
        applyBridgePayload(payload);
        renderBridgeSnapshot();
        renderTranscriptList();
        renderDebugSnapshot();
      }
    } finally {
      state.processingReplies = false;
      renderAgentStatus();
    }
  }

  async function beginUserUtterance(utteranceId = createUtteranceId()) {
    await ensureSessionReady();
    const payload = await postJson(
      `/api/bridge/sessions/${encodeURIComponent(state.session.id)}/utterances/start`,
      {
        utteranceId,
      },
    );
    state.activeUtteranceId = utteranceId;
    state.activeUtteranceText = '';
    applyBridgePayload(payload);
    renderBridgeSnapshot();
    renderTranscriptList();
    renderDebugSnapshot();
    return utteranceId;
  }

  async function syncInterimTranscript(text) {
    if (!state.session?.id) {
      return;
    }

    const nextText = `${text || ''}`.trim();
    if (!nextText) {
      return;
    }

    const utteranceId = state.activeUtteranceId || (await beginUserUtterance());
    const previousText = `${state.activeUtteranceText || ''}`;
    if (previousText && !nextText.startsWith(previousText)) {
      state.activeUtteranceText = nextText;
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
    applyBridgePayload(payload);
    renderDebugSnapshot();
    return utteranceId;
  }

  async function finalizeUserUtterance(transcript, source) {
    await ensureSessionReady();
    const cleanedTranscript = `${transcript || ''}`.trim();
    if (!cleanedTranscript) {
      return;
    }

    const utteranceId = state.activeUtteranceId || (await beginUserUtterance());
    const form = collectFormState();
    const payload = await postJson(
      `/api/bridge/sessions/${encodeURIComponent(state.session.id)}/utterances/final`,
      {
        utteranceId,
        text: cleanedTranscript,
        source,
        humanIdentity: state.room?.localParticipant?.identity || form.identity,
        humanName: state.room?.localParticipant?.name || form.participantName,
      },
    );

    state.activeUtteranceId = null;
    state.activeUtteranceText = '';
    applyBridgePayload(payload);
    renderBridgeSnapshot();
    renderTranscriptList();
    renderDebugSnapshot();
    addLog('info', 'Queued human turn for the bridge.', {
      source,
      transcript: cleanedTranscript,
    });
    await consumePendingActions(
      payload.pendingActions ||
        state.session?.pendingActions ||
        buildPendingActionsFromLegacyReplies(state.session),
    );
  }

  async function enqueueHumanTurn(transcript, source) {
    await finalizeUserUtterance(transcript, source);
  }

  async function runDemoReply() {
    await ensureSessionReady();
    await postJson(
      `/api/bridge/sessions/${encodeURIComponent(state.session.id)}/demo-reply`,
      {},
    );
    await pollSession();
  }

  function destroy() {
    if (prepareDebounceId) {
      clearTimeout(prepareDebounceId);
      prepareDebounceId = 0;
    }
    stopSessionPolling();
    humanVoiceLayer.stopListening();
    avatarSpeech.stop({ cancelVoice: true });
    humanVoiceLayer.destroy();
    agentVoiceLayer.destroy();
    avatarLayer.destroy();

    if (state.room) {
      state.room.disconnect();
    }
  }

  return {
    installSdkLogging,
    ensureSessionReady,
    prepareLobbySession,
    scheduleLobbySessionPreparation,
    openConnectPrompt,
    handlePrimaryCallAction,
    joinCall,
    disconnectCall,
    beginUserUtterance,
    syncInterimTranscript,
    finalizeUserUtterance,
    syncAvatarCatalogForSession,
    pollSession,
    enqueueHumanTurn,
    runDemoReply,
    destroy,
  };
}
