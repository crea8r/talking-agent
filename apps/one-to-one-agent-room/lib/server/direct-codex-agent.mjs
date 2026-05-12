import { randomUUID } from 'node:crypto';

const DEFAULT_MOODS = new Set(['neutral', 'warm', 'focused', 'playful']);

function normalizeString(value) {
  return `${value || ''}`.trim();
}

function getCapabilityPolicy(session = {}) {
  const policy = session?.metadata?.agentSetup?.codexCapabilityPolicy;
  return policy && typeof policy === 'object' ? policy : {};
}

function getAgentIdentity(session = {}) {
  const identity = session?.metadata?.agentIdentity;
  return identity && typeof identity === 'object' ? identity : {};
}

function buildAgentIdentityPromptLines(session = {}) {
  const identity = getAgentIdentity(session);
  const lines = [];
  const name = normalizeString(identity.name);
  const pronouns = normalizeString(identity.pronouns);
  const personality = normalizeString(identity.personality);
  const interests = normalizeString(identity.interests);
  const selfPrompt = normalizeString(identity.selfPrompt);

  if (!name && !pronouns && !personality && !interests && !selfPrompt) {
    return [];
  }

  lines.push('Spoken agent identity:');
  if (name) {
    lines.push(`Name: ${name}`);
    lines.push(`If the human asks your name, answer with ${name}.`);
  }
  if (pronouns) {
    lines.push(`Pronouns: ${pronouns}`);
  }
  if (personality) {
    lines.push(`Personality: ${personality}`);
  }
  if (interests) {
    lines.push(`Interests: ${interests}`);
  }
  if (selfPrompt) {
    lines.push(`Private self cue: ${selfPrompt}`);
  }
  lines.push(
    'Use the spoken agent identity when the human asks who you are, your name, pronouns, personality, or interests.',
  );
  lines.push(
    'Treat the character model as visual appearance only, not your spoken name, unless the human explicitly asks about the avatar or model.',
  );
  return lines;
}

function formatHistory(turns = [], maxTurns = 6) {
  return turns
    .slice(-maxTurns)
    .flatMap((turn) => {
      const lines = [];
      const userText = normalizeString(turn?.transcript);
      const replyText = normalizeString(turn?.agentReply?.text);

      if (userText) {
        lines.push(`Human: ${userText}`);
      }
      if (replyText) {
        lines.push(`Agent: ${replyText}`);
      }
      return lines;
    })
    .join('\n');
}

function formatGestureCatalog(gestures = []) {
  return gestures
    .map((gesture) => {
      const description = normalizeString(gesture.description || gesture.intent || '');
      const bestFor = Array.isArray(gesture.bestFor) ? gesture.bestFor.slice(0, 4).join(', ') : '';
      const suffix = [description, bestFor ? `best for ${bestFor}` : ''].filter(Boolean).join('; ');
      return `- ${gesture.id}${suffix ? `: ${suffix}` : ''}`;
    })
    .join('\n');
}

function buildReplyContractText() {
  return [
    'Return exactly one JSON object and nothing else.',
    'Use this shape:',
    '{"spokenText":"...","subtitle":"...","mood":"warm","animationSequence":[{"gestureId":"Greeting","atRatio":0.0}],"followUps":[{"spokenText":"...","subtitle":"...","mood":"warm","pauseMs":1200,"animationSequence":[{"gestureId":"Pose","atRatio":0.2}]}]}',
    'Rules:',
    '- spokenText is required and should be natural spoken English only.',
    '- subtitle is required and should match spokenText closely.',
    '- mood must be one of neutral, warm, focused, or playful.',
    '- animationSequence may contain 0 to 3 beats.',
    '- Each beat must use only a gestureId from the available gesture list and an atRatio between 0 and 1.',
    '- followUps is optional and may contain 0 to 7 additional spoken segments.',
    '- Use followUps when the human explicitly asks for spaced delivery, multiple separate replies, or a countdown-like sequence.',
    '- Also use followUps when the answer is a long list, plan, or explanation that would sound too slow or dense as one block.',
    '- When you use followUps for a long answer, keep each segment short and easy to speak cleanly.',
    '- When followUps is present, spokenText is the first spoken segment and each follow-up pauseMs is the silence before that next segment begins.',
    '- Do not use markdown, code fences, or explanations.',
  ].join('\n');
}

function isLinkedCallLaunch(launch = {}) {
  return (
    normalizeString(launch?.mode) === 'linked-call' &&
    normalizeString(launch?.launchId) &&
    normalizeString(launch?.callSessionId)
  );
}

