function normalizeString(value) {
  return `${value || ''}`.trim();
}

function normalizeMode(value) {
  return normalizeString(value) === 'linked-call' ? 'linked-call' : 'manual';
}

function normalizeBooleanFlag(value, fallbackValue) {
  const cleaned = normalizeString(value).toLowerCase();
  if (!cleaned) {
    return fallbackValue;
  }
  if (['1', 'true', 'yes', 'on'].includes(cleaned)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(cleaned)) {
    return false;
  }
  return fallbackValue;
}

function normalizeScreen(value, fallbackValue) {
  const cleaned = normalizeString(value);
  return cleaned === 'call' || cleaned === 'setup' ? cleaned : fallbackValue;
}

export function slugifyWorkspaceKey(value) {
  const slug = normalizeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'default';
}

export function deriveWorkspaceLabel(workspaceRoot, runtimeConfig = {}) {
  const cleanedWorkspaceRoot = normalizeString(workspaceRoot);
  if (cleanedWorkspaceRoot) {
    const segments = cleanedWorkspaceRoot.split('/').filter(Boolean);
    return segments.at(-1) || cleanedWorkspaceRoot;
  }

  return normalizeString(runtimeConfig.codexProjectName || runtimeConfig.appName || 'Codex Project');
}

export function resolveConfiguredManualWorkspaceRoot(runtimeConfig = {}) {
  return (
    normalizeString(runtimeConfig?.manualMode?.workspaceRoot) ||
    normalizeString(runtimeConfig?.codexProjectPath)
  );
}

export function applyManualSettingsToLaunchContext({
  launchContext = {},
  runtimeConfig = {},
  settings = {},
} = {}) {
  const currentLaunch =
    launchContext && typeof launchContext === 'object'
      ? launchContext
      : {};
  if (normalizeMode(currentLaunch.mode) === 'linked-call') {
    return currentLaunch;
  }

  const workspaceRoot =
    normalizeString(settings?.manualMode?.workspaceRoot) ||
    resolveConfiguredManualWorkspaceRoot(runtimeConfig);

  return {
    ...currentLaunch,
    mode: 'manual',
    autoStart: false,
    initialScreen: normalizeScreen(currentLaunch.initialScreen, 'setup'),
    workspaceRoot,
    workspaceKey: slugifyWorkspaceKey(workspaceRoot),
    displayTitle: deriveWorkspaceLabel(workspaceRoot, runtimeConfig),
  };
}

export function resolveLaunchContext({
  locationHref = 'http://127.0.0.1/',
  runtimeConfig = {},
} = {}) {
  const url = new URL(locationHref);
  const mode = normalizeMode(url.searchParams.get('mode'));
  const workspaceRoot =
    normalizeString(url.searchParams.get('cwd')) ||
    normalizeString(url.searchParams.get('workspaceRoot')) ||
    resolveConfiguredManualWorkspaceRoot(runtimeConfig);
  const displayTitle =
    normalizeString(url.searchParams.get('title')) || deriveWorkspaceLabel(workspaceRoot, runtimeConfig);
  const autoStart = normalizeBooleanFlag(url.searchParams.get('autostart'), mode === 'linked-call');
  const initialScreen = normalizeScreen(
    url.searchParams.get('screen'),
    mode === 'linked-call' ? 'call' : 'setup',
  );

  return {
    mode,
    autoStart,
    initialScreen,
    workspaceRoot,
    workspaceKey: slugifyWorkspaceKey(workspaceRoot),
    displayTitle,
    launchId:
      normalizeString(url.searchParams.get('launch')) ||
      normalizeString(url.searchParams.get('launchId')),
    originalSessionId:
      normalizeString(url.searchParams.get('originalSessionId')) ||
      normalizeString(url.searchParams.get('originalSession')),
    callSessionId:
      normalizeString(url.searchParams.get('callSessionId')) ||
      normalizeString(url.searchParams.get('callSession')),
    callStatus: normalizeString(url.searchParams.get('status')),
    endedSummary: normalizeString(url.searchParams.get('summary')),
    linkedSessionId:
      normalizeString(url.searchParams.get('session')) ||
      normalizeString(url.searchParams.get('sessionId')),
  };
}
