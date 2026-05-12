import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_API_URL = 'http://127.0.0.1:4384';
const DEFAULT_VOICE_PAUSE_FINALIZE_MS = 1200;
const LOCAL_SESSION_SNAPSHOT_FILE = 'session-report.json';

function normalizeString(value = '') {
  return `${value || ''}`.trim();
}

function parseTimestamp(value) {
  const normalized = normalizeString(value);
  if (!normalized) {
    return null;
  }

  const timestampMs = Date.parse(normalized);
  return Number.isFinite(timestampMs) ? timestampMs : null;
}

function formatDurationMs(durationMs) {
  if (!Number.isFinite(durationMs)) {
    return 'n/a';
  }
  if (durationMs < 1000) {
    return `${Math.max(0, Math.round(durationMs))}ms`;
  }
  return `${(durationMs / 1000).toFixed(durationMs % 1000 === 0 ? 0 : 2)}s`;
}

function getEventTime(event) {
  return parseTimestamp(event?.at);
}

function buildAudioKey({ kind = '', turnId = '', source = '', text = '' } = {}) {
  if (normalizeString(kind) === 'reply') {
    return `reply:${normalizeString(turnId)}`;
  }
  return [
    normalizeString(kind),
    normalizeString(source),
    normalizeString(text),
  ].join('|');
}

function buildReplyLookup(session = {}) {
  const lookup = new Map();
  for (const turn of Array.isArray(session.turns) ? session.turns : []) {
    if (turn?.id && turn?.agentReply) {
      lookup.set(turn.id, turn.agentReply);
    }
  }
  return lookup;
}

function buildAudioLifecycle(session = {}) {
  const replyLookup = buildReplyLookup(session);
  const sessionEvents = Array.isArray(session.events) ? session.events.slice() : [];
  const syntheticEvents = [];

  for (const turn of Array.isArray(session.turns) ? session.turns : []) {
    const reply = turn?.agentReply;
    if (!reply || !turn?.id) {
      continue;
    }

    const hasReplyStartEvent = sessionEvents.some(
      (event) =>
        event?.type === 'audio.started' &&
        event?.details?.kind === 'reply' &&
        normalizeString(event?.details?.turnId) === turn.id,
    );
    if (!hasReplyStartEvent && normalizeString(reply.playbackStartedAt)) {
      syntheticEvents.push({
        at: reply.playbackStartedAt,
        type: 'audio.started',
        details: {
          kind: 'reply',
          source: 'codex-turn',
          turnId: turn.id,
          text: normalizeString(reply.text),
        },
      });
    }

    const hasReplyEndEvent = sessionEvents.some(
      (event) =>
        event?.type === 'audio.ended' &&
        event?.details?.kind === 'reply' &&
        normalizeString(event?.details?.turnId) === turn.id,
    );
    if (!hasReplyEndEvent && normalizeString(reply.playedAt)) {
      syntheticEvents.push({
        at: reply.playedAt,
        type: 'audio.ended',
        details: {
          kind: 'reply',
          source: 'codex-turn',
          turnId: turn.id,
          text: normalizeString(reply.text),
        },
      });
    }
  }

  const lifecycleEvents = [...sessionEvents, ...syntheticEvents]
    .filter((event) => event?.type === 'audio.started' || event?.type === 'audio.ended')
    .map((event) => {
      const details = event.details || {};
      const turnId = normalizeString(details.turnId);
      const reply = turnId ? replyLookup.get(turnId) || null : null;
      const text = normalizeString(details.text) || normalizeString(reply?.text);
      return {
        at: normalizeString(event.at),
        atMs: getEventTime(event),
        type: event.type,
        kind: normalizeString(details.kind),
        source: normalizeString(details.source),
        turnId,
        text,
      };
    })
    .filter((event) => Number.isFinite(event.atMs))
    .sort((left, right) => left.atMs - right.atMs);

  const outputs = [];
  const pendingByKey = new Map();

  for (const event of lifecycleEvents) {
    const key = buildAudioKey(event);
    if (event.type === 'audio.started') {
      const output = {
        kind: event.kind,
        source: event.source,
        turnId: event.turnId,
        text: event.text,
        startedAt: event.at,
        startedAtMs: event.atMs,
        endedAt: '',
        endedAtMs: null,
      };
      outputs.push(output);
      const queue = pendingByKey.get(key) || [];
      queue.push(output);
      pendingByKey.set(key, queue);
      continue;
    }

    const queue = pendingByKey.get(key) || [];
    const match = queue.shift() || null;
    if (!queue.length) {
      pendingByKey.delete(key);
    } else {
      pendingByKey.set(key, queue);
    }
    if (match) {
      match.endedAt = event.at;
      match.endedAtMs = event.atMs;
    }
  }

  return outputs;
}

