import { escapeHtml, formatTime, safeStringify } from '../lib/format.js';

export function updateStatusCard(statusElement, detailElement, cardState, title, detail) {
  if (!statusElement || !detailElement) {
    return;
  }
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
    if (option.style) {
      option.style.color = '#08111d';
      option.style.backgroundColor = '#f5f7ff';
    }
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

export function renderSubtitleLane(textElement, modeElement, subtitle = {}) {
  textElement.textContent = subtitle.text || '…';
  modeElement.textContent = subtitle.mode || 'idle';
  modeElement.dataset.mode = subtitle.mode || 'idle';
}

export function renderTranscriptList(container, session) {
  if (!container) {
    return;
  }
  container.innerHTML = '';

  if (!session?.turns?.length) {
    container.innerHTML = '<li class="empty-state">No turns yet.</li>';
    return;
  }

  const items = [];

  session.turns.forEach((turn) => {
    items.push({
      role: 'human',
      createdAt: turn.createdAt,
      html: `
        <div class="turn-head">
          <span>${escapeHtml(formatTime(turn.createdAt))}</span>
        </div>
        <div class="turn-body">
          <p>${escapeHtml(turn.transcript)}</p>
        </div>
      `,
    });

    if (turn.agentReply) {
      const stateLabel = turn.agentReply.interruptedAt
        ? 'interrupted'
        : turn.agentReply.playedAt
          ? 'played'
          : 'ready';
      items.push({
        role: 'agent',
        createdAt: turn.agentReply.createdAt,
        html: `
          <div class="turn-head">
            <span>${escapeHtml(formatTime(turn.agentReply.createdAt))}</span>
          </div>
          <div class="turn-body">
            <p>${escapeHtml(turn.agentReply.subtitle || turn.agentReply.text)}</p>
            <small>${escapeHtml(
              `${turn.agentReply.emoteId || 'neutral'}${turn.agentReply.gestureId ? ` · ${turn.agentReply.gestureId}` : ''} · ${stateLabel}`,
            )}</small>
          </div>
        `,
      });
      return;
    }

    const pendingMessage =
      turn.status === 'interrupted'
        ? 'This turn was interrupted before the reply finished.'
        : turn.status === 'error'
          ? turn.errorText || 'Codex failed to answer this turn.'
          : 'Codex is thinking about a reply.';
    items.push({
      role: 'agent',
      createdAt: turn.createdAt,
      html: `
        <div class="turn-head">
          <span>${escapeHtml(formatTime(turn.createdAt))}</span>
        </div>
        <div class="turn-body">
          <p>${escapeHtml(pendingMessage)}</p>
        </div>
      `,
    });
  });

  items
    .sort(
      (left, right) =>
        new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime(),
    )
    .forEach((item) => {
    const humanItem = document.createElement('li');
    humanItem.className = 'turn-item';
    humanItem.dataset.role = item.role;
    humanItem.innerHTML = item.html;
    container.append(humanItem);
  });
}

export function renderLogs(container, logs) {
  if (!container) {
    return;
  }
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
  if (!container) {
    return;
  }
  container.textContent = safeStringify(payload);
}
