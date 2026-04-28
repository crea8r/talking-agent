import {
  LogLevel,
  Room,
  RoomEvent,
  Track,
  VideoPresets,
  setLogExtension,
} from '/vendor/livekit-client.mjs';
import { createRoomLayerClient } from '/vendor/room-layer-client.mjs';
import { createVoiceLayer } from '/vendor/voice-layer-browser.js';
import { createAvatarSpeechController } from '/vendor/avatar-speech-browser.js';
import {
  DEFAULT_MODEL,
  EMOTES,
  GESTURES,
  STAGES,
  createAvatarLayer,
} from '/vendor/avatar-layer-browser.js';

const STORAGE_KEY = 'one-to-one-agent-room.state';
const roomLayer = createRoomLayerClient({
  sdk: {
    LogLevel,
    Room,
    RoomEvent,
    setLogExtension,
  },
});

const dom = {
  livekitUrl: document.querySelector('#livekit-url'),
  roomName: document.querySelector('#room-name'),
  identity: document.querySelector('#identity'),
  participantName: document.querySelector('#participant-name'),
  enableCamera: document.querySelector('#enable-camera'),
  enableMicrophone: document.querySelector('#enable-microphone'),
  joinCall: document.querySelector('#join-call'),
  disconnectCall: document.querySelector('#disconnect-call'),
  copyMcpCommand: document.querySelector('#copy-mcp-command'),
  runDemoReply: document.querySelector('#run-demo-reply'),
  mcpCommand: document.querySelector('#mcp-command'),
  stateFile: document.querySelector('#state-file'),
  roomStatus: document.querySelector('#room-status'),
  roomDetail: document.querySelector('#room-detail'),
  bridgeStatus: document.querySelector('#bridge-status'),
  bridgeDetail: document.querySelector('#bridge-detail'),
  agentStatus: document.querySelector('#agent-status'),
  agentDetail: document.querySelector('#agent-detail'),
  sessionId: document.querySelector('#session-id'),
  pendingCount: document.querySelector('#pending-count'),
  localIdentity: document.querySelector('#local-identity'),
  remoteCount: document.querySelector('#remote-count'),
  localStage: document.querySelector('#local-stage'),
  humanLocale: document.querySelector('#human-locale'),
  humanStatus: document.querySelector('#human-status'),
  humanTranscript: document.querySelector('#human-transcript'),
  startListening: document.querySelector('#start-listening'),
  stopListening: document.querySelector('#stop-listening'),
  typedInput: document.querySelector('#typed-input'),
  sendTyped: document.querySelector('#send-typed'),
  clearTyped: document.querySelector('#clear-typed'),
  stageShell: document.querySelector('#stage-shell'),
  agentCanvas: document.querySelector('#agent-canvas'),
  stageOptions: document.querySelector('#stage-options'),
  emoteOptions: document.querySelector('#emote-options'),
  gestureOptions: document.querySelector('#gesture-options'),
  activeAvatar: document.querySelector('#active-avatar'),
  activeEmote: document.querySelector('#active-emote'),
  activeGesture: document.querySelector('#active-gesture'),
  activeMouth: document.querySelector('#active-mouth'),
  lookTarget: document.querySelector('#look-target'),
  sceneNote: document.querySelector('#scene-note'),
  voiceSelect: document.querySelector('#voice-select'),
  speechRate: document.querySelector('#speech-rate'),
  speechRateValue: document.querySelector('#speech-rate-value'),
  speechPitch: document.querySelector('#speech-pitch'),
  speechPitchValue: document.querySelector('#speech-pitch-value'),
  lastAgentReply: document.querySelector('#last-agent-reply'),
  transcriptList: document.querySelector('#transcript-list'),
  logList: document.querySelector('#log-list'),
  debugSnapshot: document.querySelector('#debug-snapshot'),
};

const storedState = readStoredState();
const stageMap = new Map(STAGES.map((stage) => [stage.id, stage]));
const emoteMap = new Map(EMOTES.map((emote) => [emote.id, emote]));
const gestureMap = new Map(GESTURES.map((gesture) => [gesture.id, gesture]));
const earlyBootIssues = [];

const state = {
  runtimeConfig: null,
  room: null,
  session: null,
  sessionPollId: 0,
  logs: [],
  localVideoElement: null,
  transcriptPreview: 'none',
  processingReplies: false,
  modelLoading: false,
  avatarSpeechSnapshot: null,
  humanVoiceSnapshot: null,
  agentVoiceSnapshot: null,
  voiceOptions: [],
  preferences: {
    livekitUrl: storedState.livekitUrl || '',
    roomName: storedState.roomName || '',
    identity: storedState.identity || '',
    participantName: storedState.participantName || '',
    enableCamera: Boolean(storedState.enableCamera),
    enableMicrophone: Boolean(storedState.enableMicrophone),
    humanLocale: storedState.humanLocale || 'en-US',
    voiceName: storedState.voiceName || '',
    speechRate: clampNumber(storedState.speechRate, 0.75, 1.35, 1),
    speechPitch: clampNumber(storedState.speechPitch, 0.75, 1.4, 1),
    stageId: stageMap.has(storedState.stageId) ? storedState.stageId : STAGES[0].id,
    emoteId: emoteMap.has(storedState.emoteId) ? storedState.emoteId : EMOTES[0].id,
    gestureId: gestureMap.has(storedState.gestureId) ? storedState.gestureId : GESTURES[0].id,
  },
};

