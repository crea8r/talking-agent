import test from 'node:test';
import assert from 'node:assert/strict';

import { createSessionController } from './session-controller.js';

test('handlePrimaryCallAction opens the connect prompt and prepares a session', async () => {
  const statusUpdates = [];
  let posted = false;
  let dialogOpened = false;
  let promptFocused = false;

  globalThis.window = {
    setTimeout,
    clearTimeout,
    setInterval() {
      return 1;
    },
    clearInterval() {},
    requestAnimationFrame(callback) {
      callback();
    },
  };

  const state = {
    runtimeConfig: {
      codexProjectName: 'talking-agent',
    },
    room: null,
    session: null,
    sessionPollId: 0,
    sessionKey: '',
    sessionPreparing: false,
    modelLoading: false,
    processingReplies: false,
    preferences: {
      voiceName: '',
      speechRate: 1,
      speechPitch: 1,
    },
  };

  const controller = createSessionController({
    state,
    roomLayer: {
      installSdkLogging() {},
      attachRoomListeners() {},
      async disconnectRoom() {},
      async mintToken() {
        return { token: 'token' };
      },
      async connectRoom() {},
    },
    roomClass: class {},
    videoPresets: {
      h720: {
        resolution: {},
      },
    },
    logLevel: 'info',
    screenNavigator: {
      show() {},
    },
    humanVoiceLayer: {
      stopListening() {},
      destroy() {},
    },
    agentVoiceLayer: {
      destroy() {},
      getSnapshot() {
        return { speechSynthesisSupported: true };
      },
    },
    avatarSpeech: {
      stop() {},
      getSnapshot() {
        return { active: false };
      },
      async speakText() {},
    },
    avatarLayer: {
      destroy() {},
      getSnapshot() {
        return {};
      },
    },
    dom: {
      connectPromptDialog: {
        open: false,
        showModal() {
          dialogOpened = true;
          this.open = true;
        },
      },
      connectPromptBody: {
        focus() {
          promptFocused = true;
        },
        select() {},
      },
      localIdentity: { textContent: '' },
      remoteCount: { textContent: '' },
      lastAgentReply: { textContent: '' },
    },
    stageMap: new Map(),
    emoteMap: new Map(),
    selectStage() {},
    selectEmote() {},
    selectGesture() {},
    collectFormState() {
      return {
        livekitUrl: 'ws://127.0.0.1:7880',
        roomName: 'talking-agent-call',
        identity: 'human-room-host',
        participantName: 'Human Caller',
        enableCamera: true,
        enableMicrophone: true,
      };
    },
    fetchJson: async () => ({
      session: {
        id: 'session-1',
        title: 'talking-agent',
        agent: {
          label: 'Codex OpenAI',
          lastSeenAt: null,
        },
        metrics: {
          pendingTurns: 0,
          unplayedReplies: 0,
        },
        turns: [],
      },
    }),
    postJson: async () => {
      posted = true;
      return {
        session: {
          id: 'session-1',
          title: 'talking-agent',
          agent: {
            label: 'Codex OpenAI',
            lastSeenAt: null,
          },
          metrics: {
            pendingTurns: 0,
            unplayedReplies: 0,
          },
          turns: [],
        },
      };
    },
    addLog() {},
    formatError(error) {
      return error;
    },
    renderLocalStage() {},
    renderRoomSnapshot() {},
    renderBridgeSnapshot() {},
    renderTranscriptList() {},
    renderDebugSnapshot() {},
    renderAgentStatus() {},
    refreshActionButtons() {},
    updateRoomStatus(stateValue, title, detail) {
      statusUpdates.push({ stateValue, title, detail });
    },
  });

  await controller.handlePrimaryCallAction();

  assert.equal(posted, true);
  assert.equal(dialogOpened, true);
  assert.equal(promptFocused, true);
  assert.deepEqual(statusUpdates[0], {
    stateValue: 'loading',
    title: 'Agent setup',
    detail: 'Opening the bridge steps and preparing a call session for the agent.',
  });
  assert.equal(state.session?.id, 'session-1');
});

