# Voice Cast Production Test Design

## Goal

Replace the current `CV3 Production Test` tab in `Voice Cast` with a new `Production Test` workflow that simulates a production voice-reply loop:

1. user selects a reference WAV that defines the target voice
2. user speaks into the microphone
3. browser STT captures the spoken utterance and stops automatically on silence
4. the system picks one random reply from a fixed built-in pool of 100 replies
5. the system waits `100 ms`
6. the system produces mocked reply audio using the future production chain shape:
   `MeloTTS text -> OpenVoice V2 voice conversion`
7. the app plays the reply and records the turn in persistent history

This redesign validates the interaction model and data/storage boundaries before any real `MeloTTS` or `OpenVoice V2` integration is added.

## Scope

### In Scope

- rename and redesign the second tab from `CV3 Production Test` to `Production Test`
- replace the current `prompt WAV + mode + manual generate` UI with a minimal console flow
- use browser STT for transcript capture
- auto-stop recording on silence
- use a fixed built-in list of 100 reply texts ranging from short replies to three-sentence replies
- select one random reply per user turn
- show the recognized transcript and selected reply text before playback
- show end-to-end speech generation time for each generated reply
- persist the selected reference WAV in Voice Cast storage
- persist the last 20 turns on disk
- keep a replay button for each generated reply in history
- delete generated reply audio files when the corresponding turn falls out of the 20-item history window
- keep the backend mocked but shaped like the future production backend

### Out of Scope

- real `MeloTTS` synthesis
- real `OpenVoice V2` conversion
- real microphone audio upload to the server for STT
- browser-to-server live streaming
- emotional control, mood routing, or character switching in this tab
- support for multiple saved reference voices at once
- editing the reply pool from the UI

## User Experience

The second tab becomes `Production Test` and follows a `Minimal Test Console` layout.

### Top Section: Reference Voice

- show the currently remembered reference WAV filename
- show a `Replace Reference WAV` control
- when the user selects a file, the app uploads it to Voice Cast storage immediately
- once stored, the remembered reference becomes the active base voice for future turns
- the selected file persists across reloads and restarts

### Middle Section: Live Turn

- show a `Start Listening` button
- when clicked, the browser starts STT listening
- the listening session stops automatically on silence
- once STT completes, the UI shows:
  - the recognized user transcript
  - the randomly chosen reply text
  - the speech generation time for that reply
  - a short chain label indicating `Browser STT -> 100 ms pause -> mocked MeloTTS -> mocked OpenVoice V2`
- the latest generated reply is playable via `Replay Latest Reply`

### Lower Section: Recent Turns

- show a running history of the latest 20 turns
- each history item shows:
  - turn order or timestamp
  - recognized transcript
  - chosen reply text
  - generation time
  - replay button
- when a 21st item is added:
  - the oldest item is removed from persisted history
  - the oldest generated reply audio file is deleted from disk

## Interaction Flow

### Happy Path

1. user opens `Voice Cast`
2. user navigates to `Production Test`
3. user uploads a reference WAV if one is not already remembered
4. user clicks `Start Listening`
5. browser STT enters listening state
6. silence ends the listening session
7. client receives transcript
8. client sends a mock production-turn request to the server
9. server picks a random reply from the built-in list
10. server waits `100 ms`
11. server generates mocked reply audio and records total generation time
12. server persists the new turn and prunes history if needed
13. client receives the new turn payload
14. client updates the latest-turn panel and history list
15. client auto-plays or exposes replay for the generated reply

### Failure Cases

- no reference WAV selected:
  - disable `Start Listening` or fail fast with a clear message
- browser STT unavailable:
  - show a browser capability error in the tab
- transcript capture fails:
  - show a turn-local error and keep prior history intact
- mock generation fails:
  - preserve transcript if already captured, show generation failure, do not append a partial turn
- persisted history load fails:
  - show an error banner and fall back to empty in-memory state for that session
- replay audio missing for an existing history row:
  - show the row metadata but disable replay for that row

## Architecture

Use a thin mock with a production-shaped server.

### Client Responsibilities

- manage the tab UI
- use browser STT APIs
- start and stop listening
- collect the transcript
- upload replacement reference WAV files
- request a mock production turn from the local server
- render the newest turn and the persisted history list
- play returned reply audio

### Server Responsibilities

- store the remembered reference WAV
- own the built-in 100-reply pool used for random selection
- generate mocked reply audio
- measure reply generation time from mock start to mock completion
- persist production-turn metadata
- persist generated reply audio files
- prune history beyond 20 items
- delete generated audio for pruned turns
- return a normalized response shape that matches the future real production backend

This boundary keeps the eventual swap to real `MeloTTS` and `OpenVoice V2` local to the server-side production pipeline.

## Data Model

### Reference Voice Metadata

Store one current remembered reference voice for the tab.

Suggested fields:

- `id`
- `originalFileName`
- `storedFileName`
- `storedPath`
- `mimeType`
- `sizeBytes`
- `createdAt`
- `updatedAt`

### Production Turn Record

Each turn persists as metadata plus one generated reply audio file.

Suggested fields:

