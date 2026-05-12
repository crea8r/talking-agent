import test from 'node:test';
import assert from 'node:assert/strict';

function createManualTimers() {
  let now = 0;
  let nextId = 1;
  const timeouts = new Map();

  function runDueTimers() {
    while (true) {
      const dueEntry = [...timeouts.entries()]
        .sort((left, right) => left[1].dueAt - right[1].dueAt)[0];
      if (!dueEntry || dueEntry[1].dueAt > now) {
        return;
      }
      timeouts.delete(dueEntry[0]);
      dueEntry[1].callback();
    }
  }

  return {
    setTimeout(callback, delay = 0) {
      const id = nextId++;
      timeouts.set(id, {
        callback,
        dueAt: now + Math.max(0, Number(delay) || 0),
      });
      return id;
    },
    clearTimeout(id) {
      timeouts.delete(id);
    },
    advanceBy(ms) {
      now += Math.max(0, Number(ms) || 0);
      runDueTimers();
    },
  };
}

function createWindowStub(FakeRecognition, timers = globalThis) {
  return {
    SpeechRecognition: FakeRecognition,
    webkitSpeechRecognition: undefined,
    speechSynthesis: {
      cancel() {},
      getVoices() {
        return [];
      },
    },
    requestAnimationFrame() {
      return 1;
    },
    cancelAnimationFrame() {},
    setTimeout: timers.setTimeout.bind(timers),
    clearTimeout: timers.clearTimeout.bind(timers),
  };
}

async function loadCreateVoiceLayer() {
  const mod = await import(`./index.js?test=${Date.now()}-${Math.random()}`);
  return mod.createVoiceLayer;
}

test('voice layer auto-restarts recognition when the browser ends an idle listening session', async () => {
  class FakeRecognition {
    static instances = [];

    constructor() {
      this.startCount = 0;
      FakeRecognition.instances.push(this);
    }

    start() {
      this.startCount += 1;
      this.onstart?.();
    }

    stop() {
      this.onend?.();
    }
  }

  globalThis.window = createWindowStub(FakeRecognition);
  const createVoiceLayer = await loadCreateVoiceLayer();
  const voiceLayer = createVoiceLayer({
    autoRestart: true,
  });

  await voiceLayer.startListening({ restart: true });
  const recognition = FakeRecognition.instances[0];
  recognition.onend?.();
  await new Promise((resolve) => setTimeout(resolve, 220));

  assert.equal(recognition.startCount, 2);
  assert.equal(voiceLayer.getSnapshot().listening, true);
});

test('voice layer does not auto-restart after microphone permission is denied', async () => {
  class FakeRecognition {
    static instances = [];

    constructor() {
      this.startCount = 0;
      FakeRecognition.instances.push(this);
    }

    start() {
      this.startCount += 1;
      this.onstart?.();
    }

    stop() {
      this.onend?.();
    }
  }

  globalThis.window = createWindowStub(FakeRecognition);
  const createVoiceLayer = await loadCreateVoiceLayer();
  const voiceLayer = createVoiceLayer({
    autoRestart: true,
  });

  await voiceLayer.startListening({ restart: true });
  const recognition = FakeRecognition.instances[0];
  recognition.onerror?.({ error: 'not-allowed' });
  recognition.onend?.();
  await new Promise((resolve) => setTimeout(resolve, 220));

  assert.equal(recognition.startCount, 1);
  assert.equal(voiceLayer.getSnapshot().status, 'microphone permission denied');
});

