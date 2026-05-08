import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCallSessionKey,
  buildCallSessionPayload,
  buildDefaultCallForm,
  getCallPrimaryAction,
  getCallTitle,
  normalizeSessionForUi,
} from './call-session.js';

test('buildDefaultCallForm keeps only human defaults and production voice fields', () => {
  const form = buildDefaultCallForm();

  assert.equal(form.humanIdentity, 'human-caller');
  assert.equal(form.participantName, 'Human Caller');
  assert.equal(form.humanLocale, 'en-US');
  assert.equal(form.voiceSampleFileName, '');
  assert.equal(form.voiceSampleProfileId, '');
  assert.equal(form.voiceSampleStatus, 'missing');
});

test('buildCallSessionPayload describes the direct codex voice-avatar contract', () => {
  const payload = buildCallSessionPayload(
    {
      humanIdentity: 'human-caller',
      participantName: 'Human Caller',
      bundledModelId: 'bhf-1-2',
      humanLocale: 'en-US',
      voiceSampleFileName: 'reference.wav',
      voiceSampleProfileId: 'profile-123',
      voiceSampleStatus: 'ready',
      voiceSampleSpeakerId: 'EN-US',
      voiceSampleSpeakerLabel: 'EN-US',
    },
    {
      codexProjectName: 'talking-agent',
      appMode: 'app4-direct-codex-session',
    },
    {
      mode: 'linked-call',
      autoStart: true,
      launchId: 'launch-123',
      originalSessionId: 'session-original',
      callSessionId: 'session-call',
      workspaceRoot: '/tmp/workspace-alpha',
      displayTitle: 'workspace-alpha',
      linkedSessionId: 'session-42',
    },
  );

  assert.equal(payload.metadata.callMode, 'direct-codex-voice-avatar');
  assert.equal(payload.title, 'workspace-alpha');
  assert.equal(payload.metadata.agentSetup.voiceSampleFileName, 'reference.wav');
  assert.equal(payload.metadata.agentSetup.voiceSampleProfileId, 'profile-123');
  assert.equal(payload.metadata.agentSetup.activeModelId, 'bhf-1-2');
  assert.equal(payload.metadata.launch.mode, 'linked-call');
  assert.equal(payload.metadata.launch.autoStart, true);
  assert.equal(payload.metadata.launch.launchId, 'launch-123');
  assert.equal(payload.metadata.launch.originalSessionId, 'session-original');
  assert.equal(payload.metadata.launch.callSessionId, 'session-call');
  assert.equal(payload.metadata.launch.workspaceRoot, '/tmp/workspace-alpha');
  assert.equal(payload.metadata.launch.linkedSessionId, 'session-42');
  assert.equal(payload.metadata.codexContract.turnRoute, '/api/call/sessions/:id/turns');
  assert.equal(payload.metadata.runtimeHints.directCodexExec, true);
  assert.equal(payload.metadata.runtimeHints.browserSpeechSynthesis, false);
});

test('buildCallSessionKey changes when the workspace scope changes', () => {
  const runtimeConfig = { codexProjectName: 'talking-agent' };
  const alpha = buildCallSessionKey(
    {
      humanIdentity: 'human-caller',
      participantName: 'Human Caller',
      bundledModelId: 'bhf-1-2',
      voiceSampleProfileId: 'profile-alpha',
    },
    runtimeConfig,
    {
      workspaceRoot: '/tmp/workspace-alpha',
    },
  );
  const beta = buildCallSessionKey(
    {
      humanIdentity: 'human-caller',
      participantName: 'Human Caller',
      bundledModelId: 'fbf-1-0',
      voiceSampleProfileId: 'profile-beta',
    },
    runtimeConfig,
    {
      workspaceRoot: '/tmp/workspace-beta',
    },
  );

  assert.notEqual(alpha, beta);
});

test('getCallPrimaryAction blocks start-call until recognition, production voice, and codex are ready', () => {
  assert.deepEqual(
    getCallPrimaryAction({
      activeCall: false,
      sessionPreparing: false,
      modelLoading: false,
      recognitionSupported: true,
      setupReady: true,
      productionVoiceReady: true,
      codexReady: false,
    }),
    {
      mode: 'start-call',
      label: 'Start Call',
      disabled: true,
    },
  );

  assert.deepEqual(
    getCallPrimaryAction({
      activeCall: false,
      sessionPreparing: false,
      modelLoading: false,
      recognitionSupported: true,
      setupReady: true,
      productionVoiceReady: true,
      codexReady: true,
    }),
    {
      mode: 'start-call',
      label: 'Start Call',
      disabled: false,
    },
  );
});

test('getCallPrimaryAction keeps start-call available while the idle avatar visual is still loading', () => {
  assert.deepEqual(
    getCallPrimaryAction({
      activeCall: false,
      sessionPreparing: false,
      modelLoading: true,
      recognitionSupported: true,
      setupReady: true,
      productionVoiceReady: true,
      codexReady: true,
    }),
    {
      mode: 'start-call',
      label: 'Start Call',
      disabled: false,
    },
  );
});

test('normalizeSessionForUi supplies default agent metadata and numeric metrics', () => {
  const normalized = normalizeSessionForUi({
    id: 'session-1',
    agent: {
      id: '',
      label: '',
      status: '',
      currentTurnId: '',
      lastReplyAt: '',
      lastError: '',
    },
    metrics: {
      pendingTurns: '2',
      turnCount: '3',
      unplayedReplies: '1',
    },
  });

  assert.equal(normalized.agent.id, 'codex-openai');
  assert.equal(normalized.agent.label, 'Codex OpenAI');
  assert.equal(normalized.agent.status, 'idle');
  assert.equal(normalized.metrics.pendingTurns, 2);
  assert.equal(normalized.metrics.turnCount, 3);
  assert.equal(normalized.metrics.unplayedReplies, 1);
});

test('getCallTitle prefers the live session title and falls back to the project title', () => {
  assert.equal(
    getCallTitle({ title: 'workspace-alpha' }, { codexProjectName: 'talking-agent' }),
    'workspace-alpha',
  );
  assert.equal(getCallTitle(null, { codexProjectName: 'talking-agent' }), 'talking-agent');
});
