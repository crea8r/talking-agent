# Voice Cast Design

Date: 2026-05-02
Status: Proposed

## Summary

Build a separate spike app, `apps/voice-cast`, for casting and validating character voices before they are wired into the room product.

`Voice Cast` has two jobs:

1. Create a reusable prompt asset from text alone using the older text-only CosyVoice instruct path.
2. Test the real production path with `Fun-CosyVoice3` using that saved prompt asset.

This work should stay separate from `apps/one-to-one-agent-room`. The room app is the integration spike. `Voice Cast` is a local casting and voice-validation tool.

## Goals

- Let an operator describe a character voice in prose and generate candidate prompt audio from text alone.
- Let an operator save a generated prompt voice as a reusable prompt asset for later testing.
- Let an operator upload a prompt WAV and test `Fun-CosyVoice3` in `instruct2` and `zero_shot` modes.
- Keep the UI small, direct, and local-first.
- Preserve enough metadata so prompt assets remain useful across sessions.
- Measure generation timing in the backend so the operator can judge whether the local path is viable for production.

## Non-Goals

- No avatar rendering.
- No LiveKit room integration.
- No speech recognition.
- No attempt to replace the room app or the browser voice loop labs.
- No attempt to train a custom voice model in this app.
- No attempt to infer a new stable character voice from prose alone in the `CosyVoice3` path.

## Why A Separate App

This should be a new app under `apps/voice-cast`.

Reasons:

- Casting voices is a different workflow from a live call.
- The room app should not accumulate model-specific UI for prompt assets and multi-step TTS testing.
- `Voice Cast` needs local file persistence and explicit TTS debug surfaces that would be noise inside the room UI.
- A separate app keeps the production room flow clean while still letting us make progress on character voice quality.

## Product Shape

The app title is `Voice Cast`.

The browser UI uses two tabs:

1. `Text-Only Casting`
2. `CV3 Production Test`

The first tab exists because the chosen `CosyVoice3` production path does not provide a text-only character casting mode. The second tab exists because the first tab's output is not enough on its own; the saved asset must be validated against the real `CosyVoice3` runtime path.

## Core Constraint

`Fun-CosyVoice3` does not give the operator a text-only prompt-asset workflow for the desired `instruct2` and `zero_shot` production modes.

That means the app must intentionally split into:

- a text-only casting tab using an older CosyVoice instruct model with preset speakers
- a production-validation tab using `Fun-CosyVoice3` with uploaded prompt audio

The design must not hide this model split.

## Recommended Approach

Create a small Node-served browser app that talks to local TTS backends through server-side adapters.

The app server will:

- serve the static browser UI
- expose runtime config
- proxy requests to configured local CosyVoice services
- persist prompt assets and metadata in `output/voice-cast/`
- return generated audio and timing metadata to the browser

The browser app will:

- collect operator input
- submit generation requests to the app server
- preview returned audio
- save prompt assets
- upload a prompt WAV into the production tab

## Runtime Architecture

### 1. App Server

Add `apps/voice-cast/server.mjs`.

Responsibilities:

- serve the browser app
- expose runtime config
- expose HTTP APIs for text-only casting and `CosyVoice3` production generation
- handle multipart uploads for prompt WAVs
- persist prompt asset metadata and generated files

The server should follow the simple built-in Node server pattern already used by spike apps in this repo.

### 2. Browser App

Add `apps/voice-cast/src`.

Responsibilities:

- render the two-tab UI
- manage form state
- send generation requests
- preview generated audio
- show request timing
- allow save and upload flows

This app should not import:

- `three`
- `@pixiv/three-vrm`
- LiveKit modules
- `voice-layer-browser`
- avatar speech modules

### 3. TTS Adapter Layer

Add a small server-side adapter module, for example `apps/voice-cast/lib/tts-client.mjs`.

Responsibilities:

- call the text-only casting backend
- call the `CosyVoice3` backend
- normalize responses into one app-facing shape
- expose request timing and backend errors

The app must not call Python directly from the browser. The browser only talks to the local Node app server.

## External Dependency Model

The repo will not embed CosyVoice models inside the Node app.

Instead, `Voice Cast` assumes one or two local CosyVoice services already exist:

- a text-only casting service
- a `CosyVoice3` production service

The app server should be configured by environment variables or runtime config such as:

- `VOICE_CAST_TEXT_ONLY_BASE_URL`
- `VOICE_CAST_CV3_BASE_URL`

The exact upstream route names can vary by local deployment. The app's adapter layer should own that translation.

This keeps the app usable on macOS first, while leaving room for Linux and later Windows setups that host the Python side differently.

## Tab 1: Text-Only Casting

### Purpose

Generate a prompt asset from text alone.

### Fixed Model Choice

Tab 1 uses the older text-only CosyVoice instruct path.

