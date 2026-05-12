import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  VRMExpressionPresetName,
  VRMHumanBoneName,
  VRMLoaderPlugin,
  VRMUtils,
} from '@pixiv/three-vrm';
import {
  VRMAnimationLoaderPlugin,
  createVRMAnimationHumanoidTracks,
} from '@pixiv/three-vrm-animation';
import { ANIMATION_MANIFEST } from './animation-manifest.js';

export { ANIMATION_MANIFEST } from './animation-manifest.js';

export const BUNDLED_MODELS = [
  {
    id: 'bhf-1-2',
    label: 'Red Tinker Bell',
    technicalLabel: 'Bhf 1.2',
    path: '/models/Bhf_1_2.vrm',
    note: 'Young female red fairy lead with a bright playful read.',
    voiceProfile: {
      label: 'Bright playful young voice',
      preferredVoiceNames: [
        'Flo (English (US))',
        'Flo (English (UK))',
        'Sandy (English (US))',
        'Sandy (English (UK))',
        'Kathy',
        'Samantha',
      ],
    },
  },
  {
    id: 'fbf-1-0',
    label: 'Green Fairy',
    technicalLabel: 'Fbf 1.0',
    path: '/models/Fbf_1_0.vrm',
    note: 'Young female green fairy with a softer, calmer stage read.',
    voiceProfile: {
      label: 'Soft warm young voice',
      preferredVoiceNames: [
        'Shelley (English (US))',
        'Shelley (English (UK))',
        'Samantha',
        'Moira',
        'Karen',
      ],
    },
  },
  {
    id: 'smg-1-0',
    label: 'Snowshoe',
    technicalLabel: 'Smg 1.0',
    path: '/models/Smg_1_0.vrm',
    note: 'Young female snow-themed character with a cleaner, cooler read.',
    voiceProfile: {
      label: 'Clean cool young voice',
      preferredVoiceNames: [
        'Samantha',
        'Sandy (English (US))',
        'Sandy (English (UK))',
        'Shelley (English (US))',
        'Tessa',
      ],
    },
  },
];

export const DEFAULT_MODEL = BUNDLED_MODELS[0];
const BUNDLED_MODEL_MAP = new Map(BUNDLED_MODELS.map((model) => [model.id, model]));

function normalizeVoiceName(value) {
  return `${value || ''}`.trim().toLowerCase();
}

function getVoiceNameVariants(name) {
  const trimmed = `${name || ''}`.trim();
  if (!trimmed) {
    return [];
  }

  const baseName = trimmed.replace(/\s*\(.+\)\s*$/, '').trim();
  return Array.from(new Set([trimmed, baseName].filter(Boolean).map(normalizeVoiceName)));
}

export function getBundledModel(modelId = DEFAULT_MODEL.id) {
  return BUNDLED_MODEL_MAP.get(modelId) || DEFAULT_MODEL;
}

export function pickVoiceForModel(modelId = DEFAULT_MODEL.id, voices = []) {
  const model = getBundledModel(modelId);
  const preferredVoiceNames = model.voiceProfile?.preferredVoiceNames || [];

  for (const preferredName of preferredVoiceNames) {
    const variants = getVoiceNameVariants(preferredName);
    const matchedVoice = voices.find((voice) => {
      const voiceName = normalizeVoiceName(voice?.name);
      return variants.includes(voiceName);
    });

    if (matchedVoice?.name) {
      return matchedVoice.name;
    }
  }

  return '';
}

function createBundledAnimation(definition) {
  return {
    id: definition.id,
    label: definition.id,
    path: `/animations/${definition.file}`,
    note: definition.description,
    description: definition.description,
    bestFor: definition.bestFor,
  };
}

export const BUNDLED_ANIMATIONS = ANIMATION_MANIFEST.map(createBundledAnimation);

export const STAGES = [
  {
    id: 'neon-loft',
    label: 'Neon Loft',
    note: 'Cyan key light with a magenta rim for a sci fi control room feel.',
    shell: {
      '--scene-bg-start': '#070d19',
      '--scene-bg-end': '#010308',
      '--scene-grid': 'rgba(100, 237, 255, 0.16)',
      '--scene-glow': 'rgba(89, 225, 255, 0.24)',
      '--scene-pulse-a': 'rgba(255, 90, 208, 0.22)',
      '--scene-pulse-b': 'rgba(91, 239, 255, 0.18)',
    },
    lights: {
      exposure: 1.12,
      ambientSky: '#8ebfff',
      ambientGround: '#0a0c13',
      ambientIntensity: 0.82,
      key: '#8cf6ff',
      keyIntensity: 2.1,
      keyPosition: [1.55, 1.9, 2.7],
      fill: '#ff8bc5',
      fillIntensity: 1.1,
      fillPosition: [-1.4, 1.15, 1.45],
      rim: '#6f7cff',
      rimIntensity: 1.45,
      rimPosition: [-1.25, 2.15, -2.2],
    },
  },
  {
    id: 'sunset-studio',
    label: 'Sunset Studio',
    note: 'Warmer daylight read with softer contrast and cleaner skin light.',
    shell: {
      '--scene-bg-start': '#1c1423',
      '--scene-bg-end': '#080b14',
      '--scene-grid': 'rgba(255, 217, 164, 0.12)',
      '--scene-glow': 'rgba(255, 180, 108, 0.2)',
      '--scene-pulse-a': 'rgba(255, 173, 104, 0.18)',
      '--scene-pulse-b': 'rgba(118, 213, 255, 0.14)',
    },
    lights: {
      exposure: 1.08,
      ambientSky: '#ffd4b1',
      ambientGround: '#191018',
      ambientIntensity: 0.92,
      key: '#ffd6a8',
      keyIntensity: 1.9,
      keyPosition: [1.6, 1.85, 2.5],
      fill: '#8ed6ff',
      fillIntensity: 0.9,
      fillPosition: [-1.5, 1.2, 1.7],
      rim: '#ff9b8c',
      rimIntensity: 1.15,
      rimPosition: [-1.1, 2.0, -2.1],
    },
  },
  {
    id: 'midnight-hangar',
    label: 'Midnight Hangar',
    note: 'Cooler blue steel lighting with harder edge separation and less warmth.',
    shell: {
      '--scene-bg-start': '#060914',
      '--scene-bg-end': '#010205',
      '--scene-grid': 'rgba(113, 183, 255, 0.12)',
      '--scene-glow': 'rgba(93, 145, 255, 0.18)',
      '--scene-pulse-a': 'rgba(89, 123, 255, 0.18)',
      '--scene-pulse-b': 'rgba(122, 233, 255, 0.14)',
    },
    lights: {
      exposure: 1,
      ambientSky: '#89b0ff',
      ambientGround: '#090a11',
      ambientIntensity: 0.74,
      key: '#8fd8ff',
      keyIntensity: 1.75,
      keyPosition: [1.3, 1.8, 2.4],
      fill: '#6f81ff',
      fillIntensity: 0.82,
      fillPosition: [-1.45, 1.0, 1.5],
      rim: '#bfe2ff',
      rimIntensity: 1.3,
      rimPosition: [-1.2, 2.2, -2.3],
    },
  },
];

const B = VRMHumanBoneName;

const GESTURE_MOTION_OPTIONS = {
  Greeting: { fadeIn: 0.18 },
  Goodbye: { fadeIn: 0.18 },
};

const GESTURE_INTENTS = {
  Pose: 'idle',
  LookAround: 'listen',
  Thinking: 'thinking',
  Greeting: 'greet',
  Clapping: 'celebrate',
  Surprised: 'react',
  Sad: 'sad',
  Angry: 'angry',
  Blush: 'blush',
  Jump: 'jump',
  Sleepy: 'sleepy',
  No: 'no',
};

