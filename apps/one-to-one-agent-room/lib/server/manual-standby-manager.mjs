import {
  buildCallSessionPayload,
  buildDefaultCallForm,
} from '../../src/lib/app/call-session.js';
import {
  applyManualSettingsToLaunchContext,
} from '../../src/lib/app/launch-context.js';

function normalizeString(value) {
  return `${value || ''}`.trim();
}

function normalizePluginIds(values = []) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => normalizeString(value))
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right));
}

function buildConfigSignature({
  settings = {},
  launch = {},
  setup = null,
  voiceProfile = null,
} = {}) {
  return JSON.stringify({
    manualWorkspaceRoot: normalizeString(settings?.manualMode?.workspaceRoot),
    agentMode: normalizeString(settings?.agentMode),
    selfProfile: settings?.selfProfile || {},
    workspaceRoot: normalizeString(launch?.workspaceRoot),
    workspaceKey: normalizeString(launch?.workspaceKey),
    activeModelId: normalizeString(setup?.activeModelId),
    activeModelLabel: normalizeString(setup?.activeModelLabel),
    enabledPluginIds: normalizePluginIds(setup?.enabledPluginIds),
    enableControlComputer: setup?.enableControlComputer === true,
    enableComplexTasks: setup?.enableComplexTasks === true,
    voiceProfileId: normalizeString(voiceProfile?.id),
    voiceReferenceAvailable: voiceProfile?.referenceAvailable === true,
  });
}

