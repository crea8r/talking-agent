# talking-agent

Monorepo for small discovery apps that lead toward a live talking avatar agent.

The current main spike is `apps/one-to-one-agent-room`. Its flow is now:

- the browser listens with Web Speech API
- final human text is sent to the app server
- the app server runs `codex exec` directly for that turn
- Codex returns structured reply text plus coarse animation beats
- the browser synthesizes the reply with `production-voice`, plays the avatar animation, and lip-syncs locally

There is no live MCP listener in this app anymore.

The working plan for the repo lives in [docs/6-app-plan.md](docs/6-app-plan.md).
The first product draft lives in [docs/prd-local-call-command.md](docs/prd-local-call-command.md).

## Repo Layout

- `apps/`: runnable spikes and integration shells
- `packages/`: shared voice, avatar, Codex exec, and support utilities
- `docs/`: durable product and architecture decisions

Current reusable packages are listed in [packages/README.md](packages/README.md).

## Current Apps

- `apps/meeting-link-probe`: prove local room transport
- `apps/voice-loop-lab`: prove browser voice turn-taking
- `apps/avatar-puppet-lab`: prove avatar rendering and playback
- `apps/one-to-one-agent-room`: direct browser voice + avatar + `codex exec`
- `apps/voice-cast`: production voice experiments with direct Codex replies
- `apps/pose-studio`: pose/gesture staging with direct Codex control
- `apps/agent-room-mcp-tester`: older MCP/bridge debugging spike

## Prerequisites

- Node `>=20`
- `npm install`
- a browser with Web Speech API support
- a working local Codex auth home at `~/.codex` or `CODEX_HOME`
- the local `production-voice` backend running

## Run App 4

From the repo root:

```bash
npm install
npm run start:one-to-one-agent-room
```

Open [http://127.0.0.1:4384](http://127.0.0.1:4384).

## Start The Voice Backend

`one-to-one-agent-room` expects `production-voice` at `http://127.0.0.1:50003` by default.

If you use a different URL, set:

```bash
ONE_TO_ONE_AGENT_ROOM_PRODUCTION_VOICE_BASE_URL=http://127.0.0.1:50003
```

before starting the app server.

## How `one-to-one-agent-room` Talks To Codex

The app does not wait on an external agent loop.

Instead:

1. the browser captures a final transcript
2. the browser `POST`s that transcript to `/api/call/sessions/:id/turns`
3. the app server runs local `codex exec`
4. Codex returns JSON with:
   - `spokenText`
   - `subtitle`
   - `mood`
   - `animationSequence`
5. the browser speaks and animates the reply immediately

The reusable subprocess helper for this lives in `packages/codex-exec`.

## Short Voice Call Test

Use this flow for a quick end-to-end check:

1. Start the `production-voice` backend.
2. Start `one-to-one-agent-room`.
3. Open [http://127.0.0.1:4384](http://127.0.0.1:4384).
4. In `Setup`, choose a character model.
5. Upload a WAV voice sample.
6. Wait for both `Voice` and `Codex` to show ready states.
7. Click `Start Call`.
8. Allow microphone access.
9. Say `hello can you hear me`.
10. The app server should call Codex directly and the avatar should answer.

If microphone capture is unavailable, use `Typed Turn` in `Diagnostics`.

## Recommended Dev Test Flow

### 1. HTTP Smoke Test

These routes should all work locally:

- `GET /healthz`
- `GET /api/runtime-config`
- `GET /api/codex/state`
- `GET /api/production-voice/state`
- `POST /api/call/sessions`
- `POST /api/call/sessions/:id/state`
- `POST /api/call/sessions/:id/turns`
- `POST /api/call/sessions/:id/turns/:turnId/played`

### 2. Browser Session Test

1. Hard refresh the page.
2. Confirm the `Character Model` dropdown populates.
3. Confirm the live preview updates when the model changes.
4. Confirm the saved WAV sample persists across reload.
5. Start a call.
6. Speak one short sentence.
7. Confirm:
   - human subtitle updates live
   - agent subtitle shows `Thinking…`
   - the reply speaks with `production-voice`
   - the avatar mouth and gestures animate
8. Interrupt the agent while it is speaking and confirm playback stops immediately.

## Runtime Notes

- `one-to-one-agent-room` no longer depends on a visible LiveKit room flow.
- the browser still handles:
  - speech recognition
  - subtitles
  - interruption
  - lip sync
  - ambient idle/thinking animation
- the app server handles:
  - session state
  - direct `codex exec`
  - reply shaping
  - production voice profile persistence

## Legacy MCP Spikes

These still exist in the repo, but they are not part of the current `one-to-one-agent-room` path:

- `packages/agent-room-bridge`
- `apps/agent-room-mcp-tester`

They are useful only if you want to revisit the earlier MCP-mediated architecture.

## Troubleshooting

- `Start Call` stays disabled:
  Confirm all three prerequisites are ready:
  - browser speech recognition
  - a saved WAV sample
  - `GET /api/codex/state` shows `running: true`
- Codex is ready but replies fail:
  Check the `Diagnostics` panel for the active request and the server event log.
- The avatar does not speak:
  Confirm `GET /api/production-voice/state` reports `running: true` and a saved profile exists.
- The reply text appears but playback stops:
  That usually means the turn was interrupted by new human speech, which is expected behavior.

## Notes

- This repo intentionally keeps spike apps small and disposable.
- Reusable logic should move into `packages/` once at least two apps need it.
- `apps/one-to-one-agent-room` is intentionally thin. Its main reusable pieces are:
  - `packages/voice-layer-browser`
  - `packages/avatar-layer-browser`
  - `packages/avatar-speech-browser`
  - `packages/production-voice`
  - `packages/codex-exec`