test('handlePrimaryCallAction stays safe before runtime config finishes loading', async () => {
  const statusUpdates = [];
  let posted = false;

  globalThis.window = {
    setTimeout,
    clearTimeout,
    setInterval() {
      return 1;
    },
    clearInterval() {},
    requestAnimationFrame(callback) {
      callback();
    },
  };

  const state = {
    runtimeConfig: null,
    room: null,
    session: null,
    sessionPollId: 0,
    sessionKey: '',
    sessionPreparing: false,
    modelLoading: false,
    processingReplies: false,
    preferences: {
      voiceName: '',
      speechRate: 1,
      speechPitch: 1,
    },
  };

  const logs = [];
  const controller = createSessionController({
    state,
    roomLayer: {
      installSdkLogging() {},
      attachRoomListeners() {},
      async disconnectRoom() {},
      async mintToken() {
        return { token: 'token' };
      },
      async connectRoom() {},
    },
    roomClass: class {},
    videoPresets: {
      h720: {
        resolution: {},
      },
    },
    logLevel: 'info',
    screenNavigator: {
      show() {},
    },
    humanVoiceLayer: {
      stopListening() {},
      destroy() {},
    },
    agentVoiceLayer: {
      destroy() {},
      getSnapshot() {
        return { speechSynthesisSupported: true };
      },
    },
    avatarSpeech: {
      stop() {},
      getSnapshot() {
        return { active: false };
      },
      async speakText() {},
    },
    avatarLayer: {
      destroy() {},
      getSnapshot() {
        return {};
      },
    },
    dom: {
      connectPromptDialog: {
        open: false,
        showModal() {
          this.open = true;
        },
      },
      connectPromptBody: {
        focus() {},
        select() {},
      },
      localIdentity: { textContent: '' },
      remoteCount: { textContent: '' },
      lastAgentReply: { textContent: '' },
    },
    stageMap: new Map(),
    emoteMap: new Map(),
    selectStage() {},
    selectEmote() {},
    selectGesture() {},
    collectFormState() {
      return {
        livekitUrl: 'ws://127.0.0.1:7880',
        roomName: 'talking-agent-call',
        identity: 'human-room-host',
        participantName: 'Human Caller',
        enableCamera: true,
        enableMicrophone: true,
      };
    },
    fetchJson: async () => ({ session: null }),
    postJson: async () => {
      posted = true;
      return { session: null };
    },
    addLog(level, message) {
      logs.push({ level, message });
    },
    formatError(error) {
      return error;
    },
    renderLocalStage() {},
    renderRoomSnapshot() {},
    renderBridgeSnapshot() {},
    renderTranscriptList() {},
    renderDebugSnapshot() {},
    renderAgentStatus() {},
    refreshActionButtons() {},
    updateRoomStatus(stateValue, title, detail) {
      statusUpdates.push({ stateValue, title, detail });
    },
  });

  await controller.handlePrimaryCallAction();

  assert.equal(posted, false);
  assert.deepEqual(statusUpdates.at(-1), {
    stateValue: 'loading',
    title: 'Loading project',
    detail: 'Runtime config is still loading. Try Connect Agent again in a moment.',
  });
  assert.deepEqual(logs.at(-1), {
    level: 'warn',
    message: 'Connect Agent clicked before runtime config finished loading.',
  });
});

