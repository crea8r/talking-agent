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
    label: 'Bhf 1.2',
    path: '/models/Bhf_1_2.vrm',
    note: 'Optimized VRM 1.0 default with a softer read and six custom expressions.',
  },
  {
    id: 'fbf-1-0',
    label: 'Fbf 1.0',
    path: '/models/Fbf_1_0.vrm',
    note: 'Heavier VRM 1.0 fashion variant with extra face detail and a sharper silhouette.',
  },
  {
    id: 'smg-1-0',
    label: 'Smg 1.0',
    path: '/models/Smg_1_0.vrm',
    note: 'Lean VRM 1.0 update with a cleaner rig and a more assertive stage read.',
  },
];

export const DEFAULT_MODEL = BUNDLED_MODELS[0];

function createBundledAnimation(definition) {
  return {
    id: definition.id,
    label: definition.id,
    path: `/animations/${definition.file}`,
    note: definition.description,
    description: definition.description,
    bestFor: definition.bestFor,
    avoidFor: definition.avoidFor,
    cameraFit: definition.cameraFit,
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
  const motionOptions = definition.fadeIn == null ? {} : { fadeIn: definition.fadeIn };

  return {
    id: definition.id,
    intent: definition.intent || definition.id,
    label: definition.id,
    note: definition.description,
    description: definition.description,
    bestFor: definition.bestFor,
    avoidFor: definition.avoidFor,
    cameraFit: definition.cameraFit,
    file: definition.file,
    aliases: definition.aliases || [],
    pose: {},
    motion: createVrmaMotion(definition.id, motionOptions),
  };
}

export const GESTURES = ANIMATION_MANIFEST.map(createVrmaGesture);

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

  for (const catalog of ALL_GESTURE_CATALOGS) {
    const match = catalog.find(
      (gesture) => gesture.id === gestureId || gesture.aliases?.includes(gestureId),
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
    const exactMatch = gestures.find(
      (gesture) => gesture.id === requestedGestureId || gesture.aliases?.includes(requestedGestureId),
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
  };

  const runtime = createRendererRuntime({
    canvas,
    stageShell,
    state,
    onLog,
    onLookTargetChange(label) {
      state.lookTargetLabel = label;
      onLookTargetChange?.(label);
    },
  });

  runtime.start();
  applyStage(state.currentStageId);
  applyEnergy(state.energy);

  async function loadModel(url, { label = 'Model', modelId = DEFAULT_GESTURE_MODEL_ID } = {}) {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    state.isLoadingModel = true;
    emitLog(onLog, 'info', `Loading model ${label}.`);

    try {
      const resolvedModelId = MODEL_GESTURES[modelId] ? modelId : DEFAULT_GESTURE_MODEL_ID;
      const gltf = await loader.loadAsync(url);
      const vrm = gltf.userData.vrm;

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
      await runtime.setVRM(vrm);
      state.currentModelLabel = label;
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

  function setGesture(gestureId) {
    const nextGestureId =
      resolveGesturePreset(state.currentModelId, gestureId)?.id ||
      getGesturePresets(state.currentModelId)[0]?.id ||
      GESTURES[0].id;
    if (nextGestureId !== state.currentGestureId) {
      state.currentGestureStartedAt = getNowMs();
    }
    state.currentGestureId = nextGestureId;
    runtime.syncGestureMotion();
    return getSnapshot();
  }

  function setSpeaking(active) {
    state.speaking = Boolean(active);
    return getSnapshot();
  }

  function setMouthCue(mouthCue) {
    state.currentMouthCue = MOUTH_CUES.includes(mouthCue) ? mouthCue : 'rest';
    return getSnapshot();
  }

  function recenterGaze() {
    runtime.look.pointerActive = false;
    runtime.look.pointerTarget.set(0, 0);
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
        avoidFor: gesture.avoidFor,
        cameraFit: gesture.cameraFit,
      })),
      mouthCue: state.currentMouthCue,
      speaking: state.speaking,
      energy: state.energy,
      lookTargetLabel: state.lookTargetLabel,
    };
  }

  function destroy() {
    runtime.dispose();
  }

  return {
    DEFAULT_MODEL,
    destroy,
    getSnapshot,
    loadModel,
    recenterGaze,
    setEmote,
    setEnergy: applyEnergy,
    setGesture,
    setMouthCue,
    setSpeaking,
    setStage: applyStage,
  };
}

function createRendererRuntime({ canvas, stageShell, state, onLog, onLookTargetChange }) {
  const scene = new THREE.Scene();
  const clock = new THREE.Clock();
  const camera = new THREE.PerspectiveCamera(29, canvas.clientWidth / Math.max(canvas.clientHeight, 1), 0.1, 30);
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance',
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
    },
    look: {
      pointerActive: false,
      pointerTarget: new THREE.Vector2(0, 0),
      currentOffset: new THREE.Vector2(0, 0),
      targetObject: lookTarget,
      seed: Math.random() * Math.PI * 2,
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
    syncGestureMotion,
    applyStageLighting,
  };

  function start() {
    resize();
    window.addEventListener('resize', resize);
    stageShell?.addEventListener('pointermove', handlePointerMove);
    stageShell?.addEventListener('pointerleave', handlePointerLeave);
    renderer.setAnimationLoop(renderFrame);
  }

  function dispose() {
    renderer.setAnimationLoop(null);
    window.removeEventListener('resize', resize);
    stageShell?.removeEventListener('pointermove', handlePointerMove);
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

  function handlePointerMove(event) {
    const rect = stageShell.getBoundingClientRect();
    const normalizedX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const normalizedY = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    runtime.look.pointerActive = true;
    runtime.look.pointerTarget.set(normalizedX * 0.24, normalizedY * -0.15);
  }

  function handlePointerLeave() {
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
    syncGestureMotion();
  }

  function clearCurrentVRM() {
    runtime.animation.activeAction?.stop();
    runtime.animation.activeAction = null;
    runtime.animation.activeClipId = null;
    runtime.animation.actions.clear();
    runtime.animation.clips.clear();
    runtime.animation.mixer?.stopAllAction();
    runtime.animation.mixer = null;

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

  function syncGestureMotion() {
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

    playGestureMotion(motion.clipId, motion);
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

  function playGestureMotion(clipId, { fadeIn = 0.24, loop = 'repeat' } = {}) {
    const nextAction = getOrCreateAction(clipId);
    if (!nextAction) {
      stopGestureMotion();
      return;
    }

    if (runtime.animation.activeAction === nextAction && runtime.animation.activeClipId === clipId) {
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

    if (previousAction && previousAction !== nextAction) {
      previousAction.fadeOut(fadeIn);
      nextAction.fadeIn(fadeIn);
    } else {
      nextAction.fadeIn(fadeIn);
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

    if (runtime.animation.activeClipId) {
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
