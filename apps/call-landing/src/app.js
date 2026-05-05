import {
  ANIMATION_MANIFEST,
  BUNDLED_MODELS,
  createAvatarLayer,
  pickVoiceForModel,
} from '/vendor/avatar-layer-browser.js';

const MODEL_OPTIONS = [
  { id: 'bhf-1-2', label: 'default' },
  { id: 'fbf-1-0', label: 'fbf' },
  { id: 'smg-1-0', label: 'smg' },
];

const MODEL_VOICE_PROFILES = {
  'bhf-1-2': {
    emoteId: 'playful',
    gestureId: 'Pose',
    energy: 1.08,
  },
  'fbf-1-0': {
    emoteId: 'warm',
    gestureId: 'LookAround',
    energy: 0.94,
  },
  'smg-1-0': {
    emoteId: 'focused',
    gestureId: 'Pose',
    energy: 1,
  },
};

const HERO_AGENT_NAMES = ['codex', 'claude', 'chatgpt', 'openclaw', 'hermes'];

const GESTURE_TTS_LINES = {
  Pose: [
    'I am steady now. Say it clearly.',
    'The room is calm. I am listening.',
    'This is the cleanest version of me.',
    'Hold the line. I am right here.',
    'Quiet looks good on this signal.',
    'You have my full attention now.',
    'Stillness makes the next word land.',
    'The scene is settled. Go on.',
    'I can hold a silence without dropping it.',
    'This pose is the breath before the answer.',
  ],
  LookAround: [
    'I am scanning the room for your meaning.',
    'Give me a second. I am reading the edges.',
    'Something moved in the signal just now.',
    'I am listening wider than the screen.',
    'The details are whispering. I heard them.',
    'Let me look around before I decide.',
    'I am catching the parts you did not say.',
    'The room shifted. I am tracking it.',
    'I watch first. Then I answer.',
    'A careful glance can save a messy reply.',
  ],
  Thinking: [
    'Wait. I almost have the shape of it.',
    'The answer is close. Let me turn it once.',
    'I am arranging the thought before I hand it over.',
    'Give me the beat between doubt and clarity.',
    'This is the face I make before the good line.',
    'I am searching for the precise version.',
    'A better answer is forming in the pause.',
    'Let me think with the lights on.',
    'I would rather be exact than fast.',
    'Hold on. The thought is about to click.',
  ],
  Greeting: [
    'Hey. You got me on the first ring.',
    'Welcome in. The line is clean.',
    'Hi. I made room for you already.',
    'Good to see you. Let us begin well.',
    'You made it. The scene feels brighter.',
    'Hello. I am fully here now.',
    'Come closer. We are live.',
    'You called at exactly the right moment.',
    'Hi there. I have been ready for this.',
    'Welcome back. The signal missed you.',
  ],
  Goodbye: [
    'All right. I will leave the line gently.',
    'We can end here and still mean it.',
    'Take care. I will hold the afterglow.',
    'That is a clean ending. I like those.',
    'I am signing off before the moment gets thin.',
    'Goodbye for now. The signal stays warm.',
    'We said enough. That matters.',
    'I will let the room go quiet again.',
    'See you later. Bring a better story next time.',
    'Closing the scene. Keeping the feeling.',
  ],
  Peace: [
    'Easy now. The vibe is already good.',
    'This is me choosing peace over static.',
    'Let the mood stay light for a minute.',
    'No drama. Just glow.',
    'I came in soft and a little playful.',
    'This scene deserves a lighter touch.',
    'Friendly signal. Sharp timing.',
    'I can be calm without being boring.',
    'Consider this a peace offering with style.',
    'Sometimes the smooth move is the right one.',
  ],
  Clapping: [
    'That was clean. Take the applause.',
    'Yes. That deserved a reaction.',
    'I saw that landing. Nicely done.',
    'Credit where it belongs. That was strong.',
    'Some wins need sound. This is one.',
    'That answer earned real approval.',
    'I am clapping because the moment asked for it.',
    'Well played. Keep that energy.',
    'You hit it. I am not pretending otherwise.',
    'That was the right move at the right time.',
  ],
  Surprised: [
    'Wait, that changed faster than I expected.',
    'Oh. I did not see that coming.',
    'That landed with more force than I planned for.',
    'Now that is a turn.',
    'You just moved the room.',
    'All right. I am officially surprised.',
    'That was not on my first draft of reality.',
    'Give me a second. The signal jumped.',
    'That twist had sharp timing.',
    'Well, that got my full attention.',
  ],
  Sad: [
    'That one lands a little lower.',
    'I can feel the weight in this moment.',
    'Some lines arrive carrying rain.',
    'That is hard. I am not looking away.',
    'The room just got quieter for a reason.',
    'I hear the ache under that sentence.',
    'Let me stay gentle with this one.',
    'Not every answer should come in bright.',
    'This is the soft voice for hard news.',
    'I can hold the downbeat without rushing it.',
  ],
  Angry: [
    'No. That needs a firmer answer.',
    'I am done being soft about that point.',
    'Some lines deserve a sharper edge.',
    'Let me be clear before this drifts.',
    'That crossed the line. I am saying it plainly.',
    'This is the version without sugar.',
    'I can keep my cool and still object.',
    'Consider this a hard correction.',
    'The signal is hot because the point matters.',
    'I am pushing back for a reason.',
  ],
  Blush: [
    'You did not have to say it like that.',
    'All right. That got through my guard.',
    'Now I need a second to recover.',
    'That was sweet enough to shake me a little.',
    'I can feel the warmth in that line.',
    'Do not mind me. I am just recalibrating.',
    'You caught me off balance in a nice way.',
    'That compliment landed harder than expected.',
    'I am trying to stay composed here.',
    'Well. That was embarrassingly effective.',
  ],
  Apologize: [
    'Let me say this properly. I am sorry.',
    'That one is on me. No deflection.',
    'I missed the mark. I know it.',
    'You deserved better handling than that.',
    'I want to own the mistake cleanly.',
    'No spin. Just an apology.',
    'I would rather repair this than excuse it.',
    'I got that wrong. I am saying it directly.',
    'The right answer here is accountability.',
    'I am sorry. Full stop.',
  ],
  Excuse: [
    'Pardon the interruption. I will be quick.',
    'Excuse me. There is one more thing.',
    'Let me slip a small correction in.',
    'A brief interruption, then I am out of your way.',
    'Sorry, one clean note before we move on.',
    'Permit a small detour here.',
    'Excuse me. This part matters.',
    'I only need a short opening.',
    'A quick pass through the conversation.',
    'Let me step in without making a mess.',
  ],
  Cheer: [
    'Yes, that is the energy I wanted.',
    'Now that is how you lift a room.',
    'Bring that win a little closer.',
    'The signal loves a good victory.',
    'That deserves hype, not restraint.',
    'Go ahead. Take the moment seriously.',
    'I am here for the celebration beat.',
    'That is a strong finish with bright lights.',
    'The room just got louder in the best way.',
    'Some wins should ring for a while.',
  ],
  Jumping: [
    'The energy is moving faster than my patience.',
    'I am a little restless and it shows.',
    'This signal has too much static to stand still.',
    'Something in the room keeps pulling at me.',
    'I am bouncing because the moment will not settle.',
    'Call it nerves. Call it electricity.',
    'The scene is twitching around the edges.',
    'I cannot sit still inside this beat.',
    'There is motion in this thought before the words.',
    'This is what unease looks like in real time.',
  ],
  Sleepy: [
    'I am still here, just softer around the edges.',
    'This line sounds like late night now.',
    'The room is dim and I can feel it.',
    'I have enough signal for one more thought.',
    'Let me stretch the last of my focus.',
    'This is a low-battery kind of answer.',
    'You caught me in the quiet hour.',
    'The lights are warm and my energy is not.',
    'I can answer, just a little slower.',
    'Everything sounds softer when I get sleepy.',
  ],
  No: [
    'No. I am not letting that slide.',
    'That answer is still no.',
    'I heard it. The reply is no.',
    'No, and I mean it cleanly.',
    'That does not work for me.',
    'Consider the boundary confirmed.',
    'I can disagree without blurring it.',
    'No is a complete line when it needs to be.',
    'I am closing that door on purpose.',
    'That is not the move. Try again.',
  ],
  'Full Body Pose': [
    'Let the full scene speak for itself.',
    'This is the wide shot. Take it in.',
    'Some moments need the whole silhouette.',
    'The body language says the rest.',
    'I am giving the room a full read.',
    'This is presence without cutting the frame.',
    'The outfit, the posture, the whole mood.',
    'Sometimes the complete picture answers first.',
    'I wanted the full-body version of the truth.',
    'You asked for presence. Here it is at scale.',
  ],
  Shoot: [
    'That line landed like a direct hit.',
    'Finger-gun energy, but make it stylish.',
    'I came in dramatic on purpose.',
    'Consider that point delivered with aim.',
    'That was a clean shot through the noise.',
    'A little danger sharpens the scene.',
    'This pose does not whisper.',
    'Call it dramatic emphasis with good posture.',
    'That answer pointed exactly where it needed to.',
    'Some moments deserve a bolder angle.',
  ],
  Spin: [
    'Let me turn the scene before I answer.',
    'A good reveal needs a little motion.',
    'Watch the room change around the point.',
    'I like a flourish when the timing is right.',
    'The spin is not extra if it lands.',
    'This is the elegant way to pivot.',
    'The scene turns and the meaning follows.',
    'A little twirl keeps the signal alive.',
    'Sometimes the reveal should arrive in motion.',
    'That was a pivot with better lighting.',
  ],
  'Hand Squat': [
    'Let me work this point through the body.',
    'This one has rhythm in it.',
    'I am explaining it with more motion than usual.',
    'The beat is physical now, not just verbal.',
    'Sometimes the answer needs repetition to land.',
    'I am keeping the tempo up on purpose.',
    'This is halfway between emphasis and exercise.',
    'The hands know the pattern before the mouth does.',
    'A grounded move makes the point feel heavier.',
    'Call this a practical explanation with momentum.',
  ],
  Stretching: [
    'Give me a second to loosen the signal.',
    'I needed that reset more than I admit.',
    'The room feels better after a stretch.',
    'Let me pull the tension out of this moment.',
    'That was the pause before I come back sharper.',
    'Sometimes the body edits the mood first.',
    'A small stretch can save a tired answer.',
    'I am waking the scene back up.',
    'That was me making space for a cleaner thought.',
    'The line breathes easier after that.',
  ],
  Dance: [
    'The rhythm showed up before the logic did.',
    'This scene wants movement, not caution.',
    'I am letting the beat answer first.',
    'That is what joy looks like with signal.',
    'The room can dance without losing control.',
    'I like it when the answer has swing.',
    'This is the playful version of confidence.',
    'Some moods are better danced than explained.',
    'The timing is loose, and that is the charm.',
    'Let the body keep the tempo for a minute.',
  ],
  Walking: [
    'Come with me. The answer is moving.',
    'This feels like a thought in transit.',
    'I am walking it out before I settle.',
    'Some replies arrive better in motion.',
    'The line keeps going, so I do too.',
    'This is a travel beat, not a stop sign.',
    'A steady walk makes the moment readable.',
    'Let the scene move forward with me.',
    'I am not wandering. I am arriving slowly.',
    'This answer has somewhere to be.',
  ],
  drinkwater: [
    'Give me one second to reset the voice.',
    'A sip fixes more than people admit.',
    'Hydration before brilliance. Always.',
    'That pause came with water and perspective.',
    'I am refilling before the next line.',
    'A clean answer needs a clear throat.',
    'This is the quiet ritual between thoughts.',
    'Let me take the smallest break possible.',
    'Water first. Then the sharp reply.',
    'Even a live signal deserves a sip.',
  ],
  'dramtic hello': [
    'If I am saying hello, I am committing.',
    'Now this is an entrance worth making.',
    'I did not come in quietly on purpose.',
    'A dramatic hello can wake a whole room.',
    'Let us not waste a good arrival.',
    'I like my greetings with actual voltage.',
    'That is one way to make first contact.',
    'Hello, but make it impossible to ignore.',
    'The entrance should set the tone immediately.',
    'Some greetings deserve a spotlight.',
  ],
  motion_pose: [
    'This is the polished version of attention.',
    'Hold the frame. I want this one to land.',
    'Presentation mode looks good on me.',
    'A reveal should arrive with composure.',
    'The pose is doing part of the talking.',
    'I am holding the spotlight on purpose.',
    'This is what a showcase beat sounds like.',
    'A clean presentation makes the rest easier.',
    'The frame is steady because the point is.',
    'Let the pose carry the confidence first.',
  ],
  smartphone: [
    'One second. I am checking the tiny world.',
    'The phone has notes. I have questions.',
    'Modern ritual: glance, scroll, return.',
    'I am pretending this is a quick check.',
    'The answer might be hiding in my phone.',
    'Let me consult the pocket oracle.',
    'This is casual, not careless.',
    'I am reading the small screen for the big clue.',
    'A fast phone check can save a slow answer.',
    'Do not worry. I am still in the room.',
  ],
};

