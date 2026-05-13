import test from 'node:test';
import assert from 'node:assert/strict';

import { createSessionController } from './session-controller.js';

function createSessionPayload({
  id = 'session-1',
  title = 'talking-agent',
  state = 'idle',
  turns = [],
} = {}) {
  return {
    session: {
      id,
      title,
      state,
      turns,
      metrics: {
        pendingTurns: 0,
        turnCount: turns.length,
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
      avatar: {
        activeModelId: 'bhf-1-2',
        activeModelLabel: 'Red Tinker Bell',
        gestureCatalog: [],
      },
    },
  };
}

function cloneFormState(formState) {
  return {
    ...formState,
    enabledPluginIds: [...formState.enabledPluginIds],
  };
}

function createHarness({
  runtimeConfig = { codexProjectName: 'talking-agent' },
  launchContext = { mode: 'manual' },
  productionVoiceReady = true,
  productionVoiceBackendRunning = true,
  codexBackendRunning = true,
} = {}) {
  const postCalls = [];
  let nextSessionNumber = 1;
  const formState = {
    humanIdentity: 'human-caller',
    participantName: 'Human Caller',
    humanLocale: 'en-US',
    bundledModelId: 'bhf-1-2',
    voiceSampleFileName: productionVoiceReady ? 'voice.wav' : '',
    voiceSampleProfileId: productionVoiceReady ? 'voice-profile-1' : '',
    voiceSampleStatus: productionVoiceReady ? 'ready' : 'missing',
    enabledPluginIds: ['tool-a'],
    enableControlComputer: true,
    enableComplexTasks: false,
  };

  const state = {
    runtimeConfig,
    launchContext,
    session: null,
    sessionKey: '',
    sessionPreparing: false,
    activeCall: false,
    endingCall: false,
    callEndingDimmed: false,
    startupGreetingActive: false,
    humanMicMuted: false,
    humanMicLevel: 0,
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
        mode: 'idle',
        text: 'Waiting',
      },
      agent: {
        mode: 'idle',
        text: 'Offline',
      },
    },
    preferences: {
      bundledModelId: formState.bundledModelId,
      humanLocale: formState.humanLocale,
      gestureId: 'Pose',
      emoteId: 'neutral',
      voiceSampleFileName: formState.voiceSampleFileName,
      voiceSampleProfileId: formState.voiceSampleProfileId,
      voiceSampleStatus: formState.voiceSampleStatus,
    },
    productionVoice: {
      loading: false,
      uploading: false,
      backendRunning: productionVoiceBackendRunning,
      profile: {
        referenceAvailable: productionVoiceReady,
      },
      validationMessage: '',
    },
    codex: {
      loading: false,
      backendRunning: codexBackendRunning,
      backendDetail: codexBackendRunning ? '' : 'Codex exec is unavailable.',
    },
    agentSelf: {
      loading: false,
      saving: false,
      settings: {
        agentMode: 'standard',
        selfProfile: {
          name: '',
          pronouns: '',
          personality: '',
          interests: '',
          selfPrompt: '',
        },
      },
    },
  };

  globalThis.window = {
    setTimeout,
    clearTimeout,
    setInterval() {
      return 0;
    },
    clearInterval() {},
    requestAnimationFrame(callback) {
      callback();
    },
  };

  const controller = createSessionController({
    state,
    humanVoiceLayer: {
      stopListening() {},
      async startListening() {},
      updateConfig() {},
      getSnapshot() {
        return {
          recognitionSupported: true,
          status: 'ready',
          listening: false,
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
      async speakText() {},
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
      return cloneFormState(formState);
    },
    fetchJson: async () => ({}),
    postJson: async (url, body) => {
      postCalls.push({ url, body });
      if (url === '/api/call/sessions') {
        return createSessionPayload({
          id: `session-${nextSessionNumber++}`,
          title: body?.title || 'talking-agent',
        });
      }
      return createSessionPayload({
        id: state.session?.id || 'session-unknown',
        title: state.session?.title || 'talking-agent',
        state: state.session?.state || 'idle',
        turns: state.session?.turns || [],
      });
    },
    postFormData: async () => ({}),
    addLog() {},
    formatError(error) {
      return error instanceof Error ? error.message : `${error || ''}`;
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
    formState,
    postCalls,
  };
}

test('prepareLobbySession creates and reuses a direct session while the setup key is unchanged', async () => {
  const harness = createHarness();

  await harness.controller.prepareLobbySession();

  assert.equal(harness.state.session?.id, 'session-1');
  assert.equal(harness.state.sessionPreparing, false);
  assert.deepEqual(
    harness.postCalls.map((call) => call.url),
    ['/api/call/sessions', '/api/call/sessions/session-1/setup'],
  );

  await harness.controller.prepareLobbySession();

  assert.deepEqual(
    harness.postCalls.map((call) => call.url),
    ['/api/call/sessions', '/api/call/sessions/session-1/setup'],
  );
});

test('prepareLobbySession starts a new session when the call identity changes', async () => {
  const harness = createHarness();

  await harness.controller.prepareLobbySession();
  harness.formState.participantName = 'Another Human';
  await harness.controller.prepareLobbySession();

  assert.equal(harness.state.session?.id, 'session-2');
  assert.deepEqual(
    harness.postCalls.map((call) => call.url),
    [
      '/api/call/sessions',
      '/api/call/sessions/session-1/setup',
      '/api/call/sessions',
      '/api/call/sessions/session-2/setup',
    ],
  );
});

test('handlePrimaryCallAction requires a WAV production voice sample before starting', async () => {
  const harness = createHarness({ productionVoiceReady: false });

  await assert.rejects(
    () => harness.controller.handlePrimaryCallAction(),
    /Upload a WAV production voice sample before starting the call\./,
  );

  assert.equal(harness.state.activeCall, false);
  assert.equal(harness.postCalls.length, 0);
});

test('handlePrimaryCallAction rejects linked calls that already ended', async () => {
  const harness = createHarness({
    launchContext: {
      mode: 'linked-call',
      callStatus: 'ended',
    },
  });

  await assert.rejects(
    () => harness.controller.handlePrimaryCallAction(),
    /This linked call has already ended\./,
  );

  assert.equal(harness.state.activeCall, false);
  assert.equal(harness.postCalls.length, 0);
});
