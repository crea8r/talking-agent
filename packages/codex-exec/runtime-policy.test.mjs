import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMcpServerArgs, buildCodexToolArguments } from './lib/mcp-tools.mjs';

test('computer control launches the MCP worker without forcing read-only sandbox', () => {
  const args = buildMcpServerArgs({
    workdir: '/tmp/workspace',
    capabilityPolicy: {
      enableControlComputer: true,
    },
  });

  assert.equal(args.includes('read-only'), false);
});

test('computer control initial turns do not force read-only tool execution', () => {
  const toolArguments = buildCodexToolArguments({
    prompt: 'Check the workspace.',
    workdir: '/tmp/workspace',
    model: 'gpt-5.4',
    reasoningEffort: 'low',
    capabilityPolicy: {
      enableControlComputer: true,
    },
  });

  assert.notEqual(toolArguments.sandbox, 'read-only');
});
