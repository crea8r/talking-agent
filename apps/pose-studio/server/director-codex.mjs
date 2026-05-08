import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  buildPoseStudioMcpUrl,
  DIRECTOR_CODEX_HOME,
  DIRECTOR_CODEX_MODEL,
  DIRECTOR_CODEX_REASONING_EFFORT,
  DIRECTOR_CODEX_WORKDIR,
  SOURCE_CODEX_HOME,
} from './config.mjs';

export async function ensureDirectorCodexHome({
  sourceCodexHome = SOURCE_CODEX_HOME,
  directorCodexHome = DIRECTOR_CODEX_HOME,
} = {}) {
  await rm(directorCodexHome, { recursive: true, force: true });
  await mkdir(directorCodexHome, { recursive: true });

  const filesToSeed = ['auth.json', 'installation_id'];
  await Promise.all(filesToSeed.map(async (fileName) => {
    await copyFile(
      path.join(sourceCodexHome, fileName),
      path.join(directorCodexHome, fileName),
    );
  }));

  await writeFile(
    path.join(directorCodexHome, 'config.toml'),
    buildDirectorCodexHomeConfig(),
  );

  await Promise.all([
    mkdir(path.join(directorCodexHome, 'memories'), { recursive: true }),
    mkdir(path.join(directorCodexHome, 'shell_snapshots'), { recursive: true }),
    mkdir(path.join(directorCodexHome, 'tmp'), { recursive: true }),
    writeFile(
      path.join(directorCodexHome, 'skills'),
      'pose-studio director blocks Codex skill installation in this isolated home\n',
    ),
  ]);
}

function buildDirectorCodexHomeConfig() {
  return [
    'notify = []',
    '',
    '[shell_environment_policy]',
    'inherit = "core"',
    '',
    '[plugins."github@openai-curated"]',
    'enabled = false',
    '',
    '[plugins."gmail@openai-curated"]',
    'enabled = false',
    '',
    '[plugins."google-calendar@openai-curated"]',
    'enabled = false',
    '',
    '[plugins."figma@openai-curated"]',
    'enabled = false',
    '',
    '[plugins."superpowers@openai-curated"]',
    'enabled = false',
    '',
    '[plugins."hyperframes@openai-curated"]',
    'enabled = false',
    '',
    '[plugins."remotion@openai-curated"]',
    'enabled = false',
    '',
    '[plugins."google-drive@openai-curated"]',
    'enabled = false',
    '',
  ].join('\n');
}

export function buildDirectorCodexPrompt({ prompt, modelId }) {
  return [
    'You have access to an MCP server named pose-studio.',
    'You are running in an empty scratch workspace.',
    'Do not read or inspect local files.',
    'Do not run shell commands.',
    'Do not use web search.',
    'Use only pose-studio MCP tools.',
    'Do not delegate.',
    'Do not spawn agents.',
    'Do not use collab tools.',
    `Target model is already selected in pose-studio: ${modelId}.`,
    'The stage_pose_sequence tool description includes the gesture catalog you need.',
    'Choose a short sequence of valid gestures that fits the request and stays within 60 seconds total.',
    'Your next step must be exactly one pose-studio MCP write tool call.',
    'If you can build a valid sequence, call stage_pose_sequence exactly once with { prompt, steps }.',
    'If you cannot build a valid sequence, call report_pose_sequence_error exactly once with { prompt, message }.',
    'Use only gesture ids listed in the stage_pose_sequence tool description.',
    'Do not explain your reasoning or print a plan.',
    'Do not emit agent messages before the single MCP tool call.',
    'After the tool call, stop.',
    `User request: ${prompt}`,
  ].join('\n');
}

export function buildDirectorCodexExecArgs({
  codexWorkdir = DIRECTOR_CODEX_WORKDIR,
  mcpUrl = buildPoseStudioMcpUrl(),
  prompt,
  modelId,
  codexPrompt = buildDirectorCodexPrompt({ prompt, modelId }),
} = {}) {
  const configOverrides = [
    ['model_reasoning_effort', DIRECTOR_CODEX_REASONING_EFFORT],
    ['notify', []],
    ['mcp_servers.pose-studio.url', mcpUrl],
    ['mcp_servers.pose-studio.enabled', true],
    ['mcp_servers.pose-studio.tools.stage_pose_sequence.approval_mode', 'approve'],
    ['mcp_servers.pose-studio.tools.report_pose_sequence_error.approval_mode', 'approve'],
    ['plugins."github@openai-curated".enabled', false],
    ['plugins."gmail@openai-curated".enabled', false],
    ['plugins."google-calendar@openai-curated".enabled', false],
    ['plugins."figma@openai-curated".enabled', false],
    ['plugins."superpowers@openai-curated".enabled', false],
    ['plugins."hyperframes@openai-curated".enabled', false],
    ['plugins."remotion@openai-curated".enabled', false],
  ];

  const args = [
    '-a', 'never',
    'exec', '--json', '--ephemeral',
    '--disable', 'multi_agent',
    '--disable', 'multi_agent_v2',
    '--disable', 'enable_fanout',
    '--disable', 'plugins',
    '--disable', 'shell_tool',
    '--disable', 'shell_snapshot',
    '-m', DIRECTOR_CODEX_MODEL,
    '--skip-git-repo-check',
    '-s', 'read-only',
    '-C', codexWorkdir,
  ];

  for (const [key, value] of configOverrides) {
    args.push('-c', `${key}=${JSON.stringify(value)}`);
  }

  args.push(codexPrompt);
  return args;
}
