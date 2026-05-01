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

  async function createBridgeSession() {
    const form = collectFormState();
    const sessionResponse = await postJson('/api/bridge/sessions', {
      roomName: form.roomName,
      livekitUrl: form.livekitUrl,
      humanIdentity: state.room?.localParticipant?.identity || form.identity,
      humanName: state.room?.localParticipant?.name || form.participantName,
      metadata: {
        app: 'one-to-one-agent-room',
        planEntry: 'docs/6-app-plan.md#4-one-to-one-agent-room',
        reusablePackages: [
          '@talking-agent/room-layer',
          '@talking-agent/avatar-layer-browser',
          '@talking-agent/voice-layer-browser',
          '@talking-agent/avatar-speech-browser',
          '@talking-agent/agent-room-bridge',
        ],
      },
    });

    state.session = sessionResponse.session;
    renderBridgeSnapshot();
    renderTranscriptList();
    renderDebugSnapshot();
    startSessionPolling();
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
    const form = collectFormState();
    if (!form.livekitUrl) {
      throw new Error('LiveKit URL is required.');
    }

    if (!form.roomName) {
      throw new Error('Room name is required.');
    }

    if (!form.identity) {
      throw new Error('Human identity is required.');
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
      await createBridgeSession();
      updateRoomStatus('ready', 'Connected', 'Room and bridge are ready.');
      screenNavigator.show('session');
      addLog('info', 'Call created.', {
        room: room.name,
        identity: room.localParticipant.identity,
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

  async function disconnectCall({ preserveRoomStatus = false } = {}) {
    stopSessionPolling();
    humanVoiceLayer.stopListening();
    avatarSpeech.stop({ cancelVoice: true });
    state.session = null;
    renderBridgeSnapshot();
    renderTranscriptList();

    if (state.room) {
      try {
        await roomLayer.disconnectRoom(state.room);
      } catch (error) {
        addLog('error', 'Room disconnect failed.', formatError(error));
      }
    }

    state.room = null;
    renderLocalStage();
    if (!preserveRoomStatus) {
      renderRoomSnapshot();
      screenNavigator.show('setup');
    } else {
      dom.localIdentity.textContent = collectFormState().identity || 'none';
      dom.remoteCount.textContent = '0';
      dom.disconnectCall.disabled = true;
    }
    refreshActionButtons();
    renderDebugSnapshot();
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
  }

  async function pollSession() {
    if (!state.session?.id) {
      return;
    }

    try {
      const payload = await fetchJson(`/api/bridge/sessions/${encodeURIComponent(state.session.id)}`);
      state.session = payload.session;
      renderBridgeSnapshot();
      renderTranscriptList();
      renderDebugSnapshot();
      await playAgentRepliesIfReady();
    } catch (error) {
      addLog('error', 'Bridge poll failed.', formatError(error));
    }
  }

  async function playAgentRepliesIfReady() {
    if (state.processingReplies || !state.session) {
      return;
    }

    const unplayedReplies = state.session.turns
      .filter((turn) => turn.agentReply && !turn.agentReply.playedAt)
      .sort(
        (left, right) =>
          Date.parse(left.agentReply.createdAt) - Date.parse(right.agentReply.createdAt),
      );

    if (!unplayedReplies.length) {
      return;
    }

    state.processingReplies = true;
    renderAgentStatus();

    try {
      for (const turn of unplayedReplies) {
        const reply = turn.agentReply;
        if (!reply) {
          continue;
        }

        if (stageMap.has(reply.stageId)) {
          selectStage(reply.stageId, { persist: false });
        }

        if (emoteMap.has(reply.emoteId)) {
          selectEmote(reply.emoteId, { persist: false });
        }

        selectGesture(reply.gestureId, { persist: false });

        dom.lastAgentReply.textContent = reply.text;
        const withVoice =
          reply.voiceMode !== 'silent' && agentVoiceLayer.getSnapshot().speechSynthesisSupported;
        await avatarSpeech.speakText(reply.text, {
          withVoice,
          source: `bridge-reply:${turn.id}`,
          locale: 'en-US',
          preferredVoiceName: state.preferences.voiceName,
          speechRate: state.preferences.speechRate,
          speechPitch: state.preferences.speechPitch,
        });

        const payload = await postJson(
          `/api/bridge/sessions/${encodeURIComponent(state.session.id)}/replies/${encodeURIComponent(reply.id)}/played`,
          {},
        );
        state.session = payload.session;
        renderBridgeSnapshot();
        renderTranscriptList();
        renderDebugSnapshot();
      }
    } finally {
      state.processingReplies = false;
      renderAgentStatus();
    }
  }

  async function enqueueHumanTurn(transcript, source) {
    await ensureSessionReady();
    const form = collectFormState();
    const payload = await postJson(
      `/api/bridge/sessions/${encodeURIComponent(state.session.id)}/human-turn`,
      {
        transcript,
        source,
        humanIdentity: state.room?.localParticipant?.identity || form.identity,
        humanName: state.room?.localParticipant?.name || form.participantName,
      },
    );

    state.session = payload.session;
    renderBridgeSnapshot();
    renderTranscriptList();
    renderDebugSnapshot();
    addLog('info', 'Queued human turn for the bridge.', {
      source,
      transcript,
    });
  }

  async function runDemoReply() {
    await ensureSessionReady();
    const payload = await postJson(
      `/api/bridge/sessions/${encodeURIComponent(state.session.id)}/demo-reply`,
      {},
    );
    if (payload.session) {
      state.session = payload.session;
      renderBridgeSnapshot();
      renderTranscriptList();
      renderDebugSnapshot();
      await playAgentRepliesIfReady();
    }
  }

  function destroy() {
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
    joinCall,
    disconnectCall,
    enqueueHumanTurn,
    runDemoReply,
    destroy,
  };
}
