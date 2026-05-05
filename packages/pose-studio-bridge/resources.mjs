import { CAPABILITIES_VERSION, MAX_SEQUENCE_DURATION_MS } from './index.mjs';

const MIME_TYPE = 'application/json';

export function createPoseStudioCapabilitiesPayload() {
  return {
    protocolVersion: CAPABILITIES_VERSION,
    tools: ['get_pose_state', 'stage_pose_sequence', 'report_pose_sequence_error', 'stop_pose_sequence'],
    maxSequenceDurationMs: MAX_SEQUENCE_DURATION_MS,
    notes: [
      'Use only gesture ids from pose://catalog.',
      'If no valid sequence can be staged, call report_pose_sequence_error with a short user-facing explanation.',
      'The pose-studio app takes over the UI while a directed sequence is active.',
      'The browser transport controls are play, pause, replay, and stop.',
    ],
  };
}

export function createPoseCatalogPayload(catalog = {}) {
  return {
    activeModelId: catalog.activeModelId || '',
    activeModelLabel: catalog.activeModelLabel || '',
    requestedModelId: catalog.requestedModelId || catalog.activeModelId || '',
    catalogVersion: catalog.catalogVersion || '',
    maxSequenceDurationMs: MAX_SEQUENCE_DURATION_MS,
    models: Array.isArray(catalog.models) ? catalog.models : [],
    gestures: Array.isArray(catalog.gestures) ? catalog.gestures : [],
  };
}

export function createPoseStatePayload(state = {}) {
  return {
    runtime: state.runtime || {},
    director: state.director || {},
  };
}

export function listPoseStudioResources() {
  return [
    {
      uri: 'pose://capabilities',
      name: 'Pose Studio Capabilities',
      description: 'Tool names, runtime notes, and sequence limits for the pose-studio director bridge.',
      mimeType: MIME_TYPE,
    },
    {
      uri: 'pose://catalog',
      name: 'Pose Studio Catalog',
      description: 'Current model catalog with gesture metadata and durations.',
      mimeType: MIME_TYPE,
    },
    {
      uri: 'pose://state',
      name: 'Pose Studio State',
      description: 'Current runtime and director takeover state for pose-studio.',
      mimeType: MIME_TYPE,
    },
  ];
}

export async function readPoseStudioResource(uri, store) {
  if (uri === 'pose://capabilities') {
    return {
      uri,
      mimeType: MIME_TYPE,
      text: JSON.stringify(createPoseStudioCapabilitiesPayload(), null, 2),
    };
  }

  if (uri === 'pose://catalog') {
    const catalog = await store.getCatalog();
    return {
      uri,
      mimeType: MIME_TYPE,
      text: JSON.stringify(createPoseCatalogPayload(catalog), null, 2),
    };
  }

  if (uri === 'pose://state') {
    const state = await store.getState();
    return {
      uri,
      mimeType: MIME_TYPE,
      text: JSON.stringify(createPoseStatePayload(state), null, 2),
    };
  }

  throw new Error(`Unknown resource: ${uri}`);
}

export function listPoseStudioPrompts() {
  return [
    {
      name: 'pose_director_bootstrap',
      description: 'How to direct the pose-studio browser app with gesture sequences.',
      arguments: [],
    },
  ];
}

export function getPoseStudioPrompt(name) {
  if (name !== 'pose_director_bootstrap') {
    throw new Error(`Unknown prompt: ${name}`);
  }

  return {
    description: 'How to direct pose-studio with gesture sequences.',
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: [
            'Read pose://catalog before sending any sequence.',
            'Choose only gesture ids from the catalog.',
            'Keep the full sequence within the 60 second limit.',
            'Use stage_pose_sequence to send a valid sequence into the app.',
            'If you cannot stage a valid sequence, call report_pose_sequence_error instead of replying with plain text.',
            'Use stop_pose_sequence when the directed takeover should end.',
          ].join('\n'),
        },
      },
    ],
  };
}