test('handlePrimaryCallAction keeps the live room on the Call screen after connect', async () => {
  const shownScreens = [];

  globalThis.window = {
    setTimeout,
    clearTimeout,
    setInterval() {
      return 1;
    },
    clearInterval() {},
    requestAnimationFrame(callback) {
      callback();
    },
  };

  const state = {
    runtimeConfig: {
      codexProjectName: 'talking-agent',
    },
    room: null,
    session: {
      id: 'session-1',
      title: 'talking-agent',
      agent: {
        id: 'codex-openai',
        label: 'Codex OpenAI',
        lastSeenAt: new Date().toISOString(),
      },
      metrics: {
        pendingTurns: 0,
        unplayedReplies: 0,
      },
      turns: [],
    },
    sessionPollId: 0,
    sessionKey: 'session-key',
    sessionPreparing: false,
    modelLoading: false,
    processingReplies: false,
    preferences: {
      voiceName: '',
      speechRate: 1,
      speechPitch: 1,
    },
  };

  class FakeRoom {
    constructor() {
      this.state = 'connected';
      this.name = 'talking-agent-call';
      this.remoteParticipants = new Map();
      this.localParticipant = {
        identity: 'human-room-host',
        name: 'Human Caller',
      };
    }
  }

  const controller = createSessionController({
    state,
    roomLayer: {
      installSdkLogging() {},
      attachRoomListeners() {},
      async disconnectRoom() {},
      async mintToken() {
        return { token: 'token' };
      },
      async connectRoom() {},
    },
    roomClass: FakeRoom,
    videoPresets: {
      h720: {
        resolution: {},
      },
    },
    logLevel: 'info',
    screenNavigator: {
      show(screenId) {
        shownScreens.push(screenId);
      },
    },
    humanVoiceLayer: {
      stopListening() {},
      destroy() {},
    },
    agentVoiceLayer: {
      destroy() {},
      getSnapshot() {
        return { speechSynthesisSupported: true };
      },
    },
    avatarSpeech: {
      stop() {},
      getSnapshot() {
        return { active: false };
      },
      async speakText() {},
    },
    avatarLayer: {
      destroy() {},
      getSnapshot() {
        return {};
      },
    },
    dom: {
      connectPromptDialog: {
        open: false,
        showModal() {},
      },
      connectPromptBody: {
        focus() {},
        select() {},
      },
      localIdentity: { textContent: '' },
      remoteCount: { textContent: '' },
      lastAgentReply: { textContent: '' },
    },
    stageMap: new Map(),
    emoteMap: new Map(),
    selectStage() {},
    selectEmote() {},
    selectGesture() {},
    collectFormState() {
      return {
        livekitUrl: 'ws://127.0.0.1:7880',
        roomName: 'talking-agent-call',
        identity: 'human-room-host',
        participantName: 'Human Caller',
        enableCamera: true,
        enableMicrophone: true,
      };
    },
    fetchJson: async (url) => {
      if (url.startsWith('/api/probe-livekit')) {
        return {
          reachable: true,
          probeUrl: 'http://127.0.0.1:7880',
          status: 200,
          statusText: 'OK',
        };
      }

      return { session: state.session };
    },
    postJson: async () => ({ ok: true }),
    addLog() {},
    formatError(error) {
      return error;
    },
    renderLocalStage() {},
    renderRoomSnapshot() {},
    renderBridgeSnapshot() {},
    renderTranscriptList() {},
    renderDebugSnapshot() {},
    renderAgentStatus() {},
    refreshActionButtons() {},
    updateRoomStatus() {},
  });

  await controller.handlePrimaryCallAction();

  assert.deepEqual(shownScreens, ['setup']);
});