const avatarLayer = createSafeAvatarLayer();

const agentVoiceLayer = createVoiceLayer({
  locale: 'en-US',
  autoRestart: false,
  speakReplies: true,
  preferredVoiceName: state.preferences.voiceName,
  speechRate: state.preferences.speechRate,
  speechPitch: state.preferences.speechPitch,
  getReply: async (transcript) => transcript,
});

const avatarSpeech = createAvatarSpeechController({
  avatarLayer,
  voiceLayer: agentVoiceLayer,
  onLog(level, message, details) {
    addLog(level, `[agent] ${message}`, details);
  },
  onStateChange(snapshot) {
    state.avatarSpeechSnapshot = snapshot;
    renderAgentStatus();
    syncAvatarSnapshot();
  },
});

const humanVoiceLayer = createVoiceLayer({
  locale: state.preferences.humanLocale,
  autoRestart: true,
  speakReplies: false,
  getReply: async (transcript) => {
    await enqueueHumanTurn(transcript, 'voice');
    return 'Queued for Codex agent.';
  },
});

humanVoiceLayer.setHandlers({
  onStateChange(snapshot) {
    state.humanVoiceSnapshot = snapshot;
    renderHumanStatus();
    refreshActionButtons();
    renderDebugSnapshot();
  },
  onTranscript({ text }) {
    state.transcriptPreview = text || 'none';
    dom.humanTranscript.textContent = state.transcriptPreview;
  },
  onLog(entry) {
    addLog(entry.level, `[human] ${entry.message}`, entry.details);
  },
});

agentVoiceLayer.setHandlers({
  onStateChange(snapshot) {
    state.agentVoiceSnapshot = snapshot;
    renderAgentStatus();
    renderDebugSnapshot();
  },
  onVoices(voices) {
    state.voiceOptions = voices;
    renderVoiceOptions();
  },
  onLog(entry) {
    addLog(entry.level, `[voice] ${entry.message}`, entry.details);
  },
});

initialize();

function initialize() {
  flushEarlyBootIssues();
  hydrateInputs();
  updateRateLabels();
  renderChoiceButtons(dom.stageOptions, STAGES, state.preferences.stageId, selectStage);
  renderChoiceButtons(dom.emoteOptions, EMOTES, state.preferences.emoteId, selectEmote);
  renderChoiceButtons(dom.gestureOptions, GESTURES, state.preferences.gestureId, selectGesture);
  refreshSceneNote();
  syncAvatarSnapshot();
  renderVoiceOptions();
  renderHumanStatus();
  renderAgentStatus();
  bindEvents();
  installSdkLogging();
  addLog('info', 'App booting.');
  syncAgentVoiceConfig();
  void boot();
}

function createSafeAvatarLayer() {
  try {
    return createAvatarLayer({
      canvas: dom.agentCanvas,
      stageShell: dom.stageShell,
      initialStageId: state.preferences.stageId,
      initialEmoteId: state.preferences.emoteId,
      initialGestureId: state.preferences.gestureId,
      onLog(level, message, details) {
        addLog(level, `[avatar] ${message}`, details);
      },
      onLookTargetChange(label) {
        dom.lookTarget.textContent = label;
      },
    });
  } catch (error) {
    earlyBootIssues.push({
      scope: 'avatar',
      error: formatError(error),
    });

    return createFallbackAvatarLayer(error);
  }
}

function createFallbackAvatarLayer(error) {
  const fallbackState = {
    ready: false,
    loading: false,
    modelLabel: 'Avatar unavailable',
    stageId: state.preferences.stageId,
    emoteId: state.preferences.emoteId,
    gestureId: state.preferences.gestureId,
    mouthCue: 'rest',
    speaking: false,
    energy: 1,
    lookTargetLabel: 'center',
    error: error instanceof Error ? error.message : 'Avatar renderer failed to start.',
  };

  return {
    getSnapshot() {
      return { ...fallbackState };
    },
    async loadModel() {
      throw new Error(fallbackState.error);
    },
    setStage(stageId) {
      fallbackState.stageId = stageId;
      return this.getSnapshot();
    },
    setEmote(emoteId) {
      fallbackState.emoteId = emoteId;
      return this.getSnapshot();
    },
    setGesture(gestureId) {
      fallbackState.gestureId = gestureId;
      return this.getSnapshot();
    },
    setMouthCue(mouthCue) {
      fallbackState.mouthCue = mouthCue;
      return this.getSnapshot();
    },
    setSpeaking(active) {
      fallbackState.speaking = Boolean(active);
      return this.getSnapshot();
    },
    destroy() {},
  };
}

function flushEarlyBootIssues() {
  if (!earlyBootIssues.length) {
    return;
  }

  earlyBootIssues.forEach((issue) => {
    addLog('error', `${issue.scope} bootstrap failed.`, issue.error);
  });

  dom.sceneNote.textContent =
    'Avatar renderer failed to initialize in this browser. The room and bridge controls still work.';
  dom.activeAvatar.textContent = 'Avatar unavailable';
}

