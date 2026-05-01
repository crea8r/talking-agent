# talking-agent

Monorepo for small discovery apps that lead toward a live talking avatar agent.

The current integration spike is `apps/one-to-one-agent-room`, where:

- a human joins a LiveKit room in the browser
- spoken or typed turns are persisted into a reusable bridge store
- a Codex or OpenAI runtime connects through an MCP server
- the agent claims turns, submits replies, and drives avatar speech and gestures

The working plan for the repo lives in [docs/6-app-plan.md](docs/6-app-plan.md).
The first product draft for this repo lives in [docs/prd-local-call-command.md](docs/prd-local-call-command.md).

## Repo Layout

- `apps/`: runnable spikes and integration shells
- `packages/`: shared room, voice, avatar, and MCP bridge code
- `docs/`: durable product and architecture decisions

Current reusable packages are listed in [packages/README.md](packages/README.md).

## Current Apps

- `apps/meeting-link-probe`: prove local room transport
- `apps/voice-loop-lab`: prove browser voice turn-taking
- `apps/avatar-puppet-lab`: prove avatar rendering and playback
- `apps/one-to-one-agent-room`: integrate room + voice + avatar + MCP bridge

## Prerequisites

- Node `>=20`
- `npm install`
- a local LiveKit server reachable from the browser

The app defaults to:

- `LIVEKIT_URL=ws://127.0.0.1:7880`
- `LIVEKIT_API_KEY=devkey`
- `LIVEKIT_API_SECRET=secret`

If your local LiveKit server uses different values, export them before starting the app server.

## Run App 4

From the repo root:

```bash
npm install
LIVEKIT_URL=ws://127.0.0.1:7880 \
LIVEKIT_API_KEY=devkey \
LIVEKIT_API_SECRET=secret \
npm run start:one-to-one-agent-room
```

Open [http://127.0.0.1:4384](http://127.0.0.1:4384).

If `Create Call` fails immediately, the usual cause is that no LiveKit server is reachable at `LIVEKIT_URL`.

## Run The MCP Bridge Server

The browser app writes room state to a local JSON file. The agent runtime talks to that same state file through the stdio MCP server in `packages/agent-room-bridge`.

From the repo root:

```bash
AGENT_ROOM_BRIDGE_STATE_PATH="$PWD/output/one-to-one-agent-room-bridge.json" \
node "$PWD/packages/agent-room-bridge/mcp-server.mjs"
```

This MCP server exposes these tools:

- `bridge_status`
- `list_sessions`
- `get_session`
- `heartbeat_agent`
- `claim_next_turn`
- `submit_agent_reply`

Use that command in any MCP-capable runtime. In the app UI, the same bootstrap command is shown in `Codex MCP Bootstrap`, and `Copy MCP Command` copies it.

## Short Video Call Test

Use this flow when you want to verify the full human-to-agent loop quickly.

1. Start the app server.
2. Start the MCP bridge server.
3. Open [http://127.0.0.1:4384](http://127.0.0.1:4384).
4. Leave the default room values, or point the page at your local LiveKit server.
5. Click `Create Call`.
6. Allow browser mic and camera access if you want live media.
7. Click `Start Listening`.
8. Say a short sentence such as `hello can you hear me`.
9. Have your MCP agent claim the turn and submit a reply with `voiceMode: "speak"`.
10. The avatar should speak the reply and animate its mouth and gesture state.

Useful follow-up prompts for a short smoke test:

- `what day is today`
- `who are you`
- `tell me a joke`

If microphone capture is unavailable, use `Typed Fallback` and `Queue Typed Turn`.

## Recommended Dev Test Flow

There are two levels of testing.

### 1. Browser And Avatar Only

This isolates the front end from the external agent runtime.

1. Click `Create Call`.
2. Enter text in `Typed Fallback`.
3. Click `Queue Typed Turn`.
4. Click `Run Local Fallback Reply`.

That path uses the local fallback route in the app server instead of Codex. It proves:

- the room session is created
- the bridge can hold pending turns
- the browser can poll replies
- the avatar can speak and animate a response

### 2. Full MCP Agent Loop

This is the real integration path for app 4.

1. Start the MCP server with the command above.
2. Attach a Codex or OpenAI runtime to that MCP server.
3. Create a room session in the browser.
4. In the MCP runtime, call `list_sessions` to find the active session.
5. Call `heartbeat_agent` for that session.
6. Call `claim_next_turn` to take the next pending human turn.
7. Call `submit_agent_reply` with:

```json
{
  "sessionId": "<session-id>",
  "turnId": "<turn-id>",
  "agentId": "codex-openai",
  "agentLabel": "Codex OpenAI",
  "reply": "Hello. I can hear you clearly.",
  "emoteId": "warm",
  "gestureId": "explain",
  "voiceMode": "speak",
  "notes": "Manual smoke test"
}
```

The browser app will pick up the reply, animate the avatar, and speak it aloud.

## How To Test With Codex

Point Codex at the MCP command:

```bash
AGENT_ROOM_BRIDGE_STATE_PATH="$PWD/output/one-to-one-agent-room-bridge.json" \
node "$PWD/packages/agent-room-bridge/mcp-server.mjs"
```

Then give it a task like:

> Watch the newest one-to-one-agent-room session, claim pending turns, and answer them briefly with `voiceMode: "speak"`.

For a short call, keep the agent behavior tight:

- short replies
- one turn claimed at a time
- always send `voiceMode: "speak"`
- set simple direction such as `emoteId: "warm"` and `gestureId: "explain"`

## Troubleshooting

- `Create Call` appears to do nothing:
  The app could not reach your LiveKit server. Confirm something is listening on `LIVEKIT_URL`.
- The session exists but the agent never replies:
  Confirm the MCP server is running against the same `AGENT_ROOM_BRIDGE_STATE_PATH` the app uses.
- The MCP agent submits replies but the avatar stays silent:
  Confirm `voiceMode` is `speak`.
- The avatar still does not respond:
  Use `Run Local Fallback Reply` first. If that works, the failure is in the external MCP runtime loop, not the browser playback path.

## Notes

- This repo intentionally keeps spike apps small and disposable.
- Reusable logic should move into `packages/` once at least two apps need it.
- `apps/one-to-one-agent-room` is intentionally thin. The reusable pieces live in:
  - `packages/room-layer`
  - `packages/voice-layer-browser`
  - `packages/avatar-layer-browser`
  - `packages/avatar-speech-browser`
  - `packages/agent-room-bridge`
