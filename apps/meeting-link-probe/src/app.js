import {
  ConnectionState,
  LogLevel,
  Room,
  RoomEvent,
  Track,
  VideoPresets,
  setLogExtension,
} from '/vendor/livekit-client.mjs';
import { createRoomLayerClient } from '/vendor/room-layer-client.mjs';

const elements = {
  livekitUrl: document.querySelector('#livekit-url'),
  roomName: document.querySelector('#room-name'),
  identity: document.querySelector('#identity'),
  participantName: document.querySelector('#participant-name'),
  metadata: document.querySelector('#metadata'),
  apiKey: document.querySelector('#api-key'),
  apiSecret: document.querySelector('#api-secret'),
  token: document.querySelector('#token'),
  enableCamera: document.querySelector('#enable-camera'),
  enableMicrophone: document.querySelector('#enable-microphone'),
  autoLaunchSampleAgent: document.querySelector('#auto-launch-sample-agent'),
  serverDefaults: document.querySelector('#server-defaults'),
  probeStatus: document.querySelector('#probe-status'),
  sampleAgentStatus: document.querySelector('#sample-agent-status'),
  connectionState: document.querySelector('#connection-state'),
  currentRoom: document.querySelector('#current-room'),
  currentIdentity: document.querySelector('#current-identity'),
  remoteCount: document.querySelector('#remote-count'),
  tokenClaims: document.querySelector('#token-claims'),
  debugSnapshot: document.querySelector('#debug-snapshot'),
  logList: document.querySelector('#log-list'),
  localStage: document.querySelector('#local-stage'),
  remoteGrid: document.querySelector('#remote-grid'),
  audioGate: document.querySelector('#audio-gate'),
  startAudio: document.querySelector('#start-audio'),
  mintToken: document.querySelector('#mint-token'),
  joinRoom: document.querySelector('#join-room'),
  disconnectRoom: document.querySelector('#disconnect-room'),
  launchSampleAgent: document.querySelector('#launch-sample-agent'),
  stopSampleAgent: document.querySelector('#stop-sample-agent'),
  copyProbeLink: document.querySelector('#copy-probe-link'),
  copyDebugSnapshot: document.querySelector('#copy-debug-snapshot'),
};

const state = {
  defaults: null,
  logs: [],
  room: null,
  sampleAgentRoom: null,
  sampleAgentStatus: 'idle',
  sampleAgentIdentity: null,
  sampleAgentMedia: null,
  tokenClaims: null,
  lastError: null,
  localVideoElement: null,
  remoteAudioElements: new Map(),
  remoteVideoElements: new Map(),
};

const QUERY = new URLSearchParams(window.location.search);
const roomLayer = createRoomLayerClient({
  sdk: {
    LogLevel,
    Room,
    RoomEvent,
    setLogExtension,
  },
});

function createIdentitySeed() {
  return Math.random().toString(36).slice(2, 8);
}

