import test from 'node:test';
import assert from 'node:assert/strict';

import { createSessionController } from './session-controller.js';

function createSessionPayload({
  id = 'session-1',
  title = 'talking-agent',
  state = 'idle',
  turns = [],
  standby = {
    status: 'idle',
    requestId: '',
    preparedAt: '',
    updatedAt: '',
    error: '',
  },
} = {}) {
  return {
    session: {
      id,
      title,
      state,
      standby,
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
  runtimeConfig = {
    codexProjectName: 'talking-agent',
    manualMode: {
      sessionRoute: '/api/manual-session',
    },
  },
  launchContext = {
    mode: 'manual',
    workspaceRoot: '/tmp/manual-workspace',
    workspaceKey: 'tmp-manual-workspace',
  },
  productionVoiceReady = true,
  productionVoiceBackendRunning = true,
  codexBackendRunning = true,
  fetchJsonOverride = null,
  postJsonOverride = null,
} = {}) {
  const postCalls = [];
  const roomStatuses = [];
  let nextSessionNumber = 1;
  function takeNextSessionId() {
    return `session-${nextSessionNumber++}`;
  }

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
    loadingUi: {
      boot: {
        active: false,
        phase: '',
        detail: '',
      },
      call: {
        active: false,
        phase: '',
        detail: '',
      },
    },
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
    fetchJson: async (url) => {
      if (typeof fetchJsonOverride === 'function') {
        const overridePayload = await fetchJsonOverride(url, {
          state,
          formState,
          createSessionPayload,
        });
        if (overridePayload !== undefined) {
          return overridePayload;
        }
      }
      if (url === '/api/manual-session') {
        return createSessionPayload({
          id: 'manual-session-1',
          title: 'manual-workspace',
          standby: {
            status: 'ready',
            requestId: 'warmup-1',
            preparedAt: '2026-05-14T00:00:00.000Z',
            updatedAt: '2026-05-14T00:00:00.000Z',
            error: '',
          },
        });
      }
      if (url === `/api/call/sessions/${encodeURIComponent(state.session?.id || '')}`) {
        return createSessionPayload({
          id: state.session?.id || 'session-unknown',
          title: state.session?.title || 'talking-agent',
          state: state.session?.state || 'idle',
          standby: state.session?.standby,
          turns: state.session?.turns || [],
        });
      }
      return {};
    },
    postJson: async (url, body) => {
      postCalls.push({ url, body });
      if (typeof postJsonOverride === 'function') {
        const overridePayload = await postJsonOverride(url, body, {
          state,
          formState,
          createSessionPayload,
          takeNextSessionId,
        });
        if (overridePayload !== undefined) {
          return overridePayload;
        }
      }
      if (url === '/api/call/sessions') {
        return createSessionPayload({
          id: takeNextSessionId(),
          title: body?.title || 'talking-agent',
        });
      }
      if (url.endsWith('/standby')) {
        return createSessionPayload({
          id: state.session?.id || 'session-unknown',
          title: state.session?.title || 'talking-agent',
          state: state.session?.state || 'idle',
          standby: {
            status: 'ready',
            requestId: 'warmup-1',
            preparedAt: '2026-05-14T00:00:00.000Z',
            updatedAt: '2026-05-14T00:00:00.000Z',
            error: '',
          },
          turns: state.session?.turns || [],
        });
      }
      if (url.endsWith('/discard')) {
        return {
          ok: true,
          sessionId: `${state.session?.id || ''}`.trim(),
        };
      }
      return createSessionPayload({
        id: state.session?.id || 'session-unknown',
        title: state.session?.title || 'talking-agent',
        state: state.session?.state || 'idle',
        standby: state.session?.standby,
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
    updateRoomStatus(stateValue, title, detail) {
      roomStatuses.push({ stateValue, title, detail });
    },
  });

  return {
    controller,
    state,
    formState,
    postCalls,
    roomStatuses,
  };
}

test('prepareLobbySession attaches and reuses the server-provided manual standby session', async () => {
  const harness = createHarness();

  await harness.controller.prepareLobbySession();

  assert.equal(harness.state.session?.id, 'manual-session-1');
  assert.equal(harness.state.sessionPreparing, false);
  assert.deepEqual(
    harness.postCalls.map((call) => call.url),
    [],
  );

  await harness.controller.prepareLobbySession();

  assert.deepEqual(
    harness.postCalls.map((call) => call.url),
    [],
  );
});

test('prepareLobbySession in linked-call mode still creates a fresh direct session', async () => {
  const harness = createHarness({
    launchContext: {
      mode: 'linked-call',
      launchId: 'launch-1',
      workspaceRoot: '/tmp/workspace-alpha',
      workspaceKey: 'tmp-workspace-alpha',
    },
  });

  await harness.controller.prepareLobbySession();

  assert.equal(harness.state.session?.id, 'session-1');
  assert.deepEqual(
    harness.postCalls.map((call) => call.url),
    [
      '/api/call/sessions',
      '/api/call/sessions/session-1/setup',
    ],
  );
});

test('handlePrimaryCallAction reuses the prepared standby session instead of forcing a fresh one', async () => {
  const harness = createHarness();

  await harness.controller.prepareLobbySession();
  await harness.controller.handlePrimaryCallAction();

  assert.equal(
    harness.postCalls.filter((call) => call.url === '/api/call/sessions').length,
    0,
  );
  assert.deepEqual(
    harness.postCalls.find((call) => call.url.endsWith('/state'))?.body,
    { state: 'live', skipWarmup: true },
  );
  harness.controller.destroy();
});

test('handlePrimaryCallAction reports explicit remote startup phases before the startup greeting', async () => {
  const harness = createHarness();

  await harness.controller.handlePrimaryCallAction();

  assert.equal(
    harness.roomStatuses.some((entry) => entry.title === 'Attaching standby session'),
    true,
  );
  assert.equal(
    harness.roomStatuses.some((entry) => entry.title === 'Starting call runtime'),
    true,
  );
  assert.equal(
    harness.roomStatuses.some((entry) => entry.title === 'Waiting for greeting'),
    true,
  );
  harness.controller.destroy();
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

test('finalizeUserUtterance refreshes the session and surfaces the latest persisted turn error when Codex fails', async () => {
  const harness = createHarness({
    fetchJsonOverride(url, { state: currentState }) {
      if (url === `/api/call/sessions/${encodeURIComponent(currentState.session?.id || '')}`) {
        return createSessionPayload({
          id: currentState.session?.id || 'session-1',
          title: currentState.session?.title || 'talking-agent',
          state: 'live',
          turns: [
            {
              id: 'turn-1',
              transcript: 'Check my calendar',
              status: 'error',
              errorText: 'Google Calendar permission is required for this request.',
            },
          ],
        });
      }
      return undefined;
    },
    postJsonOverride(url) {
      if (url.endsWith('/turns')) {
        throw new Error('Unable to process the human turn.');
      }
      return undefined;
    },
  });

  harness.state.session = createSessionPayload({
    id: 'session-1',
    title: 'talking-agent',
    state: 'live',
  }).session;
  harness.state.activeCall = true;

  await assert.rejects(
    () => harness.controller.finalizeUserUtterance('Check my calendar', 'typed'),
    /Unable to process the human turn\./,
  );

  assert.equal(
    harness.state.subtitles.agent.text,
    'Google Calendar permission is required for this request.',
  );
  assert.equal(harness.state.subtitles.agent.mode, 'error');
});