export function buildInitialTurnPrompt({ session, turn } = {}) {
  const agentSetup = session?.metadata?.agentSetup || {};
  const historyBlock = formatHistory(
    (session?.turns || []).filter((entry) => entry.id !== turn?.id && entry.agentReply),
  );
  const gestureBlock = formatGestureCatalog(session?.avatar?.gestureCatalog || []);
  const identityBlock = buildAgentIdentityPromptLines(session);

  return [
    'You are the speaking avatar agent inside the one-to-one agent room.',
    'This is a live voice call with one human and one agent avatar.',
    'The human cannot see internal reasoning. Reply naturally, briefly, and conversationally.',
    'Keep each reply to one to three short sentences.',
    ...identityBlock,
    `Character model: ${normalizeString(session?.avatar?.activeModelLabel || session?.avatar?.activeModelId || 'Default avatar')}`,
    `Voice sample file: ${normalizeString(agentSetup.voiceSampleFileName || 'unknown')}`,
    `Voice sample speaker: ${normalizeString(agentSetup.voiceSampleSpeakerLabel || 'unknown')}`,
    buildReplyContractText(),
    gestureBlock ? 'Available gesture ids:' : '',
    gestureBlock,
    historyBlock ? 'Recent conversation:' : '',
    historyBlock,
    `Human: ${normalizeString(turn?.transcript)}`,
    'Agent JSON:',
  ].filter(Boolean).join('\n');
}

export function buildResumeTurnPrompt({ session, turn } = {}) {
  const gestureBlock = formatGestureCatalog(session?.avatar?.gestureCatalog || []);
  const identityBlock = buildAgentIdentityPromptLines(session);

  return [
    'Continue the same live voice call.',
    'Reply naturally, briefly, and conversationally.',
    ...identityBlock,
    buildReplyContractText(),
    gestureBlock ? 'Available gesture ids:' : '',
    gestureBlock,
    `Current character model: ${normalizeString(session?.avatar?.activeModelLabel || session?.avatar?.activeModelId || 'Default avatar')}`,
    `Human: ${normalizeString(turn?.transcript)}`,
    'Agent JSON:',
  ].filter(Boolean).join('\n');
}

export function buildSpeculativeTurnPrompt({ session, transcript = '' } = {}) {
  const agentSetup = session?.metadata?.agentSetup || {};
  const historyBlock = formatHistory(session?.turns || []);
  const gestureBlock = formatGestureCatalog(session?.avatar?.gestureCatalog || []);
  const identityBlock = buildAgentIdentityPromptLines(session);

  return [
    'You are the speaking avatar agent inside the one-to-one agent room.',
    'This is a live voice call with one human and one agent avatar.',
    'You are hearing a partial transcript while the human may still be speaking.',
    'Reply with one very short spoken line that keeps the exchange natural and engaged.',
    'Do not give a final answer, do not claim the work is complete, and do not make irreversible commitments.',
    'Prefer low-commitment acknowledgments, framing, or a brief preview of direction.',
    ...identityBlock,
    `Character model: ${normalizeString(session?.avatar?.activeModelLabel || session?.avatar?.activeModelId || 'Default avatar')}`,
    `Voice sample file: ${normalizeString(agentSetup.voiceSampleFileName || 'unknown')}`,
    `Voice sample speaker: ${normalizeString(agentSetup.voiceSampleSpeakerLabel || 'unknown')}`,
    buildReplyContractText(),
    gestureBlock ? 'Available gesture ids:' : '',
    gestureBlock,
    historyBlock ? 'Recent conversation:' : '',
    historyBlock,
    `Human partial transcript so far: ${normalizeString(transcript)}`,
    'Agent JSON:',
  ].filter(Boolean).join('\n');
}

