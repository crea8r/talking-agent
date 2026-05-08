import { createProductionVoicePlaybackArtifact } from './client.mjs';
import { resolveVoiceRenderProfile } from '../voice-layer-browser/render-profiles.js';

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

export function createProductionVoiceLayer({
  synthesizeSpeech,
  AudioImpl = globalThis.Audio,
  urlApi = globalThis.URL,
  initialConfig = {},
} = {}) {
  if (typeof synthesizeSpeech !== 'function') {
    throw new Error('createProductionVoiceLayer requires a synthesizeSpeech function.');
  }

  if (typeof AudioImpl !== 'function') {
    throw new Error('createProductionVoiceLayer requires an Audio implementation.');
  }

  const state = {
    speaking: false,
    lastReply: '',
    lastTurn: null,
    lastError: null,
    config: {
      locale: initialConfig.locale || 'en-US',
      speakReplies: initialConfig.speakReplies !== false,
      preferredVoiceName: initialConfig.preferredVoiceName || 'Production Voice',
      speechRate: Number.isFinite(initialConfig.speechRate) ? initialConfig.speechRate : 1,
      speechPitch: Number.isFinite(initialConfig.speechPitch) ? initialConfig.speechPitch : 1,
      defaultCharacterId: initialConfig.defaultCharacterId || 'default',
      voiceCharacters:
        initialConfig.voiceCharacters && typeof initialConfig.voiceCharacters === 'object'
          ? initialConfig.voiceCharacters
          : {},
      ready: initialConfig.ready !== false,
    },
    handlers: {
      onStateChange: null,
      onLog: null,
      onTurn: null,
      onVoices: null,
    },
    playbackToken: 0,
    activePlayback: null,
  };

  function now() {
    return typeof performance?.now === 'function' ? performance.now() : Date.now();
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

  function emitLog(level, message, details = null) {
    state.handlers.onLog?.({
      at: wallClock(),
      level,
      message,
      details,
    });
  }

  function getStatusLabel() {
    if (state.speaking) {
      return 'speaking';
    }

    if (!state.config.ready) {
      return 'production voice unavailable';
    }

    if (state.lastError?.message) {
      return `voice error: ${state.lastError.message}`;
    }

    return 'ready';
  }

  function getSnapshot() {
    return {
      recognitionSupported: false,
      speechSynthesisSupported: state.config.ready,
      listening: false,
      speaking: state.speaking,
      status: getStatusLabel(),
      selectedLocale: state.config.locale,
      selectedVoice: state.config.preferredVoiceName,
      speakReplies: state.config.speakReplies,
      speechRate: state.config.speechRate,
      speechPitch: state.config.speechPitch,
      defaultCharacterId: state.config.defaultCharacterId,
      autoRestart: false,
      lastTranscript: '',
      lastReply: state.lastReply,
      lastTurn: state.lastTurn,
      lastError: state.lastError,
      voices: [],
      provider: 'production-voice',
    };
  }

  function emitStateChange() {
    state.handlers.onStateChange?.(getSnapshot());
  }

  function resolveRenderProfile(renderOptions = {}) {
    return resolveVoiceRenderProfile({
      preferredVoiceName:
        renderOptions.preferredVoiceName ?? state.config.preferredVoiceName,
      speechRate: renderOptions.speechRate ?? state.config.speechRate,
      speechPitch: renderOptions.speechPitch ?? state.config.speechPitch,
      characterId: renderOptions.characterId || '',
      mood: renderOptions.mood || '',
      defaultCharacterId:
        renderOptions.defaultCharacterId ?? state.config.defaultCharacterId,
      voiceCharacters: renderOptions.voiceCharacters ?? state.config.voiceCharacters,
    });
  }

  function clearActivePlayback() {
    const activePlayback = state.activePlayback;
    if (!activePlayback) {
      return;
    }

    activePlayback.audio.pause?.();
    activePlayback.cleanup?.();
    if (activePlayback.objectUrl && typeof urlApi?.revokeObjectURL === 'function') {
      urlApi.revokeObjectURL(activePlayback.objectUrl);
    }
    state.activePlayback = null;
  }

  function cancelSpeech({ emitWarning = true } = {}) {
    const hadActivePlayback = Boolean(state.activePlayback);
    state.playbackToken += 1;

    if (state.activePlayback?.resolve) {
      state.activePlayback.resolve({ cancelled: true });
    }

    clearActivePlayback();
    state.speaking = false;
    emitStateChange();

    if (emitWarning && hadActivePlayback) {
      emitLog('warn', 'Production voice playback cancelled.');
    }
  }

  async function runTextTurn(text, source = 'typed', speechHooks = {}, renderOptions = {}) {
    const cleanedText = `${text || ''}`.trim();
    if (!cleanedText) {
      throw new Error('Speech text is required.');
    }

    state.lastError = null;
    state.lastReply = cleanedText;

    if (!state.config.speakReplies) {
      const turn = {
        at: wallClock(),
        source,
        transcript: cleanedText,
        reply: cleanedText,
      };
      state.lastTurn = turn;
      state.handlers.onTurn?.(turn);
      emitStateChange();
      return turn;
    }

    if (!state.config.ready) {
      const error = new Error('Production voice is not ready.');
      state.lastError = formatError(error);
      emitStateChange();
      throw error;
    }

    cancelSpeech({ emitWarning: false });

    const startedAt = now();
    const playbackToken = state.playbackToken + 1;
    state.playbackToken = playbackToken;
    state.speaking = true;
    emitStateChange();

    const resolvedRender = resolveRenderProfile(renderOptions);

    let synthesisResult;
    try {
      synthesisResult = await synthesizeSpeech({
        text: cleanedText,
        source,
        renderProfile: resolvedRender,
      });
    } catch (error) {
      state.lastError = formatError(error);
      state.speaking = false;
      emitStateChange();
      throw error;
    }

    if (playbackToken !== state.playbackToken) {
      return {
        at: wallClock(),
        source,
        transcript: cleanedText,
        reply: cleanedText,
      };
    }

    const artifact = createProductionVoicePlaybackArtifact(synthesisResult, {
      urlApi,
    });
    const audio = new AudioImpl(artifact.objectUrl);

    const turn = {
      at: wallClock(),
      source,
      transcript: cleanedText,
      reply: cleanedText,
      metrics: {
        replyReady: formatLatency(now() - startedAt),
        ttsStart: 'pending',
        ttsEnd: 'pending',
        turnTotal: 'pending',
      },
    };

    await new Promise((resolve, reject) => {
      let cleaned = false;
      const cleanup = () => {
        if (cleaned) {
          return;
        }
        cleaned = true;
        audio.removeEventListener('ended', handleEnded);
        audio.removeEventListener('error', handleError);
      };

      const handleEnded = () => {
        turn.metrics.ttsEnd = formatLatency(now() - startedAt);
        turn.metrics.turnTotal = formatLatency(now() - startedAt);
        cleanup();
        speechHooks.onSpeechEnd?.({
          text: cleanedText,
          characterId: resolvedRender.characterId,
          mood: resolvedRender.mood,
        });
        resolve({ cancelled: false });
      };

      const handleError = () => {
        cleanup();
        reject(new Error('Production voice audio playback failed.'));
      };

      state.activePlayback = {
        audio,
        objectUrl: artifact.objectUrl,
        cleanup,
        resolve,
      };

      audio.addEventListener('ended', handleEnded);
      audio.addEventListener('error', handleError);

      Promise.resolve(audio.play())
        .then(() => {
          if (playbackToken !== state.playbackToken) {
            cleanup();
            resolve({ cancelled: true });
            return;
          }

          turn.metrics.ttsStart = formatLatency(now() - startedAt);
          speechHooks.onSpeechStart?.({
            text: cleanedText,
            characterId: resolvedRender.characterId,
            mood: resolvedRender.mood,
          });
        })
        .catch((error) => {
          cleanup();
          reject(error instanceof Error ? error : new Error('Production voice audio playback failed.'));
        });
    });

    if (playbackToken === state.playbackToken) {
      clearActivePlayback();
      state.speaking = false;
      state.lastTurn = turn;
      state.handlers.onTurn?.(turn);
      emitStateChange();
    }

    return turn;
  }

  function updateConfig(patch = {}) {
    state.config = {
      ...state.config,
      ...patch,
    };
    emitStateChange();
  }

  function destroy() {
    cancelSpeech({ emitWarning: false });
    state.handlers = {
      onStateChange: null,
      onLog: null,
      onTurn: null,
      onVoices: null,
    };
  }

  state.handlers.onVoices?.([]);
  emitStateChange();

  return {
    cancelSpeech,
    destroy,
    getSnapshot,
    runTextTurn,
    resolveRenderProfile,
    setHandlers(nextHandlers = {}) {
      state.handlers = {
        ...state.handlers,
        ...nextHandlers,
      };
      state.handlers.onVoices?.([]);
      emitStateChange();
    },
    updateConfig,
  };
}