async function boot() {
  updateRoomStatus('loading', 'Loading runtime config…', 'Preparing the room and bridge.');
  dom.localStage.innerHTML = '<div class="empty-state">Loading runtime config…</div>';

  try {
    await fetchRuntimeConfig();
    ensureDefaults();
    persistState();
    await loadModel();
    renderRoomSnapshot();
    renderBridgeSnapshot();
    refreshActionButtons();
    renderDebugSnapshot();
    addLog('info', 'Runtime ready.', {
      appName: state.runtimeConfig.appName,
      appMode: state.runtimeConfig.appMode,
    });
  } catch (error) {
    updateRoomStatus(
      'error',
      'Bootstrap failed',
      error instanceof Error ? error.message : 'Unable to prepare the app.',
    );
    addLog('error', 'Bootstrap failed.', formatError(error));
  }
}

function readStoredState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function persistState() {
  const payload = {
    livekitUrl: dom.livekitUrl.value,
    roomName: dom.roomName.value,
    identity: dom.identity.value,
    participantName: dom.participantName.value,
    enableCamera: dom.enableCamera.checked,
    enableMicrophone: dom.enableMicrophone.checked,
    humanLocale: dom.humanLocale.value,
    voiceName: state.preferences.voiceName,
    speechRate: state.preferences.speechRate,
    speechPitch: state.preferences.speechPitch,
    stageId: state.preferences.stageId,
    emoteId: state.preferences.emoteId,
    gestureId: state.preferences.gestureId,
  };

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage failures in the spike app.
  }
}

function hydrateInputs() {
  dom.livekitUrl.value = state.preferences.livekitUrl;
  dom.roomName.value = state.preferences.roomName;
  dom.identity.value = state.preferences.identity;
  dom.participantName.value = state.preferences.participantName;
  dom.enableCamera.checked = state.preferences.enableCamera;
  dom.enableMicrophone.checked = state.preferences.enableMicrophone;
  dom.humanLocale.value = state.preferences.humanLocale;
  dom.speechRate.value = String(state.preferences.speechRate);
  dom.speechPitch.value = String(state.preferences.speechPitch);
}

function ensureDefaults() {
  if (!dom.livekitUrl.value.trim()) {
    dom.livekitUrl.value = state.runtimeConfig?.livekitUrl || 'ws://127.0.0.1:7880';
  }

  if (!dom.roomName.value.trim()) {
    dom.roomName.value = 'app4-one-to-one-room';
  }

  if (!dom.identity.value.trim()) {
    dom.identity.value = `human-${Math.random().toString(36).slice(2, 8)}`;
  }

  if (!dom.participantName.value.trim()) {
    dom.participantName.value = 'Human Caller';
  }

  dom.mcpCommand.value = state.runtimeConfig?.bridge?.mcpServerCommand || '';
  dom.stateFile.textContent = state.runtimeConfig?.bridge?.stateFilePath || 'none';
  updateRoomStatus('ready', 'Ready', 'Create the call when you are ready to start the room.');
}

