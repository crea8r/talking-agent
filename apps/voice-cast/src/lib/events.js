import { buildPromptAssetFileStem } from './format.js';
import { getNextNeutralSampleIndex, NEUTRAL_SAMPLE_LINES } from './neutral-sample-lines.js';

const SILENT_WAV_DATA_URL =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

function syncCastingStateFromDom(dom, state) {
  const voiceDirection = dom.castingInstructText.value;
  state.casting.presetSpeaker = dom.castingPresetSpeaker.value;
  state.casting.speed = dom.castingSpeed.value;
  state.casting.characterPrompt = voiceDirection;
  state.casting.instructText = voiceDirection;
  state.casting.promptText = dom.promptText.value;
}

function syncProductionProfileStateFromDom(dom, state) {
  state.production.selectedSpeakerId = dom.productionBaseSpeaker.value;
  state.production.selectedReferenceFile = dom.productionReferenceWavInput.files?.[0] || null;
}

export function buildCastingPayload(state) {
  return {
    model: state.casting.model,
    presetSpeaker: state.casting.presetSpeaker,
    speed: Number.parseFloat(state.casting.speed || '1'),
    characterPrompt: state.casting.characterPrompt,
    instructText: state.casting.instructText,
    promptText: state.casting.promptText,
  };
}

export function buildPromptAssetSavePayload(state) {
  const voiceDirection = state.casting.instructText || state.casting.characterPrompt;

  return {
    fileNameStem: buildPromptAssetFileStem(voiceDirection),
    audioBase64: state.casting.result?.audioBase64 || '',
    promptText: state.casting.promptText,
    characterPrompt: voiceDirection,
    instructText: state.casting.instructText,
    presetSpeaker: state.casting.presetSpeaker,
    model: state.casting.model,
    speed: Number.parseFloat(state.casting.speed || '1'),
  };
}

export function buildProductionProfileFormData(state) {
  const formData = new FormData();
  formData.set('meloBaseSpeakerId', state.production.selectedSpeakerId);
  formData.set('meloBaseSpeakerLabel', state.production.selectedSpeakerId);
  if (state.production.selectedReferenceFile) {
    formData.set('referenceWav', state.production.selectedReferenceFile);
  }
  return formData;
}

function createDefaultSpeechRecognition() {
  const Recognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
  if (!Recognition) {
    return null;
  }

  const recognition = new Recognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'en-US';
  return recognition;
}

function resetAudioElement(audioElement) {
  if (!audioElement) {
    return;
  }

  if (typeof audioElement.pause === 'function') {
    audioElement.pause();
  }
  if ('currentTime' in audioElement) {
    audioElement.currentTime = 0;
  }
  if (typeof audioElement.removeAttribute === 'function') {
    audioElement.removeAttribute('src');
  } else {
    audioElement.src = '';
  }
  if (typeof audioElement.load === 'function') {
    audioElement.load();
  }
}

function primeAudioPlayback(audioElement) {
  if (!audioElement) {
    return;
  }

  audioElement.autoplay = true;
  audioElement.preload = 'auto';

  if (audioElement.src) {
    return;
  }

  audioElement.muted = true;
  audioElement.src = SILENT_WAV_DATA_URL;
  const cleanup = () => {
    audioElement.muted = false;
    if (audioElement.src !== SILENT_WAV_DATA_URL) {
      return;
    }
    resetAudioElement(audioElement);
  };

  if (typeof audioElement.play === 'function') {
    Promise.resolve(audioElement.play()).catch(() => {}).finally(cleanup);
    return;
  }

  cleanup();
}

function playAudioUrl(audioElement, url) {
  if (!audioElement || !url) {
    return Promise.resolve(false);
  }

  audioElement.hidden = false;
  audioElement.autoplay = true;
  audioElement.preload = 'auto';
  audioElement.muted = false;
  if (typeof audioElement.pause === 'function') {
    audioElement.pause();
  }
  if (audioElement.src !== url) {
    audioElement.src = url;
  }
  if ('currentTime' in audioElement) {
    audioElement.currentTime = 0;
  }
  if (typeof audioElement.load === 'function') {
    audioElement.load();
  }
  if (typeof audioElement.play === 'function') {
    return Promise.resolve(audioElement.play())
      .then(() => true)
      .catch(() => false);
  }
  return Promise.resolve(false);
}

function runAsync(handler) {
  return (...args) => {
    handler(...args).catch((error) => {
      console.error(error);
    });
  };
}

