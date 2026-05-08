import test from 'node:test';
import assert from 'node:assert/strict';

import {
  VOICE_PREVIEW_LINES,
  createSetupPreviewController,
  pickRandomExpressiveGesture,
} from './setup-preview.js';

test('pickRandomExpressiveGesture avoids idle and listening gestures when expressive options exist', () => {
  const gesture = pickRandomExpressiveGesture(
    [
      { id: 'Pose', intent: 'idle', bestFor: ['idle'] },
      { id: 'LookAround', intent: 'listening', bestFor: ['listening'] },
      { id: 'Greeting', intent: 'greet', bestFor: ['greet'] },
    ],
    'Pose',
    () => 0,
  );

  assert.equal(gesture?.id, 'Greeting');
});

test('playVoicePreview speaks a prepared line with the selected character and restores the prior gesture', async () => {
  let activeGestureId = 'Pose';
  const calls = [];
  const state = {
    activeCall: false,
    modelLoading: false,
    preferences: {
      bundledModelId: 'bhf-1-2',
      humanLocale: 'en-US',
    },
    productionVoice: {
      backendRunning: true,
      loading: false,
      uploading: false,
      validationMessage: '',
      profile: {
        referenceAvailable: true,
      },
    },
  };

  const controller = createSetupPreviewController({
    state,
    avatarLayer: {
      getSnapshot() {
        return {
          ready: true,
          gestureId: activeGestureId,
          availableGestures: [
            { id: 'Pose', intent: 'idle', bestFor: ['idle'], durationMs: 1800 },
            { id: 'Greeting', intent: 'greet', bestFor: ['greet'], durationMs: 2100 },
          ],
        };
      },
      setGesture(nextGestureId) {
        activeGestureId = nextGestureId;
        calls.push(['gesture', nextGestureId]);
      },
    },
    avatarSpeech: {
      getSnapshot() {
        return { active: false };
      },
      async speakText(text, options) {
        calls.push(['speak', text, options.characterId, options.locale]);
      },
    },
    random: () => 0,
    addLog() {},
    formatError(error) {
      return error;
    },
    renderVoiceSampleState() {},
    refreshActionButtons() {},
  });

  const played = await controller.playVoicePreview();

  assert.equal(played, true);
  assert.equal(state.setupPreview.voicePending, false);
  assert.equal(state.setupPreview.voiceActive, false);
  assert.deepEqual(calls[0], ['gesture', 'Greeting']);
  assert.deepEqual(calls[1], ['speak', VOICE_PREVIEW_LINES[0], 'bhf-1-2', 'en-US']);
  assert.deepEqual(calls[2], ['gesture', 'Pose']);
});

test('playVoicePreview resets the wait counter when clicked again before playback starts', async () => {
  let activeGestureId = 'Pose';
  let speechActive = false;
  let intervalCallback = null;
  let currentIntervalId = 0;
  const pendingCalls = [];
  const state = {
    activeCall: false,
    modelLoading: false,
    preferences: {
      bundledModelId: 'bhf-1-2',
      humanLocale: 'en-US',
    },
    productionVoice: {
      backendRunning: true,
      loading: false,
      uploading: false,
      validationMessage: '',
      profile: {
        referenceAvailable: true,
      },
    },
  };
  let stopCount = 0;

  const controller = createSetupPreviewController({
    state,
    avatarLayer: {
      getSnapshot() {
        return {
          ready: true,
          gestureId: activeGestureId,
          availableGestures: [
            { id: 'Pose', intent: 'idle', bestFor: ['idle'], durationMs: 1800 },
            { id: 'Greeting', intent: 'greet', bestFor: ['greet'], durationMs: 2100 },
          ],
        };
      },
      setGesture(nextGestureId) {
        activeGestureId = nextGestureId;
      },
    },
    avatarSpeech: {
      getSnapshot() {
        return { active: speechActive };
      },
      stop() {
        stopCount += 1;
        speechActive = false;
      },
      async speakText(text, options) {
        speechActive = true;
        return new Promise((resolve) => {
          pendingCalls.push({
            text,
            options,
            resolve() {
              options.onPlaybackEnd?.();
              speechActive = false;
              resolve();
            },
          });
        });
      },
    },
    timers: {
      setTimeout() {
        return 1;
      },
      clearTimeout() {},
      setInterval(fn) {
        intervalCallback = fn;
        currentIntervalId += 1;
        return currentIntervalId;
      },
      clearInterval() {
        intervalCallback = null;
      },
    },
    random: () => 0,
    addLog() {},
    formatError(error) {
      return error;
    },
    renderVoiceSampleState() {},
    refreshActionButtons() {},
  });

  const firstPromise = controller.playVoicePreview();
  assert.equal(state.setupPreview.voicePending, true);
  assert.equal(state.setupPreview.voiceWaitSeconds, 0);

  intervalCallback?.();
  assert.equal(state.setupPreview.voiceWaitSeconds, 1);

  const secondPromise = controller.playVoicePreview();
  assert.equal(stopCount, 1);
  assert.equal(state.setupPreview.voicePending, true);
  assert.equal(state.setupPreview.voiceWaitSeconds, 0);
  assert.equal(pendingCalls.length, 2);

  pendingCalls[0].resolve();
  pendingCalls[1].options.onPlaybackStart?.();
  assert.equal(state.setupPreview.voicePending, false);
  assert.equal(state.setupPreview.voiceActive, true);
  pendingCalls[1].resolve();

  await firstPromise;
  await secondPromise;
  assert.equal(state.setupPreview.voicePending, false);
  assert.equal(state.setupPreview.voiceActive, false);
  assert.equal(state.setupPreview.voiceWaitSeconds, 0);
});

test('playCharacterAnimationPreview disables until the preview duration completes', () => {
  let activeGestureId = 'Pose';
  let queuedTimer = null;
  let queuedDelay = 0;
  const state = {
    activeCall: false,
    modelLoading: false,
    preferences: {
      bundledModelId: 'bhf-1-2',
      humanLocale: 'en-US',
    },
    productionVoice: {
      backendRunning: true,
      loading: false,
      uploading: false,
      validationMessage: '',
      profile: {
        referenceAvailable: true,
      },
    },
  };

  const controller = createSetupPreviewController({
    state,
    avatarLayer: {
      getSnapshot() {
        return {
          ready: true,
          gestureId: activeGestureId,
          availableGestures: [
            { id: 'Pose', intent: 'idle', bestFor: ['idle'], durationMs: 1800 },
            { id: 'Cheer', intent: 'celebrate', bestFor: ['celebrate'], durationMs: 2400 },
          ],
        };
      },
      setGesture(nextGestureId) {
        activeGestureId = nextGestureId;
      },
    },
    avatarSpeech: {
      getSnapshot() {
        return { active: false };
      },
    },
    timers: {
      setTimeout(fn, delay) {
        queuedTimer = fn;
        queuedDelay = delay;
        return 1;
      },
      clearTimeout() {},
    },
    random: () => 0,
    addLog() {},
    formatError(error) {
      return error;
    },
    renderVoiceSampleState() {},
    refreshActionButtons() {},
  });

  const played = controller.playCharacterAnimationPreview();

  assert.equal(played, true);
  assert.equal(state.setupPreview.animationPlaying, true);
  assert.equal(controller.canPreviewCharacterAnimation(), false);
  assert.equal(activeGestureId, 'Cheer');
  assert.equal(queuedDelay, 2400);

  queuedTimer();
  assert.equal(state.setupPreview.animationPlaying, false);
  assert.equal(activeGestureId, 'Pose');
});
