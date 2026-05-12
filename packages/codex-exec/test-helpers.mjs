import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

export async function seedBasicSourceCodexHome(sourceCodexHome, { configToml = '' } = {}) {
  await mkdir(sourceCodexHome, { recursive: true });
  await writeFile(path.join(sourceCodexHome, 'auth.json'), '{"ok":true}');
  await writeFile(path.join(sourceCodexHome, 'installation_id'), 'codex-exec-test');
  await writeFile(path.join(sourceCodexHome, 'config.toml'), configToml);
}

export async function seedPlugin({
  sourceCodexHome,
  marketplace = 'openai-curated',
  name,
  version = '0.1.0',
  displayName,
} = {}) {
  const pluginDir = path.join(
    sourceCodexHome,
    'plugins',
    'cache',
    marketplace,
    name,
    '1141b764',
    '.codex-plugin',
  );
  await mkdir(pluginDir, { recursive: true });
  await writeFile(
    path.join(pluginDir, 'plugin.json'),
    JSON.stringify({
      name,
      version,
      interface: { displayName: displayName || name },
    }),
  );
}

export async function seedForkedSourceCodexHome(rootDir, originalSessionId) {
  const sourceCodexHome = path.join(rootDir, 'source-codex-home');
  const sessionDir = path.join(sourceCodexHome, 'sessions', '2026', '05', '08');
  const shellSnapshotDir = path.join(sourceCodexHome, 'shell_snapshots');

  await seedBasicSourceCodexHome(sourceCodexHome, { configToml: 'model = "gpt-5.4"\n' });
  await seedPlugin({ sourceCodexHome, name: 'github', displayName: 'GitHub' });
  await mkdir(sessionDir, { recursive: true });
  await mkdir(shellSnapshotDir, { recursive: true });
  await writeFile(path.join(shellSnapshotDir, 'skip-me.sh'), 'echo do not copy\n');
  await writeFile(
    path.join(sourceCodexHome, 'session_index.jsonl'),
    `${JSON.stringify({
      id: originalSessionId,
      thread_name: 'Original coding thread',
      updated_at: '2026-05-08T10:00:00.000Z',
    })}\n`,
  );
  await writeFile(
    path.join(sessionDir, `rollout-2026-05-08T10-00-00-${originalSessionId}.jsonl`),
    [
      JSON.stringify({
        timestamp: '2026-05-08T10:00:00.000Z',
        type: 'session_meta',
        payload: {
          id: originalSessionId,
          timestamp: '2026-05-08T10:00:00.000Z',
          cwd: '/Users/hieu/Work/crea8r/talking-agent',
          source: 'desktop',
        },
      }),
      JSON.stringify({
        timestamp: '2026-05-08T10:01:00.000Z',
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'Help me implement app4.' }],
        },
      }),
      '',
    ].join('\n'),
  );

  return sourceCodexHome;
}
