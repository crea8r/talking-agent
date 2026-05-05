export function safeStringify(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return JSON.stringify({
      error: error instanceof Error ? error.message : 'Unable to stringify value.',
    }, null, 2);
  }
}
