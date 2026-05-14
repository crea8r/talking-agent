import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile } from 'node:fs/promises';

import { createAgentSelf } from './index.mjs';

test('agent self starts in standard mode and persists global settings', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'agent-self-'));
  const agentSelf = createAgentSelf({
    rootDir,
    appId: 'one-to-one-agent-room',
    random: () => 0,
  });

  const defaults = await agentSelf.getSettings();
  assert.equal(defaults.agentMode, 'standard');
  assert.deepEqual(defaults.manualMode, {
    workspaceRoot: '',
  });
  assert.deepEqual(defaults.selfProfile, {
    name: '',
    pronouns: '',
    personality: '',
    interests: '',
    selfPrompt: '',
  });

  const saved = await agentSelf.updateSettings({
    agentMode: 'continuity',
    manualMode: {
      workspaceRoot: '/tmp/workspace-alpha',
    },
    selfProfile: {
      name: 'Moth',
      pronouns: 'they/them',
      personality: 'curious and oblique',
      interests: 'memory, bridges, poems',
      selfPrompt: 'notice repetition and unfinished thoughts',
    },
  });

  assert.equal(saved.agentMode, 'continuity');
  assert.equal(saved.manualMode.workspaceRoot, '/tmp/workspace-alpha');
  assert.equal(saved.selfProfile.name, 'Moth');
  assert.equal(saved.selfProfile.pronouns, 'they/them');

  const reloaded = await agentSelf.getSettings();
  assert.equal(reloaded.agentMode, 'continuity');
  assert.equal(reloaded.manualMode.workspaceRoot, '/tmp/workspace-alpha');
  assert.equal(reloaded.selfProfile.interests, 'memory, bridges, poems');
});

test('agent self returns a short reserve packet in continuity mode using current anchors and journal continuity', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'agent-self-'));
  const agentSelf = createAgentSelf({
    rootDir,
    appId: 'one-to-one-agent-room',
    random: () => 0,
  });

  await agentSelf.updateSettings({
    agentMode: 'continuity',
    selfProfile: {
      name: 'Moth',
      pronouns: '',
      personality: 'quietly observant',
      interests: 'continuity, memory, hidden state',
      selfPrompt: '',
    },
  });

  await agentSelf.completeTurn({
    scopeKey: 'workspace-alpha',
    turnId: 'turn-1',
    userText: 'I want continuity and hidden state across conversations.',
    agentText: 'Keep the hidden state low authority and relevant to the app.',
  });

  const packet = await agentSelf.prepareReserve({
    scopeKey: 'workspace-alpha',
    turnId: 'turn-2',
    text: 'How do we keep that state relevant to the app without drift?',
  });

  assert.ok(packet);
  assert.equal(packet.turnId, 'turn-2');
  assert.equal(packet.dropIfMainReplyStarted, true);
  assert.match(packet.text, /state|continuity|app/i);
  assert.match(packet.kind, /bridge|frame|clarify-seed|option-seed/);
});

test('agent self completes a hidden poem project, saves a txt artifact, and rolls into the next project', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'agent-self-'));
  const agentSelf = createAgentSelf({
    rootDir,
    appId: 'one-to-one-agent-room',
    random: () => 0,
    projectTurnRange: { min: 2, max: 2 },
  });

  await agentSelf.updateSettings({
    agentMode: 'continuity',
    selfProfile: {
      name: 'Moth',
      pronouns: 'they/them',
      personality: 'attentive',
      interests: 'memory, bridges, private history',
      selfPrompt: 'collect motifs without steering the reply',
    },
  });

  await agentSelf.completeTurn({
    scopeKey: 'workspace-alpha',
    turnId: 'turn-1',
    userText: 'We keep talking about memory and bridges in the app.',
    agentText: 'The bridge should stay low authority and hold private history.',
  });

  await agentSelf.completeTurn({
    scopeKey: 'workspace-alpha',
    turnId: 'turn-2',
    userText: 'The hidden state should gather motifs quietly over time.',
    agentText: 'It can keep a poem as private history without changing the main answer.',
  });

  const state = await agentSelf.getWorkspaceState({ scopeKey: 'workspace-alpha' });

  assert.equal(state.project.poemIndex, 2);
  assert.equal(state.project.completedPoemCount, 1);
  assert.ok(Array.isArray(state.completedArtifacts));
  assert.equal(state.completedArtifacts.length, 1);
  assert.ok(state.journal.sensibility.motifBiases.some((entry) => entry.token));

  const artifactPath = state.completedArtifacts[0].artifactPath;
  const poemText = await readFile(artifactPath, 'utf8');
  assert.match(poemText, /memory|bridge|history|motif/i);
});

