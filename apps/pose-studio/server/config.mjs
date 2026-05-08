import path from 'node:path';

import {
  createPoseStudioBridgeStore,
  resolveDefaultPoseStudioBridgeStatePath,
} from '../../../packages/pose-studio-bridge/index.mjs';

export const DEFAULT_HOST = '127.0.0.1';
export const DEFAULT_PORT = Number.parseInt(process.env.PORT || '4387', 10);
export const DEFAULT_MCP_PATH = '/mcp';
export const DIRECTOR_REQUEST_TIMEOUT_MS = Number.parseInt(
  process.env.POSE_STUDIO_DIRECTOR_REQUEST_TIMEOUT_MS || '120000',
  10,
);
export const DIRECTOR_CODEX_MODEL =
  process.env.POSE_STUDIO_DIRECTOR_CODEX_MODEL || 'gpt-5.4-mini';
export const DIRECTOR_CODEX_REASONING_EFFORT =
  process.env.POSE_STUDIO_DIRECTOR_CODEX_REASONING_EFFORT || 'low';
export const DIRECTOR_CODEX_WORKDIR =
  process.env.POSE_STUDIO_DIRECTOR_CODEX_WORKDIR || '/private/tmp/pose-studio-director';
export const DIRECTOR_CODEX_HOME =
  process.env.POSE_STUDIO_DIRECTOR_CODEX_HOME || '/private/tmp/pose-studio-codex-home';
export const SOURCE_CODEX_HOME =
  process.env.CODEX_HOME || path.join(process.env.HOME || '', '.codex');

export function buildPoseStudioMcpUrl({
  host = DEFAULT_HOST,
  port = DEFAULT_PORT,
  pathname = DEFAULT_MCP_PATH,
} = {}) {
  return `http://${host}:${port}${pathname}`;
}

export function createDefaultBridgeStore(repoRoot) {
  return createPoseStudioBridgeStore({
    stateFilePath: resolveDefaultPoseStudioBridgeStatePath({
      cwd: repoRoot,
      env: process.env,
    }),
  });
}