test('handlePrimaryCallAction restores the Call lobby when room connect fails', async () => {
  const roomSnapshots = [];

  globalThis.window = {
    setTimeout,
    clearTimeout,
    setInterval() {
      return 1;
    },
    clearInterval() {},
    requestAnimationFrame(callback) {
      callback();
    },
  };

  const state = {
    runtimeConfig: {
      codexProjectName: 'talking-agent',
    },
    room: null,
    session: {
      id: 'session-1',
      title: 'talking-agent',
      agent: {
        id: 'codex-openai',
        label: 'Codex OpenAI',
        lastSeenAt: new Date().toISOString(),
      },
      metrics: {
        pendingTurns: 0,
        unplayedReplies: 0,
      },
      turns: [],
    },
    sessionPollId: 0,
    sessionKey: 'session-key',
    sessionPreparing: false,
    modelLoading: false,
    processingReplies: false,
    preferences: {
      voiceName: '',
      speechRate: 1,
      speechPitch: 1,
    },
  };

  class FakeRoom {
    constructor() {
      this.state = 'connecting';
      this.name = 'talking-agent-call';
      this.remoteParticipants = new Map();
      this.localParticipant = {
        identity: 'human-room-host',
        name: 'Human Caller',
      };
    }
  }

  const controller = createSessionController({
    state,
    roomLayer: {
      installSdkLogging() {},
      attachRoomListeners() {},
      async disconnectRoom() {},
      async mintToken() {
        return { token: 'token' };
      },
      async connectRoom() {
        throw new Error('connect failed');
      },
    },
    roomClass: FakeRoom,
    videoPresets: {
      h720: {
        resolution: {},
      },
    },
    logLevel: 'info',
    screenNavigator: {
      show() {},
    },
    humanVoiceLayer: {
      stopListening() {},
      destroy() {},
    },
    agentVoiceLayer: {
      destroy() {},
      getSnapshot() {
        return { speechSynthesisSupported: true };
      },
    },
    avatarSpeech: {
      stop() {},
      getSnapshot() {
        return { active: false };
      },
      async speakText() {},
    },
    avatarLayer: {
      destroy() {},
      getSnapshot() {
        return {};
      },
    },
    dom: {
      connectPromptDialog: {
        open: false,
        showModal() {},
      },
      connectPromptBody: {
        focus() {},
        select() {},
      },
      localIdentity: { textContent: '' },
      remoteCount: { textContent: '' },
      lastAgentReply: { textContent: '' },
    },
    stageMap: new Map(),
    emoteMap: new Map(),
    selectStage() {},
    selectEmote() {},
    selectGesture() {},
    collectFormState() {
      return {
        livekitUrl: 'ws://127.0.0.1:7880',
        roomName: 'talking-agent-call',
        identity: 'human-room-host',
        participantName: 'Human Caller',
        enableCamera: true,
        enableMicrophone: true,
      };
    },
    fetchJson: async (url) => {
      if (url.startsWith('/api/probe-livekit')) {
        return {
          reachable: true,
          probeUrl: 'http://127.0.0.1:7880',
          status: 200,
          statusText: 'OK',
        };
      }

      return { session: state.session };
    },
    postJson: async () => ({ ok: true }),
    addLog() {},
    formatError(error) {
      return error;
    },
    renderLocalStage() {},
    renderRoomSnapshot() {
      roomSnapshots.push(Boolean(state.room));
    },
    renderBridgeSnapshot() {},
    renderTranscriptList() {},
    renderDebugSnapshot() {},
    renderAgentStatus() {},
    refreshActionButtons() {},
    updateRoomStatus() {},
  });

  await assert.rejects(() => controller.handlePrimaryCallAction(), /connect failed/);

  assert.equal(state.room, null);
  assert.equal(roomSnapshots.at(-1), false);
});

