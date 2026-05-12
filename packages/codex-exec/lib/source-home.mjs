import os from 'node:os';
import path from 'node:path';

import { normalizeString } from './strings.mjs';

export function resolveDefaultSourceCodexHome({
  env = process.env,
  homeDir = os.homedir(),
} = {}) {
  const configuredHome = normalizeString(env.CODEX_SOURCE_HOME);
  if (configuredHome) {
    return configuredHome;
  }
  const fallbackHome = normalizeString(env.HOME || homeDir) || homeDir;
  return path.join(fallbackHome, '.codex');
}
