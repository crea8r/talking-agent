import test from 'node:test';
import assert from 'node:assert/strict';

import { createPresenter } from './presenter.js';

function createElement(overrides = {}) {
  const styleState = {};
  return {
    textContent: '',
    dataset: {},
    value: '',
    disabled: false,
    hidden: false,
    innerHTML: '',
    children: [],
    attributes: {},
    style: {
      setProperty(name, value) {
        styleState[name] = value;
      },
      getPropertyValue(name) {
        return styleState[name] || '';
      },
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    append(node) {
      this.children.push(node);
    },
    appendChild(node) {
      this.children.push(node);
    },
    replaceChildren(...nodes) {
      this.children = nodes;
    },
    closest() {
      return null;
    },
    ...overrides,
  };
}

function createPresenterHarness({
  stateOverrides = {},
  domOverrides = {},
  avatarLayerSnapshot = {},
  avatarSpeechSnapshot = { active: false, mode: 'idle', currentText: '' },
} = {}) {
  const dom = {
    voiceSampleFileName: createElement(),
    voiceSampleStatus: createElement(),
    joinCall: createElement(),
    sendTyped: createElement(),
    typedInput: createElement(),
    callCameraToggle: createElement(),
    callSpeakerToggle: createElement(),
    callMicToggle: createElement(),
    callAvatarHost: createElement(),
    setupAvatarLoading: createElement({ hidden: true }),
    setupAvatarLoadingLabel: createElement(),
    setupAvatarLoadingProgress: createElement({ hidden: true }),
    setupAvatarLoadingDetail: createElement({ hidden: true }),
    callSelfCluster: createElement({ hidden: true }),
    callSelfView: createElement({ hidden: true }),
    callSelfVideo: createElement({ hidden: true, play() { return Promise.resolve(); } }),
    callSelfStatus: createElement(),
    callSelfPlaceholder: createElement(),
    callStageLoading: createElement({ hidden: true }),
    callStageLoadingLabel: createElement(),
    callStageLoadingCountdown: createElement({ hidden: true }),
    callStageLoadingTip: createElement({ hidden: true }),
    callEmptyState: createElement({ hidden: false }),
    callEmptyStateTitle: createElement(),
    callEmptyStateDetail: createElement(),
    callSubtitleOverlay: createElement({ hidden: true }),
    callSubtitleHuman: createElement({ hidden: true }),
    callSubtitleAgent: createElement({ hidden: true }),
    callLayout: createElement(),
    callHistoryPanel: createElement({ hidden: true }),
    callHistoryList: createElement(),
    callHistoryToggle: createElement({ hidden: false }),
    callThinkingTimer: createElement({ hidden: true }),
    callDeferredIndicator: createElement({ hidden: true }),
    callDeferredList: createElement(),
    ...domOverrides,
  };

  const state = {
    launchContext: {
      initialScreen: 'setup',
    },
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
      avatar: {
        active: false,
        phase: '',
        detail: '',
        percent: null,
      },
    },
    productionVoice: {
      loading: false,
      uploading: false,
      backendRunning: true,
      profile: null,
      validationMessage: '',
    },
    codex: {
      backendRunning: true,
    },
    preferences: {
      bundledModelId: 'bhf-1-2',
      voiceSampleFileName: '',
    },
    activeCall: false,
    sessionPreparing: false,
    endingCall: false,
    callEndingDimmed: false,
    humanMicMuted: false,
    humanMicLevel: 0,
    modelLoading: false,
    humanVoiceSnapshot: {
      recognitionSupported: true,
    },
    startupGreetingIndicator: {
      active: false,
      remainingSeconds: 45,
      tipText: '',
    },
    callHistoryCollapsed: true,
    ...stateOverrides,
  };

  const presenter = createPresenter({
    dom,
    state,
    collectFormState() {
      return {};
    },
    humanVoiceLayer: {
      getSnapshot() {
        return { recognitionSupported: true, status: 'idle' };
      },
    },
    agentVoiceLayer: {
      getSnapshot() {
        return { speechSynthesisSupported: true };
      },
    },
    avatarSpeech: {
      getSnapshot() {
        return avatarSpeechSnapshot;
      },
    },
    avatarLayer: {
      getSnapshot() {
        return avatarLayerSnapshot;
      },
    },
  });

  return { presenter, dom, state };
}

