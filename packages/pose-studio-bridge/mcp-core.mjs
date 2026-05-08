import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import {
  createPoseStudioBridgeStore,
  resolveDefaultPoseStudioBridgeStatePath,
} from './index.mjs';
import {
  getPoseStudioPrompt,
  listPoseStudioPrompts,
  listPoseStudioResources,
  readPoseStudioResource,
} from './resources.mjs';

export const SERVER_INFO = { name: 'pose-studio-director', title: 'Pose Studio Director', version: '0.1.0' };

export const SERVER_OPTIONS = {
  capabilities: {
    logging: {},
    tools: { listChanged: false },
    resources: { subscribe: false, listChanged: false },
    prompts: { listChanged: false },
  },
  instructions:
    'Use the stage_pose_sequence tool description as the gesture catalog, keep sequences within 60 seconds, and call report_pose_sequence_error when no safe sequence can be staged.',
};

const DIRECTOR_SERVER_OPTIONS = {
  capabilities: {
    logging: {},
    tools: { listChanged: false },
  },
  instructions:
    'Use only the director write tools. Pick gestures from the stage_pose_sequence tool description, then call exactly one write tool.',
};

export function createDefaultPoseStudioBridgeStore() {
  return createPoseStudioBridgeStore({ stateFilePath: resolveDefaultPoseStudioBridgeStatePath() });
}

export function logMcp(event, details = undefined) {
  const line = details ? `[pose-studio mcp] ${event} ${JSON.stringify(details)}\n` : `[pose-studio mcp] ${event}\n`;
  process.stderr.write(line);
}

function toolResult(payload) {
  return { content: [], structuredContent: payload };
}

function formatElapsedMs(startedAtMs) {
  return Math.round((performance.now() - startedAtMs) * 1000) / 1000;
}

function toProtocolError(error) {
  if (error instanceof McpError) return error;
  return new McpError(
    -32000,
    error instanceof Error ? error.message : 'Internal error',
    error && typeof error === 'object' && 'data' in error ? error.data : undefined,
  );
}

function wrapRequestHandler(handler) {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (error) {
      throw toProtocolError(error);
    }
  };
}

function createToolDefinitions(surface = 'full') {
  const stageDescription = surface === 'director'
    ? 'Stage a directed pose sequence into the running pose-studio app. Use only gesture ids listed below and keep the full sequence within 60 seconds.'
    : 'Stage a directed pose sequence into the running pose-studio app. Use only gesture ids from pose://catalog and keep the full sequence within 60 seconds.';
  const stageProperties = {
    prompt: { type: 'string' },
    steps: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['gestureId'],
        properties: { gestureId: { type: 'string' } },
      },
    },
  };
  const errorProperties = {
    prompt: { type: 'string' },
    message: { type: 'string' },
  };

  if (surface !== 'director') {
    stageProperties.modelId = { type: 'string' };
    errorProperties.modelId = { type: 'string' };
  }

  const definitions = [
    {
      name: 'stage_pose_sequence',
      description: stageDescription,
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: surface === 'director' ? ['prompt', 'steps'] : ['steps'],
        properties: stageProperties,
      },
    },
    {
      name: 'report_pose_sequence_error',
      description:
        'Report that the user request could not be mapped into a valid pose-studio sequence. Use this instead of replying with plain text when no safe sequence can be staged.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: surface === 'director' ? ['prompt', 'message'] : ['message'],
        properties: errorProperties,
      },
    },
  ];

  if (surface !== 'director') {
    definitions.unshift({
      name: 'get_pose_state',
      description: 'Return the current pose-studio runtime and director takeover state.',
      inputSchema: { type: 'object', additionalProperties: false, properties: {} },
    });
    definitions.push({
      name: 'stop_pose_sequence',
      description: 'Stop the current directed pose takeover and return the app to normal pose-studio mode.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: { sequenceId: { type: 'string' } },
      },
    });
  }

  return definitions;
}

