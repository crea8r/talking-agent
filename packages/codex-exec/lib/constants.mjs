export const DEFAULT_CODEX_MODEL = 'gpt-5.4';
export const DEFAULT_REASONING_EFFORT = 'low';
export const DEFAULT_TIMEOUT_MS = 600_000;

export const FILES_TO_SEED = ['auth.json', 'installation_id'];

export const FORKABLE_CODEX_ITEMS = [
  'auth.json',
  'installation_id',
  'config.toml',
  'session_index.jsonl',
  'sessions',
  'version.json',
];

export const DEFAULT_CAPABILITY_POLICY = Object.freeze({
  enabledPluginIds: [],
  enableControlComputer: false,
  enableComplexTasks: false,
});
