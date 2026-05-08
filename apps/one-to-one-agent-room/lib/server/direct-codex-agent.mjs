const DEFAULT_MOODS = new Set(['neutral', 'warm', 'focused', 'playful']);

function normalizeString(value) {
  return `${value || ''}`.trim();
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
    '{"spokenText":"...","subtitle":"...","mood":"warm","animationSequence":[{"gestureId":"Greeting","atRatio":0.0}]}',
    'Rules:',
    '- spokenText is required and should be natural spoken English only.',
    '- subtitle is required and should match spokenText closely.',
    '- mood must be one of neutral, warm, focused, or playful.',
    '- animationSequence may contain 0 to 3 beats.',
    '- Each beat must use only a gestureId from the available gesture list and an atRatio between 0 and 1.',
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

  return [
    'You are the speaking avatar agent inside the one-to-one agent room.',
    'This is a live voice call with one human and one agent avatar.',
    'The human cannot see internal reasoning. Reply naturally, briefly, and conversationally.',
    'Keep each reply to one to three short sentences.',
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

  return [
    'Continue the same live voice call.',
    'Reply naturally, briefly, and conversationally.',
    buildReplyContractText(),
    gestureBlock ? 'Available gesture ids:' : '',
    gestureBlock,
    `Current character model: ${normalizeString(session?.avatar?.activeModelLabel || session?.avatar?.activeModelId || 'Default avatar')}`,
    `Human: ${normalizeString(turn?.transcript)}`,
    'Agent JSON:',
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

export function normalizeAgentReply(rawText, gestureCatalog = []) {
  const allowedGestures = new Set((gestureCatalog || []).map((gesture) => gesture.id));
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

  const spokenText = normalizeString(parsed?.spokenText || parsed?.text || '');
  if (!spokenText) {
    throw new Error('Codex reply JSON is missing spokenText.');
  }

  const subtitle = normalizeString(parsed?.subtitle || spokenText) || spokenText;
  const mood = DEFAULT_MOODS.has(normalizeString(parsed?.mood)) ? normalizeString(parsed.mood) : 'warm';
  const normalizedSequence = Array.isArray(parsed?.animationSequence)
    ? parsed.animationSequence
        .map((beat) => ({
          gestureId: normalizeString(beat?.gestureId),
          atRatio: clampRatio(beat?.atRatio),
        }))
        .filter((beat) => beat.gestureId && allowedGestures.has(beat.gestureId))
        .slice(0, 3)
    : [];
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

  async function checkHealth() {
    return executor.checkHealth();
  }

  async function resetSession({ sessionId } = {}) {
    return executor.resetSession({ sessionId });
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
        workspaceRoot,
      });
    } else {
      const initialPrompt = buildInitialTurnPrompt({ session, turn });
      const resumePrompt = buildResumeTurnPrompt({ session, turn });
      handle = await executor.startPrompt({
        sessionId: session?.id,
        initialPrompt,
        resumePrompt,
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
      workspaceRoot,
    });
    const summary = normalizeString(summaryResult?.text);
    const writeBackResult = await linkedCallExecutor.writeBackSummary({
      originalSessionId: launch.originalSessionId,
      prompt: buildOriginalSessionNotePrompt({ session, summary, reason }),
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
    checkHealth,
    resetSession,
    startReply,
    finalizeSession,
  };
}
