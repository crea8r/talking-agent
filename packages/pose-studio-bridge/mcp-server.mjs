import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
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

const store = createPoseStudioBridgeStore({
  stateFilePath: resolveDefaultPoseStudioBridgeStatePath(),
});

const SERVER_INFO = {
  name: 'pose-studio-director',
  title: 'Pose Studio Director',
  version: '0.1.0',
};

const SERVER_OPTIONS = {
  capabilities: {
    logging: {},
    tools: {
      listChanged: false,
    },
    resources: {
      subscribe: false,
      listChanged: false,
    },
    prompts: {
      listChanged: false,
    },
  },
  instructions:
    'Read pose://catalog before staging sequences. Use only gesture ids from the catalog, keep sequences within 60 seconds, and call report_pose_sequence_error when no safe sequence can be staged.',
};

function logMcp(event, details = undefined) {
  const line = details
    ? `[pose-studio mcp] ${event} ${JSON.stringify(details)}\n`
    : `[pose-studio mcp] ${event}\n`;
  process.stderr.write(line);
}

const TOOL_DEFINITIONS = [
  {
    name: 'get_pose_state',
    description: 'Return the current pose-studio runtime and director takeover state.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
  },
  {
    name: 'stage_pose_sequence',
    description:
      'Stage a directed pose sequence into the running pose-studio app. Use only gesture ids from pose://catalog and keep the full sequence within 60 seconds.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['steps'],
      properties: {
        modelId: { type: 'string' },
        prompt: { type: 'string' },
        steps: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['gestureId'],
            properties: {
              gestureId: { type: 'string' },
            },
          },
        },
      },
    },
  },
  {
    name: 'report_pose_sequence_error',
    description:
      'Report that the user request could not be mapped into a valid pose-studio sequence. Use this instead of replying with plain text when no safe sequence can be staged.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['message'],
      properties: {
        modelId: { type: 'string' },
        prompt: { type: 'string' },
        message: { type: 'string' },
      },
    },
  },
  {
    name: 'stop_pose_sequence',
    description: 'Stop the current directed pose takeover and return the app to normal pose-studio mode.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        sequenceId: { type: 'string' },
      },
    },
  },
];

function toolResult(payload) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(payload, null, 2),
      },
    ],
    structuredContent: payload,
  };
}

function toProtocolError(error) {
  if (error instanceof McpError) {
    return error;
  }

  return new McpError(
    -32000,
    error instanceof Error ? error.message : 'Internal error',
    error && typeof error === 'object' && 'data' in error ? error.data : undefined,
  );
}

async function buildGestureCatalogDescription() {
  const catalog = await store.getCatalog();
  return catalog.gestures
    .map((gesture) => {
      const bestFor = Array.isArray(gesture.bestFor) ? gesture.bestFor.join(', ') : '';
      return `- gestureId: ${gesture.id} | name: ${gesture.label || gesture.id} | durationMs: ${gesture.durationMs} | supportsSpeech: ${gesture.supportsSpeech ? 'yes' : 'no'} | bestFor: ${bestFor}`;
    })
    .join('\n');
}

async function listTools() {
  logMcp('tools/list');
  const gestureCatalog = await buildGestureCatalogDescription();
  return TOOL_DEFINITIONS.map((tool) =>
    tool.name === 'stage_pose_sequence'
      ? {
          ...tool,
          description: `${tool.description}\nAvailable gestures:\n${gestureCatalog}`,
        }
      : tool,
  );
}

async function handleToolCall(name, args = {}) {
  logMcp('tools/call', {
    name,
    modelId: args?.modelId || '',
    sequenceId: args?.sequenceId || '',
    stepCount: Array.isArray(args?.steps) ? args.steps.length : 0,
  });
  switch (name) {
    case 'get_pose_state':
      return store.getState();
    case 'stage_pose_sequence':
      return store.stageSequence(args);
    case 'report_pose_sequence_error':
      return store.reportError(args);
    case 'stop_pose_sequence':
      return store.stopSequence(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
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

function createPoseStudioMcpServer() {
  const server = new Server(SERVER_INFO, SERVER_OPTIONS);

  server.setRequestHandler(
    ListToolsRequestSchema,
    wrapRequestHandler(async () => ({
      tools: await listTools(),
    })),
  );

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    logMcp('resources/list');
    return {
      resources: listPoseStudioResources(),
    };
  });

  server.setRequestHandler(
    ReadResourceRequestSchema,
    wrapRequestHandler(async (request) => {
      logMcp('resources/read', { uri: request.params?.uri || '' });
      return {
        contents: [await readPoseStudioResource(request.params?.uri || '', store)],
      };
    }),
  );

  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    logMcp('prompts/list');
    return {
      prompts: listPoseStudioPrompts(),
    };
  });

  server.setRequestHandler(
    GetPromptRequestSchema,
    wrapRequestHandler(async (request) => {
      logMcp('prompts/get', { name: request.params?.name || '' });
      return getPoseStudioPrompt(request.params?.name || '');
    }),
  );

  server.setRequestHandler(
    CallToolRequestSchema,
    wrapRequestHandler(async (request) => {
      const payload = await handleToolCall(
        request.params?.name,
        request.params?.arguments || {},
      );

      return toolResult(payload);
    }),
  );

  return server;
}

async function main() {
  const transport = new StdioServerTransport();
  const server = createPoseStudioMcpServer();
  logMcp('server/start', {
    stateFilePath: store.stateFilePath,
  });

  server.onerror = (error) => {
    process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  };

  await server.connect(transport);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exit(1);
});
