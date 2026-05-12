export function normalizeString(value) {
  return `${value || ''}`.trim();
}

export function summarizeOutput(text = '') {
  return `${text || ''}`
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-6)
    .join(' | ');
}
