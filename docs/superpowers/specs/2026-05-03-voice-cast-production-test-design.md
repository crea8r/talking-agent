# Voice Cast Production Test Design

## Goal

Replace the current `CV3 Production Test` tab in `Voice Cast` with a new `Production Test` workflow backed by a real local `MeloTTS -> OpenVoice V2` pipeline on the same Mac.

The target user flow is:

1. user opens `Production Test`
2. user configures one active saved profile in a collapsible setup section:
   - reference WAV
   - `MeloTTS` English base speaker
3. user clicks `Start Listening`
4. browser STT captures the utterance and stops automatically on silence
5. the system shows the recognized transcript
6. the system picks one random reply from a fixed built-in English pool of 100 replies
7. the system waits `100 ms`
8. the backend synthesizes the reply with `MeloTTS`
9. the backend converts that audio to the target voice with `OpenVoice V2`
10. the app auto-plays the generated reply immediately
11. the app persists the turn and keeps only the latest 20 replayable reply items on disk

The purpose of this redesign is to validate a realistic local production loop for voice replies while keeping the experience minimal and close to a real conversation rehearsal.

## Constraints

This design is intentionally narrow.

- platform: `macOS` only
- inference: `CPU-only`
- language: `English-only`
- runtime location: same machine as `Voice Cast`
- STT: browser STT is acceptable for this tab
- profile model: one active saved profile at a time
- setup location: collapsible first section inside the `Production Test` tab
- app setup scope: the app does not install engines; engines are installed out-of-band and then used by the app

Important constraint:

- `MeloTTS` has official local Linux/macOS install documentation
- `OpenVoice V2` officially documents Linux install; macOS is an integration target for this spike but is an unsupported path in the upstream official docs and therefore carries extra setup risk

## Scope

### In Scope

- rename and redesign the second tab from `CV3 Production Test` to `Production Test`
- replace the existing CV3-oriented controls with a minimal conversation-test console
- use browser STT for user transcript capture
- auto-stop listening on silence
- save one active production profile containing:
  - remembered reference WAV
  - remembered `MeloTTS` English base speaker
- auto-play each generated reply immediately
- show the recognized transcript and selected random reply text
- show per-turn speech generation time
- persist the latest 20 generated turns on disk
- keep replay for each generated reply in that 20-turn history
- delete generated audio files when turns are pruned from the 20-item window
- integrate a real local `MeloTTS -> OpenVoice V2` pipeline through a persistent sidecar process

### Out of Scope

- multi-profile management
- multilingual replies
- GPU or MPS acceleration
- remote TTS servers
- app-managed engine installation UX
- emotional controls or mood inputs
- user-editable reply pools
- persistence of raw user microphone audio

## Product Direction

Use a real local pipeline with a persistent Python sidecar.

### Recommended Shape

- `Voice Cast` remains the user-facing app and storage/orchestration layer
- a local Python sidecar loads `MeloTTS` and `OpenVoice V2` once and keeps them warm
- the app talks to that sidecar over local HTTP
- the sidecar exposes:
  - available English `MeloTTS` base speakers
  - reply generation from text + selected speaker + reference WAV

This is the right boundary for `macOS + CPU-only` because shelling out per turn would add too much startup latency, and two separate services would add complexity without enough value for this spike.

## User Experience

The second tab becomes `Production Test` and follows the approved `Minimal Test Console` direction.

### Collapsible Setup Section

The top section is collapsible and owns only the active saved profile.

Fields:

- `Reference WAV`
- `MeloTTS English Base Speaker`

Behavior:

- if no profile exists, the setup section is expanded by default
- once a profile exists, the section can collapse but still shows a compact summary
- replacing the reference WAV uploads it to Voice Cast storage immediately
- changing the base speaker updates the active saved profile immediately
- the app remembers exactly one active profile across reloads and restarts

The setup section does **not** include engine installation controls and does **not** include an explicit engine health dashboard. Errors should surface only when the app needs the backend and the backend is unavailable.

### Live Turn Section

The live section shows:

- `Start Listening`
- current listening state
- most recent transcript
- selected random reply
- speech generation time
- `Replay Latest Reply`

Flow:

1. user clicks `Start Listening`
2. browser STT listens
3. silence ends the turn automatically
4. transcript appears
5. app requests a reply turn from the backend
6. backend waits `100 ms`, generates speech, converts voice, persists the turn
7. app updates the latest-turn panel
8. generated reply auto-plays immediately

### Recent Turns Section

Below the latest turn, show the persisted 20-turn history.

Each item shows:

- timestamp or turn index
- user transcript
- chosen reply text
- generation time
- replay button

When the history exceeds 20 items:

- remove the oldest history record
- delete its generated reply audio file from disk immediately

## Interaction Flow

### Happy Path