function inferUserFinishedAtMs(turn = {}, acceptedAtMs, voicePauseFinalizeMs) {
  if (!Number.isFinite(acceptedAtMs)) {
    return null;
  }
  return normalizeString(turn?.source) === 'voice'
    ? acceptedAtMs - voicePauseFinalizeMs
    : acceptedAtMs;
}

export function buildSessionExperienceReport(
  session = {},
  { voicePauseFinalizeMs = DEFAULT_VOICE_PAUSE_FINALIZE_MS } = {},
) {
  const outputs = buildAudioLifecycle(session);
  const turns = Array.isArray(session.turns) ? session.turns : [];
  const intervals = turns.map((turn, index) => {
    const acceptedAtMs = parseTimestamp(turn?.createdAt);
    const nextAcceptedAtMs =
      index + 1 < turns.length ? parseTimestamp(turns[index + 1]?.createdAt) : Number.POSITIVE_INFINITY;
    const userFinishedAtMs = inferUserFinishedAtMs(turn, acceptedAtMs, voicePauseFinalizeMs);
    const intervalOutputs = outputs
      .filter((output) => output.startedAtMs >= acceptedAtMs && output.startedAtMs < nextAcceptedAtMs)
      .sort((left, right) => left.startedAtMs - right.startedAtMs);

    let previousBoundaryMs = userFinishedAtMs;
    const outputsWithSilence = intervalOutputs.map((output) => {
      const silentBeforeStartMs = Number.isFinite(previousBoundaryMs)
        ? Math.max(0, output.startedAtMs - previousBoundaryMs)
        : null;
      if (Number.isFinite(output.endedAtMs)) {
        previousBoundaryMs = output.endedAtMs;
      } else {
        previousBoundaryMs = output.startedAtMs;
      }
      return {
        ...output,
        silentBeforeStartMs,
      };
    });

    const firstAudio = outputsWithSilence[0] || null;
    const speculativeSpeechTexts = [];
    for (const output of outputsWithSilence) {
      if (output.kind === 'speculative' && output.text && !speculativeSpeechTexts.includes(output.text)) {
        speculativeSpeechTexts.push(output.text);
      }
    }

    return {
      turnId: normalizeString(turn?.id),
      userText: normalizeString(turn?.transcript),
      source: normalizeString(turn?.source) || 'voice',
      acceptedAt: normalizeString(turn?.createdAt),
      acceptedAtMs,
      inferredUserFinishedAtMs: userFinishedAtMs,
      waitToFirstAudioMs: firstAudio && Number.isFinite(userFinishedAtMs)
        ? Math.max(0, firstAudio.startedAtMs - userFinishedAtMs)
        : null,
      outputs: outputsWithSilence,
      audioReplyCount: outputsWithSilence.length,
      speculativeSpeechTexts,
    };
  });

  return {
    sessionId: normalizeString(session?.id),
    state: normalizeString(session?.state),
    assumptions: {
      voicePauseFinalizeMs,
      note:
        'Voice turns infer the user-finished timestamp as acceptedAt minus the configured pause-finalize delay.',
    },
    intervals,
  };
}

export function formatSessionExperienceReport(report) {
  const lines = [];
  lines.push(`Session: ${report.sessionId || 'unknown'} (${report.state || 'unknown'})`);
  lines.push(
    `Assumption: user-finished time for voice turns is acceptedAt - ${report.assumptions.voicePauseFinalizeMs}ms.`,
  );
  lines.push('');

  report.intervals.forEach((interval, index) => {
    lines.push(`${index + 1}. user text: ${interval.userText || '(empty)'}`);
    lines.push(`   outputs before next user turn: ${interval.audioReplyCount}`);
    lines.push(`   wait to first audio: ${formatDurationMs(interval.waitToFirstAudioMs)}`);
    if (interval.speculativeSpeechTexts.length) {
      lines.push(`   speculative speech: ${interval.speculativeSpeechTexts.join(' | ')}`);
    } else {
      lines.push('   speculative speech: none');
    }
    if (!interval.outputs.length) {
      lines.push('   audio timeline: none');
      return;
    }
    const timeline = interval.outputs
      .map((output) => {
        const text = output.text ? ` "${output.text}"` : '';
        return `${output.kind}${text} after ${formatDurationMs(output.silentBeforeStartMs)} silence`;
      })
      .join('; ');
    lines.push(`   audio timeline: ${timeline}`);
  });

  return lines.join('\n');
}