test('prepareLobbySession starts a local freshness ticker alongside bridge polling', async () => {
  const intervalCallbacks = [];
  let roomRenderCount = 0;
  let bridgeRenderCount = 0;
  let agentRenderCount = 0;

  globalThis.window = {
    setTimeout,
    clearTimeout,
    setInterval(callback) {
      intervalCallbacks.push(callback);
      return intervalCallbacks.length;
    },
    clearInterval() {},
    requestAnimationFrame(callback) {
      callback();
    },
  };

  const state = {
    runtimeConfig: {
      codexProjectName: 'talking-agent',
    },
    room: null,
    session: null,
    sessionPollId: 0,
    sessionKey: '',
    sessionPreparing: false,
    modelLoading: false,
    processingReplies: false,
    preferences: {
      voiceName: '',
      speechRate: 1,
      speechPitch: 1,
    },
  };

  const controller = createSessionController({
    state,
    roomLayer: {
      installSdkLogging() {},
      attachRoomListeners() {},
      async disconnectRoom() {},
      async mintToken() {
        return { token: 'token' };
      },
      async connectRoom() {},
    },
    roomClass: class {},
    videoPresets: {
      h720: {
        resolution: {},
      },
    },
    logLevel: 'info',
    screenNavigator: {
      show() {},
    },
    humanVoiceLayer: {
      stopListening() {},
      destroy() {},
    },
    agentVoiceLayer: {
      destroy() {},
      getSnapshot() {
        return { speechSynthesisSupported: true };
      },
    },
    avatarSpeech: {
      stop() {},
      getSnapshot() {
        return { active: false };
      },
      async speakText() {},
    },
    avatarLayer: {
      destroy() {},
      getSnapshot() {
        return {};
      },
    },
    dom: {
      connectPromptDialog: null,
      connectPromptBody: null,
      localIdentity: { textContent: '' },
      remoteCount: { textContent: '' },
      lastAgentReply: { textContent: '' },
    },
    stageMap: new Map(),
    emoteMap: new Map(),
    selectStage() {},
    selectEmote() {},
    selectGesture() {},
    collectFormState() {
      return {
        livekitUrl: 'ws://127.0.0.1:7880',
        roomName: 'talking-agent-call',
        identity: 'human-room-host',
        participantName: 'Human Caller',
        enableCamera: true,
        enableMicrophone: true,
      };
    },
    fetchJson: async () => ({
      session: {
        id: 'session-1',
        title: 'talking-agent',
        agent: {
          label: 'Codex OpenAI',
          lastSeenAt: null,
        },
        metrics: {
          pendingTurns: 0,
          unplayedReplies: 0,
        },
        turns: [],
      },
    }),
    postJson: async () => ({
      session: {
        id: 'session-1',
        title: 'talking-agent',
        agent: {
          label: 'Codex OpenAI',
          lastSeenAt: null,
        },
        metrics: {
          pendingTurns: 0,
          unplayedReplies: 0,
        },
        turns: [],
      },
    }),
    addLog() {},
    formatError(error) {
      return error;
    },
    renderLocalStage() {},
    renderRoomSnapshot() {
      roomRenderCount += 1;
    },
    renderBridgeSnapshot() {
      bridgeRenderCount += 1;
    },
    renderTranscriptList() {},
    renderDebugSnapshot() {},
    renderAgentStatus() {
      agentRenderCount += 1;
    },
    refreshActionButtons() {},
    updateRoomStatus() {},
  });

  await controller.prepareLobbySession({ force: true });

  assert.equal(intervalCallbacks.length, 2);

  intervalCallbacks[0]();
  intervalCallbacks[1]();

  assert.ok(roomRenderCount > 0);
  assert.ok(bridgeRenderCount > 0);
  assert.ok(agentRenderCount > 0);
});

