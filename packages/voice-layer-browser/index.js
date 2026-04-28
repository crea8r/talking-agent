const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const SpeechSynthesisSupported =
  typeof window.speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined';

export function createVoiceLayer(initialConfig = {}) {
  const state = {
    recognitionSupported: Boolean(SpeechRecognition),
    speechSynthesisSupported: SpeechSynthesisSupported,
    recognition: null,
    listening: false,
    speaking: false,
    micStream: null,
    audioContext: null,
    analyser: null,
    analyserData: null,
    rafId: null,
    activeTurn: null,
    lastTurn: null,
    lastTranscript: '',
    lastReply: '',
    lastError: null,
    voices: [],
    config: {
      locale: initialConfig.locale || 'en-US',
      autoRestart: initialConfig.autoRestart !== false,
      speakReplies: initialConfig.speakReplies !== false,
      preferredVoiceName: initialConfig.preferredVoiceName || '',
      speechRate: Number.isFinite(initialConfig.speechRate) ? initialConfig.speechRate : 1,
      speechPitch: Number.isFinite(initialConfig.speechPitch) ? initialConfig.speechPitch : 1,
      getReply: initialConfig.getReply || (async (transcript) => transcript),
    },
    handlers: {
      onStateChange: initialConfig.onStateChange || null,
      onLog: initialConfig.onLog || null,
      onTurn: initialConfig.onTurn || null,
      onVoices: initialConfig.onVoices || null,
      onLevel: initialConfig.onLevel || null,
      onTranscript: initialConfig.onTranscript || null,
    },
  };

  function now() {
    return performance.now();
  }

  function wallClock() {
    return new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  function formatLatency(value) {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return 'n/a';
    }

    return `${Math.round(value)} ms`;
  }

  function formatError(error) {
    if (!error) {
      return null;
    }

    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    return { value: error };
  }

  function getStatusLabel() {
    if (!state.recognitionSupported) {
      return 'speech recognition unavailable';
    }

    if (state.listening) {
      return 'listening';
    }

    if (state.speaking) {
      return 'speaking';
    }

    if (state.lastError?.name === 'SpeechRecognitionError') {
      if (state.lastError.message === 'not-allowed' || state.lastError.message === 'service-not-allowed') {
        return 'microphone permission denied';
      }

      if (state.lastError.message === 'no-speech') {
        return 'no speech detected';
      }

      return `recognition error: ${state.lastError.message}`;
    }

    return 'ready';
  }

  function getSnapshot() {
    return {
      recognitionSupported: state.recognitionSupported,
      speechSynthesisSupported: state.speechSynthesisSupported,
      listening: state.listening,
      speaking: state.speaking,
      status: getStatusLabel(),
      selectedLocale: state.config.locale,
      selectedVoice: state.config.preferredVoiceName || null,
      speakReplies: state.config.speakReplies,
      speechRate: state.config.speechRate,
      speechPitch: state.config.speechPitch,
      autoRestart: state.config.autoRestart,
      lastTranscript: state.lastTranscript,
      lastReply: state.lastReply,
      lastTurn: state.lastTurn,
      lastError: state.lastError,
      voices: state.voices.map((voice) => ({
        name: voice.name,
        lang: voice.lang,
        default: voice.default,
      })),
    };
  }

  function emitStateChange() {
    state.handlers.onStateChange?.(getSnapshot());
  }

  function emitLog(level, message, details) {
    state.handlers.onLog?.({
      at: wallClock(),
      level,
      message,
      details: details ?? null,
    });
  }

  function setLastError(error) {
    state.lastError = formatError(error);
    emitStateChange();
  }

  function setStatusFlags(patch) {
    Object.assign(state, patch);
    emitStateChange();
  }

  function setLastTranscript(text, isFinal = false) {
    state.lastTranscript = text;
    state.handlers.onTranscript?.({
      text,
      isFinal,
      at: wallClock(),
    });
    emitStateChange();
  }

  function setLastReply(text) {
    state.lastReply = text;
    emitStateChange();
  }

  function findVoiceByName(name) {
    return state.voices.find((voice) => voice.name === name) || null;
  }

  function populateVoices() {
    if (!state.speechSynthesisSupported) {
      state.voices = [];
      emitStateChange();
      state.handlers.onVoices?.([]);
      return;
    }

    const voices = window.speechSynthesis.getVoices().filter((voice) => voice.lang);
    state.voices = voices;

    if (!voices.length) {
      emitStateChange();
      state.handlers.onVoices?.([]);
      return;
    }

    if (!state.config.preferredVoiceName || !findVoiceByName(state.config.preferredVoiceName)) {
      const localeMatch =
        voices.find((voice) => voice.lang === state.config.locale) ||
        voices.find((voice) => voice.lang.startsWith(state.config.locale.split('-')[0])) ||
        voices[0];

      state.config.preferredVoiceName = localeMatch?.name || '';
    }

    state.handlers.onVoices?.(
      voices.map((voice) => ({
        name: voice.name,
        lang: voice.lang,
        default: voice.default,
      })),
    );
    emitStateChange();
  }

  function getSelectedVoice() {
    return findVoiceByName(state.config.preferredVoiceName);
  }

  async function ensureMicMeter() {
    if (state.audioContext && state.micStream) {
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    const analyserData = new Uint8Array(analyser.frequencyBinCount);

    source.connect(analyser);

    state.micStream = stream;
    state.audioContext = audioContext;
    state.analyser = analyser;
    state.analyserData = analyserData;

    const tick = () => {
      if (!state.analyser || !state.analyserData) {
        return;
      }

      state.analyser.getByteTimeDomainData(state.analyserData);
      let sum = 0;
      for (const sample of state.analyserData) {
        const centered = (sample - 128) / 128;
        sum += centered * centered;
      }
      const rms = Math.sqrt(sum / state.analyserData.length);
      const level = Math.min(100, Math.round(rms * 220));
      state.handlers.onLevel?.(level);
      state.rafId = window.requestAnimationFrame(tick);
    };

    tick();
  }

  async function speak(text, turn = null) {
    if (!state.config.speakReplies) {
      if (turn) {
        turn.metrics.ttsStart = 'muted';
        turn.metrics.ttsEnd = 'muted';
        turn.metrics.turnTotal = formatLatency(now() - turn.startedAt);
      }
      return;
    }

    if (!state.speechSynthesisSupported) {
      throw new Error('Speech synthesis is not available in this browser.');
    }

    window.speechSynthesis.cancel();
    setStatusFlags({ speaking: true });

    const utterance = new SpeechSynthesisUtterance(text);
    const voice = getSelectedVoice();
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    }
    utterance.rate = state.config.speechRate;
    utterance.pitch = state.config.speechPitch;

    const queuedAt = now();

    await new Promise((resolve, reject) => {
      utterance.onstart = () => {
        if (turn) {
          turn.metrics.ttsStart = formatLatency(now() - turn.startedAt);
        }
        emitLog('info', 'Speech synthesis started.', {
          voice: voice?.name || null,
          queueDelayMs: Math.round(now() - queuedAt),
        });
      };

      utterance.onend = () => {
        if (turn) {
          turn.metrics.ttsEnd = formatLatency(now() - turn.startedAt);
          turn.metrics.turnTotal = formatLatency(now() - turn.startedAt);
        }
        setStatusFlags({ speaking: false });
        resolve();
      };

      utterance.onerror = (event) => {
        reject(new Error(`Speech synthesis failed: ${event.error}`));
      };

      window.speechSynthesis.speak(utterance);
    });
  }

  async function processTurn(transcript, source = 'voice', startedAt = now()) {
    state.lastError = null;
    const reply = await Promise.resolve(state.config.getReply(transcript, source));
    const replyReadyAt = now();

    const turn = {
      at: wallClock(),
      source,
      transcript,
      reply,
      startedAt,
      metrics: {
        speechStart: source === 'voice' ? 'captured' : 'typed',
        transcriptFinal: formatLatency(replyReadyAt - startedAt),
        replyReady: formatLatency(replyReadyAt - startedAt),
        ttsStart: 'pending',
        ttsEnd: 'pending',
        turnTotal: 'pending',
      },
    };

    setLastTranscript(transcript, true);
    setLastReply(reply);
    emitLog('info', 'Reply prepared.', { source, transcript, reply });

    try {
      await speak(reply, turn);
    } catch (error) {
      setLastError(error);
      turn.metrics.ttsStart = 'failed';
      turn.metrics.ttsEnd = 'failed';
      turn.metrics.turnTotal = formatLatency(now() - startedAt);
      emitLog('error', 'Reply speech failed.', state.lastError);
    }

    state.lastTurn = turn;
    state.handlers.onTurn?.(turn);
    emitStateChange();

    if (source === 'voice' && state.config.autoRestart && !state.listening && !state.speaking) {
      startListening({ restart: true }).catch((error) => {
        setLastError(error);
        emitLog('error', 'Recognition auto-restart failed.', state.lastError);
      });
    }

    return turn;
  }

  function stopListening({ updateStatus = true } = {}) {
    if (!state.recognition) {
      return;
    }

    try {
      state.recognition.stop();
    } catch {}

    if (updateStatus) {
      emitStateChange();
    }
  }

  function buildRecognition() {
    if (!SpeechRecognition) {
      return null;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = state.config.locale;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setStatusFlags({ listening: true });
      emitLog('info', 'Speech recognition started.', { locale: recognition.lang });
    };

    recognition.onspeechstart = () => {
      if (!state.activeTurn) {
        state.activeTurn = { startedAt: now() };
      }
      emitLog('info', 'Speech detected.');
    };

    recognition.onresult = (event) => {
      let interim = '';
      let finalTranscript = '';

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0]?.transcript?.trim() || '';
        if (result.isFinal) {
          finalTranscript += transcript;
        } else {
          interim += transcript;
        }
      }

      if (interim) {
        setLastTranscript(interim, false);
      }

      if (finalTranscript) {
        const startedAt = state.activeTurn?.startedAt || now();
        state.activeTurn = null;
        emitLog('info', 'Final transcript received.', { transcript: finalTranscript });
        stopListening({ updateStatus: false });
        processTurn(finalTranscript, 'voice', startedAt).catch((error) => {
          setLastError(error);
          emitLog('error', 'Voice turn processing failed.', state.lastError);
        });
      }
    };

    recognition.onerror = (event) => {
      const error = {
        name: 'SpeechRecognitionError',
        message: event.error,
      };
      state.lastError = error;
      emitLog('error', 'Speech recognition error.', error);
      emitStateChange();
    };

    recognition.onend = () => {
      state.listening = false;
      emitLog('info', 'Speech recognition ended.');
      emitStateChange();
    };

    return recognition;
  }

  async function startListening({ restart = false } = {}) {
    if (!state.recognitionSupported) {
      throw new Error('Speech recognition is not available in this browser.');
    }

    state.lastError = null;

    if (state.speaking) {
      cancelSpeech();
    }

    if (!state.recognition) {
      state.recognition = buildRecognition();
    }

    state.recognition.lang = state.config.locale;
    state.activeTurn = null;

    if (!restart) {
      await ensureMicMeter();
    }

    state.recognition.start();
  }

  function cancelSpeech() {
    if (!state.speechSynthesisSupported) {
      setStatusFlags({ speaking: false });
      return;
    }

    window.speechSynthesis.cancel();
    setStatusFlags({ speaking: false });
    emitLog('warn', 'Speech synthesis cancelled.');
  }

  async function runTextTurn(text, source = 'typed') {
    return processTurn(text, source, now());
  }

  function updateConfig(patch = {}) {
    state.config = {
      ...state.config,
      ...patch,
    };

    if (patch.locale && state.recognition) {
      state.recognition.lang = patch.locale;
    }

    if (patch.preferredVoiceName || patch.locale) {
      populateVoices();
    }

    emitStateChange();
  }

  function destroy() {
    cancelSpeech();
    stopListening({ updateStatus: false });

    if (state.rafId) {
      cancelAnimationFrame(state.rafId);
    }

    if (state.audioContext && state.audioContext.state !== 'closed') {
      state.audioContext.close().catch(() => {});
    }

    if (state.micStream) {
      for (const track of state.micStream.getTracks()) {
        track.stop();
      }
    }

    state.audioContext = null;
    state.micStream = null;
    state.analyser = null;
    state.analyserData = null;
    state.recognition = null;
    state.handlers = {
      onStateChange: null,
      onLog: null,
      onTurn: null,
      onVoices: null,
      onLevel: null,
      onTranscript: null,
    };
  }

  if (state.speechSynthesisSupported) {
    window.speechSynthesis.onvoiceschanged = () => {
      populateVoices();
      emitLog('info', 'Speech synthesis voices refreshed.', {
        count: window.speechSynthesis.getVoices().length,
      });
    };
  }

  populateVoices();
  emitStateChange();

  return {
    cancelSpeech,
    destroy,
    getSnapshot,
    processTurn,
    runTextTurn,
    setHandlers(nextHandlers = {}) {
      state.handlers = {
        ...state.handlers,
        ...nextHandlers,
      };
      emitStateChange();
    },
    startListening,
    stopListening,
    updateConfig,
  };
}