export const EMOTES = [
  {
    id: 'neutral',
    label: 'Neutral',
    note: 'Balanced default expression with steady eye contact.',
    expressions: {},
    head: [0, 0, 0],
    chest: [0, 0, 0],
    gaze: [0, 0],
    blinkRate: 1,
    wander: 0.05,
    mouthBoost: 1,
  },
  {
    id: 'warm',
    label: 'Warm',
    note: 'Softer gaze, slight smile, and a more open face.',
    expressions: {
      [VRMExpressionPresetName.Happy]: 0.28,
      [VRMExpressionPresetName.Relaxed]: 0.18,
    },
    head: [-2.5, -5, 1],
    chest: [1.5, -2, 0.5],
    gaze: [0.03, -0.015],
    blinkRate: 1.08,
    wander: 0.065,
    mouthBoost: 1.05,
  },
  {
    id: 'focused',
    label: 'Focused',
    note: 'Sharper attention with reduced blinking and a narrower smile.',
    expressions: {
      [VRMExpressionPresetName.Angry]: 0.12,
      [VRMExpressionPresetName.Relaxed]: 0.04,
    },
    head: [1, 2.5, -0.4],
    chest: [-1, 1.25, 0],
    gaze: [0, 0.02],
    blinkRate: 0.86,
    wander: 0.035,
    mouthBoost: 0.95,
  },
  {
    id: 'playful',
    label: 'Playful',
    note: 'Lighter tilt with more smile and a little more eye travel.',
    expressions: {
      [VRMExpressionPresetName.Happy]: 0.42,
      [VRMExpressionPresetName.Relaxed]: 0.12,
      [VRMExpressionPresetName.Surprised]: 0.06,
    },
    head: [-3.5, 6, 1.5],
    chest: [1, 1.25, 1],
    gaze: [0.05, -0.02],
    blinkRate: 1.14,
    wander: 0.08,
    mouthBoost: 1.08,
  },
];

function createVrmaGesture(definition) {
  const motionOptions = GESTURE_MOTION_OPTIONS[definition.id] || {};

  return {
    id: definition.id,
    intent: GESTURE_INTENTS[definition.id] || definition.id,
    label: definition.id,
    note: definition.description,
    description: definition.description,
    bestFor: definition.bestFor,
    file: definition.file,
    pose: {},
    motion: createVrmaMotion(definition.id, motionOptions),
  };
}

export const GESTURES = ANIMATION_MANIFEST.map(createVrmaGesture);

const LEGACY_GESTURE_ALIASES = new Map([
  ['bhf-calm-front', 'Pose'],
  ['fbf-runway-idle', 'Pose'],
  ['smg-alert-idle', 'Pose'],
  ['bhf-open-explain', 'Pose'],
  ['fbf-presentation', 'Pose'],
  ['smg-directive', 'Pose'],
  ['bhf-soft-listen', 'LookAround'],
  ['fbf-shoulder-tuck', 'LookAround'],
  ['smg-ready-listen', 'LookAround'],
  ['bhf-quiet-think', 'Thinking'],
  ['fbf-aside-think', 'Thinking'],
  ['smg-scan', 'Thinking'],
  ['bhf-hand-wave', 'Greeting'],
  ['bhf-side-wave', 'Greeting'],
  ['fbf-fashion-wave', 'Greeting'],
  ['smg-signal', 'Greeting'],
  ['bhf-celebrate-clap', 'Clapping'],
  ['bhf-surprised-react', 'Surprised'],
  ['bhf-sad-pause', 'Sad'],
  ['dogeza', 'Apologize'],
  ['gekirei', 'Cheer'],
  ['shake', 'No'],
  ['Shake', 'No'],
]);

const DEFAULT_GESTURE_MODEL_ID = 'default';
const BUNDLED_ANIMATION_MAP = new Map(BUNDLED_ANIMATIONS.map((animation) => [animation.id, animation]));
const BUNDLED_ANIMATION_SOURCE_CACHE = new Map();

function createVrmaMotion(clipId, { fadeIn = 0.28, loop = 'repeat' } = {}) {
  return {
    type: 'vrma',
    clipId,
    fadeIn,
    loop,
  };
}

export const MODEL_GESTURES = {
  [DEFAULT_GESTURE_MODEL_ID]: GESTURES,
  'bhf-1-2': GESTURES,
  'fbf-1-0': GESTURES,
  'smg-1-0': GESTURES,
};

const ALL_GESTURE_CATALOGS = [GESTURES];

export function getGesturePresets(modelId = DEFAULT_GESTURE_MODEL_ID) {
  return MODEL_GESTURES[modelId] || MODEL_GESTURES[DEFAULT_GESTURE_MODEL_ID];
}

function findGestureByIdAcrossCatalogs(gestureId) {
  if (!gestureId) {
    return null;
  }

  const legacyGestureId = LEGACY_GESTURE_ALIASES.get(gestureId);
  if (legacyGestureId) {
    return GESTURES.find((gesture) => gesture.id === legacyGestureId) || null;
  }

  for (const catalog of ALL_GESTURE_CATALOGS) {
    const match = catalog.find(
      (gesture) => gesture.id === gestureId || gesture.bestFor?.includes(gestureId),
    );
    if (match) {
      return match;
    }
  }

  return null;
}

export function resolveGesturePreset(
  modelId,
  requestedGestureId,
  { fallbackToFirst = true } = {},
) {
  const gestures = getGesturePresets(modelId);
  if (!gestures.length) {
    return null;
  }

  if (requestedGestureId) {
    const legacyGestureId = LEGACY_GESTURE_ALIASES.get(requestedGestureId);
    if (legacyGestureId) {
      const legacyMatch = gestures.find((gesture) => gesture.id === legacyGestureId);
      if (legacyMatch) {
        return legacyMatch;
      }
    }

    const exactMatch = gestures.find(
      (gesture) => gesture.id === requestedGestureId || gesture.bestFor?.includes(requestedGestureId),
    );
    if (exactMatch) {
      return exactMatch;
    }

    const semanticMatch = gestures.find((gesture) => gesture.intent === requestedGestureId);
    if (semanticMatch) {
      return semanticMatch;
    }

    const sourceGesture = findGestureByIdAcrossCatalogs(requestedGestureId);
    if (sourceGesture?.intent) {
      const mappedGesture = gestures.find((gesture) => gesture.intent === sourceGesture.intent);
      if (mappedGesture) {
        return mappedGesture;
      }
    }
  }

  return fallbackToFirst ? gestures[0] : null;
}

export const MOUTH_CUES = ['rest', 'aa', 'ih', 'ou', 'ee', 'oh'];

export const DEFAULT_AVATAR_FEATURE_FLAGS = Object.freeze({
  smoothGestureTransitions: true,
});

export function normalizeAvatarFeatureFlags(featureFlags = {}) {
  return {
    smoothGestureTransitions: featureFlags?.smoothGestureTransitions !== false,
  };
}

export function resolveGestureTransitionConfig({
  nextFadeIn = 0.24,
  featureFlags = DEFAULT_AVATAR_FEATURE_FLAGS,
} = {}) {
  const normalizedFlags = normalizeAvatarFeatureFlags(featureFlags);
  const smoothGestureTransitions = normalizedFlags.smoothGestureTransitions !== false;

  return {
    fadeIn: smoothGestureTransitions ? Math.max(nextFadeIn, 0.36) : nextFadeIn,
    useCrossFade: smoothGestureTransitions,
    warp: smoothGestureTransitions,
  };
}

const STAGE_MAP = new Map(STAGES.map((stage) => [stage.id, stage]));
const EMOTE_MAP = new Map(EMOTES.map((emote) => [emote.id, emote]));