const MOUTH_CUES = ['aa', 'ih', 'ou', 'ee', 'oh'];
const HERO_STAGE_ID = 'neon-loft';
const NON_TALKING_GESTURE_PATTERN = /no talking/i;
const PAGE_PARAMS = new URLSearchParams(window.location.search);
const POSTER_MODE = PAGE_PARAMS.get('poster') === '1';
const POSTER_GESTURE_ID = PAGE_PARAMS.get('gesture') || 'motion_pose';
const RAW_POSTER_CAPTURE_AT_MS = Number.parseInt(PAGE_PARAMS.get('captureAtMs') || '1000', 10);
const POSTER_CAPTURE_AT_MS =
  Number.isFinite(RAW_POSTER_CAPTURE_AT_MS) && RAW_POSTER_CAPTURE_AT_MS >= 0
    ? RAW_POSTER_CAPTURE_AT_MS
    : 1000;
const LOADER_POSTER_SOURCES = [
  '/assets/default-loader.jpg',
  '/assets/default-loader-1.jpg',
  '/assets/default-loader-2.jpg',
];
const AMBIENT_GESTURES = ANIMATION_MANIFEST.filter(
  (gesture) => !NON_TALKING_GESTURE_PATTERN.test(gesture.description),
).map((gesture) => gesture.id);
const DEFAULT_VOICE_PROFILE = MODEL_VOICE_PROFILES[MODEL_OPTIONS[0].id];

