const DEFAULT_LOADING_ENTRY = Object.freeze({
  active: false,
  phase: '',
  detail: '',
  percent: null,
});

function normalizePercent(value) {
  if (value === null || value === undefined || `${value}`.trim() === '') {
    return null;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function normalizeLoadingEntry(entry = {}) {
  return {
    active: entry.active === true,
    phase: `${entry.phase || ''}`.trim(),
    detail: `${entry.detail || ''}`.trim(),
    percent: normalizePercent(entry.percent),
  };
}

export function ensureLoadingUiState(state) {
  if (!state.loadingUi || typeof state.loadingUi !== 'object') {
    state.loadingUi = {};
  }

  for (const scope of ['boot', 'call', 'avatar']) {
    if (!state.loadingUi[scope] || typeof state.loadingUi[scope] !== 'object') {
      state.loadingUi[scope] = { ...DEFAULT_LOADING_ENTRY };
      continue;
    }
    state.loadingUi[scope] = normalizeLoadingEntry(state.loadingUi[scope]);
  }

  return state.loadingUi;
}

export function getLoadingUiState(state, scope) {
  const loadingUi = ensureLoadingUiState(state);
  if (!loadingUi[scope]) {
    loadingUi[scope] = { ...DEFAULT_LOADING_ENTRY };
  }
  return loadingUi[scope];
}

export function setLoadingUiState(state, scope, entry = {}) {
  const loadingUi = ensureLoadingUiState(state);
  loadingUi[scope] = normalizeLoadingEntry({
    ...loadingUi[scope],
    ...entry,
  });
  return loadingUi[scope];
}

export function clearLoadingUiState(state, scope) {
  return setLoadingUiState(state, scope, DEFAULT_LOADING_ENTRY);
}