const MOUTH_TO_EXPRESSION = {
  rest: null,
  aa: VRMExpressionPresetName.Aa,
  ih: VRMExpressionPresetName.Ih,
  ou: VRMExpressionPresetName.Ou,
  ee: VRMExpressionPresetName.Ee,
  oh: VRMExpressionPresetName.Oh,
};

const MOUTH_STRENGTH = {
  rest: 0,
  aa: 1,
  ih: 0.72,
  ou: 0.68,
  ee: 0.64,
  oh: 0.84,
};

export function createAvatarLayer({
  canvas,
  stageShell = null,
  initialStageId = STAGES[0].id,
  initialEmoteId = EMOTES[0].id,
  initialGestureId = GESTURES[0].id,
  initialEnergy = 1,
  featureFlags = DEFAULT_AVATAR_FEATURE_FLAGS,
  pointerMode = 'look',
  preserveDrawingBuffer = false,
  onLog = null,
  onLookTargetChange = null,
} = {}) {
  if (!canvas) {
    throw new Error('createAvatarLayer requires a canvas element.');
  }

  const state = {
    currentStageId: STAGE_MAP.has(initialStageId) ? initialStageId : STAGES[0].id,
    currentEmoteId: EMOTE_MAP.has(initialEmoteId) ? initialEmoteId : EMOTES[0].id,
    currentModelId: DEFAULT_GESTURE_MODEL_ID,
    currentGestureId:
      resolveGesturePreset(DEFAULT_GESTURE_MODEL_ID, initialGestureId)?.id || GESTURES[0].id,
    currentGestureStartedAt: getNowMs(),
    currentModelLabel: 'No model',
    currentMouthCue: 'rest',
    speaking: false,
    energy: clamp(initialEnergy, 0.65, 1.5),
    lookTargetLabel: 'center',
    isLoadingModel: false,
    poseSampleTimeMs: null,
    displayMode: 'mesh',
    featureFlags: normalizeAvatarFeatureFlags(featureFlags),
  };

  const runtime = createRendererRuntime({
    canvas,
    stageShell,
    state,
    pointerMode,
    preserveDrawingBuffer,
    onLog,
    onLookTargetChange(label) {
      state.lookTargetLabel = label;
      onLookTargetChange?.(label);
    },
  });

  runtime.start();
  applyStage(state.currentStageId);
  applyEnergy(state.energy);

  async function loadModel(
    url,
    {
      label = 'Model',
      modelId = DEFAULT_GESTURE_MODEL_ID,
      onProgress = null,
    } = {},
  ) {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    let fallbackProgress = 10;

    const reportProgress = ({
      percent = 0,
      phase = 'model',
      loaded = 0,
      total = 0,
      lengthComputable = false,
    } = {}) => {
      if (typeof onProgress !== 'function') {
        return;
      }

      onProgress({
        percent: Math.max(0, Math.min(100, Math.round(percent))),
        phase,
        loaded,
        total,
        lengthComputable,
        label,
        modelId,
      });
    };

    state.isLoadingModel = true;
    emitLog(onLog, 'info', `Loading model ${label}.`);
    reportProgress({ percent: 0, phase: 'model' });

    try {
      const resolvedModelId = MODEL_GESTURES[modelId] ? modelId : DEFAULT_GESTURE_MODEL_ID;
      const gltf = await loader.loadAsync(url, (event) => {
        const loaded = Number(event?.loaded) || 0;
        const total = Number(event?.total) || 0;
        const lengthComputable = total > 0;

        if (lengthComputable) {
          reportProgress({
            percent: (loaded / total) * 88,
            phase: 'model',
            loaded,
            total,
            lengthComputable,
          });
          return;
        }

        fallbackProgress = Math.min(84, fallbackProgress + 7);
        reportProgress({
          percent: fallbackProgress,
          phase: 'model',
          loaded,
          total,
          lengthComputable,
        });
      });
      const vrm = gltf.userData.vrm;
      reportProgress({ percent: 90, phase: 'prepare' });

      if (!vrm) {
        throw new Error('The selected file did not expose a VRM avatar.');
      }

      VRMUtils.removeUnnecessaryVertices(gltf.scene);

      if (vrm.meta?.metaVersion === '0') {
        VRMUtils.rotateVRM0(vrm);
      }

      state.currentModelId = resolvedModelId;
      state.currentGestureId =
        resolveGesturePreset(state.currentModelId, state.currentGestureId)?.id ||
        getGesturePresets(state.currentModelId)[0]?.id ||
        GESTURES[0].id;
      state.currentGestureStartedAt = getNowMs();
      reportProgress({ percent: 94, phase: 'hydrate' });
      await runtime.setVRM(vrm);
      state.currentModelLabel = label;
      reportProgress({ percent: 100, phase: 'ready' });
      emitLog(onLog, 'info', `Model ready: ${label}.`);
      return getSnapshot();
    } finally {
      state.isLoadingModel = false;
    }
  }

  function applyStage(stageId) {
    const stage = STAGE_MAP.get(stageId) || STAGES[0];
    state.currentStageId = stage.id;

    if (stageShell) {
      Object.entries(stage.shell).forEach(([token, value]) => {
        stageShell.style.setProperty(token, value);
      });
    }

    runtime.applyStageLighting(stage);
    return getSnapshot();
  }

  function applyEnergy(value) {
    state.energy = clamp(value, 0.65, 1.5);
    if (stageShell) {
      stageShell.style.setProperty('--energy-multiplier', state.energy.toFixed(2));
    }
    return getSnapshot();
  }

  function setEmote(emoteId) {
    state.currentEmoteId = EMOTE_MAP.has(emoteId) ? emoteId : EMOTES[0].id;
    return getSnapshot();
  }

  function setGesture(gestureId, { restart = false, transition = 'fade', loop = undefined } = {}) {
    const nextGestureId =
      resolveGesturePreset(state.currentModelId, gestureId)?.id ||
      getGesturePresets(state.currentModelId)[0]?.id ||
      GESTURES[0].id;
    if (restart || nextGestureId !== state.currentGestureId) {
      state.currentGestureStartedAt = getNowMs();
    }
    state.currentGestureId = nextGestureId;
    runtime.syncGestureMotion({ restart, transition, loop });
    return getSnapshot();
  }

  function setSpeaking(active) {
    state.speaking = Boolean(active);
    return getSnapshot();
  }

  function setFeatureFlags(nextFeatureFlags = {}) {
    state.featureFlags = {
      ...state.featureFlags,
      ...normalizeAvatarFeatureFlags(nextFeatureFlags),
    };
    return getSnapshot();
  }

  function setMouthCue(mouthCue) {
    state.currentMouthCue = MOUTH_CUES.includes(mouthCue) ? mouthCue : 'rest';
    return getSnapshot();
  }

  function setPoseSampleTime(timeMs = null) {
    if (Number.isFinite(timeMs) && timeMs >= 0) {
      state.poseSampleTimeMs = timeMs;
    } else {
      state.poseSampleTimeMs = null;
    }

    runtime.syncGestureMotion();
    return getSnapshot();
  }

  function setGesturePaused(paused = true) {
    if (Number.isFinite(state.poseSampleTimeMs)) {
      state.poseSampleTimeMs = null;
    }

    runtime.setGesturePaused(Boolean(paused));
    return getSnapshot();
  }

  function recenterGaze() {
    runtime.look.pointerActive = false;
    runtime.look.pointerTarget.set(0, 0);
  }

  function setDisplayMode(mode = 'mesh') {
    state.displayMode = ['mesh', 'skeleton', 'bones'].includes(mode) ? mode : 'mesh';
    runtime.applyDisplayMode(state.displayMode);
    return getSnapshot();
  }

  function setOrbitSnapDegrees(degrees = 0) {
    runtime.setOrbitSnapDegrees(degrees);
    return getSnapshot();
  }

  function captureHumanoidSkeleton() {
    if (!runtime.currentVRM?.humanoid) {
      return null;
    }

    const skeleton = {};
    const includedNodes = new Map();

    Object.values(VRMHumanBoneName).forEach((boneName) => {
      const node = runtime.currentVRM.humanoid.getRawBoneNode(boneName);
      if (node) {
        includedNodes.set(node, boneName);
      }
    });

    includedNodes.forEach((boneName, node) => {
      skeleton[boneName] = {
        name: node.name || boneName,
        translation: node.position.toArray(),
        children: node.children.map((childNode) => includedNodes.get(childNode)).filter(Boolean),
      };
    });

    return skeleton;
  }

  function playPreviewClip(clip, options = {}) {
    runtime.playPreviewClip(clip, options);
    return getSnapshot();
  }

  function pausePreviewClip() {
    runtime.pausePreviewClip();
    return getSnapshot();
  }

  function resumePreviewClip() {
    runtime.resumePreviewClip();
    return getSnapshot();
  }

  function stopPreviewClip() {
    runtime.stopPreviewClip();
    return getSnapshot();
  }

  function getPreviewPlaybackState() {
    return runtime.getPreviewPlaybackState();
  }

  function getSnapshot() {
    return {
      ready: Boolean(runtime.currentVRM),
      loading: state.isLoadingModel,
      modelId: state.currentModelId,
      modelLabel: state.currentModelLabel,
      stageId: state.currentStageId,
      emoteId: state.currentEmoteId,
      gestureId: state.currentGestureId,
      availableGestures: getGesturePresets(state.currentModelId).map((gesture) => ({
        id: gesture.id,
        intent: gesture.intent,
        label: gesture.label,
        file: gesture.file,
        note: gesture.note,
        description: gesture.description,
        bestFor: gesture.bestFor,
        durationMs: Math.round((runtime.animation.clips.get(gesture.motion?.clipId)?.duration || 0) * 1000),
      })),
      mouthCue: state.currentMouthCue,
      speaking: state.speaking,
      energy: state.energy,
      displayMode: state.displayMode,
      lookTargetLabel: state.lookTargetLabel,
      poseSampleTimeMs: state.poseSampleTimeMs,
      gesturePaused: Boolean(runtime.animation.activeAction?.paused),
      featureFlags: { ...state.featureFlags },
    };
  }

  function destroy() {
    runtime.dispose();
  }

  return {
    DEFAULT_MODEL,
    captureHumanoidSkeleton,
    destroy,
    getPreviewPlaybackState,
    getSnapshot,
    loadModel,
    pausePreviewClip,
    playPreviewClip,
    recenterGaze,
    resumePreviewClip,
    setDisplayMode,
    setEmote,
    setEnergy: applyEnergy,
    setFeatureFlags,
    setGesture,
    setGesturePaused,
    setMouthCue,
    setOrbitSnapDegrees,
    setPoseSampleTime,
    setSpeaking,
    setStage: applyStage,
    stopPreviewClip,
  };
}