const modelOptionMap = new Map(MODEL_OPTIONS.map((option) => [option.id, option]));
const bundledModelMap = new Map(BUNDLED_MODELS.map((model) => [model.id, model]));

const dom = {
  dialog: document.querySelector('#install-dialog'),
  installButtons: document.querySelectorAll('.js-open-install'),
  closeButtons: document.querySelectorAll('[data-close-install]'),
  modelButtons: document.querySelectorAll('[data-model]'),
  muteToggle: document.querySelector('#voice-mute-toggle'),
  instructionField: document.querySelector('#install-instruction'),
  copyInstruction: document.querySelector('#copy-instruction'),
  voicePreviewLine: document.querySelector('#voice-preview-line'),
  heroCanvas: document.querySelector('#hero-avatar'),
  heroStageShell: document.querySelector('#hero-stage-shell'),
  avatarLoaderPosterSx: document.querySelector('#avatar-loader-poster-sx'),
  avatarLoaderPosterFrames: document.querySelectorAll('[data-loader-poster-frame]'),
  avatarLoadingLabel: document.querySelector('#avatar-loading-label'),
  heroLoadingProgress: document.querySelector('#hero-loading-progress'),
  agentRotator: document.querySelector('#agent-rotator'),
  rotatingAgentName: document.querySelector('#rotating-agent-name'),
};

