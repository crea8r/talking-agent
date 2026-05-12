import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  buildSessionExperienceReport,
  loadSessionFromLocalOutput,
} from './one-to-one-agent-room-session-report.mjs';

test('buildSessionExperienceReport reconstructs user-facing audio between human turns', () => {
  const session = {
    id: 'session-1',
    state: 'ended',
    turns: [
      {
        id: 'turn-1',
        createdAt: '2026-05-11T01:00:01.450Z',
        source: 'voice',
        transcript: 'Tell me about weekend cars',
        agentReply: {
          text: 'You could go small and playful.',
          playbackStartedAt: '2026-05-11T01:00:04.900Z',
          playedAt: '2026-05-11T01:00:06.100Z',
        },
      },
      {
        id: 'turn-2',
        createdAt: '2026-05-11T01:00:10.450Z',
        source: 'voice',
        transcript: 'What about long drives',
        agentReply: {
          text: 'Comfort matters more there.',
          playbackStartedAt: '2026-05-11T01:00:13.550Z',
          playedAt: '2026-05-11T01:00:14.650Z',
        },
      },
    ],
    events: [
      {
        at: '2026-05-11T01:00:02.000Z',
        type: 'audio.started',
        details: {
          kind: 'thinking',
          source: 'local-thinking-prompt',
          text: 'One moment.',
        },
      },
      {
        at: '2026-05-11T01:00:02.700Z',
        type: 'audio.ended',
        details: {
          kind: 'thinking',
          source: 'local-thinking-prompt',
          text: 'One moment.',
        },
      },
      {
        at: '2026-05-11T01:00:03.200Z',
        type: 'audio.started',
        details: {
          kind: 'speculative',
          source: 'speculative-turn',
          text: 'Maybe a small roadster.',
        },
      },
      {
        at: '2026-05-11T01:00:03.900Z',
        type: 'audio.ended',
        details: {
          kind: 'speculative',
          source: 'speculative-turn',
          text: 'Maybe a small roadster.',
        },
      },
      {
        at: '2026-05-11T01:00:04.900Z',
        type: 'audio.started',
        details: {
          kind: 'reply',
          source: 'codex-turn',
          turnId: 'turn-1',
        },
      },
      {
        at: '2026-05-11T01:00:06.100Z',
        type: 'audio.ended',
        details: {
          kind: 'reply',
          source: 'codex-turn',
          turnId: 'turn-1',
        },
      },
      {
        at: '2026-05-11T01:00:06.100Z',
        type: 'reply.played',
        details: {
          turnId: 'turn-1',
        },
      },
    ],
  };

  const report = buildSessionExperienceReport(session, {
    voicePauseFinalizeMs: 450,
  });
  assert.equal(report.intervals.length, 2);
  assert.equal(report.intervals[0].waitToFirstAudioMs, 1000);
  assert.equal(report.intervals[0].outputs.length, 3);
  assert.equal(report.intervals[0].outputs[0].kind, 'thinking');
  assert.equal(report.intervals[0].outputs[0].silentBeforeStartMs, 1000);
  assert.equal(report.intervals[0].outputs[1].kind, 'speculative');
  assert.equal(report.intervals[0].outputs[1].silentBeforeStartMs, 500);
  assert.equal(report.intervals[0].outputs[2].kind, 'reply');
  assert.equal(report.intervals[0].outputs[2].silentBeforeStartMs, 1000);
  assert.deepEqual(report.intervals[0].speculativeSpeechTexts, ['Maybe a small roadster.']);
});

test('loadSessionFromLocalOutput loads a persisted session snapshot without the live room API', async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'one-to-one-report-'));
  const sessionId = 'session-local';
  const sessionDir = path.join(
    repoRoot,
    'output',
    'one-to-one-agent-room-codex',
    sessionId,
  );
  await mkdir(sessionDir, { recursive: true });
  await writeFile(
    path.join(sessionDir, 'session-report.json'),
    JSON.stringify({
      session: {
        id: sessionId,
        state: 'ended',
        turns: [],
        events: [],
      },
    }),
    'utf8',
  );

  const session = await loadSessionFromLocalOutput(sessionId, { repoRoot });
  assert.equal(session.id, sessionId);
  assert.equal(session.state, 'ended');
});