- `id`
- `createdAt`
- `referenceVoiceId`
- `userTranscript`
- `replyText`
- `generationTimeMs`
- `replyAudioPath`
- `replyAudioMimeType`
- `mockPipeline`
  - fixed string such as `browser-stt -> mock-melotts -> mock-openvoice-v2`

History persistence should be append-then-prune, never rewrite partial corrupted state in place without a complete replacement.

## Storage Layout

Under `output/voice-cast/`, add a dedicated production-test storage area.

Suggested layout:

- `output/voice-cast/production-test/reference/`
- `output/voice-cast/production-test/replies/`
- `output/voice-cast/production-test/history.json`
- `output/voice-cast/production-test/reference.json`

### Reference Storage

- store the currently selected WAV in `reference/`
- replace prior remembered reference on update
- overwrite metadata in `reference.json`

### Reply Audio Storage

- store one audio file per generated turn in `replies/`
- history metadata points to the stored file path
- when pruning removes a turn from history, delete its reply audio file immediately

## Built-in Reply Pool

The production test uses a fixed built-in array of 100 reply texts.

Requirements:

- replies should range from short one-line answers to three-sentence answers
- replies should be neutral and production-safe
- pool is code-defined, not user-editable in this phase
- random selection should be uniform enough for repeated testing

The reply pool is separate from the text-only casting sample pool even if some implementation helpers are shared.

## Mock Backend Behavior

The server should expose a new production-test mock endpoint rather than reusing the old CV3-specific contract unchanged.

### Input Shape

The request should contain at least:

- active reference voice identifier or stored reference file reference
- browser STT transcript
- optional client timing metadata if useful

The request should not require:

- CV3 mode selection
- prompt transcript entry
- instruct text entry
- manual production text entry

### Server Mock Processing

On each turn:

1. validate that a remembered reference WAV exists
2. choose one random reply from the 100 built-in replies
3. wait `100 ms`
4. generate mocked audio bytes for that reply
5. measure total generation time
6. persist the new turn
7. prune to 20 items if needed
8. return the newest turn plus current history

### Response Shape

Return:

- newest turn metadata
- newest turn audio payload or audio URL
- full current history list
- current remembered reference voice metadata

The response should already look like the shape a real production TTS pipeline would return, so the client does not need another redesign later.

## Audio Mocking Strategy

The server-side mocked reply audio only needs to be stable enough for replay and history testing.

Acceptable approaches:

- return a generated tone or placeholder WAV per reply
- derive deterministic mock audio from the reply text so repeated replies are replayable

The mock must produce real audio files because replay, persistence, and history pruning are part of the feature under test.

## Timing Definition

The displayed timing is:

- measured from the start of mock reply generation on the server
- through completion of mocked speech production
- excluding the user speaking duration
- excluding browser STT listening duration unless explicitly added as a second metric later

This keeps the timing focused on `reply production latency`, which matches the purpose of the tab.

UI label recommendation:

- `Speech generation time`

Store timing in milliseconds, render it in a human-friendly form such as `1.14s`.

## Browser STT

Use browser STT only for this tab.

Requirements:

- manual start via `Start Listening`
- automatic stop on silence
- transcript displayed in the latest-turn panel and in history
- graceful failure when the browser lacks support

The browser STT implementation should remain client-local and not be persisted as audio in this phase.

## API Changes

The current `/api/production/generate` path is CV3-specific. For this redesign, either:

- replace it with the new production-test mock contract, or
- add a new route such as `/api/production-test/turn` and repoint the tab to that route

Recommended:

- add a new production-test route

Reason:

- avoids mixing the old CV3 shape with the new interaction model
- keeps the spike disposable
- makes future replacement with a real `MeloTTS -> OpenVoice V2` pipeline cleaner

Also add routes for:

- saving/replacing the reference WAV
- loading persisted production-test state

## Testing

### Client Tests

- initial render with no remembered reference
- render with remembered reference loaded from server state
- start-listening flow state transitions
- transcript and reply rendering in latest-turn panel
- history rendering with replay controls
- disable or error states when STT unavailable

### Server Tests

- save reference WAV and reload remembered state
- create a mock turn from transcript
- random reply selection returns one of the 100 built-ins
- generation timing is returned and persisted
- history is capped at 20 items
- pruned history deletes old reply audio files
- persisted state reloads correctly after restart

### Integration Tests

- load page, upload reference, submit mocked transcript path, receive persisted turn
- replay buttons point to valid generated audio
- after >20 turns, oldest turn disappears and its file is removed

## Migration Notes

The existing `CV3 Production Test` UI, state, and server route are not the right abstraction for this feature. Implementation should prefer replacement over layering more conditionals onto the old tab.

Keep the text-only casting tab intact.

Replace in the second tab:

- labels
- client state
- event flow
- server endpoints used by that tab

Avoid preserving old CV3-only controls that no longer map to the chosen workflow.

## Recommendation

Implement the `Production Test` tab as a thin mock with a production-shaped server, persisted reference storage, persisted 20-turn history, replayable generated audio, and server-owned reply selection/timing. This gives the user a realistic rehearsal surface for the future `MeloTTS -> OpenVoice V2` chain without prematurely coupling the spike to the final TTS stack.
