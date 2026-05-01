import {
  renderDebugSnapshot as renderDebugSnapshotView,
  renderLocalStage as renderLocalStageView,
  renderRateLabels,
  renderTranscriptList as renderTranscriptListView,
  renderVoiceOptions as renderVoiceOptionsView,
  updateStatusCard,
} from '../../ui/render.js';

export function createPresenter({
  dom,
  state,
  trackSource,
  collectFormState,
  humanVoiceLayer,
  agentVoiceLayer,
  avatarSpeech,
  avatarLayer,
}) {
  function updateRoomStatus(cardState, title, detail) {
    updateStatusCard(dom.roomStatus, dom.roomDetail, cardState, title, detail);
  }

  function updateBridgeStatus(cardState, title, detail) {
    updateStatusCard(dom.bridgeStatus, dom.bridgeDetail, cardState, title, detail);
  }

  function updateAgentStatus(cardState, title, detail) {
    updateStatusCard(dom.agentStatus, dom.agentDetail, cardState, title, detail);
  }

  function renderLocalStage() {
    if (state.localVideoElement) {
      try {
        state.room?.localParticipant
          ?.getTrackPublication(trackSource.Camera)
          ?.track?.detach(state.localVideoElement);
      } catch {
        // Ignore detach failures in the spike app.
      }

      state.localVideoElement.remove();
      state.localVideoElement = null;
    }

    state.localVideoElement = renderLocalStageView(dom.localStage, state.room, trackSource);
  }

  function renderRoomSnapshot() {
    const room = state.room;
    const localParticipant = room?.localParticipant || null;
    const form = collectFormState();
    dom.localIdentity.textContent = localParticipant?.identity || form.identity || 'none';
    dom.remoteCount.textContent = room ? String(room.remoteParticipants.size) : '0';

    if (!room) {
      updateRoomStatus('ready', 'Ready', 'Start the room when you are ready.');
      dom.disconnectCall.disabled = true;
      return;
    }

    const connectionLabel = `${room.state || 'connecting'}`.toLowerCase();
    updateRoomStatus(
      room.state === 'connected' ? 'ready' : 'loading',
      connectionLabel,
      localParticipant
        ? `Connected as ${localParticipant.name || localParticipant.identity}.`
        : 'Connecting to room.',
    );
  }

  function renderBridgeSnapshot() {
    if (!state.session) {
      dom.sessionId.textContent = 'none';
      dom.pendingCount.textContent = '0';
      updateBridgeStatus('idle', 'No session', 'Start a room before sending turns.');
      dom.runDemoReply.disabled = true;
      dom.lastAgentReply.textContent = 'none';
      refreshActionButtons();
      return;
    }

    dom.sessionId.textContent = state.session.id;
    dom.pendingCount.textContent = String(state.session.metrics.pendingTurns);
    dom.lastAgentReply.textContent = state.session.lastAgentReply?.text || 'none';

    if (state.session.metrics.pendingTurns > 0) {
      updateBridgeStatus(
        'pending',
        `${state.session.metrics.pendingTurns} pending turn${state.session.metrics.pendingTurns === 1 ? '' : 's'}`,
        'Waiting for the next agent claim.',
      );
    } else if (state.session.metrics.unplayedReplies > 0) {
      updateBridgeStatus('active', 'Reply ready', 'Playback is about to start.');
    } else {
      updateBridgeStatus('ready', 'Bridge synced', 'Waiting for the next turn.');
    }

    dom.runDemoReply.disabled = state.session.metrics.pendingTurns === 0;
    refreshActionButtons();
  }

  function renderHumanStatus() {
    const snapshot = state.humanVoiceSnapshot || humanVoiceLayer.getSnapshot();
    dom.humanStatus.textContent = snapshot.status || 'idle';
    dom.humanTranscript.textContent = state.transcriptPreview || 'none';
  }

  function renderAgentStatus() {
    const playback = state.avatarSpeechSnapshot || avatarSpeech.getSnapshot();
    const agentVoice = state.agentVoiceSnapshot || agentVoiceLayer.getSnapshot();

    if (state.processingReplies) {
      updateAgentStatus('active', 'Replying', 'Animating the current reply.');
      return;
    }

    if (playback.active) {
      updateAgentStatus(
        'active',
        playback.mode === 'voice' ? 'Speaking' : 'Animating',
        playback.currentText || 'Handling the current reply.',
      );
      return;
    }

    if (!agentVoice.speechSynthesisSupported) {
      updateAgentStatus('warn', 'Silent fallback', 'Speech synthesis is unavailable in this browser.');
      return;
    }

    updateAgentStatus('ready', 'Waiting', 'No reply playing.');
  }

  function renderVoiceOptions() {
    state.preferences.voiceName = renderVoiceOptionsView(dom.voiceSelect, {
      voices: state.voiceOptions,
      selectedVoice: state.preferences.voiceName,
      speechSynthesisSupported: agentVoiceLayer.getSnapshot().speechSynthesisSupported,
    });
  }

  function updateRateLabels() {
    renderRateLabels(
      dom.speechRateValue,
      dom.speechPitchValue,
      state.preferences.speechRate,
      state.preferences.speechPitch,
    );
  }

  function refreshActionButtons() {
    const humanVoiceSnapshot = state.humanVoiceSnapshot || humanVoiceLayer.getSnapshot();
    const hasSession = Boolean(state.session?.id);
    const hasTypedText = dom.typedInput.value.trim().length > 0;
    const roomReady = Boolean(state.room);

    dom.joinCall.disabled = state.modelLoading || roomReady;
    dom.disconnectCall.disabled = !roomReady;
    dom.startListening.disabled =
      !hasSession || !humanVoiceSnapshot.recognitionSupported || humanVoiceSnapshot.listening;
    dom.stopListening.disabled = !humanVoiceSnapshot.listening;
    dom.sendTyped.disabled = !hasSession || !hasTypedText;
  }

  function renderTranscriptList() {
    renderTranscriptListView(dom.transcriptList, state.session);
  }

  function renderDebugSnapshot() {
    renderDebugSnapshotView(dom.debugSnapshot, {
      runtime: state.runtimeConfig,
      room: state.room
        ? {
            state: state.room.state,
            roomName: state.room.name,
            localIdentity: state.room.localParticipant?.identity,
            remoteCount: state.room.remoteParticipants.size,
          }
        : null,
      session: state.session,
      humanVoice: state.humanVoiceSnapshot || humanVoiceLayer.getSnapshot(),
      agentVoice: state.agentVoiceSnapshot || agentVoiceLayer.getSnapshot(),
      avatarSpeech: state.avatarSpeechSnapshot || avatarSpeech.getSnapshot(),
      avatar: avatarLayer.getSnapshot(),
      recentLogs: state.logs.slice(0, 8),
    });
  }

  return {
    updateRoomStatus,
    updateBridgeStatus,
    updateAgentStatus,
    renderLocalStage,
    renderRoomSnapshot,
    renderBridgeSnapshot,
    renderHumanStatus,
    renderAgentStatus,
    renderVoiceOptions,
    updateRateLabels,
    refreshActionButtons,
    renderTranscriptList,
    renderDebugSnapshot,
  };
}