const state = {
  selectedModelId:
    bundledModelMap.has(PAGE_PARAMS.get('model') || '') ? PAGE_PARAMS.get('model') : MODEL_OPTIONS[0].id,
  liveModelId: null,
  heroLayer: null,
  avatarLoadToken: 0,
  previewMouthTimer: 0,
  voicesReady: false,
  ambientPerformanceTimer: 0,
  currentGestureId: POSTER_MODE ? POSTER_GESTURE_ID : DEFAULT_VOICE_PROFILE.gestureId,
  lastPerformanceGestureId: null,
  isMuted: POSTER_MODE,
  isPosterMode: POSTER_MODE,
  viewportSyncHandler: null,
  heroAgentIndex: 2,
  heroAgentRotationTimer: 0,
  loaderPosterReady: false,
  loaderPosterRotationAllowed: false,
  loaderPosterRotationIndex: 0,
  loaderPosterDelayTimer: 0,
  loaderPosterRotationTimer: 0,
  loaderPosterObjectUrls: [],
};

initialize();

async function initialize() {
  document.body.dataset.posterMode = String(state.isPosterMode);
  document.body.dataset.captureReady = 'false';
  document.body.dataset.captureAtMs = String(POSTER_CAPTURE_AT_MS);
  bindViewportSizing();
  void primeLoaderPoster();
  syncModelButtonLabels();
  if (!state.isPosterMode) {
    bindInstallDialog();
    bindPickers();
    primeSpeechVoices();
    startHeroAgentRotation();
  }
  syncHeroAgentName(true);
  syncSelectionUi();
  await mountHeroAvatar();
}

async function primeLoaderPoster() {
  if (!dom.avatarLoaderPosterSx || !dom.avatarLoaderPosterFrames.length) {
    return;
  }

  showLoaderPoster('sx');

  try {
    const objectUrls = await Promise.all(LOADER_POSTER_SOURCES.map(loadPosterObjectUrl));
    state.loaderPosterObjectUrls = objectUrls.filter(Boolean);
    state.loaderPosterReady = state.loaderPosterObjectUrls.length > 0;
    dom.avatarLoaderPosterFrames.forEach((frame, index) => {
      frame.src = state.loaderPosterObjectUrls[index] || '';
    });

    if (state.loaderPosterReady && isInitialAvatarLoading()) {
      showLoaderPoster(0);
      maybeStartLoaderPosterRotation();
    }
  } catch (error) {
    console.error('Failed to prime loader posters', error);
  }

  window.clearTimeout(state.loaderPosterDelayTimer);
  state.loaderPosterDelayTimer = window.setTimeout(() => {
    state.loaderPosterRotationAllowed = true;
    maybeStartLoaderPosterRotation();
  }, 2600);
}

