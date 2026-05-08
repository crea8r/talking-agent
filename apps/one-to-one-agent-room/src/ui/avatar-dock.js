const VALID_SCREEN_IDS = new Set(['setup', 'call']);

function appendPreviewShell(host, previewShell) {
  if (!host || !previewShell) {
    return;
  }

  if (previewShell.parentNode === host) {
    return;
  }

  if (typeof host.append === 'function') {
    host.append(previewShell);
    return;
  }

  host.appendChild?.(previewShell);
}

export function createAvatarDock({ setupHost, callHost, previewShell } = {}) {
  const hostMap = new Map([
    ['setup', setupHost],
    ['call', callHost],
  ]);

  function sync(screenId = 'setup') {
    const nextScreenId = VALID_SCREEN_IDS.has(screenId) ? screenId : 'setup';
    appendPreviewShell(hostMap.get(nextScreenId), previewShell);
  }

  return {
    sync,
  };
}