test('voice layer emits sentence transcript events before finalizing a single cumulative voice turn', async () => {
  class FakeRecognition {
    static instances = [];

    constructor() {
      FakeRecognition.instances.push(this);
    }

    start() {
      this.onstart?.();
    }

    stop() {
      this.onend?.();
    }
  }

  globalThis.window = createWindowStub(FakeRecognition);
  const createVoiceLayer = await loadCreateVoiceLayer();
  const transcriptEvents = [];
  const turns = [];
  const replies = [];
  const voiceLayer = createVoiceLayer({
    autoRestart: false,
    speakReplies: false,
    async getReply(transcript, source) {
      replies.push({ transcript, source });
      return 'Queued for Codex agent.';
    },
  });

  voiceLayer.setHandlers({
    onTranscript(event) {
      transcriptEvents.push(event);
    },
    onTurn(turn) {
      turns.push(turn);
    },
  });

  await voiceLayer.startListening({ restart: true });
  const recognition = FakeRecognition.instances[0];

  recognition.onspeechstart?.();
  recognition.onresult?.({
    resultIndex: 0,
    results: [
      {
        0: { transcript: 'First sentence.' },
        isFinal: true,
      },
    ],
  });

  assert.equal(replies.length, 0);
  assert.equal(transcriptEvents[0]?.phase, 'sentence');
  assert.equal(transcriptEvents[0]?.text, 'First sentence.');
  assert.equal(transcriptEvents[0]?.segmentText, 'First sentence.');
  assert.equal(transcriptEvents[0]?.isFinal, false);

  recognition.onresult?.({
    resultIndex: 0,
    results: [
      {
        0: { transcript: 'Second sentence.' },
        isFinal: true,
      },
    ],
  });

  assert.equal(replies.length, 0);
  assert.equal(transcriptEvents[1]?.phase, 'sentence');
  assert.equal(transcriptEvents[1]?.text, 'First sentence. Second sentence.');
  assert.equal(transcriptEvents[1]?.segmentText, 'Second sentence.');
  assert.equal(transcriptEvents[1]?.isFinal, false);

  recognition.onend?.();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(replies.length, 1);
  assert.deepEqual(replies[0], {
    transcript: 'First sentence. Second sentence.',
    source: 'voice',
  });
  assert.equal(turns.length, 1);
  assert.equal(turns[0].transcript, 'First sentence. Second sentence.');
  assert.equal(transcriptEvents.at(-1)?.isFinal, true);
});

test('voice layer waits for a longer end-of-turn pause before finalizing a voice turn', async () => {
  class FakeRecognition {
    static instances = [];

    constructor() {
      FakeRecognition.instances.push(this);
    }

    start() {
      this.onstart?.();
    }

    stop() {
      this.onend?.();
    }
  }

  const timers = createManualTimers();
  globalThis.window = createWindowStub(FakeRecognition, timers);
  const createVoiceLayer = await loadCreateVoiceLayer();
  const turns = [];
  const replies = [];
  const voiceLayer = createVoiceLayer({
    autoRestart: false,
    speakReplies: false,
    async getReply(transcript, source) {
      replies.push({ transcript, source });
      return 'Queued for Codex agent.';
    },
  });

  voiceLayer.setHandlers({
    onTurn(turn) {
      turns.push(turn);
    },
  });

  await voiceLayer.startListening({ restart: true });
  const recognition = FakeRecognition.instances[0];

  recognition.onspeechstart?.();
  recognition.onresult?.({
    resultIndex: 0,
    results: [
      {
        0: { transcript: 'I am still talking and then I stop.' },
        isFinal: false,
      },
    ],
  });

  assert.equal(replies.length, 0);
  timers.advanceBy(1199);
  assert.equal(replies.length, 0);

  timers.advanceBy(1000);
  assert.equal(replies.length, 0);

  timers.advanceBy(1);
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(replies.length, 1);
  assert.deepEqual(replies[0], {
    transcript: 'I am still talking and then I stop.',
    source: 'voice',
  });
  assert.equal(turns.length, 1);
  assert.equal(turns[0].transcript, 'I am still talking and then I stop.');
});

test('voice layer finalizes faster after the browser has already committed a final sentence chunk', async () => {
  class FakeRecognition {
    static instances = [];

    constructor() {
      FakeRecognition.instances.push(this);
    }

    start() {
      this.onstart?.();
    }

    stop() {
      this.onend?.();
    }
  }

  const timers = createManualTimers();
  globalThis.window = createWindowStub(FakeRecognition, timers);
  const createVoiceLayer = await loadCreateVoiceLayer();
  const replies = [];
  const voiceLayer = createVoiceLayer({
    autoRestart: false,
    speakReplies: false,
    async getReply(transcript, source) {
      replies.push({ transcript, source });
      return 'Queued for Codex agent.';
    },
  });

  await voiceLayer.startListening({ restart: true });
  const recognition = FakeRecognition.instances[0];

  recognition.onspeechstart?.();
  recognition.onresult?.({
    resultIndex: 0,
    results: [
      {
        0: { transcript: 'First sentence.' },
        isFinal: true,
      },
    ],
  });

  timers.advanceBy(1199);
  assert.equal(replies.length, 0);

  timers.advanceBy(1);
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(replies[0], {
    transcript: 'First sentence.',
    source: 'voice',
  });
});