1. user opens `Voice Cast`
2. user navigates to `Production Test`
3. app loads the active saved production profile and persisted turn history
4. if no active profile exists, user uploads a reference WAV and chooses a `MeloTTS` English base speaker
5. user clicks `Start Listening`
6. browser STT starts
7. silence stops the browser STT session
8. client receives the transcript
9. client submits the transcript to the Voice Cast server
10. server picks one random reply from the fixed 100-reply English pool
11. server waits `100 ms`
12. server requests speech generation from the local `MeloTTS/OpenVoice V2` sidecar using the saved profile
13. sidecar returns converted reply audio
14. server persists the new turn and prunes old history if needed
15. client renders the latest result and updated history
16. client auto-plays the generated reply

### Failure Cases

- no active profile:
  - disable `Start Listening` and show a clear setup prompt
- browser STT unavailable:
  - show a browser capability error in the tab
- transcript capture fails:
  - show a turn-local error and leave prior history unchanged
- sidecar unavailable:
  - fail the generation request with a local-backend error
- `MeloTTS` generation fails:
  - preserve the transcript if already shown, do not persist a partial turn
- `OpenVoice V2` conversion fails:
  - preserve the transcript if already shown, do not persist a partial turn
- persisted history load fails:
  - show an error banner and fall back to empty in-memory history for that session
- replay audio missing for a persisted turn:
  - show metadata and disable replay for that row

## Architecture

Use three layers:

1. browser client
2. Voice Cast Node server
3. local Python production sidecar

### Browser Client Responsibilities

- render the `Production Test` tab
- manage the collapsible setup section
- use browser STT APIs
- start listening manually
- stop on silence automatically
- submit transcripts to the app server
- render latest turn and persisted history
- auto-play the latest reply
- replay prior replies

The client should not know how `MeloTTS` or `OpenVoice V2` work internally.

### Voice Cast Server Responsibilities

- persist the single active production profile
- copy and store the selected reference WAV
- load and serve the available `MeloTTS` English speaker list via the sidecar
- own the fixed 100-reply English pool
- choose the random reply for each turn
- apply the `100 ms` delay before generation
- call the local Python sidecar for speech production
- measure end-to-end speech generation time for the turn
- persist reply audio and turn metadata
- prune old history and delete pruned audio files
- expose production-test APIs to the browser client

### Python Sidecar Responsibilities

- load `MeloTTS` and `OpenVoice V2` once at startup
- expose the installed English `MeloTTS` base speakers
- synthesize input text with the selected `MeloTTS` base speaker
- run `OpenVoice V2` tone-color conversion with the saved reference WAV
- return generated audio bytes to the Voice Cast server

The sidecar should be persistent, not per-request, because `CPU-only` model startup cost is too high to pay on every turn.

## Local Runtime and Model Assumptions

The app does not install engines through the UI, but the overall solution assumes the following local assets exist in the workspace:

- a Python runtime dedicated to the production sidecar
- installed `MeloTTS`
- installed `OpenVoice V2`
- downloaded model weights needed for:
  - English `MeloTTS`
  - `OpenVoice V2` voice conversion

Recommended workspace ownership:

- keep these under `apps/voice-cast/vendor/` or another app-local path
- avoid coupling them to unrelated apps in the monorepo

This keeps the spike self-contained and aligned with the repository guidance.

### Speaker Expectations

The first version should surface the installed English `MeloTTS` base speakers exposed by the runtime. The expected English speaker identifiers from the official `MeloTTS` docs are:

- `EN-Default`
- `EN-US`
- `EN-BR`
- `EN_INDIA`
- `EN-AU`

If the local install exposes a different or reduced set, the UI should reflect the actual runtime list rather than hard-coding assumptions.

## Saved Profile Model

There is exactly one active saved profile at a time.

Suggested fields:

- `id`
- `referenceOriginalFileName`
- `referenceStoredFileName`
- `referenceStoredPath`
- `referenceMimeType`
- `referenceSizeBytes`
- `meloBaseSpeakerId`
- `meloBaseSpeakerLabel`
- `createdAt`
- `updatedAt`

This profile is the only setup data needed for the first version of the real production loop.

## Production Turn Model

Each turn persists as metadata plus one generated reply audio file.

Suggested fields:

- `id`
- `createdAt`
- `profileId`
- `userTranscript`
- `replyText`
- `generationTimeMs`
- `replyAudioPath`
- `replyAudioMimeType`
- `pipeline`
  - fixed string such as `browser-stt -> melotts -> openvoice-v2`

## Storage Layout

Under `output/voice-cast/`, add a dedicated production-test storage area.

Suggested layout:

- `output/voice-cast/production-test/profile/active-profile.json`
- `output/voice-cast/production-test/profile/reference.wav`
- `output/voice-cast/production-test/replies/`
- `output/voice-cast/production-test/history.json`

