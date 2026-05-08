const GOODBYE_PHRASES = [
  'Bye for now. Take care out there.',
  'See you soon. I will be right here when you come back.',
  'Talk again soon. Have a good one.',
  'Goodbye for now. Stay safe.',
  'Catch you later. Take it easy.',
  'See you next time. I enjoyed this call.',
  'Until next time. Be well.',
  'Bye. Wishing you a smooth rest of the day.',
  'See you later. Keep going.',
  'Goodbye. Take care of yourself.',
  'Talk soon. I am signing off.',
  'Bye for now. Thanks for the call.',
  'See you again soon. Stay sharp.',
  'Until next time. Take care.',
  'Goodbye. Have a calm and easy day.',
  'Catch you later. Be good to yourself.',
  'Bye. I will see you again soon.',
  'See you around. Take care.',
  'Talk later. Stay safe.',
  'Goodbye for now. Keep in touch.',
  'Bye. Hope the rest of your day goes well.',
  'See you next time. Take it easy.',
  'Until later. Stay bright.',
  'Goodbye. Sending you good energy.',
  'Catch you later. You have got this.',
  'Bye for now. Stay warm out there.',
  'See you soon. Have a lovely day.',
  'Talk again later. Take care.',
  'Goodbye. Be safe and steady.',
  'Bye. Thanks for spending time with me.',
  'See you later. Keep the momentum going.',
  'Until next time. Stay kind to yourself.',
  'Goodbye. Wishing you a peaceful day.',
  'Catch you next time. Take good care.',
  'Bye for now. Stay grounded.',
  'See you again. Enjoy the rest of your day.',
  'Talk soon. Keep shining.',
  'Goodbye. I am rooting for you.',
  'Bye. Stay safe and sound.',
  'See you later. Make it a good one.',
  'Until next time. Keep smiling.',
  'Goodbye for now. You are all set.',
  'Catch you later. Be well.',
  'Bye. Take a deep breath and carry on.',
  'See you soon. Stay steady.',
  'Talk later. Hope things go smoothly.',
  'Goodbye. Have a strong finish to your day.',
  'Bye for now. Keep your spark.',
  'See you next time. Stay cool.',
  'Until later. Wishing you good luck.',
  'Goodbye. You are in good shape.',
  'Catch you soon. Stay safe.',
  'Bye. Keep moving forward.',
  'See you around. Have a beautiful day.',
  'Talk again soon. Stay centered.',
  'Goodbye for now. Be gentle with yourself.',
  'Bye. I will be here when you need me.',
  'See you later. Stay curious.',
  'Until next time. Take the win.',
  'Goodbye. Keep your rhythm.',
  'Catch you later. Stay bright and bold.',
  'Bye for now. Have an easy landing.',
  'See you next time. Go well.',
  'Talk soon. Stay present.',
  'Goodbye. Keep the good energy going.',
  'Bye. Wishing you a graceful rest of the day.',
  'See you again. Stay light on your feet.',
  'Until later. Keep your head up.',
  'Goodbye for now. Have a smooth ride.',
  'Catch you later. Stay on track.',
  'Bye. You have got good things ahead.',
  'See you soon. Stay patient and clear.',
  'Talk later. Keep your balance.',
  'Goodbye. Go make the rest of the day yours.',
  'Bye for now. Stay open and steady.',
  'See you next time. Keep it flowing.',
  'Until next time. Stay confident.',
  'Goodbye. Wishing you a clean finish.',
  'Catch you later. Stay golden.',
  'Bye. Enjoy a little breathing room.',
  'See you around. Keep the faith.',
  'Talk soon. Have a gentle day.',
  'Goodbye for now. Carry the good mood with you.',
  'Bye. Stay rested and ready.',
  'See you later. Let the day unfold nicely.',
  'Until next time. Keep things simple.',
  'Goodbye. Have a sweet rest of the day.',
  'Catch you soon. Stay graceful.',
  'Bye for now. Keep your focus.',
  'See you again. Leave room for something good.',
  'Talk later. Stay warm and well.',
  'Goodbye. Keep a little wonder with you.',
  'Bye. Wishing you a clean reset.',
  'See you next time. Hold onto the good stuff.',
  'Until later. Keep your pace.',
  'Goodbye for now. Be safe on your way.',
  'See you soon. Keep the glow going.',
  'Talk again soon. Stay brave.',
  'Goodbye. Take the good energy with you.',
  'Bye for now. See you on the next call.',
];

const DRAMATIC_GESTURE_IDS = [
  'Goodbye',
  'Cheer',
  'Peace',
  'Spin',
  'Shoot',
  'Clapping',
  'Greeting',
  'dramtic hello',
];

function normalizeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

export function getGoodbyePhrases() {
  return GOODBYE_PHRASES.slice();
}

export function pickRandomGoodbyePhrase(random = Math.random) {
  const index = Math.max(
    0,
    Math.min(GOODBYE_PHRASES.length - 1, Math.floor(random() * GOODBYE_PHRASES.length)),
  );
  return GOODBYE_PHRASES[index] || GOODBYE_PHRASES[0];
}

export function pickDramaticGoodbyeGesture(
  availableGestures = [],
  currentGestureId = '',
  random = Math.random,
) {
  const gestures = Array.isArray(availableGestures)
    ? availableGestures.filter((gesture) => gesture?.id)
    : [];
  const dramaticPool = DRAMATIC_GESTURE_IDS
    .map((gestureId) => gestures.find((gesture) => gesture.id === gestureId))
    .filter(Boolean);
  const nonRepeatedPool = dramaticPool.filter((gesture) => gesture.id !== currentGestureId);
  const pool = nonRepeatedPool.length ? nonRepeatedPool : dramaticPool;
  if (!pool.length) {
    return null;
  }

  const index = Math.max(0, Math.min(pool.length - 1, Math.floor(random() * pool.length)));
  return pool[index] || null;
}

export function getGoodbyeGestureDurationMs(gesture = {}) {
  return Math.max(2200, normalizeNumber(gesture?.durationMs, 0));
}
