# Voice Cast Production Test Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the old CV3 production tab in `Voice Cast` with a real local `browser-stt -> MeloTTS -> OpenVoice V2` production-test flow that persists one active profile and the latest 20 replayable turns.

**Architecture:** Keep `Text-Only Casting` intact. Add a new app-server production-test layer that owns persistent profile/history storage and a fixed reply pool, plus a Python sidecar that keeps `MeloTTS` and `OpenVoice V2` warm and exposes local HTTP routes for speaker listing and audio generation.

**Tech Stack:** Node.js HTTP server, browser Web Speech API, local Python sidecar, MeloTTS, OpenVoice V2, node:test, macOS CPU-only runtime.

---

### Task 1: Lock the new production-test server contract

**Files:**
- Create: `apps/voice-cast/lib/production-test-store.mjs`
- Create: `apps/voice-cast/lib/production-replies.mjs`
- Modify: `apps/voice-cast/lib/server.mjs`
- Modify: `apps/voice-cast/lib/server.test.mjs`

- [ ] **Step 1: Write the failing server tests**

```js
test('GET /api/production-test/state returns profile, speakers, and history', async () => {
  const response = await handleRequest(new Request('http://voice-cast.local/api/production-test/state'));
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.deepEqual(payload.profile, null);
  assert.deepEqual(payload.history, []);
});

test('POST /api/production-test/profile stores the copied reference wav and profile metadata', async () => {
  const formData = new FormData();
  formData.set('meloBaseSpeakerId', 'EN-US');
  formData.set('referenceWav', new File([Uint8Array.from([1, 2, 3])], 'sample.wav', { type: 'audio/wav' }));
  const response = await handleRequest(new Request('http://voice-cast.local/api/production-test/profile', {
    method: 'POST',
    body: formData,
  }));
  assert.equal(response.status, 200);
});

test('POST /api/production-test/turn persists the new turn and caps history at 20', async () => {
  const response = await handleRequest(new Request('http://voice-cast.local/api/production-test/turn', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ transcript: 'hello there' }),
  }));
  assert.equal(response.status, 200);
});
```

- [ ] **Step 2: Run the server tests to verify RED**

Run: `node --test apps/voice-cast/lib/server.test.mjs`
Expected: FAIL on missing `/api/production-test/*` handlers and missing store utilities.

- [ ] **Step 3: Add the minimal production-test store and reply-pool implementation**

```js
export function pickRandomProductionReply(randomIndex = Math.floor(Math.random() * PRODUCTION_TEST_REPLIES.length)) {
  return PRODUCTION_TEST_REPLIES[randomIndex] || PRODUCTION_TEST_REPLIES[0];
}

export function createProductionTestStore({ rootDir }) {
  return {
    async loadState() {},
    async saveProfile({ referenceUpload, meloBaseSpeakerId, meloBaseSpeakerLabel }) {},
    async appendTurn({ userTranscript, replyText, generationTimeMs, replyAudioBuffer, replyAudioMimeType }) {},
  };
}
```

- [ ] **Step 4: Implement the new server routes**

```js
if (request.method === 'GET' && requestUrl.pathname === '/api/production-test/state') {
  const [profile, history, speakers] = await Promise.all([
    productionTestStore.loadProfile(),
    productionTestStore.loadHistory(),
    ttsClient.listProductionSpeakers(),
  ]);
  return jsonResponse(200, { ok: true, profile, history, speakers });
}
```

- [ ] **Step 5: Re-run the server tests to verify GREEN**

Run: `node --test apps/voice-cast/lib/server.test.mjs`
Expected: PASS

### Task 2: Add the real sidecar-facing client contract

**Files:**
- Modify: `apps/voice-cast/lib/tts-client.mjs`
- Modify: `apps/voice-cast/lib/tts-client.test.mjs`

- [ ] **Step 1: Write the failing client tests**

```js
test('listProductionSpeakers reads the production sidecar speakers route', async () => {
  const speakers = await client.listProductionSpeakers();
  assert.deepEqual(speakers, ['EN-US', 'EN-BR']);
});

test('generateProductionTurn posts reply text, speaker id, and reference wav path', async () => {
  await client.generateProductionTurn({
    replyText: 'All set.',
    meloBaseSpeakerId: 'EN-US',
    referenceWavPath: '/tmp/reference.wav',
  });
  assert.equal(fetchCalls[0].url, 'http://production.local/generate');
});
```

- [ ] **Step 2: Run the client tests to verify RED**

Run: `node --test apps/voice-cast/lib/tts-client.test.mjs`
Expected: FAIL on missing production-client methods.

- [ ] **Step 3: Add the minimal production client methods**

```js
async function listProductionSpeakers() {
  const response = await fetchImpl(`${productionBaseUrl}/speakers`);
  await expectOk(response);
  return normalizeSpeakers(await response.json());
}

async function generateProductionTurn({ replyText, meloBaseSpeakerId, referenceWavPath }) {
  const response = await fetchImpl(`${productionBaseUrl}/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ replyText, meloBaseSpeakerId, referenceWavPath }),
  });
  await expectOk(response);
  return normalizeAudioResponse(response);
}
```

- [ ] **Step 4: Re-run the client tests to verify GREEN**

Run: `node --test apps/voice-cast/lib/tts-client.test.mjs`
Expected: PASS

### Task 3: Replace the browser production tab state, render model, and event flow

**Files:**
- Modify: `apps/voice-cast/src/index.html`
- Modify: `apps/voice-cast/src/app.js`
- Modify: `apps/voice-cast/src/lib/store.js`
- Modify: `apps/voice-cast/src/lib/render.js`
- Modify: `apps/voice-cast/src/lib/events.js`
- Modify: `apps/voice-cast/src/lib/http.js`
- Modify: `apps/voice-cast/src/styles.css`
- Modify: `apps/voice-cast/src/lib/render.test.mjs`
- Modify: `apps/voice-cast/src/lib/events.test.mjs`

- [ ] **Step 1: Write the failing client tests**

```js
test('buildViewModel disables Start Listening when no active production profile exists', () => {
  const state = createVoiceCastState();
  const viewModel = buildViewModel(state);
  assert.equal(viewModel.production.canStartListening, false);
});

