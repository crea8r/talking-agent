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

function formatCapabilityName(value = '') {
  const cleaned = normalizeString(value)
    .replace(/@.+$/, '')
    .split('/')
    .at(-1);
  return cleaned.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildCapabilitySummaryLines(session = {}) {
  const policy = getCapabilityPolicy(session);
  const pluginNames = Array.from(
    new Set(
      (Array.isArray(policy.enabledPluginIds) ? policy.enabledPluginIds : [])
        .map((value) => formatCapabilityName(value))
        .filter(Boolean),
    ),
  );
  const lines = [];

  if (pluginNames.length) {
    lines.push(`Connected tools and apps available: ${pluginNames.join(', ')}.`);
  }
  if (policy.enableControlComputer) {
    lines.push('Computer control tools available: shell_tool and shell_snapshot.');
  }
  if (policy.enableComplexTasks) {
    lines.push('Complex task tools available: multi_agent, multi_agent_v2, and enable_fanout.');
  }

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

function formatGestureIds(gestures = []) {
  return Array.from(
    new Set(
      (Array.isArray(gestures) ? gestures : [])
        .map((gesture) => normalizeString(gesture?.id))
        .filter(Boolean),
    ),
  ).join(', ');
}

function buildReplyContractText({ compact = false } = {}) {
  const shape = compact
    ? '{"spokenText":"...","mood":"warm","animationSequence":[],"followUps":[]}'
    : '{"spokenText":"...","mood":"warm","animationSequence":[{"gestureId":"Greeting","atRatio":0.0}],"followUps":[{"spokenText":"...","mood":"warm","pauseMs":1200,"animationSequence":[{"gestureId":"Pose","atRatio":0.2}]}]}';
  return [
    'Return exactly one JSON object and nothing else.',
    'Use this shape:',
    shape,
    'Rules:',
    '- spokenText is required and should be natural spoken English only.',
    '- mood must be one of neutral, warm, focused, or playful.',
    '- animationSequence may contain 0 to 3 beats.',
    '- Each beat must use only a valid gestureId and an atRatio between 0 and 1.',
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
  const historyBlock = formatHistory(
    (session?.turns || []).filter((entry) => entry.id !== turn?.id && entry.agentReply),
  );
  const gestureIds = formatGestureIds(session?.avatar?.gestureCatalog || []);
  const identityBlock = buildAgentIdentityPromptLines(session);
  const capabilitySummary = buildCapabilitySummaryLines(session);

  return [
    'You are the speaking avatar agent in a live voice call.',
    ...identityBlock,
    'This is a live conversation with one human and one agent avatar.',
    'This startup turn establishes the contract for the rest of the call. Keep that contract in memory for later turns.',
    'The human usually does not need your internal reasoning, but you may briefly surface it when that makes communication clearer.',
    'Speak naturally, briefly, and conversationally.',
    'Normal replies should be one to three short sentences.',
    'Action policy:',
    '- If the human asks for current external information, connected-app data, or a real-world action, use the relevant tool or app before finalizing your answer.',
    '- Do not pretend an action was completed.',
    '- Do not say you saved, booked, checked, opened, searched, or created something unless a tool result in this turn confirms it.',
    '- If one required detail is missing, ask exactly one short follow-up question.',
    '- If a tool fails, say the concrete blocker briefly.',
    '- Prefer acting over talking-about-acting.',
    'Communication policy for actions:',
    '- When you start a real tool or connected-app action, briefly say what you are about to do.',
    '- If the action takes a while, briefly say the next meaningful status change.',
    '- When an action is blocked, say the blocker plainly.',
    '- Keep commentary short and only use it when it improves the human’s understanding of what is happening.',
    ...capabilitySummary,
    `Character model: ${normalizeString(session?.avatar?.activeModelLabel || session?.avatar?.activeModelId || 'Default avatar')}`,
    buildReplyContractText(),
    gestureIds ? `Valid gesture ids: ${gestureIds}` : '',
    gestureIds ? 'Use Greeting for hello, Goodbye for signoff, and Pose when you need a neutral fallback.' : '',
    historyBlock ? 'Recent conversation:' : '',
    historyBlock,
    `Human: ${normalizeString(turn?.transcript)}`,
    'Agent JSON:',
  ].filter(Boolean).join('\n');
}

export function buildResumeTurnPrompt({ session, turn } = {}) {
  const gestureIds = formatGestureIds(session?.avatar?.gestureCatalog || []);

  return [
    'Continue the same live voice call.',
    'Use the established session contract from startup.',
    'Reply naturally, briefly, and conversationally.',
    'Important action rule:',
    '- If this request needs current external data or a connected-app action, use the relevant tool or app before finalizing your answer.',
    '- Do not give a talk-only answer when the human is asking you to do something real.',
    '- Only three valid outcomes exist: you did the action and report the result, you ask one short missing-detail question, or you report the exact tool failure or blocker.',
    '- While performing a real action, keep the human informed with short commentary only at meaningful milestones.',
    buildReplyContractText({ compact: true }),
    gestureIds ? `Valid gesture ids: ${gestureIds}` : '',
    `Human: ${normalizeString(turn?.transcript)}`,
    'Agent JSON:',
  ].filter(Boolean).join('\n');
}

export function buildSpeculativeTurnPrompt({ session, transcript = '' } = {}) {
  const gestureIds = formatGestureIds(session?.avatar?.gestureCatalog || []);

  return [
    'Continue the same live voice call.',
    'Use the established session contract from startup.',
    'You are hearing a partial transcript while the human may still be speaking.',
    'Reply with one very short spoken line that keeps the exchange natural and engaged.',
    'Do not give a final answer, do not claim the work is complete, and do not make irreversible commitments.',
    'Prefer low-commitment acknowledgments, framing, or a brief preview of direction.',
    'Do not start tools, connected-app actions, or long plans from a speculative turn.',
    buildReplyContractText({ compact: true }),
    gestureIds ? `Valid gesture ids: ${gestureIds}` : '',
    `Human partial transcript so far: ${normalizeString(transcript)}`,
    'Agent JSON:',
  ].filter(Boolean).join('\n');
}

function buildWarmupPrompt({ session } = {}) {
  const gestureIds = formatGestureIds(session?.avatar?.gestureCatalog || []);
  const identityBlock = buildAgentIdentityPromptLines(session);
  const capabilitySummary = buildCapabilitySummaryLines(session);

  return [
    'You are preparing for the next live voice call turn inside the one-to-one agent room.',
    'No human has spoken yet.',
    'Load the spoken agent identity, visual character, action policy, and response contract for the upcoming call.',
    'Do not greet the human, ask a question, or continue the conversation.',
    ...identityBlock,
    ...capabilitySummary,
    `Character model: ${normalizeString(session?.avatar?.activeModelLabel || session?.avatar?.activeModelId || 'Default avatar')}`,
    buildReplyContractText(),
    gestureIds ? `Valid gesture ids: ${gestureIds}` : '',
    'Return exactly this JSON and nothing else:',
    '{"spokenText":"Ready.","mood":"warm","animationSequence":[{"gestureId":"Pose","atRatio":0.0}]}',
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

  function subscribeSessionEvents({ sessionId, listener } = {}) {
    if (typeof executor.subscribeSessionEvents !== 'function') {
      return () => {};
    }
    return executor.subscribeSessionEvents({ sessionId, listener });
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

  async function preemptSessionWarmupForTurn(sessionId = '') {
    const cleanedSessionId = normalizeString(sessionId);
    if (!cleanedSessionId || !sessionWarmups.has(cleanedSessionId)) {
      return false;
    }

    await abortSessionWarmup({
      sessionId: cleanedSessionId,
      reason: 'A human turn arrived before the hidden warmup finished.',
    }).catch(() => {});
    await executor.resetSession?.({ sessionId: cleanedSessionId }).catch(() => {});
    return true;
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
      const preemptedWarmup = await preemptSessionWarmupForTurn(session?.id);
      if (!preemptedWarmup) {
        await waitForSessionWarmup(session?.id);
      }
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
    subscribeSessionEvents,
    startSessionWarmup,
    resetSession,
    startReply,
    startSpeculativeReply,
    finalizeSession,
  };
}