async function buildGestureCatalogDescription(store, { surface = 'full' } = {}) {
  const catalog = await store.getCatalog();
  return catalog.gestures
    .map((gesture) => {
      const bestFor = Array.isArray(gesture.bestFor) ? gesture.bestFor.join(', ') : '';
      if (surface === 'director') {
        return `- gestureId: ${gesture.id} | durationMs: ${gesture.durationMs} | bestFor: ${bestFor}`;
      }
      return `- gestureId: ${gesture.id} | name: ${gesture.label || gesture.id} | durationMs: ${gesture.durationMs} | supportsSpeech: ${gesture.supportsSpeech ? 'yes' : 'no'} | bestFor: ${bestFor}`;
    })
    .join('\n');
}

async function listTools(store, { surface = 'full' } = {}) {
  logMcp('tools/list');
  const gestureCatalog = await buildGestureCatalogDescription(store, { surface });
  return createToolDefinitions(surface).map((tool) =>
    tool.name === 'stage_pose_sequence'
      ? { ...tool, description: `${tool.description}\nAvailable gestures:\n${gestureCatalog}` }
      : tool,
  );
}

function compactToolPayload(name, payload, { surface = 'full' } = {}) {
  if (surface !== 'director') {
    return payload;
  }

  if (name === 'stage_pose_sequence') {
    return {
      sequenceId: payload.sequenceId,
      revision: payload.revision,
      modelId: payload.modelId,
      totalDurationMs: payload.totalDurationMs,
      trimmed: payload.trimmed,
    };
  }

  if (name === 'report_pose_sequence_error') {
    return {
      revision: payload.revision,
      modelId: payload.modelId,
      message: payload.message,
    };
  }

  return payload;
}

async function handleToolCall(store, name, args = {}) {
  const startedAtMs = performance.now();
  const summary = {
    name,
    modelId: args?.modelId || '',
    sequenceId: args?.sequenceId || '',
    stepCount: Array.isArray(args?.steps) ? args.steps.length : 0,
  };
  logMcp('tools/call.start', summary);
  try {
    const result = await ({
      get_pose_state: () => store.getState(),
      stage_pose_sequence: () => store.stageSequence(args),
      report_pose_sequence_error: () => store.reportError(args),
      stop_pose_sequence: () => store.stopSequence(args),
    }[name]?.() ?? Promise.reject(new Error(`Unknown tool: ${name}`)));
    logMcp('tools/call.end', { ...summary, elapsedMs: formatElapsedMs(startedAtMs) });
    return result;
  } catch (error) {
    logMcp('tools/call.error', {
      ...summary,
      elapsedMs: formatElapsedMs(startedAtMs),
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export function createPoseStudioMcpServer({
  store = createDefaultPoseStudioBridgeStore(),
  surface = 'full',
} = {}) {
  const server = new Server(
    SERVER_INFO,
    surface === 'director' ? DIRECTOR_SERVER_OPTIONS : SERVER_OPTIONS,
  );
  server.setRequestHandler(
    ListToolsRequestSchema,
    wrapRequestHandler(async () => ({ tools: await listTools(store, { surface }) })),
  );
  if (surface !== 'director') {
    server.setRequestHandler(ListResourcesRequestSchema, async () => {
      logMcp('resources/list');
      return { resources: listPoseStudioResources() };
    });
    server.setRequestHandler(ReadResourceRequestSchema, wrapRequestHandler(async (request) => {
      logMcp('resources/read', { uri: request.params?.uri || '' });
      return { contents: [await readPoseStudioResource(request.params?.uri || '', store)] };
    }));
    server.setRequestHandler(ListPromptsRequestSchema, async () => {
      logMcp('prompts/list');
      return { prompts: listPoseStudioPrompts() };
    });
    server.setRequestHandler(GetPromptRequestSchema, wrapRequestHandler(async (request) => {
      logMcp('prompts/get', { name: request.params?.name || '' });
      return getPoseStudioPrompt(request.params?.name || '');
    }));
  }
  server.setRequestHandler(CallToolRequestSchema, wrapRequestHandler(async (request) => {
    const payload = compactToolPayload(
      request.params?.name,
      await handleToolCall(store, request.params?.name, request.params?.arguments || {}),
      { surface },
    );
    return toolResult(payload);
  }));
  return { server, store };
}