test('renderVoiceSampleState shows a red requirement when no usable voice reference exists', () => {
  const { presenter, dom } = createPresenterHarness();

  presenter.renderVoiceSampleState();

  assert.equal(dom.voiceSampleFileName.textContent, 'Choose WAV');
  assert.equal(dom.voiceSampleStatus.textContent, 'missing voice reference, a 3+s wav file');
  assert.equal(dom.voiceSampleStatus.dataset.tone, 'danger');
});

test('renderCallSnapshot marks the call stage offline until a call is active', () => {
  const { presenter, dom } = createPresenterHarness({
  });

  presenter.renderCallSnapshot();

  assert.equal(dom.joinCall.attributes.title, 'Start Call · Setup');
  assert.equal(dom.callAvatarHost.dataset.agentOnline, 'false');
  assert.equal(dom.callMicToggle.dataset.state, 'muted');
  assert.equal(dom.callMicToggle.disabled, true);
  assert.equal(dom.callMicToggle.attributes.title, 'Microphone muted');
  assert.equal(dom.callStageLoading.hidden, true);
  assert.equal(dom.callEmptyState.hidden, false);
  assert.equal(dom.callEmptyStateTitle.textContent, 'Waiting');
  assert.equal(dom.callEmptyStateDetail.textContent, 'Need voice');
  assert.equal(dom.callSelfCluster.hidden, true);
});

test('renderCallSnapshot keeps the stage clear during initial avatar loading before the call starts', () => {
  const { presenter, dom } = createPresenterHarness({
    stateOverrides: {
      modelLoading: true,
      productionVoice: {
        loading: false,
        uploading: false,
        backendRunning: true,
        profile: { referenceAvailable: true },
        validationMessage: '',
      },
    },
  });

  presenter.renderCallSnapshot();
  presenter.refreshActionButtons();

  assert.equal(dom.callStageLoading.hidden, true);
  assert.equal(dom.joinCall.disabled, false);
  assert.equal(dom.callEmptyStateDetail.textContent, 'Ready to start');
});

test('renderCallSnapshot shows boot phase copy when the call screen opens before remote dependencies finish loading', () => {
  const { presenter, dom } = createPresenterHarness({
    stateOverrides: {
      launchContext: {
        initialScreen: 'call',
      },
      loadingUi: {
        boot: {
          active: true,
          phase: 'Loading avatar assets',
          detail: 'Downloading avatar assets from the host.',
        },
        call: {
          active: false,
          phase: '',
          detail: '',
        },
      },
      productionVoice: {
        loading: false,
        uploading: false,
        backendRunning: true,
        profile: { referenceAvailable: true },
        validationMessage: '',
      },
    },
    avatarLayerSnapshot: {
      ready: false,
    },
  });

  presenter.renderCallSnapshot();

  assert.equal(dom.callStageLoading.hidden, false);
  assert.equal(dom.callStageLoadingLabel.textContent, 'Loading avatar assets');
  assert.equal(dom.callStageLoadingTip.hidden, false);
  assert.equal(dom.callStageLoadingTip.textContent, 'Downloading avatar assets from the host.');
});

test('refreshActionButtons shows an obvious setup overlay while the remote avatar and VRMA assets are loading', () => {
  const { presenter, dom } = createPresenterHarness({
    stateOverrides: {
      modelLoading: true,
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
        avatar: {
          active: true,
          phase: 'Loading character animations',
          detail: 'Streaming VRMA motion files from your laptop.',
          percent: 94,
        },
      },
    },
  });

  presenter.refreshActionButtons();

  assert.equal(dom.setupAvatarLoading.hidden, false);
  assert.equal(dom.setupAvatarLoadingLabel.textContent, 'Loading character animations');
  assert.equal(dom.setupAvatarLoadingProgress.hidden, false);
  assert.equal(dom.setupAvatarLoadingProgress.textContent, '94%');
  assert.equal(dom.setupAvatarLoadingDetail.hidden, false);
  assert.equal(
    dom.setupAvatarLoadingDetail.textContent,
    'Streaming VRMA motion files from your laptop.',
  );
});

test('renderCallSnapshot makes the mic live and glowing while the user is speaking', () => {
  const { presenter, dom } = createPresenterHarness({
    stateOverrides: {
      activeCall: true,
      humanMicLevel: 58,
      humanVoiceSnapshot: {
        recognitionSupported: true,
        listening: true,
      },
      productionVoice: {
        loading: false,
        uploading: false,
        backendRunning: true,
        profile: { referenceAvailable: true },
        validationMessage: '',
      },
    },
    domOverrides: {
      callMicToggle: createElement(),
    },
  });

  presenter.renderCallSnapshot();

  assert.equal(dom.callMicToggle.dataset.state, 'live');
  assert.equal(dom.callMicToggle.dataset.speaking, 'true');
  assert.equal(dom.callMicToggle.disabled, false);
  assert.equal(dom.callMicToggle.attributes.title, 'Mute microphone');
  assert.equal(dom.callMicToggle.style.getPropertyValue('--mic-glow'), '0.58');
});

