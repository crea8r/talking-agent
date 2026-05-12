export function createAvatarSpeechController({
  avatarLayer,
  voiceLayer,
  onLog = null,
  onStateChange = null,
} = {}) {
  if (!avatarLayer) {
    throw new Error('createAvatarSpeechController requires an avatarLayer.');
  }

  if (!voiceLayer) {
    throw new Error('createAvatarSpeechController requires a voiceLayer.');
  }

  const state = {
    active: false,
    mode: 'idle',
    source: '',
    currentText: '',
    currentMouth: 'rest',
    durationMs: 0,
    startedAt: 0,
    playbackStarted: false,
    frames: [],
    rafId: 0,
    sessionId: 0,
  };

  function emitLog(level, message, details = null) {
    onLog?.(level, message, details);
  }

  function emitState() {
    onStateChange?.(getSnapshot());
  }

  function getSnapshot() {
    return {
      active: state.active,
      mode: state.mode,
      source: state.source,
      currentText: state.currentText,
      currentMouth: state.currentMouth,
      durationMs: state.durationMs,
      playbackStarted: state.playbackStarted,
    };
  }

  function resetFace() {
    state.currentMouth = 'rest';
    avatarLayer.setSpeaking(false);
    avatarLayer.setMouthCue('rest');
  }

  function stop({ cancelVoice = true } = {}) {
    if (state.rafId) {
      cancelAnimationFrame(state.rafId);
    }

    if (cancelVoice) {
      voiceLayer.cancelSpeech();
    }

    state.active = false;
    state.mode = 'idle';
    state.source = '';
    state.currentText = '';
    state.durationMs = 0;
    state.startedAt = 0;
    state.playbackStarted = false;
    state.frames = [];
    state.rafId = 0;
    resetFace();
    emitState();
  }

  function getHeldMouthCue() {
    const lastAnimatedFrame = [...state.frames].reverse().find((frame) => frame.mouth !== 'rest');
    return lastAnimatedFrame?.mouth || 'rest';
  }

  function startPlayback(sessionId) {
    if (!state.active || state.sessionId !== sessionId || state.playbackStarted) {
      return;
    }

    state.startedAt = performance.now();
    state.playbackStarted = true;
    avatarLayer.setSpeaking(true);
    avatarLayer.setMouthCue('rest');
    emitState();
    tickPlayback(sessionId);
  }

  function tickPlayback(sessionId) {
    if (!state.active || state.sessionId !== sessionId) {
      return;
    }

    if (!state.playbackStarted) {
      return;
    }

    const elapsed = performance.now() - state.startedAt;
    const frame = state.frames.find((item) => elapsed >= item.startMs && elapsed < item.endMs) || null;
    const nextMouth =
      frame?.mouth || (state.mode === 'voice' && elapsed >= state.durationMs ? getHeldMouthCue() : 'rest');

    if (nextMouth !== state.currentMouth) {
      state.currentMouth = nextMouth;
      avatarLayer.setMouthCue(nextMouth);
      emitState();
    }

    if (elapsed >= state.durationMs) {
      if (state.mode === 'silent') {
        stop({ cancelVoice: false });
        return;
      }
    }

    state.rafId = requestAnimationFrame(() => tickPlayback(sessionId));
  }

  async function speakText(
    text,
    {
      withVoice = true,
      source = 'agent-reply',
      locale = 'en-US',
      preferredVoiceName = '',
      speechRate = 1,
      speechPitch = 1,
      characterId = '',
      mood = '',
      onPlaybackStart = null,
      onPlaybackEnd = null,
    } = {},
  ) {
    const cleanedText = `${text || ''}`.trim();
    if (!cleanedText) {
      throw new Error('Speech text is required.');
    }

    stop({ cancelVoice: true });

    const resolvedRenderProfile =
      typeof voiceLayer.resolveRenderProfile === 'function'
        ? voiceLayer.resolveRenderProfile({
            preferredVoiceName,
            speechRate,
            speechPitch,
            characterId,
            mood,
          })
        : {
            voiceName: preferredVoiceName,
            speechRate,
            speechPitch,
            characterId,
            mood,
          };
    const timeline = buildMouthTimeline(cleanedText, resolvedRenderProfile.speechRate);
    const sessionId = state.sessionId + 1;
    state.sessionId = sessionId;
    state.active = true;
    state.mode = withVoice ? 'voice' : 'silent';
    state.source = source;
    state.currentText = cleanedText;
    state.durationMs = timeline.durationMs;
    state.startedAt = 0;
    state.playbackStarted = false;
    state.frames = timeline.frames;
    state.currentMouth = 'rest';

    voiceLayer.updateConfig({
      locale,
      autoRestart: false,
      speakReplies: withVoice,
      preferredVoiceName: resolvedRenderProfile.voiceName,
      speechRate: resolvedRenderProfile.speechRate,
      speechPitch: resolvedRenderProfile.speechPitch,
      getReply: async (transcript) => transcript,
    });

    emitLog('info', withVoice ? 'Avatar voice playback queued.' : 'Avatar silent playback started.', {
      source,
      withVoice,
      durationMs: timeline.durationMs,
    });
    emitState();

    if (!withVoice) {
      startPlayback(sessionId);
      onPlaybackStart?.();
      return getSnapshot();
    }

    try {
      await voiceLayer.runTextTurn(cleanedText, source, {
        onSpeechStart: () => {
          if (!state.active || state.sessionId !== sessionId) {
            return;
          }

          startPlayback(sessionId);
          emitLog('info', 'Avatar voice playback started.', {
            source,
            withVoice,
            durationMs: timeline.durationMs,
          });
          onPlaybackStart?.();
        },
        onSpeechEnd: () => {
          if (state.active && state.sessionId === sessionId) {
            onPlaybackEnd?.();
          }
        },
      }, {
        preferredVoiceName: resolvedRenderProfile.voiceName,
        speechRate: resolvedRenderProfile.speechRate,
        speechPitch: resolvedRenderProfile.speechPitch,
        characterId: resolvedRenderProfile.characterId,
        mood: resolvedRenderProfile.mood,
      });
    } finally {
      if (state.sessionId === sessionId) {
        stop({ cancelVoice: false });
      }
    }

    return getSnapshot();
  }

  return {
    buildMouthTimeline,
    getSnapshot,
    speakText,
    stop,
  };
}