test('save profile posts the uploaded wav and selected melo speaker', async () => {
  await dom.productionSaveProfile.dispatchEvent(new Event('click'));
  assert.equal(receivedFormData.get('meloBaseSpeakerId'), 'EN-US');
});

test('history renders only the latest 20 persisted turns with replay controls', () => {
  const viewModel = buildViewModel(state);
  assert.equal(viewModel.production.history.length, 20);
});
```

- [ ] **Step 2: Run the client tests to verify RED**

Run: `node --test apps/voice-cast/src/lib/render.test.mjs apps/voice-cast/src/lib/events.test.mjs`
Expected: FAIL on missing profile/history/listening behavior.

- [ ] **Step 3: Implement the new browser state and DOM**

```js
production: {
  speakers: [],
  profile: null,
  history: [],
  setupOpen: true,
  selectedSpeakerId: '',
  selectedReferenceFile: null,
  transcript: '',
  latestTurn: null,
  listening: false,
  submittingTurn: false,
  error: '',
}
```

- [ ] **Step 4: Implement the new HTTP calls and event handlers**

```js
async saveProductionProfile(formData) {
  return expectJson(await fetch('/api/production-test/profile', { method: 'POST', body: formData }));
}

async submitProductionTurn(payload) {
  return expectJson(await fetch('/api/production-test/turn', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
  }));
}
```

- [ ] **Step 5: Re-run the client tests to verify GREEN**

Run: `node --test apps/voice-cast/src/lib/render.test.mjs apps/voice-cast/src/lib/events.test.mjs`
Expected: PASS

### Task 4: Add the Python production sidecar for MeloTTS and OpenVoice V2

**Files:**
- Create: `apps/voice-cast/tools/production_voice_server.py`
- Create: `apps/voice-cast/tools/production_voice_server_test.py`
- Modify: `apps/voice-cast/server.mjs`

- [ ] **Step 1: Write the failing sidecar tests**

```python
def test_list_speakers_returns_english_speakers():
    app = create_app(runtime=FakeRuntime(["EN-US", "EN-BR"]))
    response = app.test_client().get("/speakers")
    assert response.status_code == 200

def test_generate_requires_reply_text_and_reference_path():
    app = create_app(runtime=FakeRuntime(["EN-US"]))
    response = app.test_client().post("/generate", json={})
    assert response.status_code == 400
```

- [ ] **Step 2: Run the sidecar tests to verify RED**

Run: `python3 -m pytest apps/voice-cast/tools/production_voice_server_test.py`
Expected: FAIL because the sidecar file does not exist yet.

- [ ] **Step 3: Implement the minimal sidecar app**

```python
@app.get("/speakers")
def list_speakers():
    return jsonify({"speakers": runtime.list_english_speakers()})

@app.post("/generate")
def generate():
    payload = request.get_json(force=True) or {}
    reply_text = payload.get("replyText", "").strip()
    speaker_id = payload.get("meloBaseSpeakerId", "").strip()
    reference_wav_path = payload.get("referenceWavPath", "").strip()
    audio_bytes = runtime.generate_reply(reply_text, speaker_id, reference_wav_path)
    return Response(audio_bytes, mimetype="audio/wav")
```

- [ ] **Step 4: Re-run the sidecar tests to verify GREEN**

Run: `python3 -m pytest apps/voice-cast/tools/production_voice_server_test.py`
Expected: PASS

### Task 5: Install the local runtime and verify the end-to-end app

**Files:**
- Modify: `apps/voice-cast/server.mjs`
- Optional: `apps/voice-cast/README.md`

- [ ] **Step 1: Install the local Python environment and engine dependencies**

Run:
```bash
python3 -m venv apps/voice-cast/vendor/production-voice/.venv
apps/voice-cast/vendor/production-voice/.venv/bin/pip install --upgrade pip
apps/voice-cast/vendor/production-voice/.venv/bin/pip install MeloTTS openvoice
```
Expected: installed local runtime under `apps/voice-cast/vendor/production-voice/`

- [ ] **Step 2: Start the production sidecar and Voice Cast**

Run:
```bash
PORT=50003 apps/voice-cast/vendor/production-voice/.venv/bin/python apps/voice-cast/tools/production_voice_server.py
VOICE_CAST_PRODUCTION_BASE_URL=http://127.0.0.1:50003 npm run start:voice-cast
```
Expected: sidecar and app health checks both return `ok: true`

- [ ] **Step 3: Run the focused automated test suite**

Run:
```bash
node --test apps/voice-cast/lib/server.test.mjs apps/voice-cast/lib/tts-client.test.mjs apps/voice-cast/src/lib/render.test.mjs apps/voice-cast/src/lib/events.test.mjs
python3 -m pytest apps/voice-cast/tools/production_voice_server_test.py
```
Expected: PASS

- [ ] **Step 4: Smoke test the browser flow**

Run:
```bash
curl -s http://127.0.0.1:4388/api/production-test/state
curl -s http://127.0.0.1:50003/speakers
```
Expected: state payload includes one active profile or `null`, and speakers return English `MeloTTS` entries.