test('agent reply scene changes wait for playback start before switching the avatar mood', async () => {
  const intervalCallbacks = [];
  const avatarSelections = [];
  const pollResponse = {
    session: {
      id: 'session-1',
      title: 'talking-agent',
      agent: {
        id: 'codex-openai',
        label: 'Codex OpenAI',
        lastSeenAt: '2026-05-01T00:00:00.000Z',
      },
      avatar: {
        activeModelId: 'bhf-1-2',
      },
      metrics: {
        pendingTurns: 0,
        unplayedReplies: 1,
      },
      turns: [
        {
          id: 'turn-1',
          source: 'voice',
          transcript: 'say hello',
          createdAt: '2026-05-01T00:00:00.000Z',
          status: 'replied',
          human: {
            identity: 'human-room-host',
            name: 'Human Caller',
          },
          agentReply: {
            id: 'reply-1',
            text: 'Hello there.',
            createdAt: '2026-05-01T00:00:01.000Z',
            playedAt: null,
            agentId: 'codex-openai',
            agentLabel: 'Codex OpenAI',
            emoteId: 'warm',
            gestureId: 'explain',
            stageId: 'studio',
            mood: 'happy',
          },
        },
      ],
    },
  };
  let speechOptions = null;
  let resolveSpeech = null;

  globalThis.window = {
    setTimeout,
    clearTimeout,
    setInterval(callback) {
      intervalCallbacks.push(callback);
      return intervalCallbacks.length;
    },
    clearInterval() {},
    requestAnimationFrame(callback) {
      callback();
    },
  };

  const state = {
    runtimeConfig: {
      codexProjectName: 'talking-agent',
    },
    room: null,
    session: null,
    sessionPollId: 0,
    sessionKey: '',
    sessionPreparing: false,
    modelLoading: false,
    processingReplies: false,
    preferences: {
      voiceName: '',
      speechRate: 1,
      speechPitch: 1,
      bundledModelId: 'bhf-1-2',
    },
  };

  const controller = createSessionController({
    state,
    roomLayer: {
      installSdkLogging() {},
      attachRoomListeners() {},
      async disconnectRoom() {},
      async mintToken() {
        return { token: 'token' };
      },
      async connectRoom() {},
    },
    roomClass: class {},
    videoPresets: {
      h720: {
        resolution: {},
      },
    },
    logLevel: 'info',
    screenNavigator: {
      show() {},
    },
    humanVoiceLayer: {
      stopListening() {},
      destroy() {},
    },
    agentVoiceLayer: {
      destroy() {},
      getSnapshot() {
        return { speechSynthesisSupported: true };
      },
    },
    avatarSpeech: {
      stop() {},
      getSnapshot() {
        return { active: false };
      },
      async speakText(text, options) {
        speechOptions = options;
        await new Promise((resolve) => {
          resolveSpeech = resolve;
        });
        return { text };
      },
    },
    avatarLayer: {
      destroy() {},
      getSnapshot() {
        return {};
      },
    },
    dom: {
      connectPromptDialog: {
        open: false,
        showModal() {},
      },
      connectPromptBody: {
        focus() {},
        select() {},
      },
      localIdentity: { textContent: '' },
      remoteCount: { textContent: '' },
      lastAgentReply: { textContent: '' },
    },
    stageMap: new Map([['studio', { id: 'studio' }]]),
    emoteMap: new Map([['warm', { id: 'warm' }]]),
    selectStage(stageId) {
      avatarSelections.push({ type: 'stage', id: stageId });
    },
    selectEmote(emoteId) {
      avatarSelections.push({ type: 'emote', id: emoteId });
    },
    selectGesture(gestureId) {
      avatarSelections.push({ type: 'gesture', id: gestureId });
    },
    collectFormState() {
      return {
        livekitUrl: 'ws://127.0.0.1:7880',
        roomName: 'talking-agent-call',
        identity: 'human-room-host',
        participantName: 'Human Caller',
        enableCamera: true,
        enableMicrophone: true,
      };
    },
    fetchJson: async () => pollResponse,
    postJson: async (url) => {
      if (url === '/api/bridge/sessions') {
        return {
          session: {
            id: 'session-1',
            title: 'talking-agent',
            agent: {
              id: 'codex-openai',
              label: 'Codex OpenAI',
              lastSeenAt: '2026-05-01T00:00:00.000Z',
            },
            metrics: {
              pendingTurns: 0,
              unplayedReplies: 0,
            },
            turns: [],
          },
        };
      }

      return {
        session: {
          ...pollResponse.session,
          turns: pollResponse.session.turns.map((turn) => ({
            ...turn,
            agentReply: {
              ...turn.agentReply,
              playedAt: '2026-05-01T00:00:02.000Z',
            },
          })),
        },
      };
    },
    addLog() {},
    formatError(error) {
      return error;
    },
    renderLocalStage() {},
    renderRoomSnapshot() {},
    renderBridgeSnapshot() {},
    renderTranscriptList() {},
    renderDebugSnapshot() {},
    renderAgentStatus() {},
    refreshActionButtons() {},
    updateRoomStatus() {},
  });

  await controller.prepareLobbySession({ force: true });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(typeof speechOptions?.onPlaybackStart, 'function');
  assert.equal(speechOptions?.characterId, 'bhf-1-2');
  assert.equal(speechOptions?.mood, 'happy');
  assert.deepEqual(avatarSelections, []);

  speechOptions.onPlaybackStart();

  assert.deepEqual(avatarSelections, [
    { type: 'stage', id: 'studio' },
    { type: 'emote', id: 'warm' },
    { type: 'gesture', id: 'explain' },
  ]);

  resolveSpeech();
  await new Promise((resolve) => setTimeout(resolve, 0));
});