test('renderCallSnapshot exposes camera and speaker controls on the call surface', () => {
  const { presenter, dom } = createPresenterHarness({
    stateOverrides: {
      activeCall: true,
      localCameraSnapshot: {
        supported: true,
        enabled: true,
        active: true,
        loading: false,
        permissionState: 'granted',
        status: 'live',
      },
      agentVoiceSnapshot: {
        speechSynthesisSupported: true,
        speakReplies: true,
      },
      productionVoice: {
        loading: false,
        uploading: false,
        backendRunning: true,
        profile: { referenceAvailable: true },
        validationMessage: '',
      },
    },
  });

  presenter.renderCallSnapshot();

  assert.equal(dom.callCameraToggle.disabled, false);
  assert.equal(dom.callSpeakerToggle.disabled, false);
  assert.equal(dom.callSelfCluster.hidden, false);
  assert.equal(dom.callSelfView.hidden, false);
  assert.equal(dom.callSelfView.dataset.state, 'live');
});

test('renderCallSnapshot keeps the mic visibly live while the browser is listening', () => {
  const { presenter, dom } = createPresenterHarness({
    stateOverrides: {
      activeCall: true,
      humanMicLevel: 4,
      humanVoiceSnapshot: {
        recognitionSupported: true,
        listening: true,
      },
      productionVoice: {
        loading: false,
        uploading: false,
        backendRunning: true,
        profile: { referenceAvailable: true },
        validationMessage: '',
      },
    },
  });

  presenter.renderCallSnapshot();

  assert.equal(dom.callMicToggle.dataset.state, 'live');
  assert.equal(dom.callMicToggle.dataset.listening, 'true');
  assert.equal(dom.callMicToggle.dataset.speaking, 'false');
  assert.equal(dom.callMicToggle.disabled, false);
  assert.equal(dom.callMicToggle.style.getPropertyValue('--mic-glow'), '0.04');
});

test('renderCallSnapshot switches the mic to muted while a reply sequence blocks listening', () => {
  const { presenter, dom } = createPresenterHarness({
    stateOverrides: {
      activeCall: true,
      currentTurnId: 'turn-42',
      humanMicLevel: 41,
      humanVoiceSnapshot: {
        recognitionSupported: true,
        listening: false,
      },
      productionVoice: {
        loading: false,
        uploading: false,
        backendRunning: true,
        profile: { referenceAvailable: true },
        validationMessage: '',
      },
    },
    avatarSpeechSnapshot: {
      active: true,
      playbackStarted: true,
      mode: 'speaking',
      currentText: 'Here is the next part.',
    },
  });

  presenter.renderCallSnapshot();

  assert.equal(dom.callMicToggle.dataset.state, 'muted');
  assert.equal(dom.callMicToggle.dataset.listening, 'false');
  assert.equal(dom.callMicToggle.disabled, true);
  assert.equal(dom.callMicToggle.attributes.title, 'Microphone muted while agent is speaking');
  assert.equal(dom.callMicToggle.style.getPropertyValue('--mic-glow'), '0.00');
});