export function buildMouthTimeline(text, rate = 1) {
  const safeRate = Number.isFinite(rate) && rate > 0 ? rate : 1;
  const tokens =
    text
      .toLowerCase()
      .match(/[a-z']+|[.,!?;:]/g)
      ?.filter(Boolean) || [];

  const frames = [];
  let cursor = 0;

  if (!tokens.length) {
    return {
      frames: [{ mouth: 'rest', startMs: 0, endMs: 640 }],
      durationMs: 640,
    };
  }

  tokens.forEach((token) => {
    if (/^[a-z']+$/.test(token)) {
      const groups = token.match(/[aeiouy]+|[^aeiouy]+/g) || [token];

      groups.forEach((group) => {
        const mouth = mapGroupToMouth(group);
        const duration = Math.max(52, (74 + Math.min(group.length, 4) * 18) / safeRate);
        pushFrame(frames, mouth, cursor, cursor + duration);
        cursor += duration;
      });

      const tailPause = (token.length <= 3 ? 34 : 42) / safeRate;
      pushFrame(frames, 'rest', cursor, cursor + tailPause);
      cursor += tailPause;
      return;
    }

    const punctuationPause =
      token === ',' || token === ';' || token === ':' ? 130 / safeRate : 210 / safeRate;
    pushFrame(frames, 'rest', cursor, cursor + punctuationPause);
    cursor += punctuationPause;
  });

  const landing = 120 / safeRate;
  pushFrame(frames, 'rest', cursor, cursor + landing);

  return {
    frames,
    durationMs: cursor + landing,
  };
}

function pushFrame(frames, mouth, startMs, endMs) {
  const previous = frames.at(-1);
  if (previous && previous.mouth === mouth) {
    previous.endMs = endMs;
    return;
  }

  frames.push({ mouth, startMs, endMs });
}

function mapGroupToMouth(group) {
  if (!group) {
    return 'rest';
  }

  if (!/[aeiouy]/.test(group)) {
    if (/[mbp]/.test(group)) {
      return 'rest';
    }

    if (/[fv]/.test(group)) {
      return 'ee';
    }

    if (/[rl]/.test(group)) {
      return 'ih';
    }

    if (/[wq]/.test(group)) {
      return 'ou';
    }

    return 'aa';
  }

  if (group.includes('ou') || group.includes('oo') || group.includes('u') || group.includes('w')) {
    return 'ou';
  }

  if (group.includes('ee') || group.includes('ea') || /^[iy]+$/.test(group) || group.includes('ei')) {
    return 'ee';
  }

  if (group.includes('i') || group.includes('y')) {
    return 'ih';
  }

  if (group.includes('o')) {
    return 'oh';
  }

  if (group.includes('e')) {
    return 'ee';
  }

  return 'aa';
}
