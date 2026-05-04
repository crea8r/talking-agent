function entry(id, file, description, bestFor) {
  return {
    id,
    file,
    description,
    bestFor,
  };
}

export const ANIMATION_MANIFEST = [
  entry(
    'Pose',
    'Pose.vrma',
    'Held neutral model pose. This is the closest current idle or resting fallback in the renamed set.',
    ['listen', 'listening', 'idle', 'relax', 'resting', 'between replies', 'neutral speaking', 'explain'],
  ),
  entry(
    'LookAround',
    'LookAround.vrma',
    'Subtle scanning and listening motion with alert but low energy body movement.',
    ['listen', 'listening', 'waiting', 'observing', 'ambient attention'],
  ),
  entry(
    'Thinking',
    'Thinking.vrma',
    'Reflective pause motion for considering an answer or searching for the right words.',
    ['thinking', 'hesitation', 'problem solving', 'reflection'],
  ),
  entry(
    'Greeting',
    'Greeting.vrma',
    'Friendly hello or welcome gesture.',
    ['greet', 'hello', 'welcome', 'opening a conversation', 'meeting someone'],
  ),
  entry(
    'Goodbye',
    'Goodbye.vrma',
    'Clear farewell motion for ending a conversation or signing off.',
    ['goodbye', 'closing', 'see you later', 'ending a session'],
  ),
  entry(
    'Peace',
    'Peace.vrma',
    'Peace sign or playful upbeat pose. No talking',
    ['peace', 'playful moments', 'casual selfies', 'light celebration', 'friendly vibe'],
  ),
  entry(
    'Clapping',
    'Clapping.vrma',
    'Applause or positive approval beat.',
    ['celebrate', 'clap', 'approval', 'great job', 'positive reinforcement'],
  ),
  entry(
    'Surprised',
    'Surprised.vrma',
    'Quick surprised or startled reaction.',
    ['react', 'surprise', 'unexpected news', 'shock', 'sudden realization'],
  ),
  entry(
    'Sad',
    'Sad.vrma',
    'Low-energy downbeat or apologetic pause.',
    ['sad', 'sadness', 'regret', 'disappointment', 'bad news'],
  ),
  entry(
    'Angry',
    'Angry.vrma',
    'Sharper frustrated or firm reaction beat.',
    ['angry', 'frustration', 'firm correction', 'serious objection', 'heated emphasis'],
  ),
  entry(
    'Blush',
    'Blush.vrma',
    'Head scratching, shy, embarrassed, or bashful reaction.',
    ['explain','blush', 'embarrassment', 'bashful thanks', 'cute moments', 'warm praise'],
  ),
  entry(
    'Apologize',
    'Apologize.vrma',
    'Explicit apology motion with more contrition than Sad.',
    ['formal apology', 'apologize'],
  ),
  entry(
    'Excuse',
    'Excuse.vrma',
    'Polite excuse-me or pardon gesture with small social energy.',
    ['excuse', 'excuse me', 'brief interruption', 'passing by', 'soft transition'],
  ),
  entry(
    'Cheer',
    'Cheer.vrma',
    'Upbeat victory or encouragement beat.',
    ['cheer', 'success', 'hype', 'encouragement', 'rallying energy'],
  ),
  entry(
    'Jumping',
    'Jumping.vrma',
    'Uneasy, body swaying around',
    ['listen', 'listening','wiggle', 'shaking'],
  ),
  entry(
    'Sleepy',
    'Sleepy.vrma',
    'Drowsy or low-energy reaction.',
    ['sleepy', 'sleepiness', 'fatigue', 'late-night mood', 'low battery jokes'],
  ),
  entry(
    'No',
    'No.vrma',
    'Clear no or disagreement gesture.',
    ['no', 'disagreement', 'rejection', 'correction', 'setting a boundary'],
  ),
  entry(
    'Full Body Pose',
    'FullBody.vrma',
    'Broad full-body showcase motion. No talking',
    ['idle', 'calm','full body', 'showing outfit', 'body read'],
  ),
  entry(
    'Shoot',
    'Shoot.vrma',
    'Stylized shooting or pointing pose for playful or dramatic moments.',
    ['shoot', 'dramatic emphasis', 'playful finger-gun vibe', 'action pose', 'gotcha'],
  ),
  entry(
    'Spin',
    'Spin.vrma',
    'Spin or twirl transition. No talking',
    ['listening', 'idle', 'spin', 'flourish', 'scene transition', 'playful reveal'],
  ),
  entry(
    'Hand Squat',
    'Squat.vrma',
    'Hand swinging up and down',
    ['explain', 'listening', 'idle','exercise beat', 'idle'],
  ),
  entry(
    'Stretching',
    'Stretching.vrma',
    'Stretch or loosen-up motion.',
    ['bored','stretch', 'stretching', 'warm-up', 'taking a break', 'waking up'],
  ),
  entry(
    'Dance',
    'Swing.vrma',
    'Loose dancing body rhythm with casual energy.',
    ['dance', 'light playful mood', 'happy'],
  ),
  entry(
    'Walking',
    'Walking.vrma',
    'Walking cycle',
    ['idle', 'travel beat', 'waiting'],
  ),
  entry(
    'drinkwater',
    'drinkwater.vrma',
    'Mimed drink of water. No talking',
    ['drinkwater', 'taking a break', 'thirsty joke', 'pause between turns'],
  ),
  entry(
    'dramtic hello',
    'hello_1.vrma',
    'Dramatic way to say hello',
    ['dramatic hello', 'intro', 'long welcome'],
  ),
  entry(
    'motion_pose',
    'motion_pose.vrma',
    'Stylized presentation pose for reveal or showcase moments.',
    ['pose', 'idle', 'showcase', 'holding attention', 'stylized presentation'],
  ),
  entry(
    'smartphone',
    'smartphone.vrma',
    'Checking or using a smartphone. No talking',
    ['bored','boring','smartphone', 'texting', 'checking info', 'phone joke', 'modern casual beat'],
  ),
];

export const ANIMATION_MANIFEST_BY_ID = new Map(
  ANIMATION_MANIFEST.map((animation) => [animation.id, animation]),
);
