const SESSION_REUSABLE_PACKAGES = [
  '@talking-agent/avatar-layer-browser',
  '@talking-agent/voice-layer-browser',
  '@talking-agent/avatar-speech-browser',
  '@talking-agent/production-voice',
  '@talking-agent/codex-exec',
];

function normalizeString(value) {
  return `${value || ''}`.trim();
}

function normalizeRuntimeConfig(runtimeConfig) {
  return runtimeConfig && typeof runtimeConfig === 'object' ? runtimeConfig : {};
}

function normalizeLaunchContext(runtimeConfig = {}, launchContext = {}) {
  const runtimeLaunch =
    runtimeConfig.launch && typeof runtimeConfig.launch === 'object' ? runtimeConfig.launch : {};
  return {
    mode: normalizeString(launchContext.mode || runtimeLaunch.mode) || 'manual',
    autoStart:
      launchContext.autoStart ??
      runtimeLaunch.autoStart ??
      false,
    workspaceRoot:
      normalizeString(launchContext.workspaceRoot || runtimeLaunch.workspaceRoot) ||
      normalizeString(runtimeConfig.codexProjectPath),
    workspaceKey:
      normalizeString(launchContext.workspaceKey || runtimeLaunch.workspaceKey) || 'default',
    displayTitle:
      normalizeString(launchContext.displayTitle || runtimeLaunch.displayTitle) || '',
    launchId:
      normalizeString(launchContext.launchId || runtimeLaunch.launchId) || '',
    originalSessionId:
      normalizeString(launchContext.originalSessionId || runtimeLaunch.originalSessionId) || '',
    callSessionId:
      normalizeString(launchContext.callSessionId || runtimeLaunch.callSessionId) || '',
    callStatus:
      normalizeString(launchContext.callStatus || runtimeLaunch.callStatus) || '',
    endedSummary:
      normalizeString(launchContext.endedSummary || runtimeLaunch.endedSummary) || '',
    linkedSessionId:
      normalizeString(launchContext.linkedSessionId || runtimeLaunch.linkedSessionId) || '',
  };
}

function buildAgentSetupMetadata(formState = {}) {
  return {
    humanLocale: `${formState.humanLocale || 'en-US'}`.trim(),
    voiceSampleFileName: `${formState.voiceSampleFileName || ''}`.trim(),
    voiceSampleProfileId: `${formState.voiceSampleProfileId || ''}`.trim(),
    voiceSampleStatus: `${formState.voiceSampleStatus || 'missing'}`.trim() || 'missing',
    voiceSampleSpeakerId: `${formState.voiceSampleSpeakerId || ''}`.trim(),
    voiceSampleSpeakerLabel: `${formState.voiceSampleSpeakerLabel || ''}`.trim(),
    activeModelId: `${formState.bundledModelId || ''}`.trim(),
  };
}

export function normalizeSessionForUi(session) {
  if (!session || typeof session !== 'object') {
    return null;
  }

  return {
    ...session,
    agent: {
      id: `${session.agent?.id || 'codex-openai'}`.trim() || 'codex-openai',
      label: `${session.agent?.label || 'Codex OpenAI'}`.trim() || 'Codex OpenAI',
      status: `${session.agent?.status || 'idle'}`.trim() || 'idle',
      currentTurnId: `${session.agent?.currentTurnId || ''}`.trim() || null,
      lastReplyAt: `${session.agent?.lastReplyAt || ''}`.trim() || null,
      lastError: `${session.agent?.lastError || ''}`.trim(),
    },
    metrics: {
      pendingTurns: Number(session.metrics?.pendingTurns || 0),
      turnCount: Number(session.metrics?.turnCount || 0),
      unplayedReplies: Number(session.metrics?.unplayedReplies || 0),
    },
  };
}

export function getCodexProjectTitle(runtimeConfig = {}) {
  const config = normalizeRuntimeConfig(runtimeConfig);
  const launch = normalizeLaunchContext(config);
  return normalizeString(launch.displayTitle || config.codexProjectName || config.appName || 'Codex Project');
}

export function getCallTitle(session, runtimeConfig = {}) {
  return `${session?.title || getCodexProjectTitle(runtimeConfig)}`.trim();
}

export function buildCallSessionKey(formState = {}, runtimeConfig = {}, launchContext = {}) {
  const launch = normalizeLaunchContext(runtimeConfig, launchContext);
  return JSON.stringify({
    title: getCodexProjectTitle(runtimeConfig),
    humanIdentity: normalizeString(formState.humanIdentity),
    humanName: normalizeString(formState.participantName),
    bundledModelId: normalizeString(formState.bundledModelId),
    voiceSampleProfileId: normalizeString(formState.voiceSampleProfileId),
    workspaceRoot: launch.workspaceRoot,
    app: 'one-to-one-agent-room',
  });
}

export function buildCallSessionPayload(formState = {}, runtimeConfig = {}, launchContext = {}) {
  const config = normalizeRuntimeConfig(runtimeConfig);
  const agentSetup = buildAgentSetupMetadata(formState);
  const launch = normalizeLaunchContext(runtimeConfig, launchContext);
  const title = normalizeString(launch.displayTitle || getCodexProjectTitle(runtimeConfig));

  return {
    humanIdentity: normalizeString(formState.humanIdentity),
    humanName: normalizeString(formState.participantName),
    title,
    metadata: {
      app: 'one-to-one-agent-room',
      planEntry: 'docs/6-app-plan.md#4-one-to-one-agent-room',
      codexProjectName: title,
      reusablePackages: SESSION_REUSABLE_PACKAGES,
      agentSetup,
      launch,
      callMode: 'direct-codex-voice-avatar',
      codexContract: {
        turnRoute: '/api/call/sessions/:id/turns',
        turnFields: ['spokenText', 'subtitle', 'mood', 'animationSequence'],
        subtitlePolicy: 'show human interim/final subtitles plus browser-driven agent thinking text',
      },
      runtimeHints: {
        browserSpeechRecognition: true,
        browserSpeechSynthesis: false,
        productionVoice: true,
        directCodexExec: true,
        interruptionHandling: true,
      },
      appMode: `${config.appMode || 'one-to-one-agent-room'}`.trim(),
    },
  };
}

export function buildDefaultCallForm() {
  return {
    humanIdentity: 'human-caller',
    participantName: 'Human Caller',
    humanLocale: 'en-US',
    voiceSampleFileName: '',
    voiceSampleProfileId: '',
    voiceSampleStatus: 'missing',
    voiceSampleSpeakerId: '',
    voiceSampleSpeakerLabel: '',
  };
}

export function getCallPrimaryAction({
  activeCall = false,
  endingCall = false,
  sessionPreparing = false,
  modelLoading = false,
  recognitionSupported = true,
  setupReady = true,
  productionVoiceReady = true,
  codexReady = true,
} = {}) {
  if (activeCall) {
    return {
      mode: 'end-call',
      label: endingCall ? 'Ending…' : 'End Call',
      disabled: endingCall,
    };
  }

  if (
    sessionPreparing ||
    !recognitionSupported ||
    !setupReady ||
    !productionVoiceReady ||
    !codexReady
  ) {
    return {
      mode: 'start-call',
      label: sessionPreparing ? 'Starting…' : 'Start Call',
      disabled:
        sessionPreparing ||
        !recognitionSupported ||
        !setupReady ||
        !productionVoiceReady ||
        !codexReady,
    };
  }

  return {
    mode: 'start-call',
    label: 'Start Call',
    disabled: false,
  };
}
