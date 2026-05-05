import { buildPromptAssetFileStem } from './format.js';
import { getNextNeutralSampleIndex, NEUTRAL_SAMPLE_LINES } from './neutral-sample-lines.js';

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

function playAudioUrl(audioElement, url) {
  if (!audioElement || !url) {
    return Promise.resolve();
  }

  audioElement.hidden = false;
  audioElement.src = url;
  if (typeof audioElement.play === 'function') {
    return Promise.resolve(audioElement.play()).catch(() => {});
  }
  return Promise.resolve();
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
      await playAudioUrlImpl(dom.productionLatestAudio, payload.turn?.replyAudioUrl || '');
    } catch (error) {
      state.production.error =
        error instanceof Error ? error.message : 'Unable to generate production reply.';
    } finally {
      state.production.submittingTurn = false;
      render();
    }
  }

  function teardownRecognition() {
    activeRecognition = null;
    pendingTranscript = '';
    transcriptSubmitted = false;
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
    if (!state.production.profile || state.production.submittingTurn || state.production.listening) {
      return;
    }

    const recognition = createSpeechRecognition();
    if (!recognition) {
      state.production.sttSupported = false;
      state.production.error = 'Browser speech recognition is not available.';
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
      state.production.error = event?.error
        ? `Speech recognition error: ${event.error}`
        : 'Speech recognition failed.';
      teardownRecognition();
      render();
    };

    recognition.onend = () => {
      if (transcriptSubmitted || !pendingTranscript) {
        state.production.listening = false;
        teardownRecognition();
        render();
        return;
      }

      transcriptSubmitted = true;
      void submitRecognizedTranscript(pendingTranscript).finally(() => {
        teardownRecognition();
      });
    };

    recognition.start();
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
}
