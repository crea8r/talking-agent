export function audioResultToDataUrl(result = null) {
  if (!result?.audioBase64) {
    return '';
  }

  return `data:${result.mimeType || 'audio/wav'};base64,${result.audioBase64}`;
}

export function formatTiming(timing) {
  const durationMs =
    typeof timing === 'number'
      ? timing
      : typeof timing?.durationMs === 'number'
        ? timing.durationMs
        : null;

  if (durationMs === null) {
    return 'n/a';
  }

  return `${(durationMs / 1000).toFixed(2)}s`;
}

export function buildPromptAssetFileStem(characterPrompt = '') {
  const words = `${characterPrompt || ''}`
    .toLowerCase()
    .match(/[a-z0-9]+/g)
    ?.slice(0, 4)
    .join('-');

  return words || `prompt-asset-${Date.now()}`;
}