function formatNow() {
  return new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function safeStringify(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatError(error) {
  return roomLayer.formatError(error);
}

function addLog(level, message, details) {
  const item = {
    timestamp: formatNow(),
    level,
    message,
    details: details ?? null,
  };

  state.logs = [item, ...state.logs].slice(0, 80);
  renderLogs();
  renderDebugSnapshot();
}

function renderLogs() {
  elements.logList.innerHTML = '';

  for (const entry of state.logs) {
    const item = document.createElement('li');
    item.className = `log-line log-item-${entry.level}`;

    const summary = document.createElement('div');
    summary.textContent = `[${entry.timestamp}] ${entry.level.toUpperCase()} · ${entry.message}`;
    item.appendChild(summary);

    if (entry.details) {
      const details = document.createElement('pre');
      details.className = 'log-details';
      details.textContent = safeStringify(entry.details);
      item.appendChild(details);
    }

    elements.logList.appendChild(item);
  }
}

function setProbeStatus(text) {
  elements.probeStatus.textContent = text;
}

function decodeTokenClaims(token) {
  return roomLayer.decodeTokenClaims(token);
}

function updateTokenClaims(token) {
  if (!token.trim()) {
    state.tokenClaims = null;
    elements.tokenClaims.textContent = 'No token yet.';
    renderDebugSnapshot();
    return;
  }

  try {
    state.tokenClaims = decodeTokenClaims(token.trim());
    elements.tokenClaims.textContent = safeStringify(state.tokenClaims);
  } catch (error) {
    state.tokenClaims = null;
    elements.tokenClaims.textContent = `Unable to decode token: ${error.message}`;
  }

  renderDebugSnapshot();
}

function collectFormState() {
  return {
    livekitUrl: elements.livekitUrl.value.trim(),
    roomName: elements.roomName.value.trim(),
    identity: elements.identity.value.trim(),
    participantName: elements.participantName.value.trim(),
    metadata: elements.metadata.value,
    apiKey: elements.apiKey.value.trim(),
    apiSecret: elements.apiSecret.value,
    token: elements.token.value.trim(),
    enableCamera: elements.enableCamera.checked,
    enableMicrophone: elements.enableMicrophone.checked,
    autoLaunchSampleAgent: elements.autoLaunchSampleAgent.checked,
  };
}

function persistFormState() {
  const { apiSecret, token, ...safeFields } = collectFormState();
  window.localStorage.setItem('meeting-link-probe.livekit.form', JSON.stringify(safeFields));
}

function hydrateFormState() {
  const saved = window.localStorage.getItem('meeting-link-probe.livekit.form');
  if (!saved) {
    return;
  }

  try {
    const parsed = JSON.parse(saved);
    elements.livekitUrl.value = parsed.livekitUrl || elements.livekitUrl.value;
    elements.roomName.value = parsed.roomName || elements.roomName.value;
    elements.identity.value = parsed.identity || elements.identity.value;
    elements.participantName.value = parsed.participantName || elements.participantName.value;
    elements.metadata.value = parsed.metadata || elements.metadata.value;
    elements.apiKey.value = parsed.apiKey || elements.apiKey.value;
    elements.enableCamera.checked = Boolean(parsed.enableCamera);
    elements.enableMicrophone.checked = Boolean(parsed.enableMicrophone);
    elements.autoLaunchSampleAgent.checked =
      parsed.autoLaunchSampleAgent === undefined ? true : Boolean(parsed.autoLaunchSampleAgent);
  } catch (error) {
    addLog('warn', 'Failed to restore saved form state.', formatError(error));
  }
}

function applyQueryParams() {
  const livekitUrl = QUERY.get('livekitUrl');
  const roomName = QUERY.get('roomName');
  const identity = QUERY.get('identity');
  const participantName = QUERY.get('participantName');

  if (livekitUrl) {
    elements.livekitUrl.value = livekitUrl;
  }

  if (roomName) {
    elements.roomName.value = roomName;
  }

  if (identity) {
    elements.identity.value = identity;
  }

  if (participantName) {
    elements.participantName.value = participantName;
  }
}

function ensureDefaults() {
  if (!elements.livekitUrl.value.trim()) {
    elements.livekitUrl.value = state.defaults?.livekitUrl || 'ws://127.0.0.1:7880';
  }

  if (!elements.roomName.value.trim()) {
    elements.roomName.value = 'app1-probe-room';
  }

  if (!elements.identity.value.trim()) {
    elements.identity.value = `human-${createIdentitySeed()}`;
  }

  if (!elements.participantName.value.trim()) {
    elements.participantName.value = 'Human Probe';
  }

  if (!elements.metadata.value.trim()) {
    elements.metadata.value = JSON.stringify(
      {
        role: 'human',
        app: 'app1',
      },
      null,
      2,
    );
  }

  if (!elements.apiKey.value.trim() && state.defaults?.apiKey) {
    elements.apiKey.value = state.defaults.apiKey;
  }

  if (elements.autoLaunchSampleAgent.checked === undefined) {
    elements.autoLaunchSampleAgent.checked = true;
  }
}

function updateRuntimeBanner() {
  if (!state.defaults) {
    elements.serverDefaults.textContent = 'Runtime config unavailable.';
    return;
  }

  const defaultsText = [
    `URL: ${state.defaults.livekitUrl}`,
    state.defaults.apiKey ? `API key: ${state.defaults.apiKey}` : 'API key: not preset',
    state.defaults.hasApiSecret ? 'API secret: provided by local server' : 'API secret: form only',
  ];

  elements.serverDefaults.textContent = defaultsText.join(' • ');
}

function renderConnectionSnapshot() {
  const room = state.room;

  elements.connectionState.textContent = room?.state || ConnectionState.Disconnected;
  elements.currentRoom.textContent = room?.name || collectFormState().roomName || 'none';
  elements.currentIdentity.textContent = room?.localParticipant?.identity || collectFormState().identity || 'none';
  elements.remoteCount.textContent = String(room ? room.remoteParticipants.size : 0);
  elements.disconnectRoom.disabled = !room || room.state === ConnectionState.Disconnected;
  elements.stopSampleAgent.disabled = !state.sampleAgentRoom;
}

function setSampleAgentStatus(text) {
  state.sampleAgentStatus = text;
  elements.sampleAgentStatus.textContent = text;
  elements.stopSampleAgent.disabled = !state.sampleAgentRoom;
  renderDebugSnapshot();
}

function renderAudioGate() {
  if (!state.room) {
    elements.audioGate.textContent =
      'Remote audio will autoplay when the browser allows it. If the browser blocks playback, this panel will prompt you to start audio manually.';
    elements.startAudio.hidden = true;
    return;
  }

  if (state.room.canPlaybackAudio) {
    elements.audioGate.textContent = 'Remote audio playback is available.';
    elements.startAudio.hidden = true;
    return;
  }

  elements.audioGate.textContent =
    'The browser is blocking remote audio playback. Use Start Room Audio once the room is connected.';
  elements.startAudio.hidden = false;
}

function cleanupDetachedTracks() {
  if (state.localVideoElement && !document.body.contains(state.localVideoElement)) {
    state.localVideoElement = null;
  }

  for (const [key, element] of state.remoteAudioElements.entries()) {
    if (!document.body.contains(element)) {
      state.remoteAudioElements.delete(key);
    }
  }

  for (const [key, element] of state.remoteVideoElements.entries()) {
    if (!document.body.contains(element)) {
      state.remoteVideoElements.delete(key);
    }
  }
}

function ensureStageElement(kind, cache, cacheKey, className) {
  let element = cache.get(cacheKey);
  if (!element) {
    element = document.createElement(kind);
    element.autoplay = true;
    element.playsInline = true;
    element.className = className;
    cache.set(cacheKey, element);
  }
  return element;
}

function renderLocalStage() {
  elements.localStage.innerHTML = '';

  if (!state.room) {
    elements.localStage.innerHTML =
      '<div class="empty-state">Connect and publish a camera track to see the local preview.</div>';
    return;
  }

  const participant = state.room.localParticipant;
  const cameraPublication = participant.getTrackPublication(Track.Source.Camera);
  const microphonePublication = participant.getTrackPublication(Track.Source.Microphone);
  const stage = document.createElement('div');
  stage.className = 'participant-card';

  const header = document.createElement('div');
  header.className = 'participant-header';
  header.innerHTML = `
    <strong>${participant.name || participant.identity}</strong>
    <span class="participant-meta">local participant</span>
  `;

  const media = document.createElement('div');
  media.className = 'participant-stage';

  if (cameraPublication?.track) {
    const video = document.createElement('video');
    video.muted = true;
    video.className = 'participant-video';
    cameraPublication.track.attach(video);
    state.localVideoElement = video;
    media.appendChild(video);
  } else {
    media.innerHTML = '<div class="empty-state">Camera is not published.</div>';
  }

  const footer = document.createElement('div');
  footer.className = 'participant-footer';
  footer.innerHTML = `
    <span class="badge">${cameraPublication?.track ? 'camera on' : 'camera off'}</span>
    <span class="badge">${microphonePublication?.track ? 'mic on' : 'mic off'}</span>
  `;

  stage.append(header, media, footer);
  elements.localStage.appendChild(stage);
}

function renderRemoteGrid() {
  elements.remoteGrid.innerHTML = '';

  if (!state.room || state.room.remoteParticipants.size === 0) {
    elements.remoteGrid.innerHTML =
      '<div class="empty-state">No remote participants yet. Open the probe in another browser context or connect a future machine participant.</div>';
    cleanupDetachedTracks();
    return;
  }

  for (const participant of state.room.remoteParticipants.values()) {
    const cameraPublication = participant.getTrackPublication(Track.Source.Camera);
    const microphonePublication = participant.getTrackPublication(Track.Source.Microphone);
    const card = document.createElement('article');
    card.className = 'participant-card';

    const header = document.createElement('div');
    header.className = 'participant-header';
    header.innerHTML = `
      <strong>${participant.name || participant.identity}</strong>
      <span class="participant-meta">${participant.identity}</span>
    `;

    const indicators = document.createElement('div');
    indicators.className = 'participant-footer';
    indicators.innerHTML = `
      <span class="badge">${cameraPublication?.track ? 'camera on' : 'camera off'}</span>
      <span class="badge">${microphonePublication?.track ? 'mic on' : 'mic off'}</span>
      <span class="badge">${participant.isSpeaking ? 'speaking' : 'idle'}</span>
    `;

    const stage = document.createElement('div');
    stage.className = 'participant-stage';

    const videoKey = `${participant.identity}:camera`;
    if (cameraPublication?.videoTrack) {
      const video = ensureStageElement('video', state.remoteVideoElements, videoKey, 'participant-video');
      video.muted = false;
      cameraPublication.videoTrack.attach(video);
      stage.appendChild(video);
    } else {
      stage.innerHTML = '<div class="empty-state">No remote camera track.</div>';
    }

    if (microphonePublication?.audioTrack) {
      const audioKey = `${participant.identity}:mic`;
      const audio = ensureStageElement('audio', state.remoteAudioElements, audioKey, 'participant-audio');
      microphonePublication.audioTrack.attach(audio);
      card.appendChild(audio);
    }

    card.append(header, stage, indicators);
    elements.remoteGrid.appendChild(card);
  }

  cleanupDetachedTracks();
}

function renderDebugSnapshot() {
  const snapshot = {
    form: {
      livekitUrl: elements.livekitUrl.value.trim(),
      roomName: elements.roomName.value.trim(),
      identity: elements.identity.value.trim(),
      participantName: elements.participantName.value.trim(),
      enableCamera: elements.enableCamera.checked,
      enableMicrophone: elements.enableMicrophone.checked,
      autoLaunchSampleAgent: elements.autoLaunchSampleAgent.checked,
    },
    runtimeDefaults: state.defaults,
    tokenClaims: state.tokenClaims,
    room: state.room
      ? {
          name: state.room.name,
          state: state.room.state,
          localIdentity: state.room.localParticipant?.identity,
          localName: state.room.localParticipant?.name,
          remoteParticipants: [...state.room.remoteParticipants.values()].map((participant) => ({
            identity: participant.identity,
            name: participant.name,
            speaking: participant.isSpeaking,
            isCameraEnabled: participant.isCameraEnabled,
            isMicrophoneEnabled: participant.isMicrophoneEnabled,
          })),
        }
      : null,
    sampleAgent: {
      status: state.sampleAgentStatus,
      identity: state.sampleAgentIdentity,
      room: state.sampleAgentRoom
        ? {
            name: state.sampleAgentRoom.name,
            state: state.sampleAgentRoom.state,
            localIdentity: state.sampleAgentRoom.localParticipant?.identity,
          }
        : null,
    },
    lastError: state.lastError,
    recentLogs: state.logs.slice(0, 10),
  };

  elements.debugSnapshot.textContent = safeStringify(snapshot);
}

async function loadRuntimeConfig() {
  state.defaults = await roomLayer.loadRuntimeConfig();
  updateRuntimeBanner();
}

async function mintToken(overrides = {}) {
  const form = {
    ...collectFormState(),
    ...overrides,
  };

  const payload = await roomLayer.mintToken({
    livekitUrl: form.livekitUrl,
    roomName: form.roomName,
    identity: form.identity,
    participantName: form.participantName,
    metadata: form.metadata,
    apiKey: form.apiKey,
    apiSecret: form.apiSecret,
    ttlMinutes: 60,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  if (!overrides.identity && !overrides.roomName && !overrides.participantName) {
    elements.token.value = payload.token;
    updateTokenClaims(payload.token);
  }

  addLog('info', 'Minted local LiveKit token.', payload.claims);
  setProbeStatus('Token ready');
  return payload.token;
}

function waitForMediaReady(mediaElement, eventName = 'canplay') {
  return new Promise((resolve, reject) => {
    const onReady = () => {
      cleanup();
      resolve();
    };

    const onError = () => {
      cleanup();
      reject(new Error(`Media failed to load: ${mediaElement.currentSrc || mediaElement.src}`));
    };

    const cleanup = () => {
      mediaElement.removeEventListener(eventName, onReady);
      mediaElement.removeEventListener('error', onError);
    };

    mediaElement.addEventListener(eventName, onReady, { once: true });
    mediaElement.addEventListener('error', onError, { once: true });
  });
}

function cleanupSampleAgentMedia() {
  const media = state.sampleAgentMedia;
  if (!media) {
    return;
  }

  for (const track of media.videoStream?.getTracks?.() || []) {
    track.stop();
  }

  for (const track of media.audioDestination?.stream?.getTracks?.() || []) {
    track.stop();
  }

  if (media.audioSourceNode) {
    media.audioSourceNode.disconnect();
  }

  if (media.audioDestination) {
    media.audioDestination.disconnect?.();
  }

  if (media.audioContext && media.audioContext.state !== 'closed') {
    media.audioContext.close().catch(() => {});
  }

  for (const element of [media.videoElement, media.audioElement]) {
    if (!element) {
      continue;
    }

    try {
      element.pause();
      element.removeAttribute('src');
      element.load();
    } catch {}
  }

  state.sampleAgentMedia = null;
}

async function createSampleAgentTracks() {
  const videoElement = document.createElement('video');
  videoElement.src = '/media/sample.mov';
  videoElement.crossOrigin = 'anonymous';
  videoElement.preload = 'auto';
  videoElement.loop = true;
  videoElement.muted = true;
  videoElement.playsInline = true;

  const audioElement = document.createElement('audio');
  audioElement.src = '/media/sample.mp3';
  audioElement.crossOrigin = 'anonymous';
  audioElement.preload = 'auto';
  audioElement.loop = true;

  await Promise.all([
    waitForMediaReady(videoElement, 'canplay'),
    waitForMediaReady(audioElement, 'canplaythrough'),
  ]);

  if (typeof videoElement.captureStream !== 'function') {
    throw new Error('This browser does not support HTMLMediaElement.captureStream().');
  }

  const videoStream = videoElement.captureStream();
  const videoTrack = videoStream.getVideoTracks()[0];

  if (!videoTrack) {
    throw new Error('The sample video did not produce a video track.');
  }

  const audioContext = new AudioContext();
  await audioContext.resume();
  const audioSourceNode = audioContext.createMediaElementSource(audioElement);
  const audioDestination = audioContext.createMediaStreamDestination();
  audioSourceNode.connect(audioDestination);
  const audioTrack = audioDestination.stream.getAudioTracks()[0];

  if (!audioTrack) {
    throw new Error('The sample audio did not produce an audio track.');
  }

  await Promise.all([videoElement.play(), audioElement.play()]);

  state.sampleAgentMedia = {
    audioContext,
    audioDestination,
    audioElement,
    audioSourceNode,
    videoElement,
    videoStream,
  };

  return { audioTrack, videoTrack };
}

function installSampleAgentRoomListeners(room) {
  roomLayer.attachRoomListeners(room, (event) => {
    switch (event.type) {
      case 'connected':
        addLog('info', 'Sample agent connected.', {
          room: room.name,
          identity: room.localParticipant.identity,
        });
        setSampleAgentStatus('connected');
        break;
      case 'connection-state-changed':
        addLog('info', 'Sample agent connection state changed.', {
          connectionState: event.connectionState,
        });
        setSampleAgentStatus(event.connectionState);
        break;
      case 'disconnected':
        addLog('warn', 'Sample agent disconnected.', { reason: event.reason });
        if (state.sampleAgentRoom === room) {
          state.sampleAgentRoom = null;
          state.sampleAgentIdentity = null;
          cleanupSampleAgentMedia();
          setSampleAgentStatus('idle');
        }
        break;
      default:
        break;
    }
  });
}

async function stopSampleAgent() {
  const room = state.sampleAgentRoom;

  if (!room) {
    cleanupSampleAgentMedia();
    state.sampleAgentIdentity = null;
    setSampleAgentStatus('idle');
    return;
  }

  try {
    await roomLayer.disconnectRoom(room);
  } catch (error) {
    addLog('error', 'Failed to stop sample agent cleanly.', formatError(error));
  } finally {
    state.sampleAgentRoom = null;
    state.sampleAgentIdentity = null;
    cleanupSampleAgentMedia();
    setSampleAgentStatus('idle');
  }
}

async function launchSampleAgent() {
  if (!state.room || state.room.state !== ConnectionState.Connected) {
    throw new Error('Join the room first, then launch the sample agent.');
  }

  await stopSampleAgent();
  setSampleAgentStatus('starting...');

  const form = collectFormState();
  const agentIdentity = `sample-agent-${createIdentitySeed()}`;
  state.sampleAgentIdentity = agentIdentity;

  const token = await mintToken({
    identity: agentIdentity,
    participantName: 'Sample Agent',
    metadata: JSON.stringify(
      {
        role: 'sample-agent',
        media: ['sample.mov', 'sample.mp3'],
      },
      null,
      2,
    ),
  });

  const room = new Room({
    adaptiveStream: false,
    dynacast: false,
  });

  installSampleAgentRoomListeners(room);
  state.sampleAgentRoom = room;
  renderConnectionSnapshot();

  try {
    await roomLayer.connectRoom({
      room,
      livekitUrl: form.livekitUrl,
      token,
    });

    const { audioTrack, videoTrack } = await createSampleAgentTracks();

    await room.localParticipant.publishTrack(videoTrack, {
      source: Track.Source.Camera,
      name: 'sample-agent-camera',
    });
    await room.localParticipant.publishTrack(audioTrack, {
      source: Track.Source.Microphone,
      name: 'sample-agent-microphone',
    });

    addLog('info', 'Sample agent is publishing sample media.', {
      identity: agentIdentity,
      room: room.name,
      video: '/media/sample.mov',
      audio: '/media/sample.mp3',
    });
    setSampleAgentStatus('publishing sample media');
  } catch (error) {
    state.lastError = formatError(error);
    addLog('error', 'Sample agent launch failed.', state.lastError);
    await stopSampleAgent();
    throw error;
  }
}

async function disconnectRoom() {
  await stopSampleAgent();

  if (!state.room) {
    return;
  }

  try {
    await roomLayer.disconnectRoom(state.room);
    addLog('info', 'Disconnected from room.');
  } catch (error) {
    state.lastError = formatError(error);
    addLog('error', 'Disconnect failed.', state.lastError);
  } finally {
    state.room = null;
    renderLocalStage();
    renderRemoteGrid();
    renderConnectionSnapshot();
    renderAudioGate();
    renderDebugSnapshot();
    setProbeStatus('Disconnected');
  }
}

function installRoomListeners(room) {
  roomLayer.attachRoomListeners(room, (event) => {
    switch (event.type) {
      case 'connected':
        addLog('info', 'LiveKit room connected.', {
          room: room.name,
          identity: room.localParticipant.identity,
        });
        renderConnectionSnapshot();
        renderAudioGate();
        renderDebugSnapshot();
        break;
      case 'connection-state-changed':
        addLog('info', 'Connection state changed.', {
          connectionState: event.connectionState,
        });
        renderConnectionSnapshot();
        renderDebugSnapshot();
        break;
      case 'participant-connected':
        addLog('info', 'Remote participant connected.', {
          identity: event.participant.identity,
          name: event.participant.name,
        });
        renderRemoteGrid();
        renderConnectionSnapshot();
        break;
      case 'participant-disconnected':
        addLog('warn', 'Remote participant disconnected.', {
          identity: event.participant.identity,
          name: event.participant.name,
        });
        renderRemoteGrid();
        renderConnectionSnapshot();
        break;
      case 'track-subscribed':
        addLog('info', 'Remote track subscribed.', {
          identity: event.participant.identity,
          source: event.publication.source,
          kind: event.track.kind,
        });
        renderRemoteGrid();
        renderAudioGate();
        break;
      case 'track-unsubscribed':
        addLog('warn', 'Remote track unsubscribed.', {
          identity: event.participant.identity,
          source: event.publication.source,
          kind: event.track.kind,
        });
        renderRemoteGrid();
        break;
      case 'local-track-published':
        addLog('info', 'Local track published.', {
          source: event.publication.source,
          sid: event.publication.trackSid,
        });
        renderLocalStage();
        break;
      case 'local-track-unpublished':
        addLog('warn', 'Local track unpublished.', {
          source: event.publication.source,
          sid: event.publication.trackSid,
        });
        renderLocalStage();
        break;
      case 'active-speakers-changed':
        renderRemoteGrid();
        break;
      case 'media-devices-error':
        state.lastError = formatError(event.error);
        addLog('error', 'Media device error.', {
          kind: event.kind,
          error: state.lastError,
        });
        renderDebugSnapshot();
        break;
      case 'audio-playback-status-changed':
        addLog('info', 'Audio playback status changed.', { playing: event.playing });
        renderAudioGate();
        break;
      case 'reconnecting':
        addLog('warn', 'Room reconnecting.');
        renderConnectionSnapshot();
        break;
      case 'reconnected':
        addLog('info', 'Room reconnected.');
        renderConnectionSnapshot();
        break;
      case 'disconnected':
        addLog('warn', 'Room disconnected.', { reason: event.reason });
        renderConnectionSnapshot();
        renderAudioGate();
        renderDebugSnapshot();
        break;
      default:
        break;
    }
  });
}

async function joinRoom() {
  const form = collectFormState();
  setProbeStatus('Connecting…');
  state.lastError = null;

  if (!form.livekitUrl) {
    throw new Error('LiveKit URL is required.');
  }

  if (!form.roomName) {
    throw new Error('Room name is required.');
  }

  if (!form.identity) {
    throw new Error('Participant identity is required.');
  }

  if (state.room) {
    await disconnectRoom();
  }

  let token = form.token;
  if (!token) {
    token = await mintToken();
  } else {
    updateTokenClaims(token);
  }

  const room = new Room({
    adaptiveStream: true,
    dynacast: true,
    videoCaptureDefaults: {
      resolution: VideoPresets.h720.resolution,
    },
  });

  installRoomListeners(room);
  state.room = room;
  renderConnectionSnapshot();
  renderAudioGate();
  renderDebugSnapshot();

  try {
    await roomLayer.connectRoom({
      room,
      livekitUrl: form.livekitUrl,
      token,
      enableCamera: form.enableCamera,
      enableMicrophone: form.enableMicrophone,
    });

    renderLocalStage();
    renderRemoteGrid();
    renderConnectionSnapshot();
    renderAudioGate();
    renderDebugSnapshot();
    setProbeStatus('Connected');

    if (form.autoLaunchSampleAgent) {
      await launchSampleAgent();
    }
  } catch (error) {
    state.lastError = formatError(error);
    addLog('error', 'Room connection failed.', state.lastError);
    setProbeStatus('Connection failed');
    renderDebugSnapshot();
    await disconnectRoom();
    throw error;
  }
}

async function copyProbeLink() {
  const form = collectFormState();
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set('livekitUrl', form.livekitUrl);
  url.searchParams.set('roomName', form.roomName);
  url.searchParams.set('participantName', form.participantName || 'Human Probe');
  url.searchParams.set('identity', `human-${createIdentitySeed()}`);
  await navigator.clipboard.writeText(url.toString());
  addLog('info', 'Copied probe URL.', { url: url.toString() });
}

async function copyDebugSnapshot() {
  await navigator.clipboard.writeText(elements.debugSnapshot.textContent);
  addLog('info', 'Copied debug snapshot.');
}

async function startRoomAudio() {
  if (!state.room) {
    return;
  }

  try {
    await roomLayer.startRoomAudio(state.room);
    addLog('info', 'Started room audio playback.');
    renderAudioGate();
  } catch (error) {
    state.lastError = formatError(error);
    addLog('error', 'Failed to start room audio.', state.lastError);
  }
}

function bindEvents() {
  const persistTargets = [
    elements.livekitUrl,
    elements.roomName,
    elements.identity,
    elements.participantName,
    elements.metadata,
    elements.apiKey,
    elements.enableCamera,
    elements.enableMicrophone,
    elements.autoLaunchSampleAgent,
  ];

  for (const target of persistTargets) {
    target.addEventListener('change', persistFormState);
    target.addEventListener('input', persistFormState);
  }

  elements.token.addEventListener('input', () => updateTokenClaims(elements.token.value));
  elements.mintToken.addEventListener('click', async () => {
    try {
      await mintToken();
    } catch (error) {
      state.lastError = formatError(error);
      addLog('error', 'Token mint failed.', state.lastError);
      setProbeStatus('Token mint failed');
    }
  });
  elements.joinRoom.addEventListener('click', async () => {
    try {
      await joinRoom();
    } catch (error) {
      addLog('error', 'Join room action failed.', formatError(error));
    }
  });
  elements.disconnectRoom.addEventListener('click', async () => {
    await disconnectRoom();
  });
  elements.launchSampleAgent.addEventListener('click', async () => {
    try {
      await launchSampleAgent();
    } catch (error) {
      addLog('error', 'Launch sample agent failed.', formatError(error));
      setSampleAgentStatus('launch failed');
    }
  });
  elements.stopSampleAgent.addEventListener('click', async () => {
    await stopSampleAgent();
  });
  elements.copyProbeLink.addEventListener('click', async () => {
    try {
      await copyProbeLink();
    } catch (error) {
      addLog('error', 'Copy probe URL failed.', formatError(error));
    }
  });
  elements.copyDebugSnapshot.addEventListener('click', async () => {
    try {
      await copyDebugSnapshot();
    } catch (error) {
      addLog('error', 'Copy debug snapshot failed.', formatError(error));
    }
  });
  elements.startAudio.addEventListener('click', async () => {
    await startRoomAudio();
  });

  window.addEventListener('beforeunload', () => {
    if (state.room) {
      state.room.disconnect();
    }
    if (state.sampleAgentRoom) {
      state.sampleAgentRoom.disconnect();
    }
    cleanupSampleAgentMedia();
  });

  window.addEventListener('error', (event) => {
    state.lastError = formatError(event.error || event.message);
    addLog('error', 'Window error.', state.lastError);
  });

  window.addEventListener('unhandledrejection', (event) => {
    state.lastError = formatError(event.reason);
    addLog('error', 'Unhandled promise rejection.', state.lastError);
  });
}

function installSdkLogging() {
  roomLayer.installSdkLogging(({ message, context }) => {
    addLog('info', `LiveKit SDK · ${message}`, context);
  }, LogLevel.info);
}

async function boot() {
  bindEvents();
  installSdkLogging();
  hydrateFormState();
  applyQueryParams();

  try {
    await loadRuntimeConfig();
    ensureDefaults();
    updateRuntimeBanner();
    updateTokenClaims(elements.token.value);
    renderConnectionSnapshot();
    renderAudioGate();
    renderLocalStage();
    renderRemoteGrid();
    renderDebugSnapshot();
    setSampleAgentStatus(state.sampleAgentStatus);
    setProbeStatus('Ready');
    addLog('info', 'LiveKit probe booted.', {
      livekitUrl: elements.livekitUrl.value,
      roomName: elements.roomName.value,
      identity: elements.identity.value,
    });
  } catch (error) {
    state.lastError = formatError(error);
    addLog('error', 'App bootstrap failed.', state.lastError);
    setProbeStatus('Bootstrap failed');
  }
}

boot();
