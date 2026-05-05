import { audioResultToDataUrl, formatTiming } from './format.js';

function buildCastingSpeakerUi(state) {
  if (state.runtimeConfig?.backends?.textOnlyConfigured === false) {
    return {
      disabled: true,
      options: ['Text-only backend not configured'],
    };
  }

  if (state.casting.speakersLoading) {
    return {
      disabled: true,
      options: ['Loading speakers…'],
    };
  }

  if (!state.casting.speakers.length) {
    return {
      disabled: true,
      options: ['No speakers available'],
    };
  }

  return {
    disabled: false,
    options: state.casting.speakers,
  };
}

function buildProductionSpeakerUi(state) {
  if (state.runtimeConfig?.backends?.productionConfigured === false) {
    return {
      disabled: true,
      options: ['Production backend not configured'],
    };
  }

  if (state.production.speakersLoading) {
    return {
      disabled: true,
      options: ['Loading speakers…'],
    };
  }

  if (!state.production.speakers.length) {
    return {
      disabled: true,
      options: ['No speakers available'],
    };
  }

  return {
    disabled: false,
    options: state.production.speakers,
  };
}

function buildCastingStatusText(state) {
  if (state.casting.loading) {
    return 'Generating prompt voice…';
  }

  if (state.casting.saveMessage) {
    return state.casting.saveMessage;
  }

  if (state.runtimeConfig?.backends?.textOnlyConfigured === false) {
    return 'Text-only backend not configured.';
  }

  if (state.casting.speakersLoading) {
    return 'Loading speakers…';
  }

  if (!state.casting.speakers.length) {
    return 'No speakers available.';
  }

  return 'Ready';
}

function buildProductionStatusText(state) {
  if (state.production.submittingTurn) {
    return 'Generating production reply…';
  }

  if (state.production.listening) {
    return 'Listening…';
  }

  if (state.production.savingProfile) {
    return 'Saving production setup…';
  }

  if (state.production.saveMessage) {
    return state.production.saveMessage;
  }

  if (state.runtimeConfig?.backends?.productionConfigured === false) {
    return 'Production backend not configured.';
  }

  if (!state.production.sttSupported) {
    return 'Browser speech recognition is not available.';
  }

  if (!state.production.profile) {
    return 'Save a reference WAV and base speaker to begin.';
  }

  return 'Ready';
}

function buildProductionSetupSummary(profile) {
  if (!profile) {
    return 'No active production profile saved.';
  }

  return `${profile.referenceOriginalFileName} • ${profile.meloBaseSpeakerId}`;
}