function buildWarmupPrompt({ session } = {}) {
  const agentSetup = session?.metadata?.agentSetup || {};
  const gestureBlock = formatGestureCatalog(session?.avatar?.gestureCatalog || []);
  const identityBlock = buildAgentIdentityPromptLines(session);

  return [
    'You are preparing for the next live voice call turn inside the one-to-one agent room.',
    'No human has spoken yet.',
    'Load the spoken agent identity, visual character, and response contract for the upcoming call.',
    'Do not greet the human, ask a question, or continue the conversation.',
    ...identityBlock,
    `Character model: ${normalizeString(session?.avatar?.activeModelLabel || session?.avatar?.activeModelId || 'Default avatar')}`,
    `Voice sample file: ${normalizeString(agentSetup.voiceSampleFileName || 'unknown')}`,
    `Voice sample speaker: ${normalizeString(agentSetup.voiceSampleSpeakerLabel || 'unknown')}`,
    buildReplyContractText(),
    gestureBlock ? 'Available gesture ids:' : '',
    gestureBlock,
    'Return exactly this JSON and nothing else:',
    '{"spokenText":"Ready.","subtitle":"Ready.","mood":"warm","animationSequence":[{"gestureId":"Pose","atRatio":0.0}]}',
  ].filter(Boolean).join('\n');
}

export function buildCallSummaryPrompt({ session, reason = '' } = {}) {
  const historyBlock = formatHistory(session?.turns || [], 10);
  return [
    'Create a short summary of the voice call and nothing else.',
    'Rules:',
    '- Return plain text only.',
    '- Keep it to 2 or 3 short sentences.',
    '- Mention the key decision, outcome, or next step from the call.',
    normalizeString(reason) ? `Call ended because: ${normalizeString(reason)}` : '',
    historyBlock ? 'Recent conversation:' : '',
    historyBlock,
    'Summary:',
  ].filter(Boolean).join('\n');
}

export function buildOriginalSessionNotePrompt({ session, summary, reason = '' } = {}) {
  return [
    'Keep this as a short record in the original text thread and do nothing else.',
    'Do not ask follow-up questions.',
    'Do not take any action from this note.',
    normalizeString(reason) ? `Call ended because: ${normalizeString(reason)}` : '',
    `Project: ${normalizeString(session?.title || 'Codex Project')}`,
    `Call summary: ${normalizeString(summary)}`,
  ].filter(Boolean).join('\n');
}

function parseJsonPayload(rawText) {
  const cleaned = normalizeString(rawText)
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {}

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
  }

  throw new Error('Codex did not return valid JSON.');
}

function clampRatio(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.min(1, numeric));
}

function clampPauseMs(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.min(15_000, Math.round(numeric)));
}

function pickGesture(gestures = [], matcher) {
  return gestures.find((gesture) => matcher(gesture))?.id || '';
}

function buildFallbackSequence({ spokenText, gestures = [] } = {}) {
  const lower = normalizeString(spokenText).toLowerCase();
  const beats = [];
  const push = (gestureId, atRatio) => {
    if (!gestureId || beats.some((beat) => beat.gestureId === gestureId)) {
      return;
    }
    beats.push({ gestureId, atRatio });
  };

  if (/\b(hello|hi|hey|good morning|good afternoon)\b/.test(lower)) {
    push(
      pickGesture(gestures, (gesture) =>
        gesture.id === 'Greeting' || gesture.intent === 'greet' || gesture.bestFor?.includes('hello')),
      0,
    );
  }

  if (/\b(sorry|apologize|apologies)\b/.test(lower)) {
    push(
      pickGesture(gestures, (gesture) => gesture.id === 'Apologize' || gesture.bestFor?.includes('apologize')),
      0.12,
    );
  }

  if (/\?$/.test(lower)) {
    push(
      pickGesture(gestures, (gesture) => gesture.id === 'Hand Squat' || gesture.id === 'Pose'),
      0.4,
    );
  }

  if (!beats.length) {
    push(
      pickGesture(gestures, (gesture) => gesture.id === 'Pose' || gesture.intent === 'idle'),
      0.18,
    );
  }

  return beats.slice(0, 3);
}

function normalizeAnimationSequence(sequence, gestureCatalog = []) {
  const allowedGestures = new Set((gestureCatalog || []).map((gesture) => gesture.id));
  const normalizedSequence = Array.isArray(sequence)
    ? sequence
        .map((beat) => ({
          gestureId: normalizeString(beat?.gestureId),
          atRatio: clampRatio(beat?.atRatio),
        }))
        .filter((beat) => beat.gestureId && allowedGestures.has(beat.gestureId))
        .slice(0, 3)
    : [];

  return normalizedSequence;
}