function createRendererRuntime({
  canvas,
  stageShell,
  state,
  pointerMode,
  preserveDrawingBuffer,
  onLog,
  onLookTargetChange,
}) {
  const scene = new THREE.Scene();
  const clock = new THREE.Clock();
  const camera = new THREE.PerspectiveCamera(29, canvas.clientWidth / Math.max(canvas.clientHeight, 1), 0.1, 30);
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer,
  });

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  camera.position.set(0, 1.3, 1.62);

  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x0a0a11, 0.85);
  const keyLight = new THREE.DirectionalLight(0x9deeff, 2);
  const fillLight = new THREE.DirectionalLight(0xff93d0, 0.95);
  const rimLight = new THREE.DirectionalLight(0x89a2ff, 1.25);
  const lightTarget = new THREE.Object3D();
  const modelPivot = new THREE.Group();
  const lookTarget = new THREE.Object3D();

  lightTarget.position.set(0, 1.2, 0);
  keyLight.target = lightTarget;
  fillLight.target = lightTarget;
  rimLight.target = lightTarget;

  scene.add(hemiLight, keyLight, fillLight, rimLight, lightTarget, modelPivot, lookTarget);

  const runtime = {
    camera,
    currentVRM: null,
    rig: null,
    animation: {
      activeAction: null,
      activeClipId: null,
      actions: new Map(),
      clips: new Map(),
      mixer: null,
      previewAction: null,
    },
    display: {
      mode: state.displayMode || 'mesh',
      skeletonHelper: null,
      skinnedMeshes: [],
    },
    look: {
      pointerActive: false,
      pointerTarget: new THREE.Vector2(0, 0),
      currentOffset: new THREE.Vector2(0, 0),
      targetObject: lookTarget,
      seed: Math.random() * Math.PI * 2,
    },
    orbit: {
      enabled: pointerMode === 'rotate',
      dragging: false,
      pointerId: null,
      startX: 0,
      startY: 0,
      baseYaw: 0,
      basePitch: 0,
      targetYaw: 0,
      targetPitch: 0,
      currentYaw: 0,
      currentPitch: 0,
      snapRadians: 0,
    },
    blink: {
      active: false,
      startedAt: 0,
      durationMs: 140,
      nextAt: performance.now() + 1600,
      weight: 0,
    },
    start,
    dispose,
    setVRM,
    setGesturePaused,
    syncGestureMotion,
    applyStageLighting,
    applyDisplayMode,
    getPreviewPlaybackState,
    pausePreviewClip,
    playPreviewClip,
    resumePreviewClip,
    setOrbitSnapDegrees,
    stopPreviewClip,
  };

  function start() {
    resize();
    window.addEventListener('resize', resize);
    stageShell?.addEventListener('pointerdown', handlePointerDown);
    stageShell?.addEventListener('pointermove', handlePointerMove);
    stageShell?.addEventListener('pointerup', handlePointerUp);
    stageShell?.addEventListener('pointercancel', handlePointerUp);
    stageShell?.addEventListener('pointerleave', handlePointerLeave);
    renderer.setAnimationLoop(renderFrame);
  }

  function dispose() {
    renderer.setAnimationLoop(null);
    window.removeEventListener('resize', resize);
    stageShell?.removeEventListener('pointerdown', handlePointerDown);
    stageShell?.removeEventListener('pointermove', handlePointerMove);
    stageShell?.removeEventListener('pointerup', handlePointerUp);
    stageShell?.removeEventListener('pointercancel', handlePointerUp);
    stageShell?.removeEventListener('pointerleave', handlePointerLeave);

    clearCurrentVRM();

    renderer.dispose();
  }

  function resize() {
    const width = canvas.clientWidth || 1040;
    const height = canvas.clientHeight || 1240;

    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
  }

  function handlePointerDown(event) {
    if (!runtime.orbit.enabled || !stageShell) {
      return;
    }

    if (event.pointerType !== 'touch' && event.button !== 0) {
      return;
    }

    runtime.orbit.dragging = true;
    runtime.orbit.pointerId = event.pointerId;
    runtime.orbit.startX = event.clientX;
    runtime.orbit.startY = event.clientY;
    runtime.orbit.baseYaw = runtime.orbit.targetYaw;
    runtime.orbit.basePitch = runtime.orbit.targetPitch;
    runtime.look.pointerActive = false;
    stageShell.dataset.dragging = 'true';
    stageShell.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function handlePointerMove(event) {
    if (runtime.orbit.enabled) {
      if (!runtime.orbit.dragging || event.pointerId !== runtime.orbit.pointerId) {
        return;
      }

      const deltaX = event.clientX - runtime.orbit.startX;
      const deltaY = event.clientY - runtime.orbit.startY;
      let nextYaw = runtime.orbit.baseYaw + deltaX * 0.012;
      if (runtime.orbit.snapRadians > 0) {
        nextYaw = Math.round(nextYaw / runtime.orbit.snapRadians) * runtime.orbit.snapRadians;
      }
      runtime.orbit.targetYaw = THREE.MathUtils.clamp(nextYaw, -Math.PI, Math.PI);
      runtime.orbit.targetPitch = THREE.MathUtils.clamp(runtime.orbit.basePitch + deltaY * 0.008, -0.42, 0.42);
      event.preventDefault();
      return;
    }

    const rect = stageShell.getBoundingClientRect();
    const normalizedX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const normalizedY = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    runtime.look.pointerActive = true;
    runtime.look.pointerTarget.set(normalizedX * 0.24, normalizedY * -0.15);
  }

  function handlePointerUp(event) {
    if (!runtime.orbit.enabled || event.pointerId !== runtime.orbit.pointerId) {
      return;
    }

    runtime.orbit.dragging = false;
    runtime.orbit.pointerId = null;
    stageShell?.releasePointerCapture?.(event.pointerId);
    if (stageShell) {
      delete stageShell.dataset.dragging;
    }
  }

  function handlePointerLeave() {
    if (runtime.orbit.enabled) {
      return;
    }

    runtime.look.pointerActive = false;
  }

  function renderFrame() {
    const delta = Math.min(clock.getDelta(), 0.05);
    const now = performance.now();
    resize();
    updateBlink(now);
    runtime.animation.mixer?.update(delta);
    updatePose(delta, now);
    updateLookTarget(delta, now);
    updateOrbit(delta);

    if (runtime.currentVRM) {
      applyExpressionState();
      runtime.currentVRM.update(delta);
    }

    renderer.render(scene, camera);
  }

  async function setVRM(vrm) {
    clearCurrentVRM();

    runtime.currentVRM = vrm;
    modelPivot.add(vrm.scene);
    prepareModel(vrm);
    runtime.rig = bindRig(vrm);
    runtime.animation.mixer = new THREE.AnimationMixer(vrm.scene);
    await hydrateAnimationClipsForCurrentModel();
    alignCameraToRig();
    runtime.look.pointerActive = false;
    runtime.look.pointerTarget.set(0, 0);
    runtime.blink.active = false;
    runtime.blink.weight = 0;
    runtime.blink.nextAt = performance.now() + 1200;
    runtime.display.skinnedMeshes = [];
    vrm.scene.traverse((object) => {
      if (object.isSkinnedMesh) {
        runtime.display.skinnedMeshes.push(object);
      }
    });
    runtime.display.skeletonHelper = new THREE.SkeletonHelper(vrm.scene);
    runtime.display.skeletonHelper.visible = false;
    modelPivot.add(runtime.display.skeletonHelper);
    applyDisplayMode(state.displayMode || 'mesh');
    syncGestureMotion();
  }

  function clearCurrentVRM() {
    runtime.animation.activeAction?.stop();
    runtime.animation.previewAction?.stop();
    runtime.animation.activeAction = null;
    runtime.animation.activeClipId = null;
    runtime.animation.previewAction = null;
    runtime.animation.actions.clear();
    runtime.animation.clips.clear();
    runtime.animation.mixer?.stopAllAction();
    runtime.animation.mixer = null;

    if (runtime.display.skeletonHelper) {
      modelPivot.remove(runtime.display.skeletonHelper);
      runtime.display.skeletonHelper = null;
    }
    runtime.display.skinnedMeshes = [];

    if (runtime.currentVRM) {
      modelPivot.remove(runtime.currentVRM.scene);
      VRMUtils.deepDispose(runtime.currentVRM.scene);
      runtime.currentVRM = null;
    }
  }

  async function hydrateAnimationClipsForCurrentModel() {
    runtime.animation.actions.clear();
    runtime.animation.clips.clear();

    if (!runtime.currentVRM || !runtime.animation.mixer) {
      return;
    }

    const clipIds = new Set(
      getGesturePresets(state.currentModelId)
        .map((gesture) => gesture.motion?.clipId)
        .filter(Boolean),
    );

    const clips = await Promise.all(
      [...clipIds].map(async (clipId) => {
        try {
          const definition = BUNDLED_ANIMATION_MAP.get(clipId);
          if (!definition) {
            return null;
          }

          const vrmAnimation = await loadBundledVrmAnimation(definition.path);
          if (!vrmAnimation) {
            return null;
          }

          return [
            clipId,
            createHumanoidOnlyAnimationClip(vrmAnimation, runtime.currentVRM, definition.label),
          ];
        } catch (error) {
          emitLog(onLog, 'warn', `Failed to load VRMA clip for ${clipId}.`, error);
          return null;
        }
      }),
    );

    clips.filter(Boolean).forEach(([clipId, clip]) => {
      runtime.animation.clips.set(clipId, clip);
    });
  }

  function syncGestureMotion({ restart = false, transition = 'fade', loop = undefined } = {}) {
    const gesture =
      resolveGesturePreset(state.currentModelId, state.currentGestureId, { fallbackToFirst: false }) ||
      null;
    const motion = gesture?.motion;

    if (motion?.type !== 'vrma' || !runtime.animation.mixer) {
      stopGestureMotion();
      return;
    }

    const clip = runtime.animation.clips.get(motion.clipId);
    if (!clip) {
      stopGestureMotion();
      return;
    }

    playGestureMotion(
      motion.clipId,
      {
        ...motion,
        ...(loop ? { loop } : {}),
      },
      { restart, transition },
    );
  }

  function getOrCreateAction(clipId) {
    if (!runtime.animation.mixer) {
      return null;
    }

    if (!runtime.animation.actions.has(clipId)) {
      const clip = runtime.animation.clips.get(clipId);
      if (!clip) {
        return null;
      }
      runtime.animation.actions.set(clipId, runtime.animation.mixer.clipAction(clip));
    }

    return runtime.animation.actions.get(clipId) || null;
  }

  function playGestureMotion(
    clipId,
    { fadeIn = 0.24, loop = 'repeat' } = {},
    { restart = false, transition = 'fade' } = {},
  ) {
    const nextAction = getOrCreateAction(clipId);
    if (!nextAction) {
      stopGestureMotion();
      return;
    }
    const shouldCutTransition = transition === 'cut' || fadeIn <= 0;
    const transitionConfig = resolveGestureTransitionConfig({
      nextFadeIn: fadeIn,
      featureFlags: state.featureFlags,
    });
    const effectiveFadeIn = shouldCutTransition ? 0 : transitionConfig.fadeIn;

    const sampleTimeSeconds =
      Number.isFinite(state.poseSampleTimeMs) && state.poseSampleTimeMs >= 0
        ? state.poseSampleTimeMs / 1000
        : null;

    if (runtime.animation.activeAction === nextAction && runtime.animation.activeClipId === clipId) {
      nextAction.setLoop(loop === 'once' ? THREE.LoopOnce : THREE.LoopRepeat, loop === 'once' ? 1 : Infinity);
      nextAction.clampWhenFinished = loop === 'once';

      if (sampleTimeSeconds !== null) {
        const clipDuration = nextAction.getClip()?.duration || sampleTimeSeconds;
        nextAction.paused = true;
        nextAction.time = Math.min(sampleTimeSeconds, clipDuration);
        runtime.animation.mixer?.setTime(nextAction.time);
        return;
      }

      nextAction.enabled = true;
      nextAction.paused = false;
      nextAction.setEffectiveTimeScale(1);
      nextAction.setEffectiveWeight(1);
      if (restart) {
        nextAction.reset();
        runtime.animation.mixer?.setTime(0);
      }
      nextAction.play();
      return;
    }

    const previousAction = runtime.animation.activeAction;

    nextAction.enabled = true;
    nextAction.reset();
    nextAction.setEffectiveTimeScale(1);
    nextAction.setEffectiveWeight(1);
    nextAction.setLoop(loop === 'once' ? THREE.LoopOnce : THREE.LoopRepeat, loop === 'once' ? 1 : Infinity);
    nextAction.clampWhenFinished = loop === 'once';
    nextAction.play();

    if (sampleTimeSeconds !== null) {
      previousAction?.stop();
      nextAction.paused = true;
      const clipDuration = nextAction.getClip()?.duration || sampleTimeSeconds;
      nextAction.time = Math.min(sampleTimeSeconds, clipDuration);
      runtime.animation.mixer?.setTime(nextAction.time);
    } else if (previousAction && previousAction !== nextAction) {
      if (shouldCutTransition) {
        previousAction.stop();
      } else {
        if (transitionConfig.useCrossFade) {
          nextAction.crossFadeFrom(previousAction, effectiveFadeIn, transitionConfig.warp);
        } else {
          previousAction.fadeOut(effectiveFadeIn);
          nextAction.fadeIn(effectiveFadeIn);
        }
      }
    } else {
      if (!shouldCutTransition) {
        nextAction.fadeIn(effectiveFadeIn);
      }
    }

    runtime.animation.activeAction = nextAction;
    runtime.animation.activeClipId = clipId;
  }

  function stopGestureMotion() {
    if (!runtime.animation.activeAction) {
      runtime.animation.activeClipId = null;
      return;
    }

    runtime.animation.activeAction.stop();
    runtime.animation.activeAction = null;
    runtime.animation.activeClipId = null;
  }

  function setGesturePaused(paused = true) {
    if (!runtime.animation.activeAction) {
      if (!paused) {
        syncGestureMotion({ restart: false });
      }
      return;
    }

    if (paused) {
      runtime.animation.activeAction.paused = true;
      return;
    }

    runtime.animation.activeAction.enabled = true;
    runtime.animation.activeAction.paused = false;
    runtime.animation.activeAction.setEffectiveTimeScale(1);
    runtime.animation.activeAction.play();
  }

  function applyStageLighting(stage) {
    const { lights } = stage;
    renderer.toneMappingExposure = lights.exposure;
    hemiLight.color.set(lights.ambientSky);
    hemiLight.groundColor.set(lights.ambientGround);
    hemiLight.intensity = lights.ambientIntensity;
    keyLight.color.set(lights.key);
    keyLight.intensity = lights.keyIntensity;
    keyLight.position.set(...lights.keyPosition);
    fillLight.color.set(lights.fill);
    fillLight.intensity = lights.fillIntensity;
    fillLight.position.set(...lights.fillPosition);
    rimLight.color.set(lights.rim);
    rimLight.intensity = lights.rimIntensity;
    rimLight.position.set(...lights.rimPosition);
  }

  function prepareModel(vrm) {
    const root = vrm.scene;
    root.traverse((object) => {
      object.frustumCulled = false;
    });

    const bounds = new THREE.Box3().setFromObject(root);
    const size = bounds.getSize(new THREE.Vector3());
    const scale = size.y > 0 ? 1.64 / size.y : 1;
    root.scale.setScalar(scale);

    const scaledBounds = new THREE.Box3().setFromObject(root);
    const center = scaledBounds.getCenter(new THREE.Vector3());
    const min = scaledBounds.min;

    root.position.x -= center.x;
    root.position.z -= center.z;
    root.position.y -= min.y;
  }

  function bindRig(vrm) {
    const humanoid = vrm.humanoid;
    const trackedBones = [
      B.Spine,
      B.Chest,
      B.UpperChest,
      B.Neck,
      B.Head,
      B.LeftShoulder,
      B.RightShoulder,
      B.LeftUpperArm,
      B.RightUpperArm,
      B.LeftLowerArm,
      B.RightLowerArm,
      B.LeftHand,
      B.RightHand,
    ];

    const nodes = new Map();
    const baseQuaternions = new Map();

    trackedBones.forEach((boneName) => {
      const node = humanoid.getNormalizedBoneNode(boneName);
      if (!node) {
        return;
      }

      nodes.set(boneName, node);
      baseQuaternions.set(boneName, node.quaternion.clone());
    });

    const rawHead = humanoid.getRawBoneNode(B.Head);
    const rawChest = humanoid.getRawBoneNode(B.UpperChest) || humanoid.getRawBoneNode(B.Chest);
    if (vrm.lookAt) {
      vrm.lookAt.target = lookTarget;
    }

    return {
      nodes,
      baseQuaternions,
      rawHead,
      rawChest,
      headWorld: new THREE.Vector3(),
      chestWorld: new THREE.Vector3(),
      rotationQuat: new THREE.Quaternion(),
    };
  }

  function alignCameraToRig() {
    if (!runtime.rig?.rawHead || !runtime.rig.rawChest) {
      camera.position.set(0, 1.3, 1.62);
      camera.lookAt(0, 1.18, 0);
      return;
    }

    runtime.currentVRM.scene.updateMatrixWorld(true);
    runtime.rig.rawHead.getWorldPosition(runtime.rig.headWorld);
    runtime.rig.rawChest.getWorldPosition(runtime.rig.chestWorld);

    const target = new THREE.Vector3(
      0,
      THREE.MathUtils.lerp(runtime.rig.chestWorld.y, runtime.rig.headWorld.y, 0.62),
      0.04,
    );
    const bustHeight = Math.max(0.75, runtime.rig.headWorld.y - runtime.rig.chestWorld.y + 0.55);
    const distance = (bustHeight * 0.5) / Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * 1.1;

    camera.position.set(0.02, target.y + 0.03, Math.min(2, Math.max(1.28, distance)));
    camera.lookAt(target);
  }

  function updateBlink(now) {
    if (Number.isFinite(state.poseSampleTimeMs)) {
      runtime.blink.active = false;
      runtime.blink.weight = 0;
      return;
    }

    const emote = EMOTE_MAP.get(state.currentEmoteId) || EMOTES[0];

    if (!runtime.blink.active && now >= runtime.blink.nextAt) {
      runtime.blink.active = true;
      runtime.blink.startedAt = now;
      runtime.blink.durationMs = 130 + Math.random() * 40;
    }

    if (!runtime.blink.active) {
      runtime.blink.weight = 0;
      return;
    }

    const progress = (now - runtime.blink.startedAt) / runtime.blink.durationMs;

    if (progress >= 1) {
      runtime.blink.active = false;
      runtime.blink.weight = 0;
      runtime.blink.nextAt = now + (1600 + Math.random() * 2600) / emote.blinkRate;
      return;
    }

    const blinkArc = progress < 0.5 ? progress * 2 : (1 - progress) * 2;
    runtime.blink.weight = Math.sin(blinkArc * Math.PI * 0.5);
  }

  function updatePose(delta, now) {
    if (!runtime.rig) {
      return;
    }

    if (runtime.animation.activeClipId || runtime.animation.previewAction) {
      modelPivot.position.y = 0;
      return;
    }

    const emote = EMOTE_MAP.get(state.currentEmoteId) || EMOTES[0];
    const gesture =
      resolveGesturePreset(state.currentModelId, state.currentGestureId) || GESTURES[0];
    const targetPose = new Map();
    const time = now / 1000;
    const speechStrength = state.speaking ? 1 : 0.28;
    const mouthStrength = MOUTH_STRENGTH[state.currentMouthCue] || 0;
    const bob = Math.sin(time * (1.15 + state.energy * 0.2) + runtime.look.seed) * (0.7 + speechStrength * 0.6);

    mergePose(targetPose, gesture.pose);
    addPose(targetPose, B.Head, emote.head);
    addPose(targetPose, B.UpperChest, emote.chest);
    addPose(targetPose, B.Spine, [bob * 0.35, 0, 0]);
    addPose(targetPose, B.UpperChest, [bob * 0.7, 0, Math.sin(time * 0.62) * 0.3]);
    addPose(targetPose, B.Head, [Math.sin(time * 0.85 + 0.4) * 0.5, 0, Math.sin(time * 0.7) * 0.35]);

    if (state.speaking) {
      addPose(targetPose, B.Head, [mouthStrength * 0.9, Math.sin(time * 3.1) * 0.7, 0]);
      addPose(targetPose, B.Neck, [mouthStrength * 0.35, 0, 0]);
      addPose(targetPose, B.UpperChest, [Math.sin(time * 2.3) * 1.1 * state.energy, 0, 0]);
    }

    const proceduralMode =
      gesture.motion?.type === 'vrma' && !runtime.animation.activeClipId
        ? gesture.intent || gesture.id
        : gesture.motion?.type || gesture.intent || gesture.id;

    switch (proceduralMode) {
      case 'bhf-hand-wave': {
        const torsoSway = Math.sin(time * 1.05 + 0.25);
        const gestureElapsed = Math.max(0, now - state.currentGestureStartedAt);
        const raiseProgress = easeInOutSine(clamp01((gestureElapsed - 80) / 720));
        const waveBlend = easeInOutSine(clamp01((gestureElapsed - 620) / 320));
        const wavePrimary = Math.sin(Math.max(0, gestureElapsed - 760) / 1000 * Math.PI * 2 * 1.7) * waveBlend;
        const waveSecondary =
          Math.sin(Math.max(0, gestureElapsed - 760) / 1000 * Math.PI * 2 * 3.4 + 0.45) *
          waveBlend;
        const elbowFollow =
          Math.sin(Math.max(0, gestureElapsed - 760) / 1000 * Math.PI * 2 * 1.7 + 0.35) *
          waveBlend;

        // Relaxed base pose, then raise the forearm and sweep it laterally while the inner palm stays presented.
        addPose(targetPose, B.Spine, [0.18 * raiseProgress + torsoSway * 0.18, -0.08 * raiseProgress, -0.1 * raiseProgress]);
        addPose(
          targetPose,
          B.UpperChest,
          [0.45 * raiseProgress + torsoSway * 0.28, -0.18 * raiseProgress, -0.36 * raiseProgress + torsoSway * 0.12],
        );
        addPose(
          targetPose,
          B.Head,
          [0.12 * raiseProgress + torsoSway * 0.14, -0.32 * raiseProgress + wavePrimary * 0.08, -0.18 * raiseProgress],
        );
        addPose(
          targetPose,
          B.RightShoulder,
          [1.4 * raiseProgress, 0, (-1.2 + torsoSway * 0.12) * raiseProgress],
        );
        addPose(
          targetPose,
          B.RightUpperArm,
          [
            28 * raiseProgress + torsoSway * 0.16 * raiseProgress + elbowFollow * 0.08,
            -4 * raiseProgress,
            -20 * raiseProgress + wavePrimary * -0.12,
          ],
        );
        addPose(
          targetPose,
          B.RightLowerArm,
          [
            -94 * raiseProgress + elbowFollow * -1.6,
            7 * raiseProgress + wavePrimary * 5.2 + waveSecondary * 1.2,
            1 * raiseProgress + waveSecondary * 0.6,
          ],
        );
        addPose(
          targetPose,
          B.RightHand,
          [
            5 * raiseProgress + waveSecondary * 0.4,
            -66 * raiseProgress + wavePrimary * 0.2,
            1 * raiseProgress + waveSecondary * 0.5,
          ],
        );
        break;
      }
      case 'explain': {
        const phrase = Math.sin(time * (1.7 + state.energy * 0.45));
        addPose(targetPose, B.LeftUpperArm, [phrase * 3.5, 0, phrase * 5.5]);
        addPose(targetPose, B.RightUpperArm, [phrase * 3.5, 0, phrase * -5.5]);
        addPose(targetPose, B.LeftHand, [0, 0, phrase * 6]);
        addPose(targetPose, B.RightHand, [0, 0, phrase * -6]);
        break;
      }
      case 'greet': {
        const wave = Math.sin(time * 3.3) * 11;
        addPose(targetPose, B.RightHand, [0, 0, wave]);
        addPose(targetPose, B.RightLowerArm, [0, 0, wave * 0.35]);
        break;
      }
      case 'thinking': {
        const drift = Math.sin(time * 1.1) * 1.4;
        addPose(targetPose, B.Head, [drift * 0.6, 0, drift * 0.3]);
        addPose(targetPose, B.RightHand, [drift, drift * 0.3, 0]);
        break;
      }
      case 'listen': {
        const breath = Math.sin(time * 0.95) * 0.9;
        addPose(targetPose, B.LeftHand, [0, 0, breath * 1.6]);
        addPose(targetPose, B.Head, [0.4, 0, breath * 0.2]);
        break;
      }
      default: {
        const breath = Math.sin(time * 0.52 + runtime.look.seed * 0.3);
        addPose(targetPose, B.Spine, [breath * 0.18, 0, 0]);
        addPose(targetPose, B.UpperChest, [0.28 + breath * 0.6, 0, breath * 0.12]);
        addPose(targetPose, B.LeftShoulder, [breath * 0.18, 0, breath * 0.18]);
        addPose(targetPose, B.RightShoulder, [breath * 0.18, 0, breath * -0.18]);
        addPose(targetPose, B.Head, [breath * 0.14, 0, breath * 0.06]);
        break;
      }
    }

    applyPoseToBones(runtime.rig, targetPose, delta);
    modelPivot.position.y =
      Math.sin(time * (1.1 + speechStrength * 0.6)) * 0.01 * (0.4 + speechStrength * 0.7);
  }

  function updateLookTarget(delta, now) {
    if (!runtime.rig?.rawHead) {
      return;
    }

    if (runtime.orbit.enabled) {
      runtime.look.pointerActive = false;
      runtime.look.pointerTarget.set(0, 0);
    }

    const emote = EMOTE_MAP.get(state.currentEmoteId) || EMOTES[0];
    const time = now / 1000;
    const wanderStrength = runtime.look.pointerActive ? 0 : emote.wander;
    const wanderX = Math.sin(time * 0.63 + runtime.look.seed) * wanderStrength;
    const wanderY = Math.cos(time * 0.47 + runtime.look.seed * 0.7) * wanderStrength * 0.7;
    const targetX = runtime.look.pointerActive ? runtime.look.pointerTarget.x : emote.gaze[0] + wanderX;
    const targetY = runtime.look.pointerActive ? runtime.look.pointerTarget.y : emote.gaze[1] + wanderY;
    const smoothing = 1 - Math.exp(-delta * 5.5);

    runtime.look.currentOffset.lerp(new THREE.Vector2(targetX, targetY), smoothing);
    runtime.rig.rawHead.getWorldPosition(runtime.rig.headWorld);
    runtime.look.targetObject.position.copy(runtime.rig.headWorld);
    runtime.look.targetObject.position.x += runtime.look.currentOffset.x;
    runtime.look.targetObject.position.y += runtime.look.currentOffset.y;
    runtime.look.targetObject.position.z += 1.18;

    const nextLabel = runtime.look.pointerActive
      ? 'pointer'
      : Math.abs(runtime.look.currentOffset.x) < 0.03
          ? 'center'
          : runtime.look.currentOffset.x > 0
              ? 'right'
              : 'left';

    if (nextLabel !== state.lookTargetLabel) {
      onLookTargetChange(nextLabel);
    }
  }

  function updateOrbit(delta) {
    if (!runtime.orbit.enabled) {
      return;
    }

    const smoothing = 1 - Math.exp(-delta * 8);
    runtime.orbit.currentYaw = THREE.MathUtils.lerp(
      runtime.orbit.currentYaw,
      runtime.orbit.targetYaw,
      smoothing,
    );
    runtime.orbit.currentPitch = THREE.MathUtils.lerp(
      runtime.orbit.currentPitch,
      runtime.orbit.targetPitch,
      smoothing,
    );

    modelPivot.rotation.y = runtime.orbit.currentYaw;
    modelPivot.rotation.x = runtime.orbit.currentPitch;
  }

  function applyExpressionState() {
    const emote = EMOTE_MAP.get(state.currentEmoteId) || EMOTES[0];
    const manager = runtime.currentVRM.expressionManager;

    if (!manager) {
      return;
    }

    manager.resetValues();

    Object.entries(emote.expressions).forEach(([name, value]) => {
      manager.setValue(name, value);
    });

    const mouthExpression = MOUTH_TO_EXPRESSION[state.currentMouthCue];
    if (mouthExpression) {
      manager.setValue(
        mouthExpression,
        Math.min(1, (MOUTH_STRENGTH[state.currentMouthCue] || 0) * emote.mouthBoost),
      );
    }

    manager.setValue(VRMExpressionPresetName.Blink, runtime.blink.weight);
  }

  function createPreviewAnimationClip(clip) {
    if (!runtime.currentVRM) {
      return new THREE.AnimationClip(clip.name, clip.duration, []);
    }

    const tracks = [];
    clip.rotationTracks?.forEach((track, boneName) => {
      const node = runtime.currentVRM.humanoid.getNormalizedBoneNode(boneName);
      if (node?.name) {
        tracks.push(new THREE.QuaternionKeyframeTrack(`${node.name}.quaternion`, track.times, track.values));
      }
    });
    clip.translationTracks?.forEach((track, boneName) => {
      const node = runtime.currentVRM.humanoid.getNormalizedBoneNode(boneName);
      if (node?.name) {
        tracks.push(new THREE.VectorKeyframeTrack(`${node.name}.position`, track.times, track.values));
      }
    });

    return new THREE.AnimationClip(clip.name, clip.duration, tracks);
  }

  function stopPreviewClip() {
    runtime.animation.previewAction?.stop();
    runtime.animation.previewAction = null;
  }

  function pausePreviewClip() {
    if (!runtime.animation.previewAction) {
      return;
    }

    runtime.animation.previewAction.paused = true;
    runtime.animation.mixer?.setTime(runtime.animation.previewAction.time);
  }

  function resumePreviewClip() {
    if (!runtime.animation.previewAction) {
      return;
    }

    runtime.animation.previewAction.paused = false;
  }

  function getPreviewPlaybackState() {
    const action = runtime.animation.previewAction;
    const clip = action?.getClip?.();

    if (!action) {
      return {
        active: false,
        paused: false,
        timeSeconds: 0,
        durationSeconds: 0,
      };
    }

    return {
      active: true,
      paused: Boolean(action.paused),
      timeSeconds: action.time || 0,
      durationSeconds: clip?.duration || 0,
    };
  }

  function playPreviewClip(clip, { loop = 'repeat', paused = false, timeSeconds = null } = {}) {
    if (!runtime.animation.mixer) {
      return;
    }

    stopGestureMotion();
    stopPreviewClip();

    const previewClip = createPreviewAnimationClip(clip);
    const action = runtime.animation.mixer.clipAction(previewClip);
    action.enabled = true;
    action.reset();
    action.setEffectiveWeight(1);
    action.setEffectiveTimeScale(1);
    action.setLoop(loop === 'once' ? THREE.LoopOnce : THREE.LoopRepeat, loop === 'once' ? 1 : Infinity);
    action.clampWhenFinished = loop === 'once';
    action.play();

    if (Number.isFinite(timeSeconds) && timeSeconds >= 0) {
      action.time = Math.min(timeSeconds, previewClip.duration || timeSeconds);
      runtime.animation.mixer.setTime(action.time);
    }

    if (paused) {
      action.paused = true;
    }

    runtime.animation.previewAction = action;
  }

  function applyDisplayMode(mode = 'mesh') {
    runtime.display.mode = mode;
    const showMesh = mode !== 'bones';
    const showSkeleton = mode !== 'mesh';

    runtime.display.skinnedMeshes.forEach((mesh) => {
      mesh.visible = showMesh;
    });
    if (runtime.display.skeletonHelper) {
      runtime.display.skeletonHelper.visible = showSkeleton;
    }
  }

  function setOrbitSnapDegrees(degrees = 0) {
    runtime.orbit.snapRadians =
      Number.isFinite(degrees) && degrees > 0
        ? THREE.MathUtils.degToRad(degrees)
        : 0;
  }

  return runtime;
}

