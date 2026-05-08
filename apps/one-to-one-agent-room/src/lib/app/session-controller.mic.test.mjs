import test from 'node:test';
import assert from 'node:assert/strict';

import { createSessionController } from './session-controller.js';

function createHarness() {
  let startCount = 0;
  let stopCount = 0;
  const state = {
    runtimeConfig: {},
    session: {
      id: 'session-1',
      title: 'talking-agent',
      state: 'live',
      turns: [],
      metrics: {
        pendingTurns: 0,
        turnCount: 0,
        unplayedReplies: 0,
      },
      agent: {
        id: 'codex-openai',
        label: 'Codex OpenAI',
        status: 'idle',
        currentTurnId: null,
        lastReplyAt: null,
        lastError: '',
      },
    },
    sessionKey: 'session-1',
    sessionPreparing: false,
    activeCall: true,
    endingCall: false,
    callEndingDimmed: false,
    humanMicMuted: false,
    humanMicLevel: 48,
    currentTurnId: null,
    playbackGeneration: 0,
    activeReplyAbortController: null,
    activeUtteranceId: null,
    activeUtteranceText: '',
    transcriptPreview: '',
    processingReplies: false,
    agentThinkingActive: false,
    agentThinkingElapsedTenths: 0,
    modelLoading: false,
    subtitles: {
      human: {
        mode: 'listening',
        text: 'Listening…',
      },
      agent: {
        mode: 'ready',
        text: 'Waiting for your first line.',
      },
    },
    preferences: {
      bundledModelId: 'bhf-1-2',
      humanLocale: 'en-US',
      gestureId: 'Pose',
      emoteId: 'neutral',
    },
    productionVoice: {
      loading: false,
      uploading: false,
      backendRunning: true,
      profile: {
        referenceAvailable: true,
      },
      validationMessage: '',
    },
    codex: {
      loading: false,
      backendRunning: true,
    },
  };

  globalThis.window = {
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    requestAnimationFrame(callback) {
      callback();
    },
  };

  const controller = createSessionController({
    state,
    humanVoiceLayer: {
      stopListening() {
        stopCount += 1;
      },
      async startListening() {
        startCount += 1;
      },
      getSnapshot() {
        return {
          recognitionSupported: true,
          status: 'ready',
          listening: !state.humanMicMuted,
        };
      },
      destroy() {},
    },
    agentVoiceLayer: {
      getSnapshot() {
        return {
          speechSynthesisSupported: true,
        };
      },
      resolveRenderProfile() {
        return {
          speechRate: 1,
        };
      },
      updateConfig() {},
      destroy() {},
    },
    avatarSpeech: {
      getSnapshot() {
        return {
          active: false,
        };
      },
      stop() {},
      buildMouthTimeline() {
        return {
          durationMs: 1000,
        };
      },
    },
    avatarLayer: {
      getSnapshot() {
        return {
          ready: true,
          gestureId: 'Pose',
          availableGestures: [],
        };
      },
      destroy() {},
    },
    dom: {},
    stageMap: new Map(),
    emoteMap: new Map(),
    selectStage() {},
    selectEmote() {},
    selectGesture() {},
    collectFormState() {
      return {
        humanLocale: 'en-US',
      };
    },
    fetchJson: async () => ({}),
    postJson: async () => ({ session: state.session }),
    postFormData: async () => ({}),
    addLog() {},
    formatError(error) {
      return error;
    },
    renderSessionSnapshot() {},
    renderTranscriptList() {},
    renderSubtitles() {},
    renderDebugSnapshot() {},
    renderAgentStatus() {},
    renderVoiceSampleState() {},
    refreshActionButtons() {},
    syncVoiceSampleProfile() {},
    persistState() {},
    updateRoomStatus() {},
  });

  return {
    controller,
    state,
    counts() {
      return {
        startCount,
        stopCount,
      };
    },
  };
}

test('toggleMicrophoneMuted stops listening, clears the level, and starts listening again on unmute', async () => {
  const harness = createHarness();

  await harness.controller.toggleMicrophoneMuted();

  assert.equal(harness.state.humanMicMuted, true);
  assert.equal(harness.state.humanMicLevel, 0);
  assert.equal(harness.state.subtitles.human.text, 'Muted.');
  assert.deepEqual(harness.counts(), {
    startCount: 0,
    stopCount: 1,
  });

  await harness.controller.toggleMicrophoneMuted();

  assert.equal(harness.state.humanMicMuted, false);
  assert.equal(harness.state.humanMicLevel, 0);
  assert.equal(harness.state.subtitles.human.text, 'Listening…');
  assert.deepEqual(harness.counts(), {
    startCount: 1,
    stopCount: 1,
  });
});