test('syncInterimTranscript starts one utterance and posts append-style deltas', async () => {
  const posts = [];

  globalThis.window = {
    setTimeout,
    clearTimeout,
    setInterval() {
      return 1;
    },
    clearInterval() {},
    requestAnimationFrame(callback) {
      callback();
    },
  };

  const state = {
    runtimeConfig: null,
    room: null,
    session: {
      id: 'session-1',
      title: 'talking-agent',
      agent: {
        label: 'Codex OpenAI',
        lastSeenAt: null,
      },
      metrics: {
        pendingTurns: 0,
        unplayedReplies: 0,
      },
      turns: [],
    },
    sessionPollId: 0,
    sessionKey: '',
    sessionPreparing: false,
    modelLoading: false,
    processingReplies: false,
    activeUtteranceId: null,
    activeUtteranceText: '',
    preferences: {
      voiceName: '',
      speechRate: 1,
      speechPitch: 1,
    },
  };

  const controller = createSessionController({
    state,
    roomLayer: {
      installSdkLogging() {},
      attachRoomListeners() {},
      async disconnectRoom() {},
      async mintToken() {
        return { token: 'token' };
      },
      async connectRoom() {},
    },
    roomClass: class {},
    videoPresets: {
      h720: {
        resolution: {},
      },
    },
    logLevel: 'info',
    screenNavigator: {
      show() {},
    },
    humanVoiceLayer: {
      stopListening() {},
      destroy() {},
    },
    agentVoiceLayer: {
      destroy() {},
      getSnapshot() {
        return { speechSynthesisSupported: true };
      },
    },
    avatarSpeech: {
      stop() {},
      getSnapshot() {
        return { active: false };
      },
      async speakText() {},
    },
    avatarLayer: {
      destroy() {},
      getSnapshot() {
        return {};
      },
    },
    dom: {
      connectPromptDialog: null,
      connectPromptBody: null,
      localIdentity: { textContent: '' },
      remoteCount: { textContent: '' },
      lastAgentReply: { textContent: '' },
    },
    stageMap: new Map(),
    emoteMap: new Map(),
    selectStage() {},
    selectEmote() {},
    selectGesture() {},
    collectFormState() {
      return {
        livekitUrl: 'ws://127.0.0.1:7880',
        roomName: 'talking-agent-call',
        identity: 'human-room-host',
        participantName: 'Human Caller',
        enableCamera: true,
        enableMicrophone: true,
        bundledModelId: 'bhf-1-2',
      };
    },
    fetchJson: async () => ({ session: state.session }),
    postJson: async (url, body) => {
      posts.push({ url, body });
      return { session: state.session };
    },
    addLog() {},
    formatError(error) {
      return error;
    },
    renderLocalStage() {},
    renderRoomSnapshot() {},
    renderBridgeSnapshot() {},
    renderTranscriptList() {},
    renderDebugSnapshot() {},
    renderAgentStatus() {},
    refreshActionButtons() {},
    updateRoomStatus() {},
  });

  await controller.syncInterimTranscript('hello');
  await controller.syncInterimTranscript('hello there');

  assert.equal(posts[0].url, '/api/bridge/sessions/session-1/utterances/start');
  assert.equal(posts[1].url, '/api/bridge/sessions/session-1/utterances/partial');
  assert.equal(posts[1].body.delta, 'hello');
  assert.equal(posts[2].url, '/api/bridge/sessions/session-1/utterances/partial');
  assert.equal(posts[2].body.delta, ' there');
});

