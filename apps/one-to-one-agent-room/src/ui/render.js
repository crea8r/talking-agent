import { escapeHtml, formatTime, safeStringify } from '../lib/format.js';

export function updateStatusCard(statusElement, detailElement, cardState, title, detail) {
  statusElement.textContent = title;
  detailElement.textContent = detail;
  statusElement.closest('.status-card')?.setAttribute('data-state', cardState);
}

export function renderSelectOptions(selectElement, items, activeId) {
  selectElement.replaceChildren();

  items.forEach((item) => {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item.label;
    if (item.note) {
      option.title = item.note;
    }
    selectElement.append(option);
  });

  selectElement.value = activeId;
}

export function renderVoiceOptions(selectElement, { voices, selectedVoice, speechSynthesisSupported }) {
  selectElement.replaceChildren();

  if (!voices.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = speechSynthesisSupported
      ? 'Browser default voice'
      : 'Speech synthesis unavailable';
    selectElement.append(option);
    selectElement.disabled = !speechSynthesisSupported;
    return selectedVoice || '';
  }

  voices.forEach((voice) => {
    const option = document.createElement('option');
    option.value = voice.name;
    option.textContent = `${voice.name} · ${voice.lang}${voice.default ? ' · default' : ''}`;
    selectElement.append(option);
  });

  if (selectedVoice && voices.some((voice) => voice.name === selectedVoice)) {
    selectElement.value = selectedVoice;
    selectElement.disabled = false;
    return selectedVoice;
  }

  const fallbackVoice = voices[0].name;
  selectElement.value = fallbackVoice;
  selectElement.disabled = false;
  return fallbackVoice;
}

export function renderRateLabels(rateElement, pitchElement, speechRate, speechPitch) {
  rateElement.textContent = `${speechRate.toFixed(2)}x`;
  pitchElement.textContent = `${speechPitch.toFixed(2)}x`;
}

export function renderLocalStage(container, room, trackSource) {
  container.innerHTML = '';

  if (!room) {
    container.innerHTML = '<div class="empty-state">Start the room to preview local media.</div>';
    return null;
  }

  const participant = room.localParticipant;
  const cameraPublication = participant.getTrackPublication(trackSource.Camera);
  const microphonePublication = participant.getTrackPublication(trackSource.Microphone);
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

  let videoElement = null;
  if (cameraPublication?.track) {
    videoElement = document.createElement('video');
    videoElement.muted = true;
    videoElement.autoplay = true;
    videoElement.playsInline = true;
    videoElement.className = 'participant-video';
    cameraPublication.track.attach(videoElement);
    media.append(videoElement);
  } else {
    media.innerHTML = '<div class="empty-state">Camera is off.</div>';
  }

  const footer = document.createElement('div');
  footer.className = 'participant-footer';
  footer.innerHTML = `
    <span class="role-tag role-human">${cameraPublication?.track ? 'camera on' : 'camera off'}</span>
    <span class="role-tag role-human">${microphonePublication?.track ? 'mic on' : 'mic off'}</span>
  `;

  card.append(header, media, footer);
  container.append(card);
  return videoElement;
}

export function renderTranscriptList(container, session) {
  container.innerHTML = '';

  if (!session?.turns?.length) {
    container.innerHTML = '<li class="empty-state">No turns yet.</li>';
    return;
  }

  session.turns.forEach((turn) => {
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
    container.append(humanItem);

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
      container.append(agentItem);
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
        <p>${escapeHtml(turn.status === 'claimed' ? 'Claimed by the agent.' : 'Waiting for the agent.')}</p>
      </div>
    `;
    container.append(pendingItem);
  });
}

export function renderLogs(container, logs) {
  container.innerHTML = '';

  logs.forEach((entry) => {
    const item = document.createElement('li');
    item.className = 'log-line';
    item.textContent = `[${entry.at}] ${entry.level.toUpperCase()} · ${entry.message}${
      entry.details ? ` ${safeStringify(entry.details)}` : ''
    }`;
    container.append(item);
  });
}

export function renderDebugSnapshot(container, payload) {
  container.textContent = safeStringify(payload);
}
