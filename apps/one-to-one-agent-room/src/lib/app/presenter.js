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
import { getLoadingUiState } from './loading-ui.js';

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

  function formatDeferredElapsedSeconds(value = 0) {
    const totalSeconds = Math.max(0, Number(value) || 0);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${`${seconds}`.padStart(2, '0')}`;
  }

  function formatStartupCountdown(value = 0) {
    const totalSeconds = Math.max(0, Number(value) || 0);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${`${seconds}`.padStart(2, '0')}`;
  }

  function formatLoadingPercent(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return '';
    }
    return `${Math.max(0, Math.min(100, Math.round(numeric)))}%`;
  }

  function escapeHtml(text = '') {
    return `${text || ''}`
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
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

  function renderAvatarLoadingState() {
    const avatarLoading = getLoadingUiState(state, 'avatar');
    const visible = Boolean(avatarLoading.active && state.modelLoading);
    const loadingPercent = formatLoadingPercent(avatarLoading.percent);

    if (dom.avatarPreviewShell) {
      dom.avatarPreviewShell.dataset.loading = visible ? 'true' : 'false';
    }
    if (dom.setupAvatarLoading) {
      dom.setupAvatarLoading.hidden = !visible;
    }
    if (dom.setupAvatarLoadingLabel) {
      dom.setupAvatarLoadingLabel.textContent = avatarLoading.phase || 'Loading 3D character';
    }
    if (dom.setupAvatarLoadingProgress) {
      dom.setupAvatarLoadingProgress.hidden = !loadingPercent;
      dom.setupAvatarLoadingProgress.textContent = loadingPercent;
    }
    if (dom.setupAvatarLoadingDetail) {
      const detail =
        avatarLoading.detail || 'Loading the avatar and motion files from your laptop.';
      dom.setupAvatarLoadingDetail.hidden = !detail;
      dom.setupAvatarLoadingDetail.textContent = detail;
    }
  }

  function renderCallSnapshot() {
    renderAvatarLoadingState();
    const humanVoiceSnapshot = state.humanVoiceSnapshot || humanVoiceLayer.getSnapshot();
    const agentVoiceSnapshot = state.agentVoiceSnapshot || agentVoiceLayer.getSnapshot();
    const avatarSpeechSnapshot = avatarSpeech.getSnapshot();
    const avatarSnapshot = avatarLayer.getSnapshot();
    const localCameraSnapshot = state.localCameraSnapshot || {};
    const playbackStarted = Boolean(avatarSpeechSnapshot.playbackStarted);
    const localThinkingPromptActive = avatarSpeechSnapshot.source === 'local-thinking-prompt';
    const replyPlaybackStarted = Boolean(playbackStarted && !localThinkingPromptActive);
    const thinkingInputLocked = Boolean(state.agentThinkingActive && !replyPlaybackStarted);
    const startupGreetingLocked = Boolean(state.startupGreetingActive);
    const startupGreetingConnecting = Boolean(startupGreetingLocked && !playbackStarted);
    const callInputLocked = thinkingInputLocked || startupGreetingLocked;
    const replySequenceLocked = Boolean(
      state.activeCall &&
      state.currentTurnId &&
      !humanVoiceSnapshot.listening,
    );
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
    const bootLoading = getLoadingUiState(state, 'boot');
    const callLoading = getLoadingUiState(state, 'call');
    const avatarLoading = getLoadingUiState(state, 'avatar');
    const agentOnline = Boolean(
      state.activeCall ||
      state.sessionPreparing ||
      state.processingReplies ||
      avatarSpeechSnapshot.active,
    );
    const stageShowingAgent = agentOnline && !state.callEndingDimmed;
    const micMuted =
      !state.activeCall ||
      state.endingCall ||
      state.humanMicMuted ||
      callInputLocked ||
      replySequenceLocked;
    const micLevel = micMuted ? 0 : clampPercent(state.humanMicLevel);
    const micListening = Boolean(state.activeCall && !micMuted && humanVoiceSnapshot.listening);
    const micSpeaking = Boolean(micListening && micLevel >= 8);
    const cameraSupported = localCameraSnapshot.supported !== false;
    const cameraActive = Boolean(localCameraSnapshot.active);
    const cameraLoading = Boolean(localCameraSnapshot.loading);
    const cameraEnabled = localCameraSnapshot.enabled !== false;
    const cameraPermissionState = `${localCameraSnapshot.permissionState || ''}`.trim();
    const cameraInteractive =
      Boolean(state.activeCall && !state.endingCall && !startupGreetingLocked && cameraSupported);
    const speakerEnabled = agentVoiceSnapshot.speakReplies !== false;
    const speakerInteractive = Boolean(
      state.activeCall &&
      !state.endingCall &&
      !startupGreetingLocked &&
      agentVoiceSnapshot.speechSynthesisSupported,
    );
    const bootLoadingVisible = Boolean(
      bootLoading.active &&
      state.launchContext?.initialScreen === 'call' &&
      !state.callEndingDimmed,
    );
    const callLoadingVisible = Boolean(callLoading.active && !state.callEndingDimmed);
    const avatarLoadingVisible = Boolean(
      avatarLoading.active &&
      state.modelLoading &&
      !startupGreetingConnecting &&
      !state.callEndingDimmed,
    );

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
      dom.callMicToggle.dataset.listening = micListening ? 'true' : 'false';
      dom.callMicToggle.dataset.speaking = micSpeaking ? 'true' : 'false';
      dom.callMicToggle.disabled =
        !state.activeCall ||
        state.endingCall ||
        callInputLocked ||
        replySequenceLocked;
      dom.callMicToggle.style.setProperty('--mic-glow', `${(micLevel / 100).toFixed(2)}`);
      const micLabel = !state.activeCall
        ? 'Microphone muted'
        : startupGreetingLocked
          ? 'Microphone muted while agent greets you'
        : thinkingInputLocked
          ? 'Microphone muted while agent is thinking'
        : replySequenceLocked
          ? 'Microphone muted while agent is speaking'
        : micMuted
          ? 'Unmute microphone'
          : 'Mute microphone';
      dom.callMicToggle.setAttribute('aria-label', micLabel);
      dom.callMicToggle.setAttribute('title', micLabel);
    }

    if (dom.callSelfView) {
      const selfViewVisible = Boolean(state.activeCall || cameraLoading || cameraActive);
      let selfViewState = 'idle';
      if (cameraActive) {
        selfViewState = 'live';
      } else if (cameraLoading) {
        selfViewState = 'loading';
      } else if (cameraPermissionState === 'denied') {
        selfViewState = 'denied';
      } else if (!cameraEnabled) {
        selfViewState = 'off';
      }
      dom.callSelfView.hidden = !selfViewVisible;
      dom.callSelfView.dataset.state = selfViewState;
    }

    if (dom.callSelfCluster) {
      dom.callSelfCluster.hidden = !state.activeCall;
    }

    if (dom.callSelfVideo) {
      dom.callSelfVideo.hidden = !cameraActive;
    }

    if (dom.callSelfPlaceholder) {
      dom.callSelfPlaceholder.hidden = cameraActive;
    }

    if (dom.callSelfStatus) {
      dom.callSelfStatus.textContent =
        localCameraSnapshot.status ||
        (cameraActive ? 'live' : cameraEnabled ? 'Camera ready' : 'Camera off');
    }

    if (dom.callCameraToggle) {
      const cameraLabel = !cameraSupported
        ? 'Camera unavailable'
        : cameraLoading
          ? 'Starting camera'
          : cameraEnabled
            ? 'Turn camera off'
            : 'Turn camera on';
      dom.callCameraToggle.disabled = !cameraInteractive;
      dom.callCameraToggle.dataset.state = cameraActive ? 'live' : cameraEnabled ? 'ready' : 'off';
      dom.callCameraToggle.setAttribute('aria-label', cameraLabel);
      dom.callCameraToggle.setAttribute('title', cameraLabel);
    }

    if (dom.callSpeakerToggle) {
      const speakerLabel = speakerEnabled ? 'Mute speaker' : 'Unmute speaker';
      dom.callSpeakerToggle.disabled = !speakerInteractive;
      dom.callSpeakerToggle.dataset.state = speakerEnabled ? 'live' : 'muted';
      dom.callSpeakerToggle.setAttribute('aria-label', speakerLabel);
      dom.callSpeakerToggle.setAttribute('title', speakerLabel);
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
      const genericStageLoading = Boolean(
        callVisualPending &&
        (state.modelLoading || !avatarSnapshot.ready || startupGreetingConnecting),
      );
      const stageLoading = Boolean(
        genericStageLoading ||
        callLoadingVisible ||
        bootLoadingVisible,
      );
      const startupGreetingIndicator =
        state.startupGreetingIndicator && typeof state.startupGreetingIndicator === 'object'
          ? state.startupGreetingIndicator
          : {};
      dom.callStageLoading.hidden = !stageLoading;
      if (dom.callStageLoadingLabel) {
        dom.callStageLoadingLabel.textContent = startupGreetingConnecting
          ? 'Connecting'
          : callLoadingVisible
            ? callLoading.phase || 'Loading'
            : avatarLoadingVisible
              ? avatarLoading.phase || 'Loading'
            : bootLoadingVisible
              ? bootLoading.phase || 'Loading'
              : 'Loading';
      }
      if (dom.callStageLoadingCountdown) {
        const showCountdown = Boolean(startupGreetingConnecting && startupGreetingIndicator.active);
        dom.callStageLoadingCountdown.hidden = !showCountdown;
        dom.callStageLoadingCountdown.textContent = showCountdown
          ? `Est. ${formatStartupCountdown(startupGreetingIndicator.remainingSeconds)}`
          : '';
      }
      if (dom.callStageLoadingTip) {
        const loadingDetail = callLoadingVisible
          ? callLoading.detail
          : avatarLoadingVisible
            ? avatarLoading.detail
          : bootLoadingVisible
            ? bootLoading.detail
            : '';
        const showTip = Boolean(
          (startupGreetingConnecting && startupGreetingIndicator.tipText) ||
          (!startupGreetingConnecting && loadingDetail),
        );
        dom.callStageLoadingTip.hidden = !showTip;
        dom.callStageLoadingTip.textContent = showTip
          ? startupGreetingConnecting
            ? `Tip: ${startupGreetingIndicator.tipText}`
            : loadingDetail
          : '';
      }
    }

    if (dom.callThinkingTimer) {
      const showThinkingTimer = Boolean(
        state.agentThinkingActive &&
        !replyPlaybackStarted,
      );
      dom.callThinkingTimer.hidden = !showThinkingTimer;
      dom.callThinkingTimer.textContent = showThinkingTimer
        ? formatThinkingTimer(state.agentThinkingElapsedTenths)
        : '';
    }

    if (dom.callDeferredIndicator) {
      const deferredIndicator = state.deferredIndicator || {};
      const tasks = Array.isArray(deferredIndicator.tasks) ? deferredIndicator.tasks : [];
      const showDeferredIndicator = Boolean(state.activeCall && deferredIndicator.active && tasks.length);
      dom.callDeferredIndicator.hidden = !showDeferredIndicator;
      if (dom.callDeferredList) {
        dom.callDeferredList.innerHTML = showDeferredIndicator
          ? tasks
              .map(
                (task) => `
                  <article class="call-deferred-item" data-phase="${escapeHtml(task.phase || '')}">
                    <span class="call-deferred-dot" aria-hidden="true"></span>
                    <span class="call-deferred-copy">
                      <span class="call-deferred-label">${escapeHtml(task.label || 'Working on your request')}</span>
                      <span class="call-deferred-detail">${escapeHtml(task.detail || '')}</span>
                    </span>
                    ${
                      task.action?.kind
                        ? `
                          <button
                            class="call-deferred-action"
                            type="button"
                            data-action="${escapeHtml(task.action.kind)}"
                            data-connector-name="${escapeHtml(task.action.connectorName || '')}"
                            data-connector-id="${escapeHtml(task.action.connectorId || '')}"
                            data-link-id="${escapeHtml(task.action.linkId || '')}"
                            aria-label="${escapeHtml(task.action.label || 'Open settings')}"
                          >${escapeHtml(task.action.label || 'Open')}</button>
                        `
                        : ''
                    }
                    <span class="call-deferred-time">${escapeHtml(formatDeferredElapsedSeconds(task.elapsedSeconds))}</span>
                  </article>
                `,
              )
              .join('')
          : '';
      }
    }

    if (startupGreetingConnecting) {
      setCallButtonMeta(action.label, 'Connecting');
      return;
    }

    if (callLoadingVisible) {
      setCallButtonMeta(action.label, callLoading.phase || 'Loading');
      return;
    }

    if (bootLoadingVisible) {
      setCallButtonMeta(action.label, bootLoading.phase || 'Loading');
      return;
    }

    if (avatarSpeechSnapshot.active && replyPlaybackStarted) {
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
    const livePlayback = state.avatarSpeechSnapshot || avatarSpeech.getSnapshot();
    const humanText = `${state.transcriptPreview || state.subtitles.human.text || ''}`.trim();
    const agentText = `${state.subtitles.agent.text || ''}`.trim();
    const humanMode = `${state.subtitles.human.mode || 'idle'}`.trim() || 'idle';
    const agentMode = `${state.subtitles.agent.mode || 'idle'}`.trim() || 'idle';
    const showHuman = Boolean(
      state.activeCall &&
      humanText &&
      (state.transcriptPreview || !['idle', 'ready'].includes(humanMode))
    );
    const showAgent = Boolean(
      state.activeCall &&
      agentText &&
      (
        !['idle', 'ready'].includes(agentMode) ||
        state.processingReplies ||
        state.agentThinkingActive ||
        livePlayback.active
      )
    );
    const thinkingVisible = Boolean(dom.callThinkingTimer && !dom.callThinkingTimer.hidden);

    if (dom.subtitleHuman) {
      dom.subtitleHuman.textContent = humanText || '…';
    }
    if (dom.subtitleHumanMode) {
      dom.subtitleHumanMode.textContent = humanMode;
      dom.subtitleHumanMode.dataset.mode = humanMode;
    }
    if (dom.subtitleAgent) {
      dom.subtitleAgent.textContent = agentText || '…';
    }
    if (dom.subtitleAgentMode) {
      dom.subtitleAgentMode.textContent = agentMode;
      dom.subtitleAgentMode.dataset.mode = agentMode;
    }
    if (dom.callSubtitleCombined) {
      dom.callSubtitleCombined.textContent = `Me: ${humanText || '…'}\nAgent: ${agentText || '…'}`;
    }
    if (dom.callSubtitleHuman) {
      dom.callSubtitleHuman.hidden = !showHuman;
      dom.callSubtitleHuman.textContent = humanText || '';
    }
    if (dom.callSubtitleAgent) {
      dom.callSubtitleAgent.hidden = !showAgent;
      dom.callSubtitleAgent.textContent = agentText || '';
    }
    if (dom.callSubtitleOverlay) {
      dom.callSubtitleOverlay.hidden = !(showHuman || showAgent || thinkingVisible);
    }
  }

  function renderAgentStatus() {
    const playback = state.avatarSpeechSnapshot || avatarSpeech.getSnapshot();
    const agentVoice = state.agentVoiceSnapshot || agentVoiceLayer.getSnapshot();
    const playbackStarted = Boolean(playback.playbackStarted);
    const localThinkingPromptActive = playback.source === 'local-thinking-prompt';
    const replyPlaybackStarted = Boolean(playbackStarted && !localThinkingPromptActive);

    if (playback.active && replyPlaybackStarted) {
      updateAgentStatus(
        'active',
        playback.mode === 'voice' ? 'Speaking' : 'Animating',
        state.subtitles.agent.text || playback.currentText || 'Speaking.',
      );
      renderCallSnapshot();
      return;
    }

    if (state.processingReplies || localThinkingPromptActive || (playback.active && !replyPlaybackStarted)) {
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
    const agentVoiceSnapshot = state.agentVoiceSnapshot || agentVoiceLayer.getSnapshot();
    const localCameraSnapshot = state.localCameraSnapshot || {};
    const avatarSpeechSnapshot = state.avatarSpeechSnapshot || avatarSpeech.getSnapshot();
    const playbackStarted = Boolean(avatarSpeechSnapshot.playbackStarted);
    const localThinkingPromptActive = avatarSpeechSnapshot.source === 'local-thinking-prompt';
    const replyPlaybackStarted = Boolean(playbackStarted && !localThinkingPromptActive);
    const thinkingInputLocked = Boolean(state.agentThinkingActive && !replyPlaybackStarted);
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
    renderAvatarLoadingState();
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
    if (dom.callCameraToggle) {
      dom.callCameraToggle.disabled = Boolean(
        !state.activeCall ||
        state.endingCall ||
        startupGreetingLocked ||
        localCameraSnapshot.supported === false,
      );
    }
    if (dom.callSpeakerToggle) {
      dom.callSpeakerToggle.disabled = Boolean(
        !state.activeCall ||
        state.endingCall ||
        startupGreetingLocked ||
        !agentVoiceSnapshot.speechSynthesisSupported,
      );
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
      const nextLabel = !historyVisible
        ? 'No call history yet'
        : historyCollapsed
          ? 'Show call history'
          : 'Hide call history';
      dom.callHistoryToggle.hidden = false;
      dom.callHistoryToggle.disabled = !historyVisible;
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
      loadingUi: state.loadingUi,
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
    renderAvatarLoadingState,
    renderTranscriptList,
    renderDebugSnapshot,
  };
}
