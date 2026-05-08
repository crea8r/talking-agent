export const VOICE_PREVIEW_LINES = [
  'Hi, this is a quick voice check before we start.',
  'Testing the voice reference now. Tell me if this sounds right.',
  'Here is a short sample so you can hear the selected voice.',
];

const IDLEISH_GESTURE_TOKENS = new Set([
  'idle',
  'listen',
  'listening',
  'waiting',
  'resting',
  'relax',
  'relaxed',
  'ambient attention',
  'pose',
  'lookaround',
]);

function normalizeToken(value) {
  return `${value || ''}`.trim().toLowerCase();
}

function isIdleishGesture(gesture = {}) {
  const tokens = [
    gesture.id,
    gesture.intent,
    ...(Array.isArray(gesture.bestFor) ? gesture.bestFor : []),
  ]
    .map(normalizeToken)
    .filter(Boolean);

  return tokens.some((token) => IDLEISH_GESTURE_TOKENS.has(token));
}

export function pickRandomExpressiveGesture(availableGestures = [], currentGestureId = '', random = Math.random) {
  const usableGestures = Array.isArray(availableGestures)
    ? availableGestures.filter((gesture) => gesture?.id)
    : [];
  const nonIdleGestures = usableGestures.filter((gesture) => !isIdleishGesture(gesture));
  const nonRepeatedPool = nonIdleGestures.filter((gesture) => gesture.id !== currentGestureId);
  const pool = nonRepeatedPool.length
    ? nonRepeatedPool
    : nonIdleGestures.length
      ? nonIdleGestures
      : usableGestures.filter((gesture) => gesture.id !== currentGestureId);

  if (!pool.length) {
    return null;
  }

  const index = Math.max(0, Math.min(pool.length - 1, Math.floor(random() * pool.length)));
  return pool[index] || null;
}

function pickRandomVoicePreviewText(random = Math.random) {
  const index = Math.max(
    0,
    Math.min(VOICE_PREVIEW_LINES.length - 1, Math.floor(random() * VOICE_PREVIEW_LINES.length)),
  );
  return VOICE_PREVIEW_LINES[index] || VOICE_PREVIEW_LINES[0];
}