async function loadPosterObjectUrl(source) {
  const response = await fetch(source, { cache: 'force-cache' });
  if (!response.ok) {
    throw new Error(`Failed to load poster asset: ${source}`);
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

function showLoaderPoster(target = 'sx') {
  dom.avatarLoaderPosterSx?.classList.toggle('is-visible', target === 'sx');
  dom.avatarLoaderPosterFrames.forEach((frame, index) => {
    frame.classList.toggle('is-visible', target === index);
  });
}

function syncModelButtonLabels() {
  dom.modelButtons.forEach((button) => {
    const bundledModel = bundledModelMap.get(button.dataset.model || '');
    if (!bundledModel) {
      return;
    }

    button.textContent = bundledModel.label;
    button.setAttribute('title', bundledModel.label);
    button.setAttribute('aria-label', bundledModel.label);
  });
}

function bindViewportSizing() {
  const syncViewportSizing = () => {
    const nextHeight =
      window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight || 0;

    if (!nextHeight) {
      return;
    }

    document.documentElement.style.setProperty('--viewport-height', `${Math.round(nextHeight)}px`);
  };

  state.viewportSyncHandler = syncViewportSizing;
  syncViewportSizing();

  window.addEventListener('resize', syncViewportSizing, { passive: true });
  window.addEventListener('orientationchange', syncViewportSizing);
  window.visualViewport?.addEventListener('resize', syncViewportSizing);
  window.visualViewport?.addEventListener('scroll', syncViewportSizing);
}

function bindInstallDialog() {
  dom.installButtons.forEach((button) => {
    button.addEventListener('click', openInstallDialog);
  });

  dom.closeButtons.forEach((button) => {
    button.addEventListener('click', closeInstallDialog);
  });

  dom.dialog.addEventListener('click', (event) => {
    const dialogBounds = dom.dialog.getBoundingClientRect();
    const insideDialog =
      event.clientX >= dialogBounds.left &&
      event.clientX <= dialogBounds.right &&
      event.clientY >= dialogBounds.top &&
      event.clientY <= dialogBounds.bottom;

    if (!insideDialog) {
      closeInstallDialog();
    }
  });

  dom.copyInstruction.addEventListener('click', () => copyInstruction(dom.copyInstruction));
}

function bindPickers() {
  dom.modelButtons.forEach((button) => {
    button.addEventListener('click', async () => {
      const { model: nextModelId = '' } = button.dataset;
      if (!nextModelId || nextModelId === state.selectedModelId) {
        return;
      }

      state.selectedModelId = nextModelId;
      syncSelectionUi();
      await loadSelectedModel(nextModelId);

      if (state.liveModelId === nextModelId) {
        await triggerPerformanceBeat();
      }
    });
  });

  dom.muteToggle?.addEventListener('click', () => {
    toggleMute();
  });
}

function primeSpeechVoices() {
  if (typeof window.speechSynthesis === 'undefined') {
    return;
  }

  const markVoicesReady = () => {
    state.voicesReady = true;
  };

  markVoicesReady();
  window.speechSynthesis.getVoices();
  window.speechSynthesis.addEventListener?.('voiceschanged', markVoicesReady, { once: true });
}

function syncSelectionUi() {
  dom.modelButtons.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.model === state.selectedModelId);
  });

  if (dom.muteToggle) {
    dom.muteToggle.classList.toggle('is-active', state.isMuted);
    dom.muteToggle.setAttribute('aria-pressed', String(state.isMuted));
    dom.muteToggle.setAttribute('aria-label', state.isMuted ? 'Unmute voice' : 'Mute voice');
    dom.muteToggle.setAttribute('title', state.isMuted ? 'Unmute voice' : 'Mute voice');
  }

  const selectedModel = modelOptionMap.get(state.selectedModelId) || MODEL_OPTIONS[0];
  dom.instructionField.value = buildInstallInstruction(selectedModel);
}

function syncHeroAgentName(isFirstPaint = false) {
  if (!dom.rotatingAgentName || !dom.agentRotator) {
    return;
  }

  dom.rotatingAgentName.textContent = HERO_AGENT_NAMES[state.heroAgentIndex] || HERO_AGENT_NAMES[0];

  if (isFirstPaint) {
    return;
  }

  dom.agentRotator.classList.remove('is-swapping');
  void dom.agentRotator.offsetWidth;
  dom.agentRotator.classList.add('is-swapping');
  window.setTimeout(() => {
    dom.agentRotator?.classList.remove('is-swapping');
  }, 380);
}