test('pollSession consumes pending actions through the new action endpoints', async () => {
  const posts = [];
  const avatarSelections = [];
  const spoken = [];

  globalThis.window = {
    setTimeout,
    clearTimeout,
    setInterval() {
      return 1;
    },
    clearInterval() {},
    requestAnimationFrame(callback) {
      callback();
    },
  };

  const state = {
    runtimeConfig: null,
    room: null,
    session: {
      id: 'session-1',
      title: 'talking-agent',
      agent: {
        label: 'Codex OpenAI',
        lastSeenAt: null,
      },
      metrics: {
        pendingTurns: 0,
        unplayedReplies: 0,
      },
      turns: [],
    },
    sessionPollId: 0,
    sessionKey: '',
    sessionPreparing: false,
    modelLoading: false,
    processingReplies: false,
    activeUtteranceId: null,
    activeUtteranceText: '',
    preferences: {
      voiceName: '',
      speechRate: 1,
      speechPitch: 1,
    },
  };

  const controller = createSessionController({
    state,
    roomLayer: {
      installSdkLogging() {},
      attachRoomListeners() {},
      async disconnectRoom() {},
      async mintToken() {
        return { token: 'token' };
      },
      async connectRoom() {},
    },
    roomClass: class {},
    videoPresets: {
      h720: {
        resolution: {},
      },
    },
    logLevel: 'info',
    screenNavigator: {
      show() {},
    },
    humanVoiceLayer: {
      stopListening() {},
      destroy() {},
    },
    agentVoiceLayer: {
      destroy() {},
      getSnapshot() {
        return { speechSynthesisSupported: true };
      },
    },
    avatarSpeech: {
      stop() {},
      getSnapshot() {
        return { active: false };
      },
      async speakText(text, options) {
        spoken.push({ text, options });
      },
    },
    avatarLayer: {
      destroy() {},
      getSnapshot() {
        return {};
      },
    },
    dom: {
      connectPromptDialog: null,
      connectPromptBody: null,
      localIdentity: { textContent: '' },
      remoteCount: { textContent: '' },
      lastAgentReply: { textContent: '' },
    },
    stageMap: new Map([['studio', { id: 'studio' }]]),
    emoteMap: new Map([['focused', { id: 'focused' }]]),
    selectStage(id) {
      avatarSelections.push(`stage:${id}`);
    },
    selectEmote(id) {
      avatarSelections.push(`emote:${id}`);
    },
    selectGesture(id) {
      avatarSelections.push(`gesture:${id}`);
    },
    collectFormState() {
      return {
        livekitUrl: 'ws://127.0.0.1:7880',
        roomName: 'talking-agent-call',
        identity: 'human-room-host',
        participantName: 'Human Caller',
        enableCamera: true,
        enableMicrophone: true,
        bundledModelId: 'bhf-1-2',
      };
    },
    fetchJson: async () => ({
      session: state.session,
      pendingActions: [
        {
          actionId: 'a1',
          type: 'anim',
          stageId: 'studio',
          emoteId: 'focused',
          gestureId: 'Thinking',
        },
        {
          actionId: 'a2',
          type: 'speech',
          text: 'Working on it.',
          mood: 'focused',
        },
      ],
    }),
    postJson: async (url) => {
      posts.push(url);
      return { session: state.session };
    },
    addLog() {},
    formatError(error) {
      return error;
    },
    renderLocalStage() {},
    renderRoomSnapshot() {},
    renderBridgeSnapshot() {},
    renderTranscriptList() {},
    renderDebugSnapshot() {},
    renderAgentStatus() {},
    refreshActionButtons() {},
    updateRoomStatus() {},
  });

  await controller.pollSession();

  assert.deepEqual(avatarSelections, ['stage:studio', 'emote:focused', 'gesture:Thinking']);
  assert.equal(spoken[0].options.characterId, 'bhf-1-2');
  assert.equal(spoken[0].options.mood, 'focused');
  assert.equal(posts[0], '/api/bridge/sessions/session-1/actions/a1/completed');
  assert.equal(posts[1], '/api/bridge/sessions/session-1/actions/a2/started');
  assert.equal(posts[2], '/api/bridge/sessions/session-1/actions/a2/finished');
});
