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
    callMicToggle: createElement(),
    callAvatarHost: createElement(),
    callStageLoading: createElement({ hidden: true }),
    callEmptyState: createElement({ hidden: false }),
    callEmptyStateTitle: createElement(),
    callEmptyStateDetail: createElement(),
    callSubtitleCombined: createElement(),
    callLayout: createElement(),
    callHistoryPanel: createElement({ hidden: true }),
    callHistoryList: createElement(),
    callHistoryToggle: createElement({ hidden: true }),
    callThinkingTimer: createElement({ hidden: true }),
    ...domOverrides,
  };

  const state = {
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

test('renderSubtitles merges human and agent text into one overlay block', () => {
  const { presenter, dom, state } = createPresenterHarness({
    stateOverrides: {
      transcriptPreview: 'Hello there',
      subtitles: {
        human: { mode: 'listening', text: 'Listening…' },
        agent: { mode: 'thinking', text: 'Thinking…' },
      },
    },
  });

  presenter.renderSubtitles();

  assert.equal(dom.callSubtitleCombined.textContent, 'Me: Hello there\nAgent: Thinking…');
});

test('renderTranscriptList hides history until there are turns', () => {
  const { presenter, dom, state } = createPresenterHarness();
  globalThis.document = {
    createElement() {
      return createElement();
    },
  };

  presenter.renderTranscriptList();
  assert.equal(dom.callLayout.dataset.historyVisible, 'false');
  assert.equal(dom.callHistoryPanel.hidden, true);

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
  assert.equal(dom.callHistoryPanel.hidden, false);

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
  assert.equal(dom.callHistoryToggle.attributes.title, 'Show call history');

  delete globalThis.document;
});

test('renderCallSnapshot shows the stage loading overlay while starting the call', () => {
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
  });

  presenter.renderCallSnapshot();

  assert.equal(dom.callStageLoading.hidden, false);
  assert.equal(dom.joinCall.attributes.title, 'Starting… · Starting session');
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
