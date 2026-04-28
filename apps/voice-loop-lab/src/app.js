import { createVoiceLayer } from '/vendor/voice-layer-browser.js';

const elements = {
  recognitionLocale: document.querySelector('#recognition-locale'),
  voiceSelect: document.querySelector('#voice-select'),
  replyMode: document.querySelector('#reply-mode'),
  autoRestart: document.querySelector('#auto-restart'),
  speakReplies: document.querySelector('#speak-replies'),
  startSession: document.querySelector('#start-session'),
  stopSession: document.querySelector('#stop-session'),
  stopSpeaking: document.querySelector('#stop-speaking'),
  runLatencyCheck: document.querySelector('#run-latency-check'),
  sendTyped: document.querySelector('#send-typed'),
  clearHistory: document.querySelector('#clear-history'),
  typedInput: document.querySelector('#typed-input'),
  status: document.querySelector('#status'),
  micEnergy: document.querySelector('#mic-energy'),
  lastTranscript: document.querySelector('#last-transcript'),
  lastReply: document.querySelector('#last-reply'),
  debugSnapshot: document.querySelector('#debug-snapshot'),
  turnList: document.querySelector('#turn-list'),
  logList: document.querySelector('#log-list'),
  latencySpeechStart: document.querySelector('#latency-speech-start'),
  latencyTranscriptFinal: document.querySelector('#latency-transcript-final'),
  latencyReplyReady: document.querySelector('#latency-reply-ready'),
  latencyTtsStart: document.querySelector('#latency-tts-start'),
  latencyTtsEnd: document.querySelector('#latency-tts-end'),
  latencyTurnTotal: document.querySelector('#latency-turn-total'),
};

const settingsKey = 'voice-loop-lab.settings';

const uiState = {
  logs: [],
  micLevel: 0,
  snapshot: null,
  transcriptPreview: 'none',
  turns: [],
  voices: [],
};

