export function createRoomLayerClient({
  sdk,
  fetchImpl,
  runtimeConfigPath = '/api/runtime-config',
  tokenPath = '/api/token',
} = {}) {
  if (!sdk) {
    throw new Error('Room layer client requires a LiveKit SDK object.');
  }

  const { LogLevel, Room, RoomEvent, setLogExtension } = sdk;

  const fetcher = fetchImpl || globalThis.fetch?.bind(globalThis);
  if (!fetcher) {
    throw new Error('Room layer client requires a fetch implementation.');
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

  function decodeTokenClaims(token) {
    const parts = token.split('.');
    if (parts.length < 2) {
      throw new Error('Token does not look like a JWT.');
    }

    const payload = parts[1]
      .replaceAll('-', '+')
      .replaceAll('_', '/')
      .padEnd(Math.ceil(parts[1].length / 4) * 4, '=');

    return JSON.parse(atob(payload));
  }

  function attachRoomListeners(room, onEvent = () => {}) {
    const emit = (type, detail = {}) => onEvent({ type, room, ...detail });

    room
      .on(RoomEvent.Connected, () => {
        emit('connected');
      })
      .on(RoomEvent.ConnectionStateChanged, (connectionState) => {
        emit('connection-state-changed', { connectionState });
      })
      .on(RoomEvent.ParticipantConnected, (participant) => {
        emit('participant-connected', { participant });
      })
      .on(RoomEvent.ParticipantDisconnected, (participant) => {
        emit('participant-disconnected', { participant });
      })
      .on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        emit('track-subscribed', { track, publication, participant });
      })
      .on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
        track.detach();
        emit('track-unsubscribed', { track, publication, participant });
      })
      .on(RoomEvent.LocalTrackPublished, (publication) => {
        emit('local-track-published', { publication });
      })
      .on(RoomEvent.LocalTrackUnpublished, (publication) => {
        publication.track?.detach();
        emit('local-track-unpublished', { publication });
      })
      .on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        emit('active-speakers-changed', { speakers });
      })
      .on(RoomEvent.MediaDevicesError, (error, kind) => {
        emit('media-devices-error', { error, kind });
      })
      .on(RoomEvent.AudioPlaybackStatusChanged, (playing) => {
        emit('audio-playback-status-changed', { playing });
      })
      .on(RoomEvent.Reconnecting, () => {
        emit('reconnecting');
      })
      .on(RoomEvent.Reconnected, () => {
        emit('reconnected');
      })
      .on(RoomEvent.Disconnected, (reason) => {
        emit('disconnected', { reason });
      });

    return room;
  }

  function createRoom(roomOptions = {}, onEvent = () => {}) {
    const room = new Room(roomOptions);
    return attachRoomListeners(room, onEvent);
  }

  async function loadRuntimeConfig() {
    const response = await fetcher(runtimeConfigPath);
    if (!response.ok) {
      throw new Error(`Failed to load runtime config (${response.status}).`);
    }

    return response.json();
  }

  async function mintToken(tokenRequest) {
    const response = await fetcher(tokenPath, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(tokenRequest),
    });

    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || `Token mint failed (${response.status}).`);
    }

    return payload;
  }

  async function connectRoom({
    room,
    livekitUrl,
    token,
    enableCamera = false,
    enableMicrophone = false,
  }) {
    room.prepareConnection(livekitUrl, token);
    await room.connect(livekitUrl, token);

    if (enableCamera) {
      await room.localParticipant.setCameraEnabled(true);
    }

    if (enableMicrophone) {
      await room.localParticipant.setMicrophoneEnabled(true);
    }

    return room;
  }

  async function disconnectRoom(room) {
    if (!room) {
      return;
    }

    await room.disconnect();
  }

  async function startRoomAudio(room) {
    if (!room) {
      return false;
    }

    await room.startAudio();
    return true;
  }

  function installSdkLogging(onLog, minLevel = LogLevel.info) {
    const log = typeof onLog === 'function' ? onLog : () => {};

    setLogExtension((level, message, context) => {
      if (level < minLevel) {
        return;
      }

      log({ level, message, context });
    });
  }

  return {
    attachRoomListeners,
    connectRoom,
    createRoom,
    decodeTokenClaims,
    disconnectRoom,
    formatError,
    installSdkLogging,
    loadRuntimeConfig,
    mintToken,
    startRoomAudio,
  };
}