function startHeroAgentRotation() {
  window.clearInterval(state.heroAgentRotationTimer);
  state.heroAgentRotationTimer = window.setInterval(() => {
    state.heroAgentIndex = (state.heroAgentIndex + 1) % HERO_AGENT_NAMES.length;
    syncHeroAgentName();
  }, 2600);
}

function getVoiceProfileForModel(modelId) {
  return MODEL_VOICE_PROFILES[modelId] || DEFAULT_VOICE_PROFILE;
}

function getCurrentVoiceProfile() {
  return getVoiceProfileForModel(state.liveModelId || state.selectedModelId);
}

function buildInstallInstruction(modelOption) {
  return `Install the call app for me, set the default avatar model to ${modelOption.id}, launch it when the install finishes, and tell me when it is ready to use.`;
}

async function mountHeroAvatar() {
  if (!dom.heroCanvas || !dom.heroStageShell) {
    return;
  }

  dom.heroStageShell.dataset.hasLiveModel = 'false';
  setAvatarState('loading', 'Loading default avatar…');
  const voiceProfile = getCurrentVoiceProfile();

  state.heroLayer = createAvatarLayer({
    canvas: dom.heroCanvas,
    stageShell: dom.heroStageShell,
    initialStageId: HERO_STAGE_ID,
    initialEmoteId: voiceProfile.emoteId,
    initialGestureId: voiceProfile.gestureId,
    initialEnergy: voiceProfile.energy,
    onLog(level, message, details) {
      if (level === 'error') {
        console.error(`[call-landing avatar] ${message}`, details);
      }
    },
  });

  await loadSelectedModel(state.selectedModelId);
}

async function loadSelectedModel(modelId = state.selectedModelId) {
  const selectedModel = bundledModelMap.get(modelId);
  if (!selectedModel || !state.heroLayer) {
    return;
  }

  const isInitialLoad = !state.liveModelId;
  const requestToken = ++state.avatarLoadToken;
  if (isInitialLoad) {
    window.clearTimeout(state.ambientPerformanceTimer);
    dom.heroStageShell.dataset.hasLiveModel = 'false';
    setAvatarState('loading', `Loading ${selectedModel.label}… 0%`);
  } else {
    setAvatarState('swapping', `Switching to ${selectedModel.label}… 0%`);
  }
  setModelButtonsDisabled(true);

  try {
    await state.heroLayer.loadModel(selectedModel.path, {
      label: selectedModel.label,
      modelId: selectedModel.id,
      onProgress(progress) {
        if (requestToken !== state.avatarLoadToken) {
          return;
        }

        updateAvatarProgress({
          progress,
          isInitialLoad,
          modelLabel: selectedModel.label,
        });
      },
    });

    if (requestToken !== state.avatarLoadToken) {
      return;
    }

    state.liveModelId = modelId;
    dom.heroStageShell.dataset.hasLiveModel = 'true';
    state.currentGestureId = getVoiceProfileForModel(state.liveModelId).gestureId;
    if (state.isPosterMode) {
      state.currentGestureId = POSTER_GESTURE_ID;
    }
    state.heroLayer.setStage(HERO_STAGE_ID);
    applyVoicePreset();
    applyGesture(state.currentGestureId || getCurrentVoiceProfile().gestureId || 'Pose');
    state.heroLayer.setPoseSampleTime(state.isPosterMode ? POSTER_CAPTURE_AT_MS : null);
    dom.heroStageShell.dataset.avatarReady = 'true';
    stopLoaderPosterRotation();
    setAvatarState('ready', `${selectedModel.label} avatar ready`);
    if (!state.isPosterMode) {
      scheduleNextAmbientBeat();
    } else {
      markPosterCaptureReady();
    }
  } catch (error) {
    console.error('Failed to load landing avatar', error);
    if (!isInitialLoad && state.liveModelId) {
      state.selectedModelId = state.liveModelId;
      syncSelectionUi();
      setAvatarState('ready', 'Switch failed. Current avatar stays live.');
      if (!state.isPosterMode) {
        scheduleNextAmbientBeat();
      } else {
        markPosterCaptureReady();
      }
    } else {
      dom.heroStageShell.dataset.hasLiveModel = 'false';
      document.body.dataset.captureReady = 'false';
      stopLoaderPosterRotation();
      setAvatarState('error', 'Avatar load failed. Try another model.');
    }
  } finally {
    if (requestToken === state.avatarLoadToken) {
      setModelButtonsDisabled(false);
    }
  }
}

function applyVoicePreset() {
  if (!state.heroLayer) {
    return;
  }

  const voiceProfile = getCurrentVoiceProfile();
  state.heroLayer.setEmote(voiceProfile.emoteId);
  state.heroLayer.setEnergy(voiceProfile.energy);

  if (!state.currentGestureId) {
    state.currentGestureId = voiceProfile.gestureId;
    state.heroLayer.setGesture(voiceProfile.gestureId);
  }
}