function safeStringify(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function persistSettings() {
  const payload = {
    recognitionLocale: elements.recognitionLocale.value,
    replyMode: elements.replyMode.value,
    autoRestart: elements.autoRestart.checked,
    speakReplies: elements.speakReplies.checked,
    voiceName: elements.voiceSelect.value,
  };

  window.localStorage.setItem(settingsKey, JSON.stringify(payload));
}

function hydrateSettings() {
  const raw = window.localStorage.getItem(settingsKey);
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

const savedSettings = hydrateSettings();

if (savedSettings.recognitionLocale) {
  elements.recognitionLocale.value = savedSettings.recognitionLocale;
}

if (savedSettings.replyMode) {
  elements.replyMode.value = savedSettings.replyMode;
}

elements.autoRestart.checked = savedSettings.autoRestart !== false;
elements.speakReplies.checked = savedSettings.speakReplies !== false;

let voiceLayer;

function makeReply(transcript, source = 'voice') {
  const cleaned = transcript.trim();
  const lower = cleaned.toLowerCase();
  const mode = elements.replyMode.value;

  if (mode === 'mirror') {
    return `You said: ${cleaned}`;
  }

  if (mode === 'concise') {
    return cleaned.length > 80 ? `${cleaned.slice(0, 77)}...` : cleaned;
  }

  if (lower.includes('hello') || lower.includes('hi')) {
    return 'Hello. Voice loop is active. Say status, time, or repeat after me.';
  }

  if (lower.includes('status')) {
    return `Recognition is ${uiState.snapshot?.recognitionSupported ? 'available' : 'unavailable'}. Voice mode is non LLM. Reply source is deterministic ${source}.`;
  }

  if (lower.includes('time')) {
    return `The local time is ${new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })}.`;
  }

  if (lower.startsWith('repeat after me')) {
    const repeated = cleaned.slice('repeat after me'.length).trim();
    return repeated ? repeated : 'You did not provide anything to repeat.';
  }

  if (lower.includes('help')) {
    return 'Try hello, status, what time is it, or repeat after me.';
  }

  if (lower.includes('stop listening')) {
    window.setTimeout(() => voiceLayer.stopListening(), 0);
    return 'Stopping the listening loop after this reply.';
  }

  return `Deterministic reply: ${cleaned || 'I heard silence.'}`;
}

voiceLayer = createVoiceLayer({
  locale: elements.recognitionLocale.value,
  autoRestart: elements.autoRestart.checked,
  speakReplies: elements.speakReplies.checked,
  preferredVoiceName: savedSettings.voiceName || '',
  getReply: makeReply,
});

function updateLatencyPanel(turn) {
  const fields = turn?.metrics || {};
  const empty = 'n/a';

  elements.latencySpeechStart.textContent = fields.speechStart ?? empty;
  elements.latencyTranscriptFinal.textContent = fields.transcriptFinal ?? empty;
  elements.latencyReplyReady.textContent = fields.replyReady ?? empty;
  elements.latencyTtsStart.textContent = fields.ttsStart ?? empty;
  elements.latencyTtsEnd.textContent = fields.ttsEnd ?? empty;
  elements.latencyTurnTotal.textContent = fields.turnTotal ?? empty;
}

function renderTurns() {
  elements.turnList.innerHTML = '';

  if (!uiState.turns.length) {
    elements.turnList.innerHTML = '<li class="empty-state">No turns yet.</li>';
    return;
  }

  for (const turn of uiState.turns) {
    const item = document.createElement('li');
    item.className = 'turn-item';
    item.innerHTML = `
      <div class="turn-head">
        <strong>${escapeHtml(turn.source)}</strong>
        <span>${escapeHtml(turn.at)}</span>
      </div>
      <div class="turn-body">
        <div><span class="label">Transcript</span><p>${escapeHtml(turn.transcript)}</p></div>
        <div><span class="label">Reply</span><p>${escapeHtml(turn.reply)}</p></div>
      </div>
      <div class="turn-foot">
        <span>${escapeHtml(turn.metrics.speechStart || 'n/a')}</span>
        <span>${escapeHtml(turn.metrics.transcriptFinal || 'n/a')}</span>
        <span>${escapeHtml(turn.metrics.replyReady || 'n/a')}</span>
        <span>${escapeHtml(turn.metrics.turnTotal || 'n/a')}</span>
      </div>
    `;
    elements.turnList.appendChild(item);
  }
}

function renderLogs() {
  elements.logList.innerHTML = '';

  for (const entry of uiState.logs) {
    const item = document.createElement('li');
    item.className = `log-line log-${entry.level}`;

    const summary = document.createElement('div');
    summary.textContent = `[${entry.at}] ${entry.level.toUpperCase()} · ${entry.message}`;
    item.appendChild(summary);

    if (entry.details) {
      const details = document.createElement('pre');
      details.className = 'debug-output compact';
      details.textContent = safeStringify(entry.details);
      item.appendChild(details);
    }

    elements.logList.appendChild(item);
  }
}

function renderVoices() {
  const selected = uiState.snapshot?.selectedVoice || savedSettings.voiceName || '';
  elements.voiceSelect.innerHTML = '';

  if (!uiState.voices.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No speech voices available';
    elements.voiceSelect.appendChild(option);
    return;
  }

  for (const voice of uiState.voices) {
    const option = document.createElement('option');
    option.value = voice.name;
    option.textContent = `${voice.name} · ${voice.lang}${voice.default ? ' · default' : ''}`;
    elements.voiceSelect.appendChild(option);
  }

  if (selected && uiState.voices.some((voice) => voice.name === selected)) {
    elements.voiceSelect.value = selected;
  }
}

function renderSnapshot() {
  const snapshot = uiState.snapshot || voiceLayer.getSnapshot();

  elements.status.textContent = snapshot.status || 'ready';
  elements.micEnergy.textContent = `${uiState.micLevel}%`;
  elements.lastTranscript.textContent = uiState.transcriptPreview || snapshot.lastTranscript || 'none';
  elements.lastReply.textContent = snapshot.lastReply || 'none';
  elements.startSession.disabled = !snapshot.recognitionSupported || snapshot.listening;
  elements.stopSession.disabled = !snapshot.listening;
  updateLatencyPanel(snapshot.lastTurn);

  elements.debugSnapshot.textContent = safeStringify({
    ...snapshot,
    voices: uiState.voices,
    recentLogs: uiState.logs.slice(0, 12),
  });
}

function syncVoiceLayerConfig() {
  voiceLayer.updateConfig({
    locale: elements.recognitionLocale.value,
    autoRestart: elements.autoRestart.checked,
    speakReplies: elements.speakReplies.checked,
    preferredVoiceName: elements.voiceSelect.value,
    getReply: makeReply,
  });
  persistSettings();
}

voiceLayer.setHandlers({
  onStateChange(snapshot) {
    uiState.snapshot = snapshot;
    renderSnapshot();
  },
  onLog(entry) {
    uiState.logs = [entry, ...uiState.logs].slice(0, 120);
    renderLogs();
    renderSnapshot();
  },
  onTurn(turn) {
    uiState.turns = [turn, ...uiState.turns].slice(0, 30);
    uiState.transcriptPreview = turn.transcript;
    renderTurns();
    renderSnapshot();
  },
  onVoices(voices) {
    uiState.voices = voices;
    renderVoices();
    renderSnapshot();
  },
  onLevel(level) {
    uiState.micLevel = level;
    renderSnapshot();
  },
  onTranscript(event) {
    uiState.transcriptPreview = event.text || 'none';
    renderSnapshot();
  },
});

uiState.snapshot = voiceLayer.getSnapshot();
uiState.voices = uiState.snapshot.voices || [];
uiState.transcriptPreview = uiState.snapshot.lastTranscript || 'none';
uiState.logs = [
  {
    at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    level: uiState.snapshot.recognitionSupported ? 'info' : 'warn',
    message: uiState.snapshot.recognitionSupported
      ? 'Voice loop lab shell booted.'
      : 'Browser speech recognition is unavailable. Typed fallback remains usable.',
    details: {
      reusedModule: '@talking-agent/voice-layer-browser',
      locale: uiState.snapshot.selectedLocale,
    },
  },
];
renderVoices();
renderTurns();
renderLogs();
renderSnapshot();

function bindEvents() {
  const configTargets = [
    elements.recognitionLocale,
    elements.replyMode,
    elements.autoRestart,
    elements.speakReplies,
    elements.voiceSelect,
  ];

  for (const target of configTargets) {
    target.addEventListener('change', () => {
      syncVoiceLayerConfig();
      renderSnapshot();
    });
    target.addEventListener('input', () => {
      syncVoiceLayerConfig();
      renderSnapshot();
    });
  }

  elements.startSession.addEventListener('click', async () => {
    try {
      await voiceLayer.startListening();
    } catch (error) {
      uiState.logs = [
        {
          at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          level: 'error',
          message: 'Failed to start recognition.',
          details: {
            name: error?.name,
            message: error?.message,
            stack: error?.stack,
          },
        },
        ...uiState.logs,
      ].slice(0, 120);
      renderLogs();
      renderSnapshot();
    }
  });

  elements.stopSession.addEventListener('click', () => {
    voiceLayer.stopListening();
  });

  elements.stopSpeaking.addEventListener('click', () => {
    voiceLayer.cancelSpeech();
  });

  elements.runLatencyCheck.addEventListener('click', async () => {
    await voiceLayer.runTextTurn(elements.typedInput.value.trim() || 'status', 'typed-check');
  });

  elements.sendTyped.addEventListener('click', async () => {
    const text = elements.typedInput.value.trim();
    if (!text) {
      return;
    }

    await voiceLayer.runTextTurn(text, 'typed');
  });

  elements.clearHistory.addEventListener('click', () => {
    uiState.turns = [];
    uiState.logs = [];
    uiState.transcriptPreview = 'none';
    renderTurns();
    renderLogs();
    updateLatencyPanel(null);
    renderSnapshot();
  });

  window.addEventListener('beforeunload', () => {
    voiceLayer.destroy();
  });
}

bindEvents();