export function createSetupPreviewController({
  state,
  avatarLayer,
  avatarSpeech,
  timers = globalThis.window,
  random = Math.random,
  addLog = () => {},
  formatError = (error) => error,
  renderVoiceSampleState = () => {},
  refreshActionButtons = () => {},
} = {}) {
  let restoreTimerId = 0;
  let restoreGestureId = '';
  let voiceWaitIntervalId = 0;
  let voicePreviewRequestId = 0;

  function getSetupPreviewState() {
    if (!state.setupPreview) {
      state.setupPreview = {
        voicePending: false,
        voiceActive: false,
        voiceWaitSeconds: 0,
        animationPlaying: false,
      };
    }

    return state.setupPreview;
  }

  function clearGestureRestore() {
    if (restoreTimerId) {
      timers?.clearTimeout?.(restoreTimerId);
      restoreTimerId = 0;
    }
  }

  function clearVoiceWaitTimer() {
    if (voiceWaitIntervalId) {
      timers?.clearInterval?.(voiceWaitIntervalId);
      voiceWaitIntervalId = 0;
    }
  }

  function setVoicePreviewState(nextState = {}) {
    const previewState = getSetupPreviewState();
    Object.assign(previewState, nextState);
    refreshActionButtons();
  }

  function restoreGesture(targetGestureId = restoreGestureId) {
    clearGestureRestore();
    if (targetGestureId) {
      avatarLayer.setGesture(targetGestureId);
    }
    restoreGestureId = '';
    const previewState = getSetupPreviewState();
    previewState.animationPlaying = false;
    refreshActionButtons();
  }

  function getAvatarSnapshot() {
    return avatarLayer.getSnapshot?.() || {};
  }

  function canPreviewVoiceSample() {
    const productionVoice = state.productionVoice || {};
    const speechSnapshot = avatarSpeech.getSnapshot?.() || {};
    const previewState = getSetupPreviewState();

    return Boolean(
      !state.activeCall &&
        !state.modelLoading &&
        !productionVoice.loading &&
        !productionVoice.uploading &&
        !productionVoice.validationMessage &&
        productionVoice.backendRunning &&
        productionVoice.profile?.referenceAvailable &&
        (!speechSnapshot.active || previewState.voicePending) &&
        !previewState.animationPlaying,
    );
  }

  function canPreviewCharacterAnimation() {
    const speechSnapshot = avatarSpeech.getSnapshot?.() || {};
    const previewState = getSetupPreviewState();
    return Boolean(
      !state.activeCall &&
        !state.modelLoading &&
        getAvatarSnapshot().ready &&
        !speechSnapshot.active &&
        !previewState.animationPlaying,
    );
  }

  async function playVoicePreview() {
    if (!canPreviewVoiceSample()) {
      renderVoiceSampleState();
      refreshActionButtons();
      return false;
    }

    const avatarSnapshot = getAvatarSnapshot();
    const previousGestureId = restoreGestureId || avatarSnapshot.gestureId || 'Pose';
    const previewGesture = pickRandomExpressiveGesture(
      avatarSnapshot.availableGestures,
      avatarSnapshot.gestureId,
      random,
    );
    const previewText = pickRandomVoicePreviewText(random);
    const requestId = voicePreviewRequestId + 1;
    voicePreviewRequestId = requestId;
    const previewState = getSetupPreviewState();

    clearVoiceWaitTimer();
    if (previewState.voicePending || previewState.voiceActive) {
      avatarSpeech.stop?.({ cancelVoice: true });
    }
    clearGestureRestore();
    if (previewGesture?.id) {
      restoreGestureId = previousGestureId;
      avatarLayer.setGesture(previewGesture.id);
    }
    setVoicePreviewState({
      voicePending: true,
      voiceActive: false,
      voiceWaitSeconds: 0,
    });
    voiceWaitIntervalId = timers?.setInterval?.(() => {
      if (voicePreviewRequestId !== requestId) {
        return;
      }

      const previewState = getSetupPreviewState();
      previewState.voiceWaitSeconds += 1;
      refreshActionButtons();
    }, 1000);

    try {
      await avatarSpeech.speakText(previewText, {
        withVoice: true,
        source: 'voice-preview',
        locale: state.preferences?.humanLocale || 'en-US',
        characterId: state.preferences?.bundledModelId || avatarSnapshot.modelId || '',
        mood: 'warm',
        onPlaybackStart: () => {
          if (voicePreviewRequestId !== requestId) {
            return;
          }

          clearVoiceWaitTimer();
          setVoicePreviewState({
            voicePending: false,
            voiceActive: true,
          });
        },
        onPlaybackEnd: () => {
          if (voicePreviewRequestId !== requestId) {
            return;
          }

          setVoicePreviewState({
            voiceActive: false,
          });
        },
      });
      addLog('info', 'Played setup voice preview.', {
        characterId: state.preferences?.bundledModelId || '',
        gestureId: previewGesture?.id || '',
      });
      return true;
    } catch (error) {
      addLog('error', 'Setup voice preview failed.', formatError(error));
      throw error;
    } finally {
      if (voicePreviewRequestId !== requestId) {
        return;
      }

      clearVoiceWaitTimer();
      setVoicePreviewState({
        voicePending: false,
        voiceActive: false,
        voiceWaitSeconds: 0,
      });
      if (previewGesture?.id) {
        restoreGesture(previousGestureId);
      } else {
        refreshActionButtons();
      }
    }
  }

  function playCharacterAnimationPreview() {
    if (!canPreviewCharacterAnimation()) {
      refreshActionButtons();
      return false;
    }

    const avatarSnapshot = getAvatarSnapshot();
    const previewGesture = pickRandomExpressiveGesture(
      avatarSnapshot.availableGestures,
      avatarSnapshot.gestureId,
      random,
    );

    if (!previewGesture?.id) {
      refreshActionButtons();
      return false;
    }

    const previousGestureId = restoreGestureId || avatarSnapshot.gestureId || 'Pose';
    const durationMs =
      Number.isFinite(previewGesture.durationMs) && previewGesture.durationMs > 0
        ? previewGesture.durationMs
        : 2200;

    clearGestureRestore();
    restoreGestureId = previousGestureId;
    getSetupPreviewState().animationPlaying = true;
    avatarLayer.setGesture(previewGesture.id);
    restoreTimerId = timers?.setTimeout?.(() => {
      restoreGesture(previousGestureId);
    }, durationMs);
    addLog('info', 'Played setup animation preview.', {
      gestureId: previewGesture.id,
      durationMs,
    });
    refreshActionButtons();
    return true;
  }

  function destroy() {
    clearVoiceWaitTimer();
    setVoicePreviewState({
      voicePending: false,
      voiceActive: false,
      voiceWaitSeconds: 0,
      animationPlaying: false,
    });
    clearGestureRestore();
    restoreGestureId = '';
  }

  return {
    canPreviewVoiceSample,
    canPreviewCharacterAnimation,
    playVoicePreview,
    playCharacterAnimationPreview,
    destroy,
  };
}