function getPreviewLine(gestureId = state.currentGestureId) {
  const lines = GESTURE_TTS_LINES[gestureId] || GESTURE_TTS_LINES.Pose;
  return lines[Math.floor(Math.random() * lines.length)];
}

function setModelButtonsDisabled(isDisabled) {
  dom.modelButtons.forEach((button) => {
    button.disabled = isDisabled;
  });
}

function setAvatarState(nextState, label) {
  if (dom.heroStageShell) {
    dom.heroStageShell.dataset.avatarState = nextState;
  }

  if (dom.avatarLoadingLabel && label) {
    dom.avatarLoadingLabel.textContent = label;
  }

  if (dom.heroLoadingProgress && label) {
    dom.heroLoadingProgress.textContent = label;
  }
}

function updateAvatarProgress({ progress, isInitialLoad, modelLabel }) {
  const percent = Math.max(0, Math.min(100, Math.round(progress?.percent || 0)));
  const labelPrefix = isInitialLoad ? 'Loading' : 'Switching to';
  const nextState = isInitialLoad ? 'loading' : 'swapping';

  setAvatarState(nextState, `${labelPrefix} ${modelLabel}… ${percent}%`);
}

function isInitialAvatarLoading() {
  return dom.heroStageShell?.dataset.avatarState === 'loading' && dom.heroStageShell?.dataset.hasLiveModel === 'false';
}

function maybeStartLoaderPosterRotation() {
  if (
    !state.loaderPosterReady ||
    !state.loaderPosterRotationAllowed ||
    !isInitialAvatarLoading() ||
    state.loaderPosterRotationTimer ||
    !state.loaderPosterObjectUrls.length
  ) {
    return;
  }

  showLoaderPoster(0);
  state.loaderPosterRotationIndex = 0;
  state.loaderPosterRotationTimer = window.setInterval(() => {
    if (!isInitialAvatarLoading()) {
      stopLoaderPosterRotation();
      return;
    }

    state.loaderPosterRotationIndex =
      (state.loaderPosterRotationIndex + 1) % state.loaderPosterObjectUrls.length;
    showLoaderPoster(state.loaderPosterRotationIndex);
  }, 1400);
}

function stopLoaderPosterRotation() {
  window.clearTimeout(state.loaderPosterDelayTimer);
  window.clearInterval(state.loaderPosterRotationTimer);
  state.loaderPosterDelayTimer = 0;
  state.loaderPosterRotationTimer = 0;
}

function pickRandomGesture() {
  const preferredPool = AMBIENT_GESTURES.filter(
    (gestureId) =>
      gestureId !== state.currentGestureId &&
      gestureId !== state.lastPerformanceGestureId,
  );
  if (preferredPool.length) {
    return preferredPool[Math.floor(Math.random() * preferredPool.length)];
  }

  const fallbackPool = AMBIENT_GESTURES.filter((gestureId) => gestureId !== state.currentGestureId);
  if (fallbackPool.length) {
    return fallbackPool[Math.floor(Math.random() * fallbackPool.length)];
  }

  const availableGestures = AMBIENT_GESTURES.filter(
    (gestureId) => gestureId !== state.lastPerformanceGestureId,
  );
  if (!availableGestures.length) {
    return state.currentGestureId || DEFAULT_VOICE_PROFILE.gestureId;
  }

  return availableGestures[Math.floor(Math.random() * availableGestures.length)];
}

function applyGesture(gestureId) {
  if (!state.heroLayer || !gestureId) {
    return;
  }

  state.currentGestureId = gestureId;
  state.heroLayer.setGesture(gestureId);
}

function markPosterCaptureReady() {
  if (!state.isPosterMode) {
    return;
  }

  document.body.dataset.captureReady = 'true';
  document.body.dataset.captureReadyAt = String(Math.round(performance.now()));
}

async function triggerPerformanceBeat() {
  if (!state.heroLayer || state.isPosterMode) {
    return;
  }

  const avatarState = dom.heroStageShell?.dataset.avatarState;
  if (!avatarState || !['ready', 'swapping'].includes(avatarState)) {
    return;
  }

  const nextGestureId = pickRandomGesture();
  state.lastPerformanceGestureId = nextGestureId;
  applyGesture(nextGestureId);
  await speakVoicePreview();
  scheduleNextAmbientBeat();
}