export function bindAppEvents({
  dom,
  state,
  httpClient,
  renderApp,
  createSpeechRecognition = createDefaultSpeechRecognition,
  playAudioUrl: playAudioUrlImpl = playAudioUrl,
}) {
  const render = () => renderApp({ dom, state });
  let activeRecognition = null;
  let pendingTranscript = '';
  let transcriptSubmitted = false;

  function teardownRecognition() {
    activeRecognition = null;
    pendingTranscript = '';
    transcriptSubmitted = false;
  }

  function pauseReplyAudio() {
    if (!dom.productionLatestAudio) {
      return;
    }
    if (typeof dom.productionLatestAudio.pause === 'function') {
      dom.productionLatestAudio.pause();
    }
    dom.productionLatestAudio.muted = false;
  }

  function canEnableListeningLoop() {
    return (
      state.runtimeConfig?.backends?.productionConfigured !== false &&
      state.production.backendHealth.running !== false &&
      state.production.sttSupported &&
      Boolean(state.production.profile)
    );
  }

  function maybeStartRecognitionSession() {
    if (
      !state.production.listenerEnabled ||
      state.production.listening ||
      state.production.submittingTurn ||
      state.production.replyPlaying
    ) {
      render();
      return;
    }

    const recognition = createSpeechRecognition();
    if (!recognition) {
      state.production.sttSupported = false;
      state.production.listenerEnabled = false;
      state.production.listening = false;
      state.production.error = 'Browser speech recognition is not available.';
      teardownRecognition();
      render();
      return;
    }

    state.production.error = '';
    state.production.transcript = '';
    state.production.listening = true;
    render();

    pendingTranscript = '';
    transcriptSubmitted = false;
    activeRecognition = recognition;

    recognition.onstart = () => {
      state.production.listening = true;
      render();
    };

    recognition.onresult = (event) => {
      const transcripts = [];
      for (let index = event.resultIndex || 0; index < (event.results?.length || 0); index += 1) {
        const result = event.results[index];
        if (result?.isFinal) {
          transcripts.push(result[0]?.transcript || '');
        }
      }
      pendingTranscript = transcripts.join(' ').trim();
      state.production.transcript = pendingTranscript;
      render();
    };

    recognition.onspeechend = () => {
      recognition.stop();
    };

    recognition.onerror = (event) => {
      state.production.listening = false;
      const wasListeningEnabled = state.production.listenerEnabled;
      const errorCode = `${event?.error || ''}`.trim();
      teardownRecognition();

      if (!wasListeningEnabled && errorCode === 'aborted') {
        render();
        return;
      }

      state.production.error = errorCode
        ? `Speech recognition error: ${errorCode}`
        : 'Speech recognition failed.';
      render();
    };

    recognition.onend = () => {
      const nextTranscript = pendingTranscript;
      const shouldSubmit = state.production.listenerEnabled && !transcriptSubmitted && Boolean(nextTranscript);

      state.production.listening = false;
      teardownRecognition();
      render();

      if (shouldSubmit) {
        transcriptSubmitted = true;
        void submitRecognizedTranscript(nextTranscript);
        return;
      }

      if (state.production.listenerEnabled && !state.production.submittingTurn && !state.production.replyPlaying) {
        maybeStartRecognitionSession();
      }
    };

    recognition.start();
  }

  function setListeningLoopEnabled(enabled) {
    if (!enabled) {
      state.production.listenerEnabled = false;
      state.production.listening = false;
      pendingTranscript = '';
      transcriptSubmitted = true;
      if (activeRecognition && typeof activeRecognition.stop === 'function') {
        activeRecognition.stop();
      } else {
        teardownRecognition();
      }
      if (state.production.replyPlaying) {
        state.production.replyPlaying = false;
        pauseReplyAudio();
      }
      render();
      return;
    }

    if (!canEnableListeningLoop()) {
      render();
      return;
    }

    state.production.listenerEnabled = true;
    state.production.error = '';
    state.production.saveMessage = '';
    primeAudioPlayback(dom.productionLatestAudio);
    render();
    maybeStartRecognitionSession();
  }

  async function submitRecognizedTranscript(transcript) {
    if (!transcript) {
      state.production.listening = false;
      render();
      return;
    }

    state.production.transcript = transcript;
    state.production.submittingTurn = true;
    state.production.listening = false;
    state.production.error = '';
    render();

    try {
      const payload = await httpClient.submitProductionTurn({ transcript });
      state.production.latestTurn = payload.turn || null;
      state.production.history = payload.history || [];
      state.production.saveMessage = '';
      render();
      const shouldAutoplay = Boolean(payload.turn?.replyAudioUrl) && state.production.listenerEnabled;
      state.production.replyPlaying = shouldAutoplay;
      render();
      const didStartPlayback = shouldAutoplay
        ? await playAudioUrlImpl(dom.productionLatestAudio, payload.turn?.replyAudioUrl || '')
        : false;

      if (shouldAutoplay && !didStartPlayback) {
        state.production.replyPlaying = false;
        render();
        if (state.production.listenerEnabled) {
          maybeStartRecognitionSession();
        }
      }
    } catch (error) {
      state.production.error =
        error instanceof Error ? error.message : 'Unable to generate production reply.';
    } finally {
      state.production.submittingTurn = false;
      render();
    }
  }

  dom.castingTabButton.addEventListener('click', () => {
    state.activeTab = 'casting';
    render();
  });

  dom.productionTabButton.addEventListener('click', () => {
    state.activeTab = 'production';
    render();
  });

  dom.refreshCastingLine.addEventListener('click', () => {
    state.casting.sampleLineIndex = getNextNeutralSampleIndex(state.casting.sampleLineIndex);
    state.casting.promptText = NEUTRAL_SAMPLE_LINES[state.casting.sampleLineIndex] || '';
    state.casting.result = null;
    state.casting.error = '';
    state.casting.saveMessage = '';
    render();
  });

  dom.generateCasting.addEventListener(
    'click',
    runAsync(async () => {
      syncCastingStateFromDom(dom, state);
      state.casting.loading = true;
      state.casting.error = '';
      state.casting.result = null;
      state.casting.saveMessage = '';
      render();

      try {
        state.casting.result = await httpClient.generateCasting(buildCastingPayload(state));
      } catch (error) {
        state.casting.error = error instanceof Error ? error.message : 'Unable to generate prompt voice.';
      } finally {
        state.casting.loading = false;
        render();
      }
    }),
  );

  dom.savePromptAsset.addEventListener(
    'click',
    runAsync(async () => {
      syncCastingStateFromDom(dom, state);
      state.casting.error = '';
      state.casting.saveMessage = '';
      render();

      try {
        await httpClient.savePromptAsset(buildPromptAssetSavePayload(state));
        state.casting.saveMessage = 'Prompt asset saved.';
      } catch (error) {
        state.casting.error = error instanceof Error ? error.message : 'Unable to save prompt asset.';
      } finally {
        render();
      }
    }),
  );

  dom.productionSetupToggle.addEventListener('click', () => {
    state.production.setupOpen = !state.production.setupOpen;
    render();
  });

  dom.saveProductionProfile.addEventListener(
    'click',
    runAsync(async () => {
      syncProductionProfileStateFromDom(dom, state);
      state.production.error = '';
      state.production.saveMessage = '';
      state.production.savingProfile = true;
      render();

      try {
        const payload = await httpClient.saveProductionProfile(buildProductionProfileFormData(state));
        state.production.profile = payload.profile || null;
        state.production.selectedSpeakerId = payload.profile?.meloBaseSpeakerId || state.production.selectedSpeakerId;
        state.production.selectedReferenceFile = null;
        state.production.setupOpen = false;
        state.production.saveMessage = 'Production setup saved.';
      } catch (error) {
        state.production.error =
          error instanceof Error ? error.message : 'Unable to save production setup.';
      } finally {
        state.production.savingProfile = false;
        render();
      }
    }),
  );

  dom.startListening.addEventListener('click', () => {
    setListeningLoopEnabled(!state.production.listenerEnabled);
  });

  dom.replayLatestReply.addEventListener(
    'click',
    runAsync(async () => {
      await playAudioUrlImpl(dom.productionLatestAudio, state.production.latestTurn?.replyAudioUrl || '');
    }),
  );

  dom.productionHistoryList.addEventListener(
    'click',
    runAsync(async (event) => {
      const replayUrl = event?.target?.dataset?.replyAudioUrl || '';
      if (!replayUrl) {
        return;
      }
      await playAudioUrlImpl(dom.productionLatestAudio, replayUrl);
    }),
  );

  dom.productionLatestAudio?.addEventListener?.('ended', () => {
    if (!state.production.replyPlaying) {
      return;
    }

    state.production.replyPlaying = false;
    render();

    if (state.production.listenerEnabled) {
      maybeStartRecognitionSession();
    }
  });
}
