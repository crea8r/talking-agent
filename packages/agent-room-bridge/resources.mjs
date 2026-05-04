import { createHash } from 'node:crypto';

import {
  BUNDLED_MODELS,
  EMOTES,
  getGesturePresets,
} from '../avatar-layer-browser/index.js';
import {
  VOICE_MOOD_IDS,
} from '../voice-layer-browser/render-profiles.js';
import { CAPABILITIES_VERSION } from './index.mjs';

const MIME_TYPE = 'application/json';

export function buildAvatarCatalogUri(modelId = '') {
  const cleanedModelId = `${modelId || ''}`.trim();
  return cleanedModelId ? `avatar://catalog/${cleanedModelId}` : 'avatar://catalog';
}

export function buildAvatarCatalogVersion(modelId = '') {
  const gestures = getGesturePresets(modelId || BUNDLED_MODELS[0]?.id || '').map((gesture) => ({
    id: gesture.id,
    intent: gesture.intent,
    description: gesture.description,
    bestFor: gesture.bestFor,
  }));

  const payload = JSON.stringify({
    modelId: `${modelId || ''}`.trim() || 'all-models',
    emotes: EMOTES.map((emote) => ({
      id: emote.id,
      label: emote.label,
      note: emote.note,
    })),
    gestures,
  });

  return createHash('sha1').update(payload).digest('hex').slice(0, 12);
}

export function createBridgeCapabilitiesPayload() {
  return {
    protocolVersion: CAPABILITIES_VERSION,
    tools: ['join_call', 'wait_for_events', 'publish_actions', 'leave_call', 'get_recent_turns'],
    eventTypes: [
      'call.joined',
      'call.ready',
      'call.ending',
      'call.ended',
      'avatar.catalog.changed',
      'utt.start',
      'utt.partial',
      'utt.final',
      'utt.cancelled',
      'user.interrupted_agent',
      'agent.playback.started',
      'agent.playback.finished',
      'idle.timeout',
      'error',
    ],
    actionTypes: ['anim', 'speech'],
    waitForEvents: {
      defaultMaxEvents: 20,
      maxWaitMs: 30000,
      cursor: 'opaque increasing integer string',
    },
    voiceRendering: {
      speechActionFields: ['mood'],
      supportedMoods: VOICE_MOOD_IDS,
      notes:
        'Speech actions only need text plus an optional mood. The renderer derives the active character from the current avatar model and applies fixed mood presets to rate and pitch.',
    },
  };
}

export function createAvatarCatalogPayload(modelId = '') {
  const cleanedModelId = `${modelId || ''}`.trim();
  const gestures = getGesturePresets(cleanedModelId || BUNDLED_MODELS[0]?.id || '').map((gesture) => ({
    id: gesture.id,
    intent: gesture.intent,
    description: gesture.description,
    bestFor: gesture.bestFor,
  }));

  return {
    modelId: cleanedModelId || null,
    version: buildAvatarCatalogVersion(cleanedModelId),
    emotes: EMOTES.map((emote) => ({
      id: emote.id,
      label: emote.label,
      note: emote.note,
    })),
    gestures,
  };
}

export function listBridgeResources() {
  const resources = [
    {
      uri: 'bridge://capabilities',
      name: 'Bridge Capabilities',
      description: 'Protocol versions, tool names, event types, and action types for the talking-agent room bridge.',
      mimeType: MIME_TYPE,
    },
    {
      uri: 'avatar://catalog',
      name: 'Avatar Catalog (default)',
      description: 'Default avatar gesture and emote catalog.',
      mimeType: MIME_TYPE,
    },
  ];

  for (const model of BUNDLED_MODELS) {
    resources.push({
      uri: buildAvatarCatalogUri(model.id),
      name: `Avatar Catalog (${model.id})`,
      description: `Gesture and emote catalog for ${model.label}.`,
      mimeType: MIME_TYPE,
    });
  }

  return resources;
}

export function readBridgeResource(uri) {
  if (uri === 'bridge://capabilities') {
    return {
      uri,
      mimeType: MIME_TYPE,
      text: JSON.stringify(createBridgeCapabilitiesPayload(), null, 2),
    };
  }

  if (uri === 'avatar://catalog') {
    return {
      uri,
      mimeType: MIME_TYPE,
      text: JSON.stringify(createAvatarCatalogPayload(), null, 2),
    };
  }

  if (uri.startsWith('avatar://catalog/')) {
    const modelId = uri.slice('avatar://catalog/'.length).trim();
    if (!BUNDLED_MODELS.some((model) => model.id === modelId)) {
      throw new Error(`Unknown avatar catalog resource: ${uri}`);
    }

    return {
      uri,
      mimeType: MIME_TYPE,
      text: JSON.stringify(createAvatarCatalogPayload(modelId), null, 2),
    };
  }

  throw new Error(`Unknown resource: ${uri}`);
}

export function listBridgePrompts() {
  return [
    {
      name: 'call_agent_bootstrap',
      description: 'One-time operating instructions for joining the active call and replying with actions.',
      arguments: [],
    },
  ];
}

export function getBridgePrompt(name) {
  if (name !== 'call_agent_bootstrap') {
    throw new Error(`Unknown prompt: ${name}`);
  }

  return {
    description: 'How to operate the one-to-one talking-agent room bridge.',
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: [
            'Use `join_call` to attach to the active call.',
            'Read `avatar://catalog` or the model-specific catalog returned by `join_call` once, then cache it by version.',
            'Keep the receive loop on `wait_for_events`.',
            'Send gesture and speech output with `publish_actions`. For animation, use `gestureId` only. For speech actions, send text and optionally mood.',
            'Use `leave_call` when you are done or when the call should end.',
          ].join('\n'),
        },
      },
    ],
  };
}
