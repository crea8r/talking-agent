import {
  renderDebugSnapshot as renderDebugSnapshotView,
  renderLocalStage as renderLocalStageView,
  renderRateLabels,
  renderTranscriptList as renderTranscriptListView,
  renderVoiceOptions as renderVoiceOptionsView,
  updateStatusCard,
} from '../../ui/render.js';
import { safeStringify } from '../format.js';
import {
  buildAgentChatPrompt,
  formatHeartbeatAge,
  getCallPrimaryAction,
  getAgentHeartbeatState,
  getCallTitle,
  getCodexProjectTitle,
} from './call-session.js';

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

  function renderCallSnapshot() {
    const heartbeat = getAgentHeartbeatState(state.session);
    const room = state.room;
    const title = getCallTitle(state.session, state.runtimeConfig);
    const form = collectFormState();
    const action = getCallPrimaryAction({
      session: state.session,
      room,
      sessionPreparing: state.sessionPreparing,
      modelLoading: state.modelLoading,
      formReady: Boolean(form.livekitUrl && form.roomName && form.identity),
    });

    dom.callTitle.textContent = title;
    dom.callAgentName.textContent = heartbeat.label;
    dom.joinCall.textContent = action.label;
    dom.joinCall.dataset.mode = action.mode;
    dom.projectName.textContent = getCodexProjectTitle(state.runtimeConfig);
    dom.bridgeCallTitle.textContent = title;
    dom.bridgeAgentLabel.textContent = heartbeat.label;
    if (dom.connectPromptBody) {
      dom.connectPromptBody.value = buildAgentChatPrompt({
        session: state.session,
        runtimeConfig: state.runtimeConfig,
      });
    }
    dom.callAgentPresence.textContent =
      heartbeat.status === 'ready'
        ? 'ready'
        : heartbeat.status === 'stale'
          ? 'reconnect'
          : state.sessionPreparing
            ? 'preparing'
            : 'waiting';
    dom.callAgentPresence.dataset.state =
      heartbeat.status === 'ready'
        ? 'ready'
        : heartbeat.status === 'stale'
          ? 'warn'
          : state.sessionPreparing
            ? 'loading'
            : 'idle';

    if (room) {
      dom.callSubtitle.textContent = heartbeat.ready
        ? `${heartbeat.label} is on the bridge. ${room.name || title} is live.`
        : `${room.name || title} is live. Waiting for the agent bridge to refresh.`;
      return;
    }

    if (state.sessionPreparing) {
      dom.callSubtitle.textContent = 'Preparing a bridge session for the agent.';
      return;
    }

    if (heartbeat.status === 'ready') {
      dom.callSubtitle.textContent = `${heartbeat.label} checked in ${formatHeartbeatAge(heartbeat.ageMs)}. Start the room when you are ready.`;
      return;
    }

    if (heartbeat.status === 'stale') {
      dom.callSubtitle.textContent = `${heartbeat.label} was last seen ${formatHeartbeatAge(heartbeat.ageMs)}. Wait for a fresh heartbeat before starting the room.`;
      return;
    }

    dom.callSubtitle.textContent = state.session?.id
      ? 'Waiting for the agent to heartbeat into this call session.'
      : 'Preparing the call session.';
  }

  function renderRoomSnapshot() {
    const room = state.room;
    const localParticipant = room?.localParticipant || null;
    const form = collectFormState();
    const heartbeat = getAgentHeartbeatState(state.session);
    dom.localIdentity.textContent = localParticipant?.identity || form.identity || 'none';
    dom.remoteCount.textContent = room ? String(room.remoteParticipants.size) : '0';

    if (!room) {
      if (state.sessionPreparing) {
        updateRoomStatus('loading', 'Preparing call', 'Creating a bridge session for the agent.');
      } else if (heartbeat.status === 'ready') {
        updateRoomStatus(
          'ready',
          'Agent ready',
          `${heartbeat.label} is connected to the bridge. Start the room when you are ready.`,
        );
      } else if (heartbeat.status === 'stale') {
        updateRoomStatus(
          'warn',
          'Agent reconnecting',
          `${heartbeat.label} was last seen ${formatHeartbeatAge(heartbeat.ageMs)}. Wait for a fresh heartbeat.`,
        );
      } else {
        updateRoomStatus(
          'loading',
          'Waiting for agent',
          'Open the prompt dialog, paste it into the agent chat, then wait for a fresh heartbeat.',
        );
      }
      if (dom.disconnectCallLive) {
        dom.disconnectCallLive.disabled = true;
      }
      renderCallSnapshot();
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
    if (dom.disconnectCallLive) {
      dom.disconnectCallLive.disabled = false;
    }
    renderCallSnapshot();
  }

  function renderBridgeSnapshot() {
    const heartbeat = getAgentHeartbeatState(state.session);

    if (!state.session) {
      dom.sessionId.textContent = 'none';
      dom.pendingCount.textContent = '0';
      updateBridgeStatus(
        state.sessionPreparing ? 'loading' : 'idle',
        state.sessionPreparing ? 'Preparing session' : 'No session',
        state.sessionPreparing
          ? 'Creating the bridge session for the call.'
          : 'The bridge session will appear here.',
      );
      dom.runDemoReply.disabled = true;
      dom.lastAgentReply.textContent = 'none';
      renderCallSnapshot();
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
    } else if (heartbeat.status === 'ready') {
      updateBridgeStatus(
        'ready',
        'Agent connected',
        `${heartbeat.label} last checked in ${formatHeartbeatAge(heartbeat.ageMs)}.`,
      );
    } else if (heartbeat.status === 'stale') {
      updateBridgeStatus(
        'warn',
        'Agent reconnecting',
        `${heartbeat.label} was last seen ${formatHeartbeatAge(heartbeat.ageMs)}.`,
      );
    } else {
      updateBridgeStatus(
        'loading',
        'Waiting for agent',
        'Open the prompt dialog, share it with the agent, and wait for a heartbeat.',
      );
    }

    dom.runDemoReply.disabled = state.session.metrics.pendingTurns === 0;
    renderCallSnapshot();
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
    const heartbeat = getAgentHeartbeatState(state.session);

    if (state.processingReplies) {
      updateAgentStatus('active', 'Replying', 'Animating the current reply.');
      renderCallSnapshot();
      return;
    }

    if (playback.active) {
      updateAgentStatus(
        'active',
        playback.mode === 'voice' ? 'Speaking' : 'Animating',
        playback.currentText || 'Handling the current reply.',
      );
      renderCallSnapshot();
      return;
    }

    if (heartbeat.status === 'ready') {
      updateAgentStatus(
        agentVoice.speechSynthesisSupported ? 'ready' : 'warn',
        agentVoice.speechSynthesisSupported ? 'Connected' : 'Connected · silent',
        agentVoice.speechSynthesisSupported
          ? `${heartbeat.label} last checked in ${formatHeartbeatAge(heartbeat.ageMs)}.`
          : `${heartbeat.label} is connected, but speech synthesis is unavailable in this browser.`,
      );
      renderCallSnapshot();
      return;
    }

    if (heartbeat.status === 'stale') {
      updateAgentStatus(
        'warn',
        'Reconnecting',
        `${heartbeat.label} was last seen ${formatHeartbeatAge(heartbeat.ageMs)}.`,
      );
      renderCallSnapshot();
      return;
    }

    if (state.sessionPreparing) {
      updateAgentStatus('loading', 'Preparing', 'Creating the bridge session for the call.');
      renderCallSnapshot();
      return;
    }

    if (!agentVoice.speechSynthesisSupported) {
      updateAgentStatus(
        'warn',
        'Silent fallback',
        'Speech synthesis is unavailable in this browser.',
      );
      renderCallSnapshot();
      return;
    }

    updateAgentStatus('loading', 'Waiting', 'No agent heartbeat yet.');
    renderCallSnapshot();
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
    const form = collectFormState();
    const hasTypedText = dom.typedInput.value.trim().length > 0;
    const roomReady = Boolean(state.room);
    const roomConnected = state.room?.state === 'connected';
    const action = getCallPrimaryAction({
      session: state.session,
      room: state.room,
      sessionPreparing: state.sessionPreparing,
      modelLoading: state.modelLoading,
      formReady: Boolean(form.livekitUrl && form.roomName && form.identity),
    });

    dom.joinCall.disabled = action.disabled;
    if (dom.disconnectCallLive) {
      dom.disconnectCallLive.disabled = !roomReady;
    }
    dom.startListening.disabled =
      !roomConnected || !humanVoiceSnapshot.recognitionSupported || humanVoiceSnapshot.listening;
    dom.stopListening.disabled = !humanVoiceSnapshot.listening;
    dom.sendTyped.disabled = !roomConnected || !hasTypedText;
  }

  function renderTranscriptList() {
    renderTranscriptListView(dom.transcriptList, state.session);
  }

  function renderDebugSnapshot() {
    if (dom.inspectorSummary) {
      const inspector = state.inspectorSnapshot;
      if (!inspector) {
        dom.inspectorSummary.textContent = 'Waiting for bridge data…';
      } else {
        dom.inspectorSummary.textContent = [
          `Call ${inspector.callId || 'none'}`,
          `state=${inspector.state || 'unknown'}`,
          `cursor=${inspector.currentCursor || '0'}`,
          `pendingActions=${inspector.pendingActions?.length || 0}`,
          `model=${inspector.avatar?.activeModelId || 'none'}`,
          `catalog=${inspector.avatar?.catalogVersion || 'none'}`,
        ].join(' • ');
      }
    }

    if (dom.inspectorEvents) {
      dom.inspectorEvents.textContent = safeStringify(state.inspectorSnapshot?.recentEvents || []);
    }

    if (dom.inspectorActions) {
      dom.inspectorActions.textContent = safeStringify(state.inspectorSnapshot?.pendingActions || []);
    }

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
      inspector: state.inspectorSnapshot,
      recentLogs: state.logs.slice(0, 8),
    });
  }

  return {
    updateRoomStatus,
    updateBridgeStatus,
    updateAgentStatus,
    renderLocalStage,
    renderCallSnapshot,
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
