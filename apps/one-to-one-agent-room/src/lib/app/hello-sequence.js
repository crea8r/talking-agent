const HELLO_PHRASES = [
  'It is great to see you. I am glad you are here.',
  'Hello there. I am ready whenever you are.',
  'Hi. Thanks for joining me.',
  'Hey there. Good to have you here.',
  'Hello. I am here and listening.',
  'Hi there. We can start whenever you like.',
  'Hello. I am glad we connected.',
  'Hey. I am ready for our call.',
  'Hi. It is nice to be here with you.',
  'Hello there. Let us ease into it.',
  'Hi there. I am all set on my side.',
  'Hello. I am ready to talk.',
  'Hey there. Nice to meet you here.',
  'Hi. I am here and tuned in.',
  'Hello there. I am glad you called.',
  'Hi there. Let us get started.',
  'Hello. I am with you now.',
  'Hey. I am ready when you are.',
  'Hi there. Happy to be on this call with you.',
  'Hello. I am here for you.',
  'Hey there. Let us make this a good call.',
  'Hi. I am listening for your first question.',
  'Hello there. We are live on my side.',
  'Hi there. I am warmed up and ready.',
  'Hello. Thanks for being here.',
  'Hey there. I am happy to hear from you.',
  'Hi. We can begin anytime.',
  'Hello there. I am settled in and ready.',
  'Hi there. I am all ears.',
  'Hello. I am glad you made it.',
  'Hey. I am here and ready to help.',
  'Hi there. Good to hear from you.',
  'Hello there. Let us start when it feels right.',
  'Hi. This is a nice moment to begin.',
  'Hello. I am ready for the conversation.',
  'Hey there. Thanks for calling in.',
  'Hi there. I am ready to follow your lead.',
  'Hello. I am in the room with you now.',
  'Hi. Let us get into it.',
  'Hello there. I am right here.',
  'Hey. I am ready to listen.',
  'Hi there. I am excited to talk with you.',
  'Hello. The line is open on my side.',
  'Hi. We can take this at your pace.',
  'Hello there. I am focused and ready.',
  'Hi there. I am glad this call started.',
  'Hello. I am here and present.',
  'Hey there. Let us begin softly.',
  'Hi. I am happy to connect.',
  'Hello there. I am ready for your first line.',
  'Hi there. I can hear you when you are ready.',
  'Hello. I am steady and listening.',
  'Hey. We are connected now.',
  'Hi there. I am here for the conversation.',
  'Hello there. It is nice to share this space with you.',
  'Hi. I am ready to jump in.',
  'Hello. Let us start simple.',
  'Hey there. I am ready to follow along.',
  'Hi there. This call is all set on my end.',
  'Hello. It is good to be here with you.',
  'Hi. I am ready for whatever is on your mind.',
  'Hello there. I am listening when you start.',
  'Hey. I am in and ready.',
  'Hi there. I am glad we have a moment together.',
  'Hello. I am here and available.',
  'Hi. It is good to connect with you.',
  'Hello there. We can begin whenever you want.',
  'Hey there. I am calm and ready.',
  'Hi. I am here for the next part.',
  'Hello. The call is live and I am with you.',
  'Hi there. Let us see where this goes.',
  'Hello there. I am ready for your voice.',
  'Hi. I am right here with you now.',
  'Hey. Good to connect.',
  'Hello there. I am awake and listening.',
  'Hi there. I am ready to hear what you have to say.',
  'Hello. Let us start the conversation.',
  'Hi. I am ready for this call.',
  'Hello there. I am at your pace.',
  'Hey there. I am happy to join you.',
  'Hi there. I can start whenever you do.',
  'Hello. I am set and listening closely.',
  'Hi. This is a good place to begin.',
  'Hello there. I am ready to hear your side.',
  'Hey. I am on the line with you.',
  'Hi there. I am comfortable and ready.',
  'Hello. We are connected and ready to go.',
  'Hi. I am here to listen first.',
  'Hello there. I am glad we are talking.',
  'Hey there. I am ready to pick up your first cue.',
  'Hi. I am ready to hear from you.',
  'Hello. It is good to have you here.',
  'Hi there. I am listening for your first thought.',
  'Hello there. I am ready to start strong.',
  'Hey. Let us get this call moving.',
  'Hi there. I am all set for the conversation.',
  'Hello. I am ready to hear your voice.',
  'Hi. I am here and ready to begin.',
  'Hello there. Let us start whenever you feel ready.',
  'Hey there. I am tuned in and ready.',
];

const HELLO_GESTURE_IDS = [
  'Greeting',
  'Peace',
  'Cheer',
  'dramtic hello',
];

export function getHelloPhrases() {
  return HELLO_PHRASES.slice();
}

export function pickRandomHelloPhrase(random = Math.random) {
  const index = Math.max(
    0,
    Math.min(HELLO_PHRASES.length - 1, Math.floor(random() * HELLO_PHRASES.length)),
  );
  return HELLO_PHRASES[index] || HELLO_PHRASES[0];
}

export function pickGreetingHelloGesture(
  availableGestures = [],
  currentGestureId = '',
  random = Math.random,
) {
  const gestures = Array.isArray(availableGestures)
    ? availableGestures.filter((gesture) => gesture?.id)
    : [];
  const greetingPool = HELLO_GESTURE_IDS
    .map((gestureId) => gestures.find((gesture) => gesture.id === gestureId))
    .filter(Boolean);
  const nonRepeatedPool = greetingPool.filter((gesture) => gesture.id !== currentGestureId);
  const pool = nonRepeatedPool.length ? nonRepeatedPool : greetingPool;
  if (!pool.length) {
    return null;
  }

  const index = Math.max(0, Math.min(pool.length - 1, Math.floor(random() * pool.length)));
  return pool[index] || null;
}