function addPose(targetPose, boneName, values) {
  if (!values) {
    return;
  }

  const current = targetPose.get(boneName) || [0, 0, 0];
  current[0] += values[0] || 0;
  current[1] += values[1] || 0;
  current[2] += values[2] || 0;
  targetPose.set(boneName, current);
}

function mergePose(targetPose, pose) {
  Object.entries(pose || {}).forEach(([boneName, values]) => {
    addPose(targetPose, boneName, values);
  });
}

function applyPoseToBones(rig, targetPose, delta) {
  const smoothing = 1 - Math.exp(-delta * 8.5);

  rig.nodes.forEach((node, boneName) => {
    const offset = targetPose.get(boneName) || [0, 0, 0];
    const baseQuaternion = rig.baseQuaternions.get(boneName);

    if (!baseQuaternion) {
      return;
    }

    rig.rotationQuat.setFromEuler(
      new THREE.Euler(
        THREE.MathUtils.degToRad(offset[0]),
        THREE.MathUtils.degToRad(offset[1]),
        THREE.MathUtils.degToRad(offset[2]),
        'XYZ',
      ),
    );

    const targetQuaternion = baseQuaternion.clone().multiply(rig.rotationQuat);
    node.quaternion.slerp(targetQuaternion, smoothing);
  });
}