test('agent self delegates reserve generation and turn processing to an injected async engine', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'agent-self-'));
  const calls = [];
  const agentSelf = createAgentSelf({
    rootDir,
    appId: 'one-to-one-agent-room',
    now: () => new Date('2026-05-11T08:00:00.000Z'),
    engine: {
      async hydrateState(context) {
        return {
          journal: context.journal || {
            scopeKey: context.scopeKey,
            totalTurns: 0,
            completedArtifacts: [],
          },
          project: context.project || {
            poemIndex: 1,
            completedPoemCount: 0,
            phase: 'gathering',
          },
        };
      },
      async prepareReserve(context) {
        calls.push({
          type: 'prepareReserve',
          mode: context.settings.agentMode,
          turnId: context.turnId,
          text: context.text,
        });
        if (context.settings.agentMode !== 'continuity') {
          return null;
        }
        return {
          turnId: context.turnId,
          kind: 'frame',
          text: 'Injected reserve output.',
          mood: 'focused',
          notBeforeMs: 111,
          expiresAtMs: 222,
          dropIfMainReplyStarted: true,
        };
      },
      async completeTurn(context) {
        calls.push({
          type: 'completeTurn',
          mode: context.settings.agentMode,
          turnId: context.turnId,
          userText: context.userText,
          agentText: context.agentText,
        });
        return {
          journal: {
            ...context.journal,
            totalTurns: context.journal.totalTurns + 1,
            updatedAt: '2026-05-11T08:00:00.000Z',
          },
          project: {
            ...context.project,
            phase: 'shaping',
          },
          completedArtifacts: [
            {
              type: 'poem',
              poemIndex: 1,
              slug: 'injected-history',
              content: 'Injected private poem.',
            },
          ],
        };
      },
    },
  });

  const standardPacket = await agentSelf.prepareReserve({
    scopeKey: 'workspace-alpha',
    turnId: 'turn-standard',
    text: 'A standard mode turn still reaches the engine.',
  });
  assert.equal(standardPacket, null);
  assert.deepEqual(calls[0], {
    type: 'prepareReserve',
    mode: 'standard',
    turnId: 'turn-standard',
    text: 'A standard mode turn still reaches the engine.',
  });

  await agentSelf.updateSettings({
    agentMode: 'continuity',
  });

  const continuityPacket = await agentSelf.prepareReserve({
    scopeKey: 'workspace-alpha',
    turnId: 'turn-continuity',
    text: 'A continuity turn should return engine output.',
  });
  assert.equal(continuityPacket?.text, 'Injected reserve output.');

  await agentSelf.completeTurn({
    scopeKey: 'workspace-alpha',
    turnId: 'turn-complete',
    userText: 'Collect this line.',
    agentText: 'And keep it private.',
  });

  const state = await agentSelf.getWorkspaceState({ scopeKey: 'workspace-alpha' });
  assert.equal(state.journal.totalTurns, 1);
  assert.equal(state.project.phase, 'shaping');
  assert.equal(state.completedArtifacts.length, 1);
  assert.match(state.completedArtifacts[0].artifactPath, /injected-history-1\.txt$/);
  const artifactText = await readFile(state.completedArtifacts[0].artifactPath, 'utf8');
  assert.equal(artifactText, 'Injected private poem.');
  assert.equal(calls[2]?.type, 'completeTurn');
  assert.equal(calls[2]?.mode, 'continuity');
});