function normalizeReplySegment(segment, gestureCatalog = [], { requireSpokenText = true } = {}) {
  const spokenText = normalizeString(segment?.spokenText || segment?.text || '');
  if (!spokenText) {
    if (requireSpokenText) {
      throw new Error('Codex reply JSON is missing spokenText.');
    }
    return null;
  }

  const subtitle = normalizeString(segment?.subtitle || spokenText) || spokenText;
  const mood = DEFAULT_MOODS.has(normalizeString(segment?.mood)) ? normalizeString(segment.mood) : 'warm';
  const normalizedSequence = normalizeAnimationSequence(segment?.animationSequence, gestureCatalog);
  const animationSequence =
    normalizedSequence.length > 0
      ? normalizedSequence
      : buildFallbackSequence({ spokenText, gestures: gestureCatalog });

  return {
    text: spokenText,
    subtitle,
    mood,
    emoteId: mood,
    gestureId: animationSequence[0]?.gestureId || '',
    animationSequence,
    pauseMs: clampPauseMs(segment?.pauseMs),
  };
}

export function normalizeAgentReply(rawText, gestureCatalog = []) {
  let parsed;

  try {
    parsed = parseJsonPayload(rawText);
  } catch {
    const spokenText = normalizeString(rawText);
    return {
      text: spokenText,
      subtitle: spokenText,
      mood: 'warm',
      emoteId: 'warm',
      gestureId: buildFallbackSequence({ spokenText, gestures: gestureCatalog })?.[0]?.gestureId || '',
      animationSequence: buildFallbackSequence({ spokenText, gestures: gestureCatalog }),
      rawText: spokenText,
    };
  }

  const primarySegment = normalizeReplySegment(parsed, gestureCatalog, {
    requireSpokenText: true,
  });
  const followUps = Array.isArray(parsed?.followUps)
    ? parsed.followUps
        .map((segment) =>
          normalizeReplySegment(segment, gestureCatalog, {
            requireSpokenText: false,
          }))
        .filter(Boolean)
        .slice(0, 7)
    : [];

  return {
    text: primarySegment.text,
    subtitle: primarySegment.subtitle,
    mood: primarySegment.mood,
    emoteId: primarySegment.emoteId,
    gestureId: primarySegment.gestureId,
    animationSequence: primarySegment.animationSequence,
    followUps,
    rawText: normalizeString(rawText),
  };
}

