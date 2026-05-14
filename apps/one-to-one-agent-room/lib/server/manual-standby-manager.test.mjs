import test from 'node:test';
import assert from 'node:assert/strict';

import { createManualStandbyManager } from './manual-standby-manager.mjs';

function createSessionPayload({
  id,
  metadata,
  standby = {
    status: 'ready',
    requestId: 'warmup-1',
    preparedAt: '2026-05-14T00:00:00.000Z',
    updatedAt: '2026-05-14T00:00:00.000Z',
    error: '',
  },
} = {}) {
  return {
    ok: true,
    session: {
      id,
      title: metadata?.launch?.displayTitle || 'talking-agent',
      state: 'ready',
      metadata,
      standby,
      turns: [],
      metrics: {
        pendingTurns: 0,
        turnCount: 0,
        unplayedReplies: 0,
      },
      human: {
        identity: 'human-caller',
        name: 'Human Caller',
      },
      agent: {
        id: 'codex-openai',
        label: 'Codex OpenAI',
        status: 'idle',
        currentTurnId: null,
        lastReplyAt: null,
        lastError: '',
      },
      avatar: {
        activeModelId: 'bhf-1-2',
        activeModelLabel: 'Red Tinker Bell',
        gestureCatalog: [],
      },
    },
  };
}

function createHarness({
  settings = {
    agentMode: 'standard',
    manualMode: {
      workspaceRoot: '/tmp/workspace-alpha',
    },
    selfProfile: {
      name: '',
      pronouns: '',
      personality: '',
      interests: '',
      selfPrompt: '',
    },
  },
  setup = {
    activeModelId: 'bhf-1-2',
    activeModelLabel: 'Red Tinker Bell',
    enabledPluginIds: ['tool-a'],
    enableControlComputer: true,
    enableComplexTasks: false,
  },
  voiceProfile = {
    id: 'voice-profile-1',
    referenceAvailable: true,
    referenceOriginalFileName: 'voice.wav',
    meloBaseSpeakerId: 'EN-US',
    meloBaseSpeakerLabel: 'English',
  },
} = {}) {
  const calls = [];
  let nextSessionNumber = 1;
  const sessionMetadataById = new Map();
  const discardedSessionIds = [];

  const sessionRuntime = {
    async createSession(payload) {
      const sessionId = `session-${nextSessionNumber++}`;
      sessionMetadataById.set(sessionId, payload.metadata);
      calls.push({
        type: 'createSession',
        sessionId,
        payload,
      });
      return createSessionPayload({
        id: sessionId,
        metadata: payload.metadata,
      });
    },
    async syncSetup({ sessionId, metadata }) {
      sessionMetadataById.set(sessionId, metadata);
      calls.push({
        type: 'syncSetup',
        sessionId,
        metadata,
      });
      return createSessionPayload({
        id: sessionId,
        metadata,
      });
    },
    async prepareSessionStandby({ sessionId }) {
      calls.push({
        type: 'prepareSessionStandby',
        sessionId,
      });
      return createSessionPayload({
        id: sessionId,
        metadata: sessionMetadataById.get(sessionId),
      });
    },
    async discardSession({ sessionId, reason }) {
      discardedSessionIds.push({ sessionId, reason });
      calls.push({
        type: 'discardSession',
        sessionId,
        reason,
      });
      return {
        ok: true,
        sessionId,
      };
    },
    async getSession(sessionId) {
      calls.push({
        type: 'getSession',
        sessionId,
      });
      return createSessionPayload({
        id: sessionId,
        metadata: sessionMetadataById.get(sessionId),
      });
    },
  };

  const manager = createManualStandbyManager({
    sessionRuntime,
    agentSelf: {
      async getSettings() {
        return structuredClone(settings);
      },
    },
    workspaceSetupStore: {
      async loadSetup() {
        return structuredClone(setup);
      },
    },
    productionVoiceProfileStore: {
      async getProfileSummary() {
        return structuredClone(voiceProfile);
      },
    },
    runtimeConfig: {
      appName: 'one-to-one-agent-room',
      appMode: 'app4-direct-codex-session',
      codexProjectName: 'talking-agent',
      codexProjectPath: '/Users/hieu/Work/crea8r/talking-agent',
    },
    persistSessionPayload: async (payload) => {
      calls.push({
        type: 'persistSessionPayload',
        sessionId: payload?.session?.id || '',
      });
    },
    syncSessionCapabilities: async (session) => {
      calls.push({
        type: 'syncSessionCapabilities',
        sessionId: session?.id || '',
      });
    },
  });

  return {
    calls,
    discardedSessionIds,
    manager,
    settings,
  };
}

test('ensureStandby creates and warms a manual standby session using the saved manual workspace root', async () => {
  const harness = createHarness();

  const payload = await harness.manager.ensureStandby();

  assert.equal(payload.session.id, 'session-1');
  assert.equal(payload.session.metadata.launch.mode, 'manual');
  assert.equal(payload.session.metadata.launch.workspaceRoot, '/tmp/workspace-alpha');
  assert.equal(payload.session.metadata.launch.workspaceKey, 'tmp-workspace-alpha');
  assert.deepEqual(
    harness.calls.map((entry) => entry.type),
    [
      'createSession',
      'syncSetup',
      'syncSessionCapabilities',
      'persistSessionPayload',
      'prepareSessionStandby',
      'persistSessionPayload',
    ],
  );
});

test('handleSettingsChanged rebuilds the standby session when the manual workspace root changes', async () => {
  const harness = createHarness();

  await harness.manager.ensureStandby();
  harness.settings.manualMode.workspaceRoot = '/tmp/workspace-beta';

  const payload = await harness.manager.handleSettingsChanged();

  assert.equal(payload.session.id, 'session-2');
  assert.equal(payload.session.metadata.launch.workspaceRoot, '/tmp/workspace-beta');
  assert.deepEqual(
    harness.discardedSessionIds.map((entry) => entry.sessionId),
    ['session-1'],
  );
});

test('claimStandby waits until the active manual call ends before preparing the next standby session', async () => {
  const harness = createHarness();

  const first = await harness.manager.ensureStandby();
  await harness.manager.claimStandby({ sessionId: first.session.id });

  const beforeEndCallCount = harness.calls.filter((entry) => entry.type === 'createSession').length;
  assert.equal(beforeEndCallCount, 1);

  await harness.manager.handleSessionEnded({ sessionId: first.session.id });

  const createCalls = harness.calls.filter((entry) => entry.type === 'createSession');
  assert.equal(createCalls.length, 2);
  assert.equal(createCalls[1].sessionId, 'session-2');
});