### Profile Storage

- store the active profile metadata in `active-profile.json`
- copy the selected reference WAV into the profile directory
- replacing the reference should replace the stored file and metadata

### Reply Storage

- store one generated reply audio file per turn in `replies/`
- history records point to those stored files
- when a turn is pruned from history, delete its reply audio file immediately

## Reply Pool

The production test uses a fixed built-in array of 100 English reply texts.

Requirements:

- all replies are English
- replies range from short one-line answers to three-sentence answers
- replies are neutral and safe for repeated production-style testing
- the pool is code-defined, not UI-editable
- selection is random per turn

This pool should be separate from the text-only casting sample pool even if helper generation patterns are shared.

## Real Generation Pipeline

For each production turn:

1. server validates that the active profile exists
2. server selects one random reply
3. server waits `100 ms`
4. server calls the sidecar with:
   - reply text
   - active `MeloTTS` English base speaker
   - stored reference WAV path
5. sidecar synthesizes reply audio with `MeloTTS`
6. sidecar converts synthesized audio to the target timbre with `OpenVoice V2`
7. sidecar returns final audio bytes
8. server stores the final reply audio and records timing

The browser STT transcript is used only to trigger and document the turn. It is not used as the reply text source. The reply text always comes from the built-in random reply pool.

## Timing Definition

The displayed timing is:

- measured from the start of reply generation on the Voice Cast server
- includes the required `100 ms` pause
- includes `MeloTTS` synthesis time
- includes `OpenVoice V2` conversion time
- includes any final in-process work required to make the reply audio ready for playback and replay persistence
- excludes the user speaking duration
- excludes browser STT listening duration

UI label recommendation:

- `Speech generation time`

Store timing in milliseconds and render it as a human-friendly seconds label such as `1.14s`.

## Browser STT

Use browser STT only for this tab.

Requirements:

- manual start with `Start Listening`
- auto-stop on silence
- recognized transcript shown in the latest-turn panel and persisted history
- graceful failure when unsupported

The browser transcript is persisted as text only. Raw microphone audio is not persisted in this version.

## API Changes

The old `/api/production/generate` route is CV3-specific and should not be stretched to fit this new workflow.

Recommended routes:

- `GET /api/production-test/state`
  - returns active profile, available `MeloTTS` English speakers, and current history
- `POST /api/production-test/profile`
  - saves or replaces the active profile
- `POST /api/production-test/turn`
  - accepts the browser STT transcript and returns the new persisted turn plus updated history

### Sidecar Routes

Recommended sidecar routes:

- `GET /healthz`
- `GET /speakers`
  - returns English `MeloTTS` base speakers
- `POST /generate`
  - accepts reply text, selected base speaker, and stored reference WAV path

The app server should be the only browser-facing layer. The browser should not talk directly to the sidecar.

## Testing

### Client Tests

- initial render with no active profile
- render with an existing active profile loaded from disk
- setup section saves reference WAV and selected base speaker
- STT listening state transitions
- transcript and reply rendering in latest-turn panel
- history rendering with replay controls
- auto-play of the newest generated reply
- error states when browser STT is unavailable

### App Server Tests

- save/replace active profile and reload it
- persist one generated turn from a transcript
- random reply selection always returns one of the 100 built-ins
- generation timing is returned and persisted
- history is capped at 20 items
- pruned turns delete their audio files
- app server correctly proxies available `MeloTTS` speakers from the sidecar

### Sidecar Tests

- list English `MeloTTS` speakers
- synthesize with a selected base speaker
- convert with `OpenVoice V2` using a reference WAV
- return a valid final WAV payload
- fail clearly on invalid speaker or invalid reference file

### Integration Tests

- load app, save active profile, run a transcript through the real local sidecar, receive replayable audio
- latest reply auto-plays
- reloading the app preserves the active profile and history
- after more than 20 turns, oldest history items and their files are removed

## Migration Notes

The existing `CV3 Production Test` client state, UI controls, and server endpoint shape are not useful for this feature and should be replaced rather than extended.

Keep the text-only casting tab intact.

Replace in the second tab:

- title and copy
- client state structure
- event flow
- server routes used by that tab
- backend assumptions

Do not preserve old CV3-only controls such as:

- model selection
- mode selection
- prompt transcript entry
- manual production text entry
- instruct text entry

## Recommendation

Implement `Production Test` as a real local `macOS + CPU-only` production rehearsal surface using browser STT, one active saved profile, a persistent Python `MeloTTS/OpenVoice V2` sidecar, immediate reply auto-play, and persisted 20-turn replayable history with pruning. This gives the user a realistic local experience while keeping the spike small, self-hosted, and properly isolated inside `Voice Cast`.