export function createManualStandbyManager({
  sessionRuntime,
  agentSelf,
  workspaceSetupStore,
  productionVoiceProfileStore,
  runtimeConfig = {},
  persistSessionPayload = async () => {},
  syncSessionCapabilities = async () => {},
} = {}) {
  if (!sessionRuntime) {
    throw new Error('createManualStandbyManager requires a sessionRuntime.');
  }
  if (!agentSelf?.getSettings) {
    throw new Error('createManualStandbyManager requires agentSelf.getSettings().');
  }
  if (!workspaceSetupStore?.loadSetup) {
    throw new Error('createManualStandbyManager requires workspaceSetupStore.loadSetup().');
  }

  let currentStandby = {
    sessionId: '',
    configSignature: '',
    workspaceKey: '',
  };
  let activeManualSessionId = '';
  let preparingPromise = null;

  async function buildManualStandbyContext() {
    const settings = await agentSelf.getSettings();
    const launch = applyManualSettingsToLaunchContext({
      launchContext: {
        mode: 'manual',
        autoStart: false,
        initialScreen: 'setup',
      },
      runtimeConfig,
      settings,
    });
    const setup = await workspaceSetupStore.loadSetup({
      scopeKey: launch.workspaceKey,
    });
    const voiceProfile = productionVoiceProfileStore?.getProfileSummary
      ? await productionVoiceProfileStore.getProfileSummary({
          scopeKey: launch.workspaceKey,
        })
      : null;

    const formState = {
      ...buildDefaultCallForm(),
      bundledModelId: normalizeString(setup?.activeModelId),
      voiceSampleFileName: normalizeString(voiceProfile?.referenceOriginalFileName),
      voiceSampleProfileId: normalizeString(voiceProfile?.id),
      voiceSampleStatus: voiceProfile?.referenceAvailable === true ? 'ready' : 'missing',
      voiceSampleSpeakerId: normalizeString(voiceProfile?.meloBaseSpeakerId),
      voiceSampleSpeakerLabel: normalizeString(voiceProfile?.meloBaseSpeakerLabel),
      enabledPluginIds: normalizePluginIds(setup?.enabledPluginIds),
      enableControlComputer: setup?.enableControlComputer === true,
      enableComplexTasks: setup?.enableComplexTasks === true,
    };

    const payload = buildCallSessionPayload(
      formState,
      runtimeConfig,
      launch,
      settings,
    );

    return {
      settings,
      launch,
      setup,
      voiceProfile,
      payload,
      configSignature: buildConfigSignature({
        settings,
        launch,
        setup,
        voiceProfile,
      }),
    };
  }

  async function createPreparedStandby(context) {
    const created = await sessionRuntime.createSession(context.payload);
    const sessionId = normalizeString(created?.session?.id);
    const synced = await sessionRuntime.syncSetup({
      sessionId,
      metadata: context.payload.metadata,
    });
    await syncSessionCapabilities(synced?.session || null);
    await persistSessionPayload(synced);
    const prepared = await sessionRuntime.prepareSessionStandby({ sessionId });
    await persistSessionPayload(prepared);
    currentStandby = {
      sessionId,
      configSignature: context.configSignature,
      workspaceKey: context.launch.workspaceKey,
    };
    return prepared;
  }

  async function discardCurrentStandby(reason) {
    const sessionId = normalizeString(currentStandby.sessionId);
    if (!sessionId) {
      currentStandby = {
        sessionId: '',
        configSignature: '',
        workspaceKey: '',
      };
      return;
    }

    currentStandby = {
      sessionId: '',
      configSignature: '',
      workspaceKey: '',
    };
    await sessionRuntime.discardSession({
      sessionId,
      reason,
    }).catch(() => {});
  }

  async function ensureStandby({ force = false } = {}) {
    if (preparingPromise) {
      return preparingPromise;
    }

    preparingPromise = (async () => {
      const context = await buildManualStandbyContext();

      if (!force && currentStandby.sessionId && currentStandby.configSignature === context.configSignature) {
        return sessionRuntime.getSession(currentStandby.sessionId);
      }

      if (currentStandby.sessionId) {
        await discardCurrentStandby('Standby session discarded because the manual setup changed.');
      }

      if (activeManualSessionId && !force) {
        return sessionRuntime.getSession(activeManualSessionId);
      }

      return createPreparedStandby(context);
    })().finally(() => {
      preparingPromise = null;
    });

    return preparingPromise;
  }

  async function handleSettingsChanged() {
    if (preparingPromise) {
      await preparingPromise.catch(() => {});
    }
    if (activeManualSessionId) {
      return null;
    }
    return ensureStandby({ force: true });
  }

  async function handleWorkspaceSetupChanged({ scopeKey = '' } = {}) {
    const context = await buildManualStandbyContext();
    if (normalizeString(scopeKey) !== normalizeString(context.launch.workspaceKey)) {
      return null;
    }
    if (activeManualSessionId) {
      return null;
    }
    return ensureStandby({ force: true });
  }

  async function handleVoiceProfileChanged({ scopeKey = '' } = {}) {
    return handleWorkspaceSetupChanged({ scopeKey });
  }

  async function claimStandby({ sessionId } = {}) {
    const cleanedSessionId = normalizeString(sessionId);
    if (!cleanedSessionId || cleanedSessionId !== normalizeString(currentStandby.sessionId)) {
      return false;
    }

    activeManualSessionId = cleanedSessionId;
    currentStandby = {
      sessionId: '',
      configSignature: '',
      workspaceKey: '',
    };
    return true;
  }

  async function handleSessionEnded({ sessionId } = {}) {
    const cleanedSessionId = normalizeString(sessionId);
    if (!cleanedSessionId) {
      return null;
    }

    if (cleanedSessionId === normalizeString(currentStandby.sessionId)) {
      currentStandby = {
        sessionId: '',
        configSignature: '',
        workspaceKey: '',
      };
      return ensureStandby({ force: true });
    }

    if (cleanedSessionId !== normalizeString(activeManualSessionId)) {
      return null;
    }

    activeManualSessionId = '';
    return ensureStandby({ force: true });
  }

  return {
    ensureStandby,
    handleSettingsChanged,
    handleWorkspaceSetupChanged,
    handleVoiceProfileChanged,
    claimStandby,
    handleSessionEnded,
  };
}