async function fetchRuntimeConfig() {
  const response = await fetch('/api/runtime-config', {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Runtime config request failed with ${response.status}`);
  }

  state.runtimeConfig = await response.json();
}

async function loadModel() {
  state.modelLoading = true;
  refreshActionButtons();
  try {
    await avatarLayer.loadModel(DEFAULT_MODEL.path, { label: DEFAULT_MODEL.label });
    dom.activeAvatar.textContent = DEFAULT_MODEL.label;
    refreshSceneNote();
  } catch (error) {
    addLog('error', 'Avatar model failed to load.', formatError(error));
    dom.activeAvatar.textContent = 'Avatar unavailable';
    dom.sceneNote.textContent =
      'Avatar model could not load. The room and MCP bridge can still be exercised without rendering.';
  } finally {
    state.modelLoading = false;
    refreshActionButtons();
  }
}

function collectFormState() {
  return {
    livekitUrl: dom.livekitUrl.value.trim(),
    roomName: dom.roomName.value.trim(),
    identity: dom.identity.value.trim(),
    participantName: dom.participantName.value.trim(),
    enableCamera: dom.enableCamera.checked,
    enableMicrophone: dom.enableMicrophone.checked,
  };
}

function bindEvents() {
  [
    dom.livekitUrl,
    dom.roomName,
    dom.identity,
    dom.participantName,
    dom.enableCamera,
    dom.enableMicrophone,
    dom.humanLocale,
  ].forEach((element) => {
    element.addEventListener('change', persistState);
    element.addEventListener('input', persistState);
  });

  dom.joinCall.addEventListener('click', async () => {
    try {
      await joinCall();
    } catch (error) {
      addLog('error', 'Create call failed.', formatError(error));
    }
  });

  dom.disconnectCall.addEventListener('click', async () => {
    await disconnectCall();
  });

  dom.copyMcpCommand.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(dom.mcpCommand.value);
      addLog('info', 'Copied MCP bootstrap command.');
    } catch (error) {
      addLog('error', 'Copy MCP command failed.', formatError(error));
    }
  });

  dom.runDemoReply.addEventListener('click', async () => {
    try {
      await runDemoReply();
    } catch (error) {
      addLog('error', 'Local fallback reply failed.', formatError(error));
    }
  });

  dom.startListening.addEventListener('click', async () => {
    try {
      await ensureSessionReady();
      await humanVoiceLayer.startListening();
    } catch (error) {
      addLog('error', 'Start listening failed.', formatError(error));
    }
  });

  dom.stopListening.addEventListener('click', () => {
    humanVoiceLayer.stopListening();
  });

  dom.sendTyped.addEventListener('click', async () => {
    const text = dom.typedInput.value.trim();
    if (!text) {
      return;
    }

    try {
      await ensureSessionReady();
      await humanVoiceLayer.runTextTurn(text, 'typed');
      dom.typedInput.value = '';
    } catch (error) {
      addLog('error', 'Queue typed turn failed.', formatError(error));
    }
  });

  dom.clearTyped.addEventListener('click', () => {
    dom.typedInput.value = '';
    refreshActionButtons();
  });

  dom.typedInput.addEventListener('input', () => {
    refreshActionButtons();
  });

  dom.humanLocale.addEventListener('change', () => {
    state.preferences.humanLocale = dom.humanLocale.value;
    humanVoiceLayer.updateConfig({
      locale: state.preferences.humanLocale,
    });
    persistState();
  });

  dom.voiceSelect.addEventListener('change', () => {
    state.preferences.voiceName = dom.voiceSelect.value;
    syncAgentVoiceConfig();
    persistState();
  });

  dom.speechRate.addEventListener('input', () => {
    state.preferences.speechRate = Number.parseFloat(dom.speechRate.value);
    updateRateLabels();
    syncAgentVoiceConfig();
    persistState();
  });

  dom.speechPitch.addEventListener('input', () => {
    state.preferences.speechPitch = Number.parseFloat(dom.speechPitch.value);
    updateRateLabels();
    syncAgentVoiceConfig();
    persistState();
  });

  window.addEventListener('beforeunload', () => {
    stopSessionPolling();
    avatarSpeech.stop({ cancelVoice: true });
    humanVoiceLayer.destroy();
    agentVoiceLayer.destroy();
    avatarLayer.destroy();

    if (state.room) {
      state.room.disconnect();
    }
  });

  window.addEventListener('error', (event) => {
    addLog('error', 'Window error.', formatError(event.error || event.message));
    renderDebugSnapshot();
  });

  window.addEventListener('unhandledrejection', (event) => {
    addLog('error', 'Unhandled promise rejection.', formatError(event.reason));
    renderDebugSnapshot();
  });
}

function installSdkLogging() {
  roomLayer.installSdkLogging(({ message, context }) => {
    addLog('info', `LiveKit SDK · ${message}`, context);
  }, LogLevel.info);
}

async function ensureSessionReady() {
  if (!state.session?.id) {
    throw new Error('Create the call before sending turns to the agent.');
  }
}

async function mintToken() {
  const form = collectFormState();
  const tokenResponse = await roomLayer.mintToken({
    roomName: form.roomName,
    identity: form.identity,
    participantName: form.participantName,
    metadata: JSON.stringify(
      {
        role: 'human',
        app: 'one-to-one-agent-room',
      },
      null,
      2,
    ),
  });

  return tokenResponse.token;
}

async function createBridgeSession() {
  const form = collectFormState();
  const sessionResponse = await postJson('/api/bridge/sessions', {
    roomName: form.roomName,
    livekitUrl: form.livekitUrl,
    humanIdentity: state.room?.localParticipant?.identity || form.identity,
    humanName: state.room?.localParticipant?.name || form.participantName,
    metadata: {
      app: 'one-to-one-agent-room',
      planEntry: 'docs/6-app-plan.md#4-one-to-one-agent-room',
      reusablePackages: [
        '@talking-agent/room-layer',
        '@talking-agent/avatar-layer-browser',
        '@talking-agent/voice-layer-browser',
        '@talking-agent/avatar-speech-browser',
        '@talking-agent/agent-room-bridge',
      ],
    },
  });

  state.session = sessionResponse.session;
  renderBridgeSnapshot();
  renderTranscriptList();
  renderDebugSnapshot();
  startSessionPolling();
}

async function probeLivekitBeforeConnect(livekitUrl) {
  const probe = await fetchJson(`/api/probe-livekit?url=${encodeURIComponent(livekitUrl)}`);

  if (!probe.reachable) {
    throw new Error(
      `No LiveKit server is reachable at ${livekitUrl}. Start LiveKit or change the URL. Probe target: ${probe.probeUrl}.`,
    );
  }

  addLog('info', 'LiveKit endpoint is reachable.', {
    probeUrl: probe.probeUrl,
    status: probe.status,
    statusText: probe.statusText,
  });
}

async function connectRoomWithTimeout(options, timeoutMs = 8000) {
  const timeoutPromise = new Promise((_, reject) => {
    window.setTimeout(() => {
      reject(new Error(`LiveKit room connect timed out after ${timeoutMs} ms.`));
    }, timeoutMs);
  });

  return Promise.race([roomLayer.connectRoom(options), timeoutPromise]);
}

async function joinCall() {
  const form = collectFormState();
  if (!form.livekitUrl) {
    throw new Error('LiveKit URL is required.');
  }

  if (!form.roomName) {
    throw new Error('Room name is required.');
  }

  if (!form.identity) {
    throw new Error('Human identity is required.');
  }

  if (state.room) {
    await disconnectCall();
  }

  updateRoomStatus('loading', 'Connecting…', 'Minting a room token and creating the bridge session.');
  await probeLivekitBeforeConnect(form.livekitUrl);

  const token = await mintToken();
  const room = new Room({
    adaptiveStream: true,
    dynacast: true,
    videoCaptureDefaults: {
      resolution: VideoPresets.h720.resolution,
    },
  });

  installRoomListeners(room);
  state.room = room;
  renderRoomSnapshot();
  refreshActionButtons();

  try {
    await connectRoomWithTimeout({
      room,
      livekitUrl: form.livekitUrl,
      token,
      enableCamera: form.enableCamera,
      enableMicrophone: form.enableMicrophone,
    });

    renderLocalStage();
    renderRoomSnapshot();
    await createBridgeSession();
    updateRoomStatus('ready', 'Connected', 'Human browser is in the room and the bridge session is ready.');
    addLog('info', 'Call created.', {
      room: room.name,
      identity: room.localParticipant.identity,
    });
  } catch (error) {
    addLog('error', 'Call creation failed.', formatError(error));
    await disconnectCall({ preserveRoomStatus: true });
    updateRoomStatus(
      'error',
      'Connection failed',
      error instanceof Error ? error.message : 'Unable to connect to the LiveKit room.',
    );
    throw error;
  }
}

async function disconnectCall({ preserveRoomStatus = false } = {}) {
  stopSessionPolling();
  humanVoiceLayer.stopListening();
  avatarSpeech.stop({ cancelVoice: true });
  state.session = null;
  renderBridgeSnapshot();
  renderTranscriptList();

  if (state.room) {
    try {
      await roomLayer.disconnectRoom(state.room);
    } catch (error) {
      addLog('error', 'Room disconnect failed.', formatError(error));
    }
  }

  state.room = null;
  renderLocalStage();
  if (!preserveRoomStatus) {
    renderRoomSnapshot();
  } else {
    dom.localIdentity.textContent = collectFormState().identity || 'none';
    dom.remoteCount.textContent = '0';
    dom.disconnectCall.disabled = true;
  }
  refreshActionButtons();
  renderDebugSnapshot();
}

function installRoomListeners(room) {
  roomLayer.attachRoomListeners(room, (event) => {
    switch (event.type) {
      case 'connected':
        addLog('info', 'LiveKit room connected.', {
          room: room.name,
          identity: room.localParticipant.identity,
        });
        renderRoomSnapshot();
        break;
      case 'connection-state-changed':
        addLog('info', 'Connection state changed.', {
          connectionState: event.connectionState,
        });
        renderRoomSnapshot();
        break;
      case 'participant-connected':
      case 'participant-disconnected':
      case 'active-speakers-changed':
        renderRoomSnapshot();
        break;
      case 'local-track-published':
      case 'local-track-unpublished':
        renderLocalStage();
        renderRoomSnapshot();
        break;
      case 'disconnected':
        addLog('warn', 'Room disconnected.', { reason: event.reason });
        renderRoomSnapshot();
        break;
      case 'media-devices-error':
        addLog('error', 'Media device error.', formatError(event.error));
        break;
      default:
        break;
    }

    renderDebugSnapshot();
  });
}

function renderLocalStage() {
  dom.localStage.innerHTML = '';

  if (!state.room) {
    dom.localStage.innerHTML = '<div class="empty-state">Create the call to see the local room preview.</div>';
    return;
  }

  const participant = state.room.localParticipant;
  const cameraPublication = participant.getTrackPublication(Track.Source.Camera);
  const microphonePublication = participant.getTrackPublication(Track.Source.Microphone);
  const card = document.createElement('div');
  card.className = 'participant-card';

  const header = document.createElement('div');
  header.className = 'participant-header';
  header.innerHTML = `
    <strong>${escapeHtml(participant.name || participant.identity)}</strong>
    <span class="participant-meta">local participant</span>
  `;

  const media = document.createElement('div');
  media.className = 'participant-stage';

  if (cameraPublication?.track) {
    const video = document.createElement('video');
    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;
    video.className = 'participant-video';
    cameraPublication.track.attach(video);
    state.localVideoElement = video;
    media.append(video);
  } else {
    media.innerHTML = '<div class="empty-state">Camera is not published.</div>';
  }

  const footer = document.createElement('div');
  footer.className = 'participant-footer';
  footer.innerHTML = `
    <span class="role-tag role-human">${cameraPublication?.track ? 'camera on' : 'camera off'}</span>
    <span class="role-tag role-human">${microphonePublication?.track ? 'mic on' : 'mic off'}</span>
  `;

  card.append(header, media, footer);
  dom.localStage.append(card);
}

function startSessionPolling() {
  stopSessionPolling();
  if (!state.session?.id) {
    return;
  }

  state.sessionPollId = window.setInterval(() => {
    void pollSession();
  }, 1500);

  void pollSession();
}

function stopSessionPolling() {
  if (state.sessionPollId) {
    clearInterval(state.sessionPollId);
    state.sessionPollId = 0;
  }
}

async function pollSession() {
  if (!state.session?.id) {
    return;
  }

  try {
    const payload = await fetchJson(`/api/bridge/sessions/${encodeURIComponent(state.session.id)}`);
    state.session = payload.session;
    renderBridgeSnapshot();
    renderTranscriptList();
    renderDebugSnapshot();
    await playAgentRepliesIfReady();
  } catch (error) {
    addLog('error', 'Bridge poll failed.', formatError(error));
  }
}

async function playAgentRepliesIfReady() {
  if (state.processingReplies || !state.session) {
    return;
  }

  const unplayedReplies = state.session.turns
    .filter((turn) => turn.agentReply && !turn.agentReply.playedAt)
    .sort((left, right) => Date.parse(left.agentReply.createdAt) - Date.parse(right.agentReply.createdAt));

  if (!unplayedReplies.length) {
    return;
  }

  state.processingReplies = true;
  renderAgentStatus();

  try {
    for (const turn of unplayedReplies) {
      const reply = turn.agentReply;
      if (!reply) {
        continue;
      }

      if (stageMap.has(reply.stageId)) {
        selectStage(reply.stageId, { persist: false });
      }

      if (emoteMap.has(reply.emoteId)) {
        selectEmote(reply.emoteId, { persist: false });
      }

      if (gestureMap.has(reply.gestureId)) {
        selectGesture(reply.gestureId, { persist: false });
      }

      dom.lastAgentReply.textContent = reply.text;
      const withVoice = reply.voiceMode !== 'silent' && agentVoiceLayer.getSnapshot().speechSynthesisSupported;
      await avatarSpeech.speakText(reply.text, {
        withVoice,
        source: `bridge-reply:${turn.id}`,
        locale: 'en-US',
        preferredVoiceName: state.preferences.voiceName,
        speechRate: state.preferences.speechRate,
        speechPitch: state.preferences.speechPitch,
      });

      const payload = await postJson(
        `/api/bridge/sessions/${encodeURIComponent(state.session.id)}/replies/${encodeURIComponent(reply.id)}/played`,
        {},
      );
      state.session = payload.session;
      renderBridgeSnapshot();
      renderTranscriptList();
      renderDebugSnapshot();
    }
  } finally {
    state.processingReplies = false;
    renderAgentStatus();
  }
}

async function enqueueHumanTurn(transcript, source) {
  await ensureSessionReady();
  const payload = await postJson(`/api/bridge/sessions/${encodeURIComponent(state.session.id)}/human-turn`, {
    transcript,
    source,
    humanIdentity: state.room?.localParticipant?.identity || collectFormState().identity,
    humanName: state.room?.localParticipant?.name || collectFormState().participantName,
  });

  state.session = payload.session;
  renderBridgeSnapshot();
  renderTranscriptList();
  renderDebugSnapshot();
  addLog('info', 'Queued human turn for the bridge.', {
    source,
    transcript,
  });
}

async function runDemoReply() {
  await ensureSessionReady();
  const payload = await postJson(
    `/api/bridge/sessions/${encodeURIComponent(state.session.id)}/demo-reply`,
    {},
  );
  if (payload.session) {
    state.session = payload.session;
    renderBridgeSnapshot();
    renderTranscriptList();
    renderDebugSnapshot();
    await playAgentRepliesIfReady();
  }
}

function renderRoomSnapshot() {
  const room = state.room;
  const localParticipant = room?.localParticipant || null;
  dom.localIdentity.textContent = localParticipant?.identity || collectFormState().identity || 'none';
  dom.remoteCount.textContent = room ? String(room.remoteParticipants.size) : '0';

  if (!room) {
    updateRoomStatus('ready', 'Ready', 'Create the call when you are ready to start the room.');
    dom.disconnectCall.disabled = true;
    return;
  }

  const connectionLabel = `${room.state || 'connecting'}`.toLowerCase();
  updateRoomStatus(
    room.state === 'connected' ? 'ready' : 'loading',
    connectionLabel,
    localParticipant ? `Connected as ${localParticipant.name || localParticipant.identity}.` : 'Connecting to the room.',
  );
}

function renderBridgeSnapshot() {
  if (!state.session) {
    dom.sessionId.textContent = 'none';
    dom.pendingCount.textContent = '0';
    updateBridgeStatus('idle', 'No session', 'Create the call before Codex can claim turns.');
    dom.runDemoReply.disabled = true;
    dom.lastAgentReply.textContent = 'none';
    refreshActionButtons();
    return;
  }

  dom.sessionId.textContent = state.session.id;
  dom.pendingCount.textContent = String(state.session.metrics.pendingTurns);
  dom.lastAgentReply.textContent = state.session.lastAgentReply?.text || 'none';

  if (state.session.metrics.pendingTurns > 0) {
    updateBridgeStatus(
      'pending',
      `${state.session.metrics.pendingTurns} pending turn${state.session.metrics.pendingTurns === 1 ? '' : 's'}`,
      'Codex can claim the next human turn through the MCP bridge.',
    );
  } else if (state.session.metrics.unplayedReplies > 0) {
    updateBridgeStatus(
      'active',
      'Reply ready',
      'The browser is about to play the newest agent reply.',
    );
  } else {
    updateBridgeStatus(
      'ready',
      'Bridge synced',
      'Waiting for the next human turn or the next Codex reply.',
    );
  }

  dom.runDemoReply.disabled = state.session.metrics.pendingTurns === 0;
  refreshActionButtons();
}

function renderHumanStatus() {
  const snapshot = state.humanVoiceSnapshot || humanVoiceLayer.getSnapshot();
  dom.humanStatus.textContent = snapshot.status || 'idle';
  dom.humanTranscript.textContent = state.transcriptPreview || 'none';
}

function renderAgentStatus() {
  const playback = state.avatarSpeechSnapshot || avatarSpeech.getSnapshot();
  const agentVoice = state.agentVoiceSnapshot || agentVoiceLayer.getSnapshot();

  if (state.processingReplies) {
    updateAgentStatus('active', 'Replying', 'A bridge reply is animating the avatar right now.');
    return;
  }

  if (playback.active) {
    updateAgentStatus(
      'active',
      playback.mode === 'voice' ? 'Speaking' : 'Animating',
      playback.currentText || 'The avatar is handling the current reply.',
    );
    return;
  }

  if (!agentVoice.speechSynthesisSupported) {
    updateAgentStatus(
      'warn',
      'Silent fallback',
      'This browser cannot speak the reply, but the avatar can still animate it.',
    );
    return;
  }

  updateAgentStatus('ready', 'Waiting', 'No reply is playing.');
}

function renderVoiceOptions() {
  const voices = state.voiceOptions;
  const selectedVoice = state.preferences.voiceName;
  dom.voiceSelect.replaceChildren();

  if (!voices.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = agentVoiceLayer.getSnapshot().speechSynthesisSupported
      ? 'Browser default voice'
      : 'Speech synthesis unavailable';
    dom.voiceSelect.append(option);
    dom.voiceSelect.disabled = !agentVoiceLayer.getSnapshot().speechSynthesisSupported;
    return;
  }

  voices.forEach((voice) => {
    const option = document.createElement('option');
    option.value = voice.name;
    option.textContent = `${voice.name} · ${voice.lang}${voice.default ? ' · default' : ''}`;
    dom.voiceSelect.append(option);
  });

  if (selectedVoice && voices.some((voice) => voice.name === selectedVoice)) {
    dom.voiceSelect.value = selectedVoice;
  } else {
    dom.voiceSelect.value = voices[0].name;
    state.preferences.voiceName = voices[0].name;
  }

  dom.voiceSelect.disabled = false;
}

function syncAgentVoiceConfig() {
  agentVoiceLayer.updateConfig({
    locale: 'en-US',
    autoRestart: false,
    preferredVoiceName: state.preferences.voiceName,
    speechRate: state.preferences.speechRate,
    speechPitch: state.preferences.speechPitch,
    speakReplies: true,
    getReply: async (transcript) => transcript,
  });
}

function updateRateLabels() {
  dom.speechRateValue.textContent = `${state.preferences.speechRate.toFixed(2)}x`;
  dom.speechPitchValue.textContent = `${state.preferences.speechPitch.toFixed(2)}x`;
}

function refreshActionButtons() {
  const humanVoiceSnapshot = state.humanVoiceSnapshot || humanVoiceLayer.getSnapshot();
  const hasSession = Boolean(state.session?.id);
  const hasTypedText = dom.typedInput.value.trim().length > 0;
  const roomReady = Boolean(state.room);

  dom.joinCall.disabled = state.modelLoading || roomReady;
  dom.disconnectCall.disabled = !roomReady;
  dom.startListening.disabled =
    !hasSession || !humanVoiceSnapshot.recognitionSupported || humanVoiceSnapshot.listening;
  dom.stopListening.disabled = !humanVoiceSnapshot.listening;
  dom.sendTyped.disabled = !hasSession || !hasTypedText;
}

function renderTranscriptList() {
  dom.transcriptList.innerHTML = '';

  if (!state.session?.turns?.length) {
    dom.transcriptList.innerHTML = '<li class="empty-state">No turns yet.</li>';
    return;
  }

  state.session.turns.forEach((turn) => {
    const humanItem = document.createElement('li');
    humanItem.className = 'turn-item';
    humanItem.dataset.role = 'human';
    humanItem.innerHTML = `
      <div class="turn-head">
        <span class="role-tag role-human">${escapeHtml(turn.source)}</span>
        <span>${escapeHtml(formatTime(turn.createdAt))}</span>
      </div>
      <div class="turn-body">
        <strong>${escapeHtml(turn.human.name || turn.human.identity || 'Human')}</strong>
        <p>${escapeHtml(turn.transcript)}</p>
      </div>
    `;
    dom.transcriptList.append(humanItem);

    if (turn.agentReply) {
      const agentItem = document.createElement('li');
      agentItem.className = 'turn-item';
      agentItem.dataset.role = 'agent';
      agentItem.innerHTML = `
        <div class="turn-head">
          <span class="role-tag role-agent">${escapeHtml(turn.agentReply.agentLabel || 'agent')}</span>
          <span>${escapeHtml(formatTime(turn.agentReply.createdAt))}</span>
        </div>
        <div class="turn-body">
          <strong>${escapeHtml(turn.agentReply.agentLabel || 'Codex OpenAI')}</strong>
          <p>${escapeHtml(turn.agentReply.text)}</p>
          <small>${escapeHtml(
            `${turn.agentReply.emoteId} · ${turn.agentReply.gestureId}${turn.agentReply.playedAt ? ' · played' : ' · pending playback'}`,
          )}</small>
        </div>
      `;
      dom.transcriptList.append(agentItem);
      return;
    }

    const pendingItem = document.createElement('li');
    pendingItem.className = 'turn-item';
    pendingItem.dataset.role = 'agent';
    pendingItem.innerHTML = `
      <div class="turn-head">
        <span class="role-tag role-agent">waiting</span>
        <span>${escapeHtml(formatTime(turn.createdAt))}</span>
      </div>
      <div class="turn-body">
        <strong>Codex OpenAI</strong>
        <p>${escapeHtml(
          turn.status === 'claimed'
            ? 'The agent runtime has claimed this turn and is preparing a reply.'
            : 'Waiting for the agent runtime to claim this turn through MCP.',
        )}</p>
      </div>
    `;
    dom.transcriptList.append(pendingItem);
  });
}

function addLog(level, message, details = null) {
  const entry = {
    at: new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
    level,
    message,
    details,
  };

  state.logs = [entry, ...state.logs].slice(0, 24);
  renderLogs();
}

function renderLogs() {
  dom.logList.innerHTML = '';

  state.logs.forEach((entry) => {
    const item = document.createElement('li');
    item.className = 'log-line';
    item.textContent = `[${entry.at}] ${entry.level.toUpperCase()} · ${entry.message}${
      entry.details ? ` ${safeStringify(entry.details)}` : ''
    }`;
    dom.logList.append(item);
  });
}

function renderDebugSnapshot() {
  dom.debugSnapshot.textContent = safeStringify({
    runtime: state.runtimeConfig,
    room: state.room
      ? {
          state: state.room.state,
          roomName: state.room.name,
          localIdentity: state.room.localParticipant?.identity,
          remoteCount: state.room.remoteParticipants.size,
        }
      : null,
    session: state.session,
    humanVoice: state.humanVoiceSnapshot || humanVoiceLayer.getSnapshot(),
    agentVoice: state.agentVoiceSnapshot || agentVoiceLayer.getSnapshot(),
    avatarSpeech: state.avatarSpeechSnapshot || avatarSpeech.getSnapshot(),
    avatar: avatarLayer.getSnapshot(),
    recentLogs: state.logs.slice(0, 8),
  });
}

function updateRoomStatus(cardState, title, detail) {
  dom.roomStatus.textContent = title;
  dom.roomDetail.textContent = detail;
  dom.roomStatus.closest('.status-card')?.setAttribute('data-state', cardState);
}

function updateBridgeStatus(cardState, title, detail) {
  dom.bridgeStatus.textContent = title;
  dom.bridgeDetail.textContent = detail;
  dom.bridgeStatus.closest('.status-card')?.setAttribute('data-state', cardState);
}

function updateAgentStatus(cardState, title, detail) {
  dom.agentStatus.textContent = title;
  dom.agentDetail.textContent = detail;
  dom.agentStatus.closest('.status-card')?.setAttribute('data-state', cardState);
}

function renderChoiceButtons(container, items, activeId, onSelect) {
  container.replaceChildren();

  items.forEach((item) => {
    const button = createChoiceButton(item.label, item.note, item.id === activeId, () => onSelect(item.id));
    button.dataset.choiceId = item.id;
    container.append(button);
  });
}

function createChoiceButton(label, note, active, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `choice-chip${active ? ' is-active' : ''}`;
  button.setAttribute('aria-pressed', active ? 'true' : 'false');
  button.innerHTML = `<span>${escapeHtml(label)}</span><small>${escapeHtml(note)}</small>`;
  button.addEventListener('click', onClick);
  return button;
}

function syncChoiceButtons(container, activeId) {
  container.querySelectorAll('.choice-chip').forEach((button) => {
    const isActive = button.dataset.choiceId === activeId;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

function selectStage(stageId, { persist = true } = {}) {
  state.preferences.stageId = stageId;
  avatarLayer.setStage(stageId);
  syncChoiceButtons(dom.stageOptions, stageId);
  refreshSceneNote();
  syncAvatarSnapshot();
  if (persist) {
    persistState();
  }
}

function selectEmote(emoteId, { persist = true } = {}) {
  state.preferences.emoteId = emoteId;
  avatarLayer.setEmote(emoteId);
  syncChoiceButtons(dom.emoteOptions, emoteId);
  refreshSceneNote();
  syncAvatarSnapshot();
  if (persist) {
    persistState();
  }
}

function selectGesture(gestureId, { persist = true } = {}) {
  state.preferences.gestureId = gestureId;
  avatarLayer.setGesture(gestureId);
  syncChoiceButtons(dom.gestureOptions, gestureId);
  refreshSceneNote();
  syncAvatarSnapshot();
  if (persist) {
    persistState();
  }
}

function refreshSceneNote() {
  const stage = stageMap.get(state.preferences.stageId);
  const emote = emoteMap.get(state.preferences.emoteId);
  const gesture = gestureMap.get(state.preferences.gestureId);
  dom.sceneNote.textContent = `${stage?.note || ''} ${emote?.note || ''} ${gesture?.note || ''}`.trim();
}

function syncAvatarSnapshot() {
  const snapshot = avatarLayer.getSnapshot();
  dom.activeAvatar.textContent = snapshot.modelLabel || DEFAULT_MODEL.label;
  dom.activeEmote.textContent = emoteMap.get(snapshot.emoteId)?.label || 'Neutral';
  dom.activeGesture.textContent = gestureMap.get(snapshot.gestureId)?.label || 'Idle';
  dom.activeMouth.textContent = snapshot.mouthCue || 'rest';
  dom.lookTarget.textContent = snapshot.lookTargetLabel || 'center';
}

async function fetchJson(url) {
  const response = await fetch(url, {
    cache: 'no-store',
  });
  const payload = await response.json();

  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Request failed with ${response.status}`);
  }

  return payload;
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json();

  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Request failed with ${response.status}`);
  }

  return payload;
}

function formatTime(value) {
  const date = new Date(value);
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function safeStringify(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
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

function clampNumber(value, min, max, fallback) {
  const parsed = Number.parseFloat(value);
  if (Number.isFinite(parsed)) {
    return Math.min(max, Math.max(min, parsed));
  }

  return fallback;
}