function escapeHtml(value = '') {
  return `${value || ''}`
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildProductionHistoryMarkup(history = []) {
  if (!history.length) {
    return '<li class="history-empty">No replies yet.</li>';
  }

  return history
    .map((turn, index) => {
      const replayDisabled = turn.replyAudioUrl ? '' : 'disabled';
      const createdAt = turn.createdAt
        ? new Date(turn.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : `Turn ${index + 1}`;

      return `
        <li class="history-item">
          <div class="history-meta">
            <span class="history-stamp">${createdAt}</span>
            <span class="history-timing">${formatTiming(turn.generationTimeMs)}</span>
          </div>
          <p class="history-transcript"><strong>You:</strong> ${escapeHtml(turn.userTranscript || '—')}</p>
          <p class="history-reply"><strong>Reply:</strong> ${escapeHtml(turn.replyText || '—')}</p>
          <button type="button" class="history-replay" data-reply-audio-url="${escapeHtml(turn.replyAudioUrl || '')}" ${replayDisabled}>Replay</button>
        </li>
      `;
    })
    .join('');
}

export function buildViewModel(state) {
  const castingSpeakerUi = buildCastingSpeakerUi(state);
  const productionSpeakerUi = buildProductionSpeakerUi(state);
  const latestTurn = state.production.latestTurn;

  return {
    activeTab: state.activeTab,
    casting: {
      generateDisabled: castingSpeakerUi.disabled,
      resultVisible: Boolean(state.casting.result),
      saveVisible: Boolean(state.casting.result),
      speakerOptions: castingSpeakerUi.options,
      speakerSelectDisabled: castingSpeakerUi.disabled,
      spokenText: state.casting.result?.meta?.spokenText || state.casting.promptText || '',
      statusText: buildCastingStatusText(state),
      timingLabel: formatTiming(state.casting.result?.timing),
      voiceDirection:
        state.casting.result?.meta?.voiceDirection ||
        state.casting.instructText ||
        state.casting.characterPrompt ||
        '',
    },
    production: {
      speakerOptions: productionSpeakerUi.options,
      speakerSelectDisabled: productionSpeakerUi.disabled,
      canSaveProfile:
        !productionSpeakerUi.disabled &&
        Boolean(state.production.selectedSpeakerId) &&
        Boolean(state.production.selectedReferenceFile || state.production.profile),
      canStartListening:
        state.runtimeConfig?.backends?.productionConfigured !== false &&
        state.production.sttSupported &&
        Boolean(state.production.profile) &&
        !state.production.listening &&
        !state.production.submittingTurn,
      latestTurnVisible: Boolean(latestTurn || state.production.transcript),
      replayLatestVisible: Boolean(latestTurn?.replyAudioUrl),
      setupSummary: buildProductionSetupSummary(state.production.profile),
      showSetupPanel: state.production.setupOpen,
      setupToggleLabel: state.production.setupOpen ? 'Hide Setup' : 'Show Setup',
      statusText: buildProductionStatusText(state),
      transcriptText: state.production.transcript || latestTurn?.userTranscript || '',
      replyText: latestTurn?.replyText || '',
      timingLabel: formatTiming(latestTurn?.generationTimeMs),
      history: state.production.history.slice(0, 20),
      historyMarkup: buildProductionHistoryMarkup(state.production.history.slice(0, 20)),
    },
  };
}

function setValue(element, value) {
  if (!element || element.value === `${value}`) {
    return;
  }
  element.value = `${value}`;
}

function replaceSelectOptions(selectElement, options, selectedValue, disabled) {
  if (!selectElement) {
    return;
  }

  selectElement.replaceChildren();
  options.forEach((optionValue) => {
    const option = document.createElement('option');
    option.value = optionValue;
    option.textContent = optionValue;
    selectElement.append(option);
  });

  if (selectedValue) {
    selectElement.value = selectedValue;
  }
  selectElement.disabled = disabled;
}

export function renderApp({ dom, state }) {
  const viewModel = buildViewModel(state);

  dom.castingTabButton?.setAttribute?.('data-active', String(viewModel.activeTab === 'casting'));
  dom.productionTabButton?.setAttribute?.('data-active', String(viewModel.activeTab === 'production'));
  if (dom.castingPanel) {
    dom.castingPanel.hidden = viewModel.activeTab !== 'casting';
  }
  if (dom.productionPanel) {
    dom.productionPanel.hidden = viewModel.activeTab !== 'production';
  }

  setValue(dom.castingModel, state.casting.model);
  setValue(dom.castingSpeed, state.casting.speed);
  setValue(dom.castingInstructText, state.casting.instructText);
  setValue(dom.promptText, state.casting.promptText);
  replaceSelectOptions(
    dom.castingPresetSpeaker,
    viewModel.casting.speakerOptions,
    state.casting.presetSpeaker || state.casting.speakers[0] || '',
    viewModel.casting.speakerSelectDisabled,
  );

  dom.generateCasting.disabled = viewModel.casting.generateDisabled;
  dom.castingStatus.textContent = viewModel.casting.statusText;
  dom.castingError.textContent = state.casting.error || '';
  dom.castingResult.hidden = !viewModel.casting.resultVisible;
  dom.savePromptAsset.hidden = !viewModel.casting.saveVisible;
  dom.castingTiming.textContent = viewModel.casting.timingLabel;
  dom.castingSpokenText.textContent = viewModel.casting.spokenText || '—';
  dom.castingVoiceDirection.textContent = viewModel.casting.voiceDirection || '—';
  if (state.casting.result) {
    dom.castingAudio.src = audioResultToDataUrl(state.casting.result);
  } else {
    dom.castingAudio.removeAttribute('src');
  }

  replaceSelectOptions(
    dom.productionBaseSpeaker,
    viewModel.production.speakerOptions,
    state.production.selectedSpeakerId || state.production.profile?.meloBaseSpeakerId || '',
    viewModel.production.speakerSelectDisabled,
  );
  dom.productionSetupToggle.textContent = viewModel.production.setupToggleLabel;
  dom.productionSetupPanel.hidden = !viewModel.production.showSetupPanel;
  dom.productionSetupSummary.textContent = viewModel.production.setupSummary;
  dom.productionReferenceFileName.textContent =
    state.production.selectedReferenceFile?.name ||
    state.production.profile?.referenceOriginalFileName ||
    'No file selected';
  dom.saveProductionProfile.disabled = !viewModel.production.canSaveProfile;
  dom.startListening.disabled = !viewModel.production.canStartListening;
  dom.replayLatestReply.hidden = !viewModel.production.replayLatestVisible;
  dom.productionStatus.textContent = viewModel.production.statusText;
  dom.productionError.textContent = state.production.error || '';
  dom.productionTranscript.textContent = viewModel.production.transcriptText || '—';
  dom.productionReplyText.textContent = viewModel.production.replyText || '—';
  dom.productionTiming.textContent = viewModel.production.timingLabel;
  dom.productionHistoryList.innerHTML = viewModel.production.historyMarkup;

  if (state.production.latestTurn?.replyAudioUrl) {
    dom.productionLatestAudio.hidden = false;
    dom.productionLatestAudio.src = state.production.latestTurn.replyAudioUrl;
  } else {
    dom.productionLatestAudio.hidden = true;
    dom.productionLatestAudio.removeAttribute('src');
  }
}