For the first version, the model choice is fixed to:

- `CosyVoice-300M-Instruct`

This tab should not expose `SFT` mode as a separate operator mode. The app uses the instruct path directly because the operator needs prose steering, not only stock speaker playback.

### Inputs

- `Preset Speaker`
- `Speed`
- `Character Prompt`
- `Instruct Text`
- `Prompt Text to Generate`

Field meanings:

- `Preset Speaker`: a real speaker id from the installed model, populated at runtime from `list_available_spks()`
- `Speed`: numeric TTS speed passed to the backend
- `Character Prompt`: app-level prose description that helps the operator shape the voice
- `Instruct Text`: real model-side instruct string
- `Prompt Text to Generate`: the exact text used to create the prompt WAV

### Speaker List Behavior

The UI may show example speaker values in mockups, but the real app must fetch the list at runtime from the text-only model backend.

The app must not hard-code the production speaker list as a source of truth.

### Action

Primary button:

- `Generate Prompt Voice`

### Output

The server returns:

- audio bytes
- request timing
- normalized generation metadata

The browser shows:

- audio preview
- compact timing information
- `Save as Prompt WAV`

## Prompt Asset Persistence

The app cannot persist only a WAV file if it wants to support the later `zero_shot` path cleanly.

The saved asset must include:

- `prompt_wav`
- `prompt_text`
- source model id
- preset speaker id
- speed
- character prompt
- instruct text
- created timestamp

### Storage Shape

Persist under:

- `output/voice-cast/prompt-assets/`

Each asset should use:

- one WAV file
- one JSON sidecar

Example:

- `output/voice-cast/prompt-assets/red-fairy-v1.wav`
- `output/voice-cast/prompt-assets/red-fairy-v1.json`

The JSON sidecar preserves the transcript and casting metadata across sessions.

### Save Behavior

The browser button label remains:

- `Save as Prompt WAV`

But the server-side save operation should persist both:

- the WAV
- the JSON sidecar

This keeps the user-facing flow simple while preserving the required metadata.

## Tab 2: CV3 Production Test

### Purpose

Test the real production generation path with `Fun-CosyVoice3`.

### Models

Expose:

- `Fun-CosyVoice3-0.5B`
- `Fun-CosyVoice3-1.5B`

### Modes

Expose only:

- `instruct2`
- `zero_shot`

Do not expose `SFT` here.

### Inputs

- `Model`
- `Mode`
- `Prompt WAV` file attachment
- `Production Text`
- `Instruct Text` when mode is `instruct2`
- `Prompt Transcript` when mode is `zero_shot`
- `Stream`
- `Speed`

### Mode-Specific Behavior

When `mode = instruct2`:

- show `Instruct Text`
- hide `Prompt Transcript`

When `mode = zero_shot`:

- hide `Instruct Text`
- show `Prompt Transcript`

Reason:

- `zero_shot` requires the text corresponding to the prompt WAV
- `instruct2` uses the instruction prompt instead

### Prompt WAV Upload

This tab uses file upload, not a saved-asset dropdown.

Reason:

- it maps directly to the real `prompt_wav` contract
- it keeps the app honest about production input shape
- it allows external prompt assets, not only assets created by this app

If the uploaded file matches a locally saved sidecar entry, the app may auto-fill transcript metadata. If not, the operator must supply the transcript manually for `zero_shot`.

### Action

Primary button:

- `Generate Production Voice`

### Output

The server returns:

- audio bytes
- request timing
- normalized generation metadata

The browser shows:

- audio preview
- compact timing information

## API Shape

The exact upstream CosyVoice routes can vary, but the app's own API should stay stable.

Recommended app API:

- `GET /api/runtime-config`
- `GET /api/casting/speakers`
- `POST /api/casting/generate`
- `POST /api/prompt-assets/save`
- `POST /api/production/generate`

### `POST /api/casting/generate`

Request body:

```json
{
  "model": "CosyVoice-300M-Instruct",
  "presetSpeaker": "English-speaking woman",
  "speed": 1.0,
  "characterPrompt": "young female voice, bright, playful, nimble",
  "instructText": "Young female, bright, playful, nimble. Speak with lively energy.",
  "promptText": "I found it. I knew there was still magic left in this room."
}
```

Response shape:

```json
{
  "audioBase64": "...",
  "mimeType": "audio/wav",
  "timing": {
    "startedAt": "...",
    "completedAt": "...",
    "durationMs": 812
  },
  "meta": {
    "model": "CosyVoice-300M-Instruct",
    "presetSpeaker": "English-speaking woman",
    "promptText": "I found it. I knew there was still magic left in this room."
  }
}
```

### `POST /api/prompt-assets/save`

Request body:

```json
{
  "fileNameStem": "red-fairy-v1",
  "audioBase64": "...",
  "promptText": "I found it. I knew there was still magic left in this room.",
  "characterPrompt": "young female voice, bright, playful, nimble",
  "instructText": "Young female, bright, playful, nimble. Speak with lively energy.",
  "presetSpeaker": "English-speaking woman",
  "model": "CosyVoice-300M-Instruct",
  "speed": 1.0
}
```

Response shape:

```json
{
  "ok": true,
  "wavPath": "output/voice-cast/prompt-assets/red-fairy-v1.wav",
  "metaPath": "output/voice-cast/prompt-assets/red-fairy-v1.json"
}
```

### `POST /api/production/generate`

Use multipart form data.

Fields:

- `model`
- `mode`
- `productionText`
- `instructText` when `instruct2`
- `promptTranscript` when `zero_shot`
- `stream`
- `speed`
- `promptWav`

Response shape:

```json
{
  "audioBase64": "...",
  "mimeType": "audio/wav",
  "timing": {
    "startedAt": "...",
    "completedAt": "...",
    "durationMs": 1043
  },
  "meta": {
    "model": "Fun-CosyVoice3-0.5B",
    "mode": "zero_shot"
  }
}
```

## UI Design

### Overall Layout

One page with a title bar and two clickable tabs:

- `Text-Only Casting`
- `CV3 Production Test`

Each tab shows:

- a compact form
- one primary generate button
- one result block with audio preview

The UI should stay intentional and compact, not tool-like clutter.

### Tab 1 UI

Show:

- model selector, fixed to one entry
- preset speaker dropdown
- speed input
- character prompt textarea
- instruct text textarea
- prompt text textarea
- `Generate Prompt Voice`
- audio preview
- `Save as Prompt WAV`

Hide:

- production-only fields
- prompt WAV upload

### Tab 2 UI

Show:

- model selector
- mode selector
- prompt WAV file input
- production text textarea
- mode-specific auxiliary field:
  - `Instruct Text` for `instruct2`
  - `Prompt Transcript` for `zero_shot`
- stream selector or checkbox
- speed input
- `Generate Production Voice`
- audio preview

Hide:

- preset speaker dropdown
- save button from tab 1

## Error Handling

The app must surface backend failures directly and specifically.

Cases to handle:

- text-only backend unavailable
- `CosyVoice3` backend unavailable
- empty prompt upload
- invalid audio upload
- missing transcript for `zero_shot`
- missing instruct text for `instruct2`
- asset save failure

The browser should show concise inline errors next to the failed action, not only raw JSON dumps.

## Timing and Viability

Latency is a product goal, but it does not need a large dedicated panel in the first UI.

Instead, each generation response should include compact timing metadata:

- start time
- completion time
- duration in ms

That timing should be shown in the result block and logged in the debug snapshot so the operator can judge whether the local path is viable without bloating the main form.

## File and Directory Plan

Add:

- `apps/voice-cast/package.json`
- `apps/voice-cast/server.mjs`
- `apps/voice-cast/src/index.html`
- `apps/voice-cast/src/styles.css`
- `apps/voice-cast/src/app.js`
- `apps/voice-cast/src/lib/http.js`
- `apps/voice-cast/src/lib/state.js`
- `apps/voice-cast/src/lib/render.js`
- `apps/voice-cast/src/lib/events.js`
- `apps/voice-cast/src/lib/format.js`
- `apps/voice-cast/lib/tts-client.mjs`
- `apps/voice-cast/lib/prompt-assets.mjs`

Persist runtime output under:

- `output/voice-cast/`
- `output/voice-cast/prompt-assets/`

## Testing

### Browser App Tests

Add focused unit tests for:

- mode-specific field visibility
- request body construction
- form validation
- save-state transitions after generate

### Server Tests

Add focused server or adapter tests for:

- runtime speaker list proxying
- prompt asset sidecar persistence
- multipart parsing for production upload
- normalized error mapping

### Manual Checks

Operator flow to validate:

1. Open `Voice Cast`.
2. Generate a prompt asset from Tab 1.
3. Save it.
4. Upload that WAV in Tab 2.
5. Run both `instruct2` and `zero_shot`.
6. Confirm audio preview and timing render.

## Open Decisions Resolved

- App name: `Voice Cast`
- App location: separate app in `apps/voice-cast`
- Main UI structure: two clickable tabs
- Tab 1 model strategy: text-only instruct path
- Tab 2 model strategy: `CosyVoice3` production path
- Tab 2 prompt asset shape: file attachment, not dropdown
- Persistence requirement: save WAV plus transcript sidecar, not WAV alone

## Recommendation

Implement the browser and server shell first, with backend adapters that assume local CosyVoice services are already running.

That gives the repo a usable casting app without blocking on Python packaging work inside this monorepo, and it keeps the runtime boundary explicit enough to swap local service layouts later.