test('renderCallSnapshot shows the deferred-work timer only while background work is still pending', () => {
  const { presenter, dom, state } = createPresenterHarness({
    stateOverrides: {
      activeCall: true,
      deferredIndicator: {
        active: true,
        elapsedSeconds: 37,
        pendingCount: 2,
        tasks: [
          {
            id: 'turn-a',
            label: 'save the airplane report to Google Drive',
            detail: 'Using google drive create file.',
            elapsedSeconds: 37,
            phase: 'using-tool',
          },
          {
            id: 'turn-b',
            label: 'check my Google Calendar availability',
            detail: 'Google Calendar needs reconnecting.',
            elapsedSeconds: 12,
            phase: 'blocked',
            action: {
              kind: 'open-plugin-settings',
              label: 'Reconnect',
              connectorName: 'Google Calendar',
              connectorId: 'connector_1',
              linkId: 'link_1',
            },
          },
        ],
      },
      productionVoice: {
        loading: false,
        uploading: false,
        backendRunning: true,
        profile: { referenceAvailable: true },
        validationMessage: '',
      },
    },
  });

  presenter.renderCallSnapshot();

  assert.equal(dom.callDeferredIndicator.hidden, false);
  assert.match(dom.callDeferredList.innerHTML, /save the airplane report to Google Drive/);
  assert.match(dom.callDeferredList.innerHTML, /Using google drive create file\./);
  assert.match(dom.callDeferredList.innerHTML, /check my Google Calendar availability/);
  assert.match(dom.callDeferredList.innerHTML, /data-action=\"open-plugin-settings\"/);
  assert.match(dom.callDeferredList.innerHTML, /Reconnect/);
  assert.match(dom.callDeferredList.innerHTML, /0:37/);
  assert.match(dom.callDeferredList.innerHTML, /0:12/);

  state.deferredIndicator = {
    active: false,
    elapsedSeconds: 0,
    pendingCount: 0,
    tasks: [],
  };
  presenter.renderCallSnapshot();

  assert.equal(dom.callDeferredIndicator.hidden, true);
  assert.equal(dom.callDeferredList.innerHTML, '');
});

test('renderSubtitles shows chip subtitles only when live transcript content exists', () => {
  const { presenter, dom, state } = createPresenterHarness({
    stateOverrides: {
      transcriptPreview: 'Hello there',
      subtitles: {
        human: { mode: 'listening', text: 'Listening…' },
        agent: { mode: 'speaking', text: 'Thinking…' },
      },
      activeCall: true,
    },
  });

  presenter.renderSubtitles();

  assert.equal(dom.callSubtitleOverlay.hidden, false);
  assert.equal(dom.callSubtitleHuman.hidden, false);
  assert.equal(dom.callSubtitleHuman.textContent, 'Hello there');
  assert.equal(dom.callSubtitleAgent.hidden, false);
  assert.equal(dom.callSubtitleAgent.textContent, 'Thinking…');
});

test('renderTranscriptList keeps history collapsed when the first turn appears', () => {
  const { presenter, dom, state } = createPresenterHarness();
  globalThis.document = {
    createElement() {
      return createElement();
    },
  };

  presenter.renderTranscriptList();
  assert.equal(dom.callLayout.dataset.historyVisible, 'false');
  assert.equal(dom.callLayout.dataset.historyCollapsed, 'true');
  assert.equal(dom.callHistoryPanel.hidden, true);
  assert.equal(dom.callHistoryToggle.disabled, true);

  state.session = {
    turns: [
      {
        source: 'voice',
        createdAt: '2026-05-08T10:00:00.000Z',
        transcript: 'Hi',
        human: { name: 'Human Caller' },
      },
    ],
  };

  presenter.renderTranscriptList();
  assert.equal(dom.callLayout.dataset.historyVisible, 'true');
  assert.equal(dom.callLayout.dataset.historyCollapsed, 'true');
  assert.equal(dom.callHistoryPanel.hidden, true);
  assert.equal(dom.callHistoryToggle.disabled, false);
  assert.equal(dom.callHistoryToggle.attributes.title, 'Show call history');

  delete globalThis.document;
});

test('refreshActionButtons disables Start Call when microphone access is denied', () => {
  const { presenter, dom, state } = createPresenterHarness({
    stateOverrides: {
      humanVoiceSnapshot: {
        recognitionSupported: true,
        status: 'microphone permission denied',
      },
      productionVoice: {
        loading: false,
        uploading: false,
        backendRunning: true,
        profile: { referenceAvailable: true },
        validationMessage: '',
      },
    },
  });

  presenter.refreshActionButtons();

  assert.equal(dom.joinCall.disabled, true);
});

test('renderCallSnapshot clears helper text when start call is ready', () => {
  const { presenter, dom } = createPresenterHarness({
    stateOverrides: {
      productionVoice: {
        loading: false,
        uploading: false,
        backendRunning: true,
        profile: { referenceAvailable: true },
        validationMessage: '',
      },
    },
  });

  presenter.renderCallSnapshot();

  assert.equal(dom.joinCall.attributes.title, 'Start Call');
});

test('renderTranscriptList exposes a collapsed history opener when turns exist', () => {
  const { presenter, dom, state } = createPresenterHarness();
  globalThis.document = {
    createElement() {
      return createElement();
    },
  };

  state.callHistoryCollapsed = true;
  state.session = {
    turns: [
      {
        source: 'voice',
        createdAt: '2026-05-08T10:00:00.000Z',
        transcript: 'Hi',
        human: { name: 'Human Caller' },
      },
    ],
  };

  presenter.renderTranscriptList();

  assert.equal(dom.callLayout.dataset.historyVisible, 'true');
  assert.equal(dom.callLayout.dataset.historyCollapsed, 'true');
  assert.equal(dom.callHistoryPanel.hidden, true);
  assert.equal(dom.callHistoryPanel.dataset.collapsed, 'true');
  assert.equal(dom.callHistoryList.hidden, true);
  assert.equal(dom.callHistoryToggle.hidden, false);
  assert.equal(dom.callHistoryToggle.disabled, false);
  assert.equal(dom.callHistoryToggle.attributes.title, 'Show call history');

  delete globalThis.document;
});

test('renderCallSnapshot shows the stage loading overlay while starting the call', () => {
  const { presenter, dom } = createPresenterHarness({
    stateOverrides: {
      sessionPreparing: true,
      loadingUi: {
        boot: {
          active: false,
          phase: '',
          detail: '',
        },
        call: {
          active: true,
          phase: 'Creating session',
          detail: 'Creating a direct Codex session on the host.',
        },
      },
      productionVoice: {
        loading: false,
        uploading: false,
        backendRunning: true,
        profile: { referenceAvailable: true },
        validationMessage: '',
      },
    },
  });

  presenter.renderCallSnapshot();

  assert.equal(dom.callStageLoading.hidden, false);
  assert.equal(dom.callStageLoadingLabel.textContent, 'Creating session');
  assert.equal(dom.callStageLoadingTip.hidden, false);
  assert.equal(dom.callStageLoadingTip.textContent, 'Creating a direct Codex session on the host.');
  assert.equal(dom.joinCall.attributes.title, 'Starting… · Creating session');
});

test('renderCallSnapshot hides the stage loading overlay once the avatar visual is ready', () => {
  const { presenter, dom } = createPresenterHarness({
    stateOverrides: {
      sessionPreparing: true,
      productionVoice: {
        loading: false,
        uploading: false,
        backendRunning: true,
        profile: { referenceAvailable: true },
        validationMessage: '',
      },
    },
    avatarLayerSnapshot: {
      ready: true,
    },
  });

  presenter.renderCallSnapshot();

  assert.equal(dom.callStageLoading.hidden, true);
});

test('renderCallSnapshot shows a tenths thinking timer beside the call button', () => {
  const { presenter, dom } = createPresenterHarness({
    stateOverrides: {
      activeCall: true,
      processingReplies: true,
      humanMicLevel: 42,
      agentThinkingActive: true,
      agentThinkingElapsedTenths: 32,
      productionVoice: {
        loading: false,
        uploading: false,
        backendRunning: true,
        profile: { referenceAvailable: true },
        validationMessage: '',
      },
    },
  });

  presenter.renderCallSnapshot();

  assert.equal(dom.callThinkingTimer.hidden, false);
  assert.equal(dom.callThinkingTimer.textContent, '3.2s');
  assert.equal(dom.callEmptyState.hidden, true);
  assert.equal(dom.callMicToggle.dataset.state, 'muted');
  assert.equal(dom.callMicToggle.dataset.speaking, 'false');
  assert.equal(dom.callMicToggle.disabled, true);
});

test('renderCallSnapshot hides the thinking timer once playback is active', () => {
  const { presenter, dom } = createPresenterHarness({
    stateOverrides: {
      activeCall: true,
      agentThinkingActive: true,
      agentThinkingElapsedTenths: 18,
      productionVoice: {
        loading: false,
        uploading: false,
        backendRunning: true,
        profile: { referenceAvailable: true },
        validationMessage: '',
      },
    },
    domOverrides: {
      callThinkingTimer: createElement({ hidden: false }),
    },
    avatarSpeechSnapshot: {
      active: true,
      playbackStarted: true,
      mode: 'speaking',
      currentText: 'Hi',
    },
  });

  presenter.renderCallSnapshot();

  assert.equal(dom.callThinkingTimer.hidden, true);
  assert.equal(dom.callThinkingTimer.textContent, '');
});

test('local thinking prompts keep the waiting timer visible until the real reply starts', () => {
  const { presenter, dom } = createPresenterHarness({
    stateOverrides: {
      activeCall: true,
      processingReplies: true,
      agentThinkingActive: true,
      agentThinkingElapsedTenths: 91,
      session: {
        agent: {
          lastError: '',
        },
      },
      subtitles: {
        human: { mode: 'final', text: 'Tell me more.' },
        agent: { mode: 'thinking', text: 'Still with you.' },
      },
      productionVoice: {
        loading: false,
        uploading: false,
        backendRunning: true,
        profile: { referenceAvailable: true },
        validationMessage: '',
      },
    },
    avatarSpeechSnapshot: {
      active: true,
      playbackStarted: true,
      source: 'local-thinking-prompt',
      mode: 'speaking',
      currentText: 'Still with you.',
    },
  });

  presenter.renderCallSnapshot();
  presenter.renderAgentStatus();

  assert.equal(dom.callThinkingTimer.hidden, false);
  assert.equal(dom.callThinkingTimer.textContent, '9.1s');
  assert.equal(dom.callMicToggle.disabled, true);
});

test('startup greeting keeps the mic muted and composer disabled until the hello finishes', () => {
  const { presenter, dom } = createPresenterHarness({
    stateOverrides: {
      activeCall: true,
      startupGreetingActive: true,
      productionVoice: {
        loading: false,
        uploading: false,
        backendRunning: true,
        profile: { referenceAvailable: true },
        validationMessage: '',
      },
      subtitles: {
        human: { mode: 'idle', text: 'Muted for intro.' },
        agent: { mode: 'ready', text: 'Joining…' },
      },
    },
  });

  presenter.renderCallSnapshot();
  presenter.refreshActionButtons();

  assert.equal(dom.callMicToggle.dataset.state, 'muted');
  assert.equal(dom.callMicToggle.disabled, true);
  assert.equal(dom.callMicToggle.attributes.title, 'Microphone muted while agent greets you');
  assert.equal(dom.typedInput.disabled, true);
  assert.equal(dom.sendTyped.disabled, true);
  assert.equal(dom.callCameraToggle.disabled, true);
  assert.equal(dom.callSpeakerToggle.disabled, true);
});

test('startup greeting shows a connecting overlay until hello playback begins', () => {
  const { presenter, dom } = createPresenterHarness({
    stateOverrides: {
      activeCall: true,
      startupGreetingActive: true,
      startupGreetingIndicator: {
        active: true,
        remainingSeconds: 37,
        tipText: 'keep your first question short and direct for the fastest reply',
      },
      productionVoice: {
        loading: false,
        uploading: false,
        backendRunning: true,
        profile: { referenceAvailable: true },
        validationMessage: '',
      },
    },
    avatarSpeechSnapshot: {
      active: false,
      playbackStarted: false,
      source: '',
      mode: 'idle',
      currentText: '',
    },
  });

  presenter.renderCallSnapshot();

  assert.equal(dom.callStageLoading.hidden, false);
  assert.equal(dom.callStageLoadingLabel.textContent, 'Connecting');
  assert.equal(dom.callStageLoadingCountdown.hidden, false);
  assert.equal(dom.callStageLoadingCountdown.textContent, 'Est. 0:37');
  assert.equal(
    dom.callStageLoadingTip.textContent,
    'Tip: keep your first question short and direct for the fastest reply',
  );
  assert.equal(dom.joinCall.attributes.title, 'End Call · Connecting');
});

test('renderCallSnapshot dims the stage during the 3 second goodbye tail after speech ends', () => {
  const { presenter, dom } = createPresenterHarness({
    stateOverrides: {
      activeCall: true,
      endingCall: true,
      callEndingDimmed: true,
      productionVoice: {
        loading: false,
        uploading: false,
        backendRunning: true,
        profile: { referenceAvailable: true },
        validationMessage: '',
      },
    },
    avatarSpeechSnapshot: {
      active: false,
      mode: 'idle',
      currentText: '',
    },
  });

  presenter.renderCallSnapshot();

  assert.equal(dom.callAvatarHost.dataset.agentOnline, 'false');
  assert.equal(dom.callEmptyState.hidden, false);
  assert.equal(dom.callEmptyStateDetail.textContent, 'Ending…');
  assert.equal(dom.joinCall.attributes.title, 'Ending… · Ending call');
});

test('refreshActionButtons disables typed input while the call is inactive', () => {
  const { presenter, dom } = createPresenterHarness({
    stateOverrides: {
      activeCall: false,
    },
  });

  presenter.refreshActionButtons();

  assert.equal(dom.typedInput.disabled, true);
  assert.equal(dom.sendTyped.disabled, true);
});