export async function resolveLatestSessionId({ repoRoot = DEFAULT_REPO_ROOT } = {}) {
  const outputRoot = path.join(repoRoot, 'output', 'one-to-one-agent-room-codex');
  const entries = await fs.readdir(outputRoot, { withFileTypes: true });
  const directories = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const fullPath = path.join(outputRoot, entry.name);
        const stats = await fs.stat(fullPath);
        return {
          name: entry.name,
          mtimeMs: stats.mtimeMs,
        };
      }),
  );
  const latest = directories.sort((left, right) => right.mtimeMs - left.mtimeMs)[0] || null;
  if (!latest) {
    throw new Error(`No session output directories found under ${outputRoot}`);
  }
  return latest.name;
}

export async function loadSessionFromLocalOutput(
  sessionId,
  { repoRoot = DEFAULT_REPO_ROOT } = {},
) {
  const normalizedSessionId = normalizeString(sessionId);
  if (!normalizedSessionId) {
    throw new Error('Session id is required.');
  }

  const snapshotPath = path.join(
    repoRoot,
    'output',
    'one-to-one-agent-room-codex',
    normalizedSessionId,
    LOCAL_SESSION_SNAPSHOT_FILE,
  );
  const raw = await fs.readFile(snapshotPath, 'utf8');
  const payload = JSON.parse(raw);
  if (payload?.session) {
    return payload.session;
  }
  return payload;
}

export async function loadSessionFromApi(sessionId, { apiUrl = DEFAULT_API_URL } = {}) {
  const normalizedSessionId = normalizeString(sessionId);
  if (!normalizedSessionId) {
    throw new Error('Session id is required.');
  }

  let response;
  try {
    response = await fetch(
      `${normalizeString(apiUrl).replace(/\/$/, '')}/api/call/sessions/${encodeURIComponent(normalizedSessionId)}`,
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'fetch failed';
    throw new Error(
      `Unable to reach the room API at ${apiUrl} for session ${normalizedSessionId}: ${reason}. Run the script while the room server is still up or pass --file with a saved session payload.`,
    );
  }

  const payload = await response.json();
  if (!response.ok || payload?.ok === false || !payload?.session) {
    throw new Error(
      payload?.error ||
        `Unable to load session ${normalizedSessionId}. Run the script while the room server is still up or pass --file with a saved session payload.`,
    );
  }
  return payload.session;
}

export async function loadSessionFromFile(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  const payload = JSON.parse(raw);
  if (payload?.session) {
    return payload.session;
  }
  return payload;
}

function parseArgs(argv = []) {
  const options = {
    apiUrl: DEFAULT_API_URL,
    filePath: '',
    json: false,
    sessionId: '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--api-url') {
      options.apiUrl = argv[index + 1] || DEFAULT_API_URL;
      index += 1;
      continue;
    }
    if (arg === '--file') {
      options.filePath = argv[index + 1] || '';
      index += 1;
      continue;
    }
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (!options.sessionId) {
      options.sessionId = arg;
    }
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(
      'Usage: node scripts/one-to-one-agent-room-session-report.mjs [session-id] [--api-url URL] [--file path/to/session.json] [--json]',
    );
    process.exitCode = 0;
    return;
  }

  let session = null;
  if (options.filePath) {
    session = await loadSessionFromFile(path.resolve(options.filePath));
  } else {
    const sessionId = options.sessionId || (await resolveLatestSessionId());
    try {
      session = await loadSessionFromLocalOutput(sessionId);
    } catch {
      session = await loadSessionFromApi(sessionId, { apiUrl: options.apiUrl });
    }
  }

  const report = buildSessionExperienceReport(session);
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(formatSessionExperienceReport(report));
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMainModule) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : `${error || ''}`);
    process.exitCode = 1;
  });
}
