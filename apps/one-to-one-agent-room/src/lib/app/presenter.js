import {
  renderDebugSnapshot as renderDebugSnapshotView,
  renderTranscriptList as renderTranscriptListView,
  updateStatusCard,
} from '../../ui/render.js';
import { safeStringify } from '../format.js';
import { VOICE_SAMPLE_REQUIREMENT } from './voice-sample.js';
import {
  getCallPrimaryAction,
  getCallTitle,
  getCodexProjectTitle,
} from './call-session.js';

export function createPresenter({
  dom,
  state,
  collectFormState,
  humanVoiceLayer,
  agentVoiceLayer,
  avatarSpeech,
  avatarLayer,
}) {
  function renderLaunchContext() {
    return null;
  }

  function updateRoomStatus(cardState, title, detail) {
    updateStatusCard(dom.roomStatus, dom.roomDetail, cardState, title, detail);
  }

  function updateCodexStatus(cardState, title, detail) {
    updateStatusCard(dom.codexStatus, dom.codexDetail, cardState, title, detail);
  }

  function updateAgentStatus(cardState, title, detail) {
    updateStatusCard(dom.agentStatus, dom.agentDetail, cardState, title, detail);
  }

  function hasVoiceSampleProfile() {
    return Boolean(state.productionVoice.profile?.referenceAvailable);
  }

  function productionVoiceReady() {
    return Boolean(state.productionVoice.backendRunning && hasVoiceSampleProfile());
  }

  function codexReady() {
    return Boolean(state.codex.backendRunning);
  }

  function recognitionReady(snapshot = {}) {
    return Boolean(
      snapshot.recognitionSupported &&
      snapshot.status !== 'microphone permission denied',
    );
  }

  function setCallButtonMeta(actionLabel, hint = '') {
    if (!dom.joinCall) {
      return;
    }

    const trimmedHint = `${hint || ''}`.trim();
    const accessibleLabel = trimmedHint ? `${actionLabel}. ${trimmedHint}` : actionLabel;
    const title = trimmedHint ? `${actionLabel} · ${trimmedHint}` : actionLabel;
    dom.joinCall.setAttribute('aria-label', accessibleLabel);
    dom.joinCall.setAttribute('title', title);
  }

  function formatThinkingTimer(tenthsValue = 0) {
    const tenths = Math.max(0, Number(tenthsValue) || 0);
    const seconds = Math.floor(tenths / 10);
    return `${seconds}.${tenths % 10}s`;
  }

  function clampPercent(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return 0;
    }
    return Math.max(0, Math.min(100, numeric));
  }

  function renderVoiceSampleState() {
    const backend = state.productionVoice;
    const profile = backend.profile;
    const hasReference = Boolean(profile?.referenceAvailable);
    const validationMessage = `${backend.validationMessage || ''}`.trim();

    dom.voiceSampleFileName.textContent =
      profile?.referenceOriginalFileName ||
      state.preferences.voiceSampleFileName ||
      'Choose WAV';
    dom.voiceSampleStatus.dataset.tone = 'muted';

    if (backend.uploading) {
      dom.voiceSampleStatus.textContent = 'Saving';
      syncSetupPreviewButtons();
      refreshActionButtons();
      return;
    }

    if (backend.loading) {
      dom.voiceSampleStatus.textContent = 'Checking';
      syncSetupPreviewButtons();
      refreshActionButtons();
      return;
    }

    if (validationMessage) {
      dom.voiceSampleStatus.textContent = validationMessage;
      dom.voiceSampleStatus.dataset.tone = 'danger';
      syncSetupPreviewButtons();
      refreshActionButtons();
      return;
    }

    if (hasReference) {
      dom.voiceSampleStatus.textContent = `Ready${profile.meloBaseSpeakerLabel ? ` · ${profile.meloBaseSpeakerLabel}` : ''}`;
      syncSetupPreviewButtons();
      refreshActionButtons();
      return;
    }

    if (!backend.backendRunning && hasReference) {
      dom.voiceSampleStatus.textContent = 'Offline';
      syncSetupPreviewButtons();
      refreshActionButtons();
      return;
    }

    dom.voiceSampleStatus.textContent = VOICE_SAMPLE_REQUIREMENT;
    dom.voiceSampleStatus.dataset.tone = 'danger';
    syncSetupPreviewButtons();
    refreshActionButtons();
  }

  function renderCodexRuntimeState() {
    if (dom.codexRuntime) {
      dom.codexRuntime.textContent = state.codex.backendRunning
        ? `${state.codex.backendApp || 'codex-exec'} · ${state.codex.model || 'unknown model'} · ${state.codex.reasoningEffort || 'unknown reasoning'}`
        : state.codex.backendDetail || 'Codex is unavailable.';
    }
    if (dom.stateFile) {
      dom.stateFile.textContent = state.codex.sessionRoot || 'Loading runtime config…';
    }

    if (state.codex.loading) {
      updateCodexStatus('loading', 'Checking', 'Verifying the local codex exec runtime.');
      return;
    }

    if (!state.codex.backendRunning) {
      updateCodexStatus(
        'warn',
        'Offline',
        state.codex.backendDetail || 'Codex offline.',
      );
      return;
    }

    if (state.processingReplies) {
      updateCodexStatus('active', 'Thinking', state.subtitles.agent.text || 'Thinking…');
      return;
    }

    updateCodexStatus(
      'ready',
      'Ready',
      `${state.codex.model || 'Codex'} ready.`,
    );
  }

  function renderCallSnapshot() {
    const humanVoiceSnapshot = state.humanVoiceSnapshot || humanVoiceLayer.getSnapshot();
    const avatarSpeechSnapshot = avatarSpeech.getSnapshot();
    const avatarSnapshot = avatarLayer.getSnapshot();
    const playbackStarted = Boolean(avatarSpeechSnapshot.playbackStarted);
    const thinkingInputLocked = Boolean(state.agentThinkingActive && !playbackStarted);
    const startupGreetingLocked = Boolean(state.startupGreetingActive);
    const callInputLocked = thinkingInputLocked || startupGreetingLocked;
    const speechReady = recognitionReady(humanVoiceSnapshot);
    const action = getCallPrimaryAction({
      activeCall: state.activeCall,
      endingCall: state.endingCall,
      sessionPreparing: state.sessionPreparing,
      modelLoading: state.modelLoading,
      recognitionSupported: speechReady,
      setupReady: Boolean(state.preferences.bundledModelId),
      productionVoiceReady: productionVoiceReady(),
      codexReady: codexReady(),
    });
    const agentOnline = Boolean(
      state.activeCall ||
      state.sessionPreparing ||
      state.processingReplies ||
      avatarSpeechSnapshot.active,
    );
    const stageShowingAgent = agentOnline && !state.callEndingDimmed;
    const micMuted =
      !state.activeCall || state.endingCall || state.humanMicMuted || callInputLocked;
    const micLevel = micMuted ? 0 : clampPercent(state.humanMicLevel);
    const micSpeaking = state.activeCall && !micMuted && micLevel >= 8;

    if (dom.callTitle) {
      dom.callTitle.textContent = getCallTitle(state.session, state.runtimeConfig);
    }
    dom.joinCall.dataset.mode = action.mode;

    if (dom.callAgentName) {
      dom.callAgentName.textContent = state.session?.agent?.label || 'Codex OpenAI';
    }

    if (dom.callAvatarHost) {
      dom.callAvatarHost.dataset.agentOnline = stageShowingAgent ? 'true' : 'false';
    }

    if (dom.callMicToggle) {
      dom.callMicToggle.dataset.state = micMuted ? 'muted' : 'live';
      dom.callMicToggle.dataset.speaking = micSpeaking ? 'true' : 'false';
      dom.callMicToggle.disabled = !state.activeCall || state.endingCall || callInputLocked;
      dom.callMicToggle.style.setProperty('--mic-glow', `${(micLevel / 100).toFixed(2)}`);
      const micLabel = !state.activeCall
        ? 'Microphone muted'
        : startupGreetingLocked
          ? 'Microphone muted while agent greets you'
        : thinkingInputLocked
          ? 'Microphone muted while agent is thinking'
        : micMuted
          ? 'Unmute microphone'
          : 'Mute microphone';
      dom.callMicToggle.setAttribute('aria-label', micLabel);
      dom.callMicToggle.setAttribute('title', micLabel);
    }

    if (dom.callEmptyState) {
      let waitingDetail = 'Ready to start';
      if (state.callEndingDimmed) {
        waitingDetail = 'Ending…';
      } else if (state.sessionPreparing) {
        waitingDetail = 'Starting';
      } else if (!hasVoiceSampleProfile()) {
        waitingDetail = 'Need voice';
      } else if (!speechReady) {
        waitingDetail =
          humanVoiceSnapshot.status === 'microphone permission denied'
          ? 'Mic off'
          : 'Browser issue';
      } else if (state.humanMicMuted && state.activeCall) {
        waitingDetail = 'Mic muted';
      } else if (!state.productionVoice.backendRunning) {
        waitingDetail = 'Voice offline';
      } else if (!state.codex.backendRunning) {
        waitingDetail = 'Codex offline';
      }

      dom.callEmptyState.hidden = stageShowingAgent;
      if (dom.callEmptyStateTitle) {
        dom.callEmptyStateTitle.textContent = 'Waiting';
      }
      if (dom.callEmptyStateDetail) {
        dom.callEmptyStateDetail.textContent = waitingDetail;
      }
    }

    if (dom.callStageLoading) {
      const callVisualPending = Boolean((state.activeCall || state.sessionPreparing) && !state.callEndingDimmed);
      const stageLoading = Boolean(
        callVisualPending &&
        (state.modelLoading || !avatarSnapshot.ready),
      );
      dom.callStageLoading.hidden = !stageLoading;
    }

    if (dom.callThinkingTimer) {
      const showThinkingTimer = Boolean(
        state.agentThinkingActive &&
        !playbackStarted,
      );
      dom.callThinkingTimer.hidden = !showThinkingTimer;
      dom.callThinkingTimer.textContent = showThinkingTimer
        ? formatThinkingTimer(state.agentThinkingElapsedTenths)
        : '';
    }

    if (avatarSpeechSnapshot.active && playbackStarted) {
      setCallButtonMeta(action.label, 'Speaking');
      return;
    }

    if (thinkingInputLocked || state.processingReplies || avatarSpeechSnapshot.active) {
      setCallButtonMeta(action.label, 'Thinking');
      return;
    }

    if (state.endingCall) {
      setCallButtonMeta(action.label, 'Ending call');
      return;
    }

    if (state.activeCall) {
      setCallButtonMeta(
        action.label,
        speechReady ? 'Listening' : 'Enable microphone',
      );
      return;
    }

    if (state.sessionPreparing) {
      setCallButtonMeta(action.label, 'Starting session');
      return;
    }

    if (!speechReady) {
      setCallButtonMeta(
        action.label,
        humanVoiceSnapshot.status === 'microphone permission denied'
          ? 'Enable microphone'
          : 'Use a supported browser',
      );
      return;
    }

    if (state.productionVoice.uploading) {
      setCallButtonMeta(action.label, 'Please wait');
      return;
    }

    if (!hasVoiceSampleProfile()) {
      setCallButtonMeta(action.label, 'Setup');
      return;
    }

    if (!state.productionVoice.backendRunning) {
      setCallButtonMeta(action.label, state.productionVoice.backendDetail || 'Retry');
      return;
    }

    if (!state.codex.backendRunning) {
      setCallButtonMeta(action.label, state.codex.backendDetail || 'Retry');
      return;
    }

    setCallButtonMeta(action.label);
  }

  function renderSessionSnapshot() {
    if (!state.session) {
      if (dom.sessionId) {
        dom.sessionId.textContent = 'none';
      }
      if (dom.turnCount) {
        dom.turnCount.textContent = '0';
      }
      if (dom.lastAgentReply) {
        dom.lastAgentReply.textContent = 'none';
      }
      if (dom.projectName) {
        dom.projectName.textContent = getCodexProjectTitle(state.runtimeConfig);
      }
      if (dom.sessionCallTitle) {
        dom.sessionCallTitle.textContent = getCodexProjectTitle(state.runtimeConfig);
      }
      if (dom.sessionAgentLabel) {
        dom.sessionAgentLabel.textContent = 'Codex OpenAI';
      }
      if (dom.inspectorSummary) {
        dom.inspectorSummary.textContent = 'Waiting for session data…';
      }
      renderCallSnapshot();
      renderCodexRuntimeState();
      refreshActionButtons();
      return;
    }

    if (dom.sessionId) {
      dom.sessionId.textContent = state.session.id;
    }
    if (dom.turnCount) {
      dom.turnCount.textContent = String(state.session.metrics?.turnCount || 0);
    }
    if (dom.lastAgentReply) {
      dom.lastAgentReply.textContent = state.session.lastAgentReply?.text || 'none';
    }
    if (dom.projectName) {
      dom.projectName.textContent = getCodexProjectTitle(state.runtimeConfig);
    }
    if (dom.sessionCallTitle) {
      dom.sessionCallTitle.textContent = getCallTitle(state.session, state.runtimeConfig);
    }
    if (dom.sessionAgentLabel) {
      dom.sessionAgentLabel.textContent = state.session.agent?.label || 'Codex OpenAI';
    }

    const activeRequest = state.inspectorSnapshot?.activeRequest;
    if (dom.inspectorSummary) {
      dom.inspectorSummary.textContent = [
        `state=${state.session.state || 'ready'}`,
        `agent=${state.session.agent?.status || 'idle'}`,
        `turns=${state.session.metrics?.turnCount || 0}`,
        `pending=${state.session.metrics?.pendingTurns || 0}`,
        `model=${state.session.avatar?.activeModelId || 'none'}`,
        activeRequest ? `request=${activeRequest.requestId}` : 'request=idle',
      ].join(' • ');
    }

    renderCallSnapshot();
    renderCodexRuntimeState();
    refreshActionButtons();
  }

  function renderHumanStatus() {
    const snapshot = state.humanVoiceSnapshot || humanVoiceLayer.getSnapshot();
    if (dom.humanStatus) {
      dom.humanStatus.textContent = snapshot.status || 'idle';
    }
    if (dom.humanTranscript) {
      dom.humanTranscript.textContent = state.transcriptPreview || state.subtitles.human.text || 'none';
    }
  }

  function renderSubtitles() {
    const humanText = state.transcriptPreview || state.subtitles.human.text || '…';
    const agentText = state.subtitles.agent.text || '…';

    if (dom.subtitleHuman) {
      dom.subtitleHuman.textContent = humanText;
    }
    if (dom.subtitleHumanMode) {
      dom.subtitleHumanMode.textContent = state.subtitles.human.mode || 'idle';
      dom.subtitleHumanMode.dataset.mode = state.subtitles.human.mode || 'idle';
    }
    if (dom.subtitleAgent) {
      dom.subtitleAgent.textContent = agentText;
    }
    if (dom.subtitleAgentMode) {
      dom.subtitleAgentMode.textContent = state.subtitles.agent.mode || 'idle';
      dom.subtitleAgentMode.dataset.mode = state.subtitles.agent.mode || 'idle';
    }
    if (dom.callSubtitleCombined) {
      dom.callSubtitleCombined.textContent = `Me: ${humanText}\nAgent: ${agentText}`;
    }
  }

  function renderAgentStatus() {
    const playback = state.avatarSpeechSnapshot || avatarSpeech.getSnapshot();
    const agentVoice = state.agentVoiceSnapshot || agentVoiceLayer.getSnapshot();
    const playbackStarted = Boolean(playback.playbackStarted);

    if (playback.active && playbackStarted) {
      updateAgentStatus(
        'active',
        playback.mode === 'voice' ? 'Speaking' : 'Animating',
        state.subtitles.agent.text || playback.currentText || 'Speaking.',
      );
      renderCallSnapshot();
      return;
    }

    if (state.processingReplies || (playback.active && !playbackStarted)) {
      updateAgentStatus('active', 'Thinking', state.subtitles.agent.text || 'Thinking');
      renderCallSnapshot();
      return;
    }

    if (!state.productionVoice.backendRunning) {
      updateAgentStatus(
        'warn',
        'Voice backend offline',
        state.productionVoice.backendDetail || 'Voice offline.',
      );
      renderCallSnapshot();
      return;
    }

    if (!hasVoiceSampleProfile()) {
      updateAgentStatus('warn', 'Voice sample needed', 'Upload WAV');
      renderCallSnapshot();
      return;
    }

    if (!state.codex.backendRunning) {
      updateAgentStatus(
        'warn',
        'Codex offline',
        state.codex.backendDetail || 'Codex offline.',
      );
      renderCallSnapshot();
      return;
    }

    if (state.sessionPreparing) {
      updateAgentStatus('loading', 'Preparing', 'Starting session');
      renderCallSnapshot();
      return;
    }

    if (state.session?.agent?.lastError) {
      updateAgentStatus('warn', 'Reply error', state.session.agent.lastError);
      renderCallSnapshot();
      return;
    }

    updateAgentStatus(
      state.activeCall ? 'active' : 'idle',
      state.activeCall ? 'Listening' : 'Offline',
      state.activeCall
        ? 'Waiting'
        : agentVoice.speechSynthesisSupported
          ? 'Start call'
          : 'Voice unavailable',
    );
    renderCallSnapshot();
  }

  function refreshActionButtons() {
    const humanVoiceSnapshot = state.humanVoiceSnapshot || humanVoiceLayer.getSnapshot();
    const avatarSpeechSnapshot = state.avatarSpeechSnapshot || avatarSpeech.getSnapshot();
    const playbackStarted = Boolean(avatarSpeechSnapshot.playbackStarted);
    const thinkingInputLocked = Boolean(state.agentThinkingActive && !playbackStarted);
    const startupGreetingLocked = Boolean(state.startupGreetingActive);
    const callInputLocked = thinkingInputLocked || startupGreetingLocked;
    const hasTypedText = (dom.typedInput?.value || '').trim().length > 0;
    const action = getCallPrimaryAction({
      activeCall: state.activeCall,
      endingCall: state.endingCall,
      sessionPreparing: state.sessionPreparing,
      modelLoading: state.modelLoading,
      recognitionSupported: recognitionReady(humanVoiceSnapshot),
      setupReady: Boolean(state.preferences.bundledModelId),
      productionVoiceReady: productionVoiceReady(),
      codexReady: codexReady(),
    });

    dom.joinCall.disabled = action.disabled;
    if (dom.typedInput) {
      dom.typedInput.disabled = !state.activeCall || state.endingCall || callInputLocked;
    }
    if (dom.sendTyped) {
      dom.sendTyped.disabled =
        !state.activeCall ||
        state.endingCall ||
        callInputLocked ||
        !hasTypedText;
    }
    syncSetupPreviewButtons();
  }

  function syncSetupPreviewButtons() {
    const playbackActive = avatarSpeech.getSnapshot().active;
    const avatarReady = Boolean(avatarLayer.getSnapshot().ready);
    const setupPreview = state.setupPreview || {};
    const voicePending = Boolean(setupPreview.voicePending);
    const voiceActive = Boolean(setupPreview.voiceActive);
    const animationPlaying = Boolean(setupPreview.animationPlaying);
    const voicePreviewReady = Boolean(
      !state.activeCall &&
        !state.modelLoading &&
        !state.productionVoice.loading &&
        !state.productionVoice.uploading &&
        !state.productionVoice.validationMessage &&
        state.productionVoice.backendRunning &&
        state.productionVoice.profile?.referenceAvailable &&
        (!playbackActive || voicePending) &&
        !voiceActive &&
        !animationPlaying,
    );
    const animationPreviewReady = Boolean(
      !state.activeCall &&
        !state.modelLoading &&
        avatarReady &&
        !playbackActive &&
        !animationPlaying,
    );

    if (dom.previewVoiceSample) {
      dom.previewVoiceSample.disabled = !voicePreviewReady;
    }
    if (dom.previewVoiceSampleTimer) {
      const waitingForVoiceStart = voicePending && !voiceActive;
      dom.previewVoiceSampleTimer.hidden = !waitingForVoiceStart;
      dom.previewVoiceSampleTimer.textContent = `${Math.max(0, Number(setupPreview.voiceWaitSeconds) || 0)}s`;
    }
    if (dom.previewCharacterAnimation) {
      dom.previewCharacterAnimation.disabled = !animationPreviewReady;
    }
  }

  function renderTranscriptList() {
    const turns = Array.isArray(state.session?.turns) ? state.session.turns : [];
    const historyVisible = turns.length > 0;
    const historyCollapsed = Boolean(state.callHistoryCollapsed);

    if (dom.callLayout) {
      dom.callLayout.dataset.historyVisible = historyVisible ? 'true' : 'false';
      dom.callLayout.dataset.historyCollapsed = historyCollapsed ? 'true' : 'false';
    }
    if (dom.callHistoryPanel) {
      dom.callHistoryPanel.hidden = !historyVisible || historyCollapsed;
      dom.callHistoryPanel.dataset.collapsed = historyCollapsed ? 'true' : 'false';
    }
    if (dom.callHistoryToggle) {
      const nextLabel = historyCollapsed ? 'Show call history' : 'Hide call history';
      dom.callHistoryToggle.hidden = !historyVisible;
      dom.callHistoryToggle.setAttribute('aria-label', nextLabel);
      dom.callHistoryToggle.setAttribute('title', nextLabel);
    }
    if (dom.callHistoryList) {
      dom.callHistoryList.hidden = historyCollapsed;
      renderTranscriptListView(dom.callHistoryList, state.session);
    }
    if (dom.transcriptList) {
      renderTranscriptListView(dom.transcriptList, state.session);
    }
  }

  function renderDebugSnapshot() {
    if (dom.inspectorEvents) {
      dom.inspectorEvents.textContent = safeStringify(state.inspectorSnapshot?.recentEvents || []);
    }

    if (dom.inspectorActions) {
      dom.inspectorActions.textContent = safeStringify(state.inspectorSnapshot?.activeRequest || null);
    }

    renderDebugSnapshotView(dom.debugSnapshot, {
      runtime: state.runtimeConfig,
      launch: state.launchContext,
      activeCall: state.activeCall,
      session: state.session,
      subtitles: state.subtitles,
      humanVoice: state.humanVoiceSnapshot || humanVoiceLayer.getSnapshot(),
      agentVoice: state.agentVoiceSnapshot || agentVoiceLayer.getSnapshot(),
      productionVoice: state.productionVoice,
      codex: state.codex,
      avatarSpeech: state.avatarSpeechSnapshot || avatarSpeech.getSnapshot(),
      avatar: avatarLayer.getSnapshot(),
      inspector: state.inspectorSnapshot,
      recentLogs: state.logs.slice(0, 8),
      form: collectFormState(),
    });
  }

  return {
    updateRoomStatus,
    updateCodexStatus,
    updateAgentStatus,
    renderCallSnapshot,
    renderLaunchContext,
    renderSessionSnapshot,
    renderHumanStatus,
    renderSubtitles,
    renderAgentStatus,
    renderVoiceSampleState,
    refreshActionButtons,
    renderTranscriptList,
    renderDebugSnapshot,
  };
}