export function createDirectCodexAgent({
  executor,
  linkedCallExecutor = null,
} = {}) {
  if (!executor) {
    throw new Error('createDirectCodexAgent requires an executor.');
  }

  const sessionWarmups = new Map();

  function clearSessionWarmup(sessionId, expectedEntry = null) {
    const cleanedSessionId = normalizeString(sessionId);
    if (!cleanedSessionId) {
      return;
    }

    const activeEntry = sessionWarmups.get(cleanedSessionId);
    if (!activeEntry) {
      return;
    }

    if (expectedEntry && activeEntry !== expectedEntry) {
      return;
    }

    sessionWarmups.delete(cleanedSessionId);
  }

  async function waitForSessionWarmup(sessionId = '') {
    const entry = sessionWarmups.get(normalizeString(sessionId));
    if (!entry) {
      return;
    }
    await entry.promise.catch(() => {});
  }

  async function checkHealth() {
    return executor.checkHealth();
  }

  async function resetSession({ sessionId } = {}) {
    await abortSessionWarmup({
      sessionId,
      reason: 'Session reset before the hidden warmup completed.',
    }).catch(() => {});
    return executor.resetSession({ sessionId });
  }

  async function startSessionWarmup({ session } = {}) {
    if (typeof executor.startPrompt !== 'function') {
      throw new Error('Session warmup requires an isolated executor with startPrompt.');
    }

    const launch = session?.metadata?.launch || {};
    if (isLinkedCallLaunch(launch)) {
      return {
        started: false,
        requestId: '',
        promise: Promise.resolve(),
      };
    }

    const sessionId = normalizeString(session?.id);
    if (!sessionId) {
      throw new Error('Session warmup requires a session id.');
    }

    const existing = sessionWarmups.get(sessionId);
    if (existing) {
      return {
        started: false,
        requestId: existing.requestId,
        promise: existing.promise,
      };
    }

    const workspaceRoot = normalizeString(launch?.workspaceRoot);
    const handle = await executor.startPrompt({
      sessionId,
      initialPrompt: buildWarmupPrompt({ session }),
      capabilityPolicy: getCapabilityPolicy(session),
      workspaceRoot,
    });
    const entry = {
      requestId: handle.requestId,
      abort: handle.abort,
      promise: handle.promise.finally(() => {
        clearSessionWarmup(sessionId, entry);
      }),
    };
    sessionWarmups.set(sessionId, entry);
    void entry.promise.catch(() => {});
    return {
      started: true,
      requestId: handle.requestId,
      promise: entry.promise,
    };
  }

  async function abortSessionWarmup({
    sessionId,
    reason = 'Session warmup aborted.',
  } = {}) {
    const cleanedSessionId = normalizeString(sessionId);
    if (!cleanedSessionId) {
      return false;
    }

    const entry = sessionWarmups.get(cleanedSessionId);
    if (!entry) {
      return false;
    }

    const aborted = entry.abort?.(normalizeString(reason) || 'Session warmup aborted.');
    clearSessionWarmup(cleanedSessionId, entry);
    await entry.promise.catch(() => {});
    return aborted === true;
  }

  async function startSpeculativeReply({ session, transcript } = {}) {
    if (typeof executor.startPrompt !== 'function' || typeof executor.resetSession !== 'function') {
      throw new Error('Speculative replies require an isolated executor with startPrompt and resetSession.');
    }

    const launch = session?.metadata?.launch || {};
    const workspaceRoot = normalizeString(launch?.workspaceRoot);
    const speculativeSessionId = `speculative-${randomUUID()}`;
    const handle = await executor.startPrompt({
      sessionId: speculativeSessionId,
      initialPrompt: buildSpeculativeTurnPrompt({ session, transcript }),
      capabilityPolicy: getCapabilityPolicy(session),
      forceFresh: true,
      workspaceRoot,
    });

    const cleanup = async () => {
      await executor.resetSession({ sessionId: speculativeSessionId }).catch(() => {});
    };

    return {
      requestId: handle.requestId,
      abort: handle.abort,
      promise: handle.promise
        .then((result) => ({
          ...normalizeAgentReply(result.text, session?.avatar?.gestureCatalog || []),
          runMode: result.mode || 'speculative',
        }))
        .finally(cleanup),
    };
  }

  async function startReply({ session, turn } = {}) {
    const launch = session?.metadata?.launch || {};
    const workspaceRoot = normalizeString(launch?.workspaceRoot);
    let handle;

    if (isLinkedCallLaunch(launch) && linkedCallExecutor?.startCallPrompt) {
      handle = await linkedCallExecutor.startCallPrompt({
        launchId: launch.launchId,
        callSessionId: launch.callSessionId,
        prompt: buildResumeTurnPrompt({ session, turn }),
        capabilityPolicy: getCapabilityPolicy(session),
        workspaceRoot,
      });
    } else {
      await waitForSessionWarmup(session?.id);
      const initialPrompt = buildInitialTurnPrompt({ session, turn });
      const resumePrompt = buildResumeTurnPrompt({ session, turn });
      handle = await executor.startPrompt({
        sessionId: session?.id,
        initialPrompt,
        resumePrompt,
        capabilityPolicy: getCapabilityPolicy(session),
        workspaceRoot,
      });
    }

    return {
      requestId: handle.requestId,
      abort: handle.abort,
      promise: handle.promise.then((result) => ({
        ...normalizeAgentReply(result.text, session?.avatar?.gestureCatalog || []),
        runMode: result.mode,
      })),
    };
  }

  async function finalizeSession({ session, reason = '' } = {}) {
    const launch = session?.metadata?.launch || {};
    if (!isLinkedCallLaunch(launch) || !linkedCallExecutor?.runCallPrompt || !linkedCallExecutor?.writeBackSummary) {
      return {
        summary: '',
        writeBackText: '',
      };
    }

    const workspaceRoot = normalizeString(launch.workspaceRoot);
    const summaryResult = await linkedCallExecutor.runCallPrompt({
      launchId: launch.launchId,
      callSessionId: launch.callSessionId,
      prompt: buildCallSummaryPrompt({ session, reason }),
      capabilityPolicy: getCapabilityPolicy(session),
      workspaceRoot,
    });
    const summary = normalizeString(summaryResult?.text);
    const writeBackResult = await linkedCallExecutor.writeBackSummary({
      originalSessionId: launch.originalSessionId,
      prompt: buildOriginalSessionNotePrompt({ session, summary, reason }),
      capabilityPolicy: getCapabilityPolicy(session),
      workspaceRoot,
    });
    await linkedCallExecutor.destroyCallSession?.({
      launchId: launch.launchId,
    });

    return {
      summary,
      writeBackText: normalizeString(writeBackResult?.text),
    };
  }

  return {
    abortSessionWarmup,
    checkHealth,
    startSessionWarmup,
    resetSession,
    startReply,
    startSpeculativeReply,
    finalizeSession,
  };
}