async function loadBundledVrmAnimation(url) {
  if (!BUNDLED_ANIMATION_SOURCE_CACHE.has(url)) {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMAnimationLoaderPlugin(parser));

    const pendingAnimation = loader
      .loadAsync(url)
      .then((gltf) => gltf.userData.vrmAnimations?.[0] || null)
      .catch((error) => {
        BUNDLED_ANIMATION_SOURCE_CACHE.delete(url);
        throw error;
      });

    BUNDLED_ANIMATION_SOURCE_CACHE.set(url, pendingAnimation);
  }

  return BUNDLED_ANIMATION_SOURCE_CACHE.get(url);
}

function createHumanoidOnlyAnimationClip(vrmAnimation, vrm, clipName) {
  const { rotation } = createVRMAnimationHumanoidTracks(
    vrmAnimation,
    vrm.humanoid,
    vrm.meta?.metaVersion === '0' ? '0' : '1',
  );

  return new THREE.AnimationClip(clipName, vrmAnimation.duration, [...rotation.values()]);
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

function clamp01(value) {
  return clamp(value, 0, 1);
}

function easeInOutSine(value) {
  const t = clamp01(value);
  return -(Math.cos(Math.PI * t) - 1) * 0.5;
}

function getNowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function emitLog(handler, level, message, details = null) {
  if (typeof handler === 'function') {
    handler(level, message, details);
  }
}
