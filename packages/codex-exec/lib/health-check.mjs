import { mkdir } from 'node:fs/promises';

import { ensureSourceCodexHome } from './codex-home.mjs';
import { resolveCodexLaunch, launchCodexProcess } from './process-runner.mjs';
import { summarizeOutput } from './strings.mjs';

export async function runCodexHealthCheck({
  rootDir,
  sourceCodexHome,
  codexCommand,
  timeoutMs,
  spawnCodex,
  extra = {},
} = {}) {
  await ensureSourceCodexHome(sourceCodexHome);
  await mkdir(rootDir, { recursive: true });

  const launch = await resolveCodexLaunch(codexCommand);
  const health = launchCodexProcess({
    command: launch.command,
    args: [...launch.argsPrefix, '--version'],
    cwd: rootDir,
    env: { ...process.env, OTEL_SDK_DISABLED: 'true' },
    outputFilePath: '',
    timeoutMs,
    spawnCodex,
  });
  const result = await health.promise;

  return {
    ok: true,
    app: 'codex-exec',
    detail: summarizeOutput(result.stdout) || summarizeOutput(result.stderr) || 'ready',
    ...extra,
  };
}