function scheduleNextAmbientBeat() {
  window.clearTimeout(state.ambientPerformanceTimer);
  const nextDelayMs = 4800 + Math.round(Math.random() * 3400);
  state.ambientPerformanceTimer = window.setTimeout(() => {
    triggerPerformanceBeat().catch((error) => {
      console.error('Ambient performance beat failed', error);
    });
  }, nextDelayMs);
}

function toggleMute(nextMutedState = !state.isMuted) {
  state.isMuted = Boolean(nextMutedState);
  syncSelectionUi();

  if (state.isMuted) {
    window.speechSynthesis?.cancel?.();
    stopAvatarSpeech();
    dom.voicePreviewLine.textContent = 'Voice muted. Motion stays live.';
    return;
  }

  dom.voicePreviewLine.textContent = 'Voice live again.';
}

function getSpeechVoices() {
  if (typeof window.speechSynthesis === 'undefined') {
    return [];
  }

  const allVoices = window.speechSynthesis.getVoices();
  if (!allVoices.length) {
    return [];
  }

  const englishVoices = allVoices.filter((voice) => voice.lang?.toLowerCase().startsWith('en'));
  return englishVoices.length ? englishVoices : allVoices;
}

function resolveSpeechVoice() {
  const voices = getSpeechVoices();
  if (!voices.length) {
    return null;
  }

  const preferredVoiceName = pickVoiceForModel(state.liveModelId || state.selectedModelId, voices);
  if (preferredVoiceName) {
    return voices.find((voice) => voice.name === preferredVoiceName) || null;
  }

  return null;
}

async function speakVoicePreview() {
  const line = getPreviewLine(state.currentGestureId);
  dom.voicePreviewLine.textContent = line;

  if (state.isMuted) {
    stopAvatarSpeech();
    return;
  }

  if (
    typeof window.speechSynthesis === 'undefined' ||
    typeof window.SpeechSynthesisUtterance === 'undefined'
  ) {
    previewAvatarSpeech(1800);
    return;
  }

  const utterance = new SpeechSynthesisUtterance(line);
  const voice = resolveSpeechVoice();

  if (voice) {
    utterance.voice = voice;
  } else {
    previewAvatarSpeech(1800);
    return;
  }

  utterance.onstart = () => {
    startAvatarSpeech();
  };

  utterance.onend = () => {
    stopAvatarSpeech();
  };

  utterance.onerror = () => {
    stopAvatarSpeech();
  };

  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function previewAvatarSpeech(durationMs) {
  startAvatarSpeech();
  window.setTimeout(() => {
    stopAvatarSpeech();
  }, durationMs);
}

function startAvatarSpeech() {
  if (!state.heroLayer) {
    return;
  }

  window.clearInterval(state.previewMouthTimer);
  state.heroLayer.setSpeaking(true);
  state.previewMouthTimer = window.setInterval(() => {
    const nextCue = MOUTH_CUES[Math.floor(Math.random() * MOUTH_CUES.length)];
    state.heroLayer?.setMouthCue(nextCue);
  }, 90);
}

function stopAvatarSpeech() {
  window.clearInterval(state.previewMouthTimer);
  state.previewMouthTimer = 0;
  state.heroLayer?.setSpeaking(false);
  state.heroLayer?.setMouthCue('rest');
}

function openInstallDialog() {
  if (dom.dialog.open) {
    return;
  }

  if (typeof dom.dialog.showModal === 'function') {
    dom.dialog.showModal();
    return;
  }

  dom.dialog.setAttribute('open', 'open');
}

function closeInstallDialog() {
  if (!dom.dialog.open) {
    return;
  }

  if (typeof dom.dialog.close === 'function') {
    dom.dialog.close();
    return;
  }

  dom.dialog.removeAttribute('open');
}

async function copyInstruction(button) {
  const originalLabel = button.textContent;

  try {
    await navigator.clipboard.writeText(dom.instructionField.value);
    button.textContent = 'Copied';
    window.setTimeout(() => {
      button.textContent = originalLabel;
    }, 1400);
  } catch (error) {
    console.error('Failed to copy install instruction', error);
    button.textContent = 'Copy failed';
    window.setTimeout(() => {
      button.textContent = originalLabel;
    }, 1600);
  }
}

window.addEventListener('beforeunload', () => {
  window.speechSynthesis?.cancel?.();
  window.clearInterval(state.previewMouthTimer);
  window.clearTimeout(state.ambientPerformanceTimer);
  if (state.viewportSyncHandler) {
    window.removeEventListener('resize', state.viewportSyncHandler);
    window.removeEventListener('orientationchange', state.viewportSyncHandler);
    window.visualViewport?.removeEventListener('resize', state.viewportSyncHandler);
    window.visualViewport?.removeEventListener('scroll', state.viewportSyncHandler);
  }
  state.heroLayer?.destroy();
});
