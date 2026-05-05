# Agent Room MCP Tester Design

Date: 2026-05-02
Status: Proposed

## Summary

Build a separate lightweight app, `apps/agent-room-mcp-tester`, for testing the redesigned one-to-one call MCP without LiveKit room rendering, 3D avatar rendering, text-to-speech playback, or speech synthesis dependencies in the hot path.

The tester app will do two jobs:

1. Simulate the human side of the call through microphone speech recognition and typed text.
2. Exercise the real MCP server through a local JSON-RPC harness so the operator can see exactly what the app sends to the agent and what the agent sends back.

The tester app will use its own bridge state file and must not share state with `apps/one-to-one-agent-room`.

## Goals

- Provide a deterministic debug UI for the event-driven call bridge.
- Let an operator create a call, speak or type user input, and inspect the resulting bridge events.
- Let an operator call MCP methods directly from the browser through a server-side MCP harness.
- Show exact JSON payloads for human input, MCP requests, MCP responses, events, and published actions.
- Support both automatic action acknowledgements and manual lifecycle stepping for timing/debugging work.

## Non-Goals

- No 3D avatar rendering.
- No voice playback or TTS output.
- No LiveKit room connection flow.
- No attempt to replace the full one-to-one room app.
- No bypass of the MCP server for agent-side testing; the tester must use the real stdio MCP server for console-driven agent actions.

## Recommended Approach

Create a new standalone app in `apps/agent-room-mcp-tester` with:

- a small Node server
- a dedicated bridge state file
- a browser UI with three panes:
  - Human Simulator
  - MCP Console
  - Bridge Inspector

The app server will reuse `createAgentRoomBridgeStore()` for bridge/session state and add a small MCP harness that spawns `packages/agent-room-bridge/mcp-server.mjs`, sends framed JSON-RPC requests, and records raw transcript entries for display in the UI.

## Why A Separate App

This work should not be added as a mode inside `apps/one-to-one-agent-room`.

Reasons:

- The room app is optimized for full call simulation and visual presentation.
- The tester app needs a very different workflow: low overhead, raw payload visibility, and manual control.
- Keeping the tester separate avoids coupling its debugger state to LiveKit, avatar, and voice concerns.
- A separate bridge state file prevents collisions with the room app and makes reproduction easier.

## High-Level Architecture

### 1. App Server

Add `apps/agent-room-mcp-tester/server.mjs`.

Responsibilities:

- serve the tester UI
- expose runtime config for the app
- own the tester bridge state file
- expose human-side bridge endpoints
- expose action lifecycle endpoints
- host a local MCP harness API for browser-triggered MCP calls

State file:

- `output/agent-room-mcp-tester-bridge.json`

### 2. Bridge Store

Reuse `packages/agent-room-bridge/index.mjs`.

The tester app should use the same event model and action model as the room app:

- `utt.start`
- `utt.partial`
- `utt.final`
- `call.ready`
- `call.ending`
- `call.ended`
- `agent.playback.started`
- `agent.playback.finished`

This keeps the test UI aligned with the real protocol and avoids a second implementation of call state.

### 3. MCP Harness

Add a small Node-side harness module, ideally in `packages/agent-room-bridge/mcp-harness.mjs`.

Responsibilities:

- spawn the real MCP server process
- send JSON-RPC frames over stdio
- wait for responses by request id
- record every request/response frame with timestamps
- allow reset/reconnect from the tester UI

The harness is intentionally local-only and debug-focused. It is not a production transport.

### 4. Browser UI

Add a small browser app under `apps/agent-room-mcp-tester/src`.

The UI should have three main panes:

- Human Simulator
- MCP Console
- Bridge Inspector

This app should not import:

- `three`
- `@pixiv/three-vrm`
- avatar rendering modules
- avatar speech modules
- LiveKit client modules

## UI Design

### Human Simulator Pane

Purpose: create a call and inject human utterances.

Controls:

- Call title
- Human identity
- Human display name
- `Create Call`
- `Mark Live`
- `End Call`
- microphone start/stop
- typed input textarea
- `Send Final Turn`
- `Clear`

Display:

- active `callId`
- current session state
- active utterance id
- interim transcript
- finalized transcript history
- last HTTP payloads sent to the bridge

Speech behavior:

- use browser speech recognition when available
- interim transcripts should call:
  - `utterances/start` once per utterance
  - `utterances/partial` with append-style deltas
- final transcripts should call:
  - `utterances/final`

Typed behavior:

- typed input bypasses partial speech
- submitting typed text should create a final utterance directly
- an optional button can simulate a partial-first flow later, but that is not required in the first version

### MCP Console Pane

Purpose: act as a built-in MCP client/debugger.

Controls:

- `Connect MCP`
- `Reset MCP`
- `Initialize`
- `List Tools`
- `List Resources`
- `List Prompts`
- tool forms for:
  - `join_call`
  - `wait_for_events`
  - `publish_actions`
  - `leave_call`
  - `get_recent_turns`
- resource form for `resources/read`
- prompt form for `prompts/get`

Display:

- raw JSON-RPC request transcript
- raw JSON-RPC response transcript
- last structured result
- request latency
- MCP connection state

The console should make it easy to copy/paste or tweak JSON arguments, not hide them behind too much UI abstraction.

### Bridge Inspector Pane

Purpose: inspect bridge state independent of the MCP transcript.

Display:

- current call summary
- cursor
- recent events
- pending actions
- recent turns
- recent action lifecycle changes

Controls:

- `Refresh`
- `Auto Ack` toggle, default on
- per-action buttons when auto-ack is off:
  - `Start`
  - `Finish`
  - `Complete`

Behavior:

- `speech` actions use `started` then `finished`
- `anim` actions use `completed`

## Data Flow

### Human Input Flow

1. Operator creates a call.
2. App server creates a bridge session using the tester bridge state file.
3. Operator speaks or types.
4. Browser posts utterance events to the tester server.
5. Tester server mutates the bridge store.
6. Bridge inspector refreshes and shows exact event payloads.
7. MCP console can call `wait_for_events` to inspect the same data as the agent.

### MCP Response Flow

1. Operator connects the MCP console.
2. Server-side harness spawns the real MCP server.
3. Operator calls `join_call`.
4. Operator calls `wait_for_events`.
5. Operator calls `publish_actions`.
6. Bridge store records actions.
7. Browser shows the pending actions and recent turns.
8. If auto-ack is enabled, the UI immediately sends lifecycle acknowledgements.
9. If auto-ack is disabled, the operator steps each lifecycle state manually.

## Server API

The tester app should expose a minimal HTTP API.

### Runtime

- `GET /api/runtime-config`

Returns:

- app name
- bridge state path
- MCP server path/command
- supported tool list
- speech recognition capability hints

### Human Simulator

- `POST /api/bridge/sessions`
- `GET /api/bridge/sessions/:id`
- `POST /api/bridge/sessions/:id/state`
- `POST /api/bridge/sessions/:id/utterances/start`
- `POST /api/bridge/sessions/:id/utterances/partial`
- `POST /api/bridge/sessions/:id/utterances/final`
- `POST /api/bridge/sessions/:id/actions/:actionId/started`
- `POST /api/bridge/sessions/:id/actions/:actionId/finished`
- `POST /api/bridge/sessions/:id/actions/:actionId/completed`

### MCP Harness

- `POST /api/mcp/connect`
- `POST /api/mcp/reset`
- `GET /api/mcp/state`
- `GET /api/mcp/transcript`
- `POST /api/mcp/request`

`/api/mcp/request` accepts a raw MCP request payload and returns the matching response payload.

This keeps the browser client simple and makes the harness reusable for future debug surfaces.

## Error Handling

### Human Side

- If microphone APIs are unavailable, disable mic controls and keep typed input enabled.
- If the user speaks before a call exists, surface a clear inline error.
- If an utterance partial arrives without an active call, reject with a typed error.

### MCP Side

- If the MCP process is not connected, all MCP request controls except `Connect MCP` should be disabled.
- If the MCP server exits unexpectedly, surface that in the transcript and connection badge.
- JSON-RPC errors should be shown both as raw frames and as a compact UI summary.

### Bridge State

- If there is no active call, `join_call` should visibly surface the `no_active_call` bridge error.
- If an action lifecycle request references an unknown action, show the HTTP error body inline.

## Testing

### Unit Tests

- MCP harness framing and response correlation
- bridge session helper functions for the tester app
- auto-ack/manual-ack state transitions

### Server Tests

- create call
- append partial/final utterances
- manual action acknowledgement routes
- MCP harness connect/request/reset behavior

### Browser Tests

- typed turn flow
- mic-disabled fallback behavior
- raw transcript rendering
- auto-ack toggle behavior

### Smoke Test

1. Start the tester app.
2. Create a call.
3. Type or speak a turn.
4. Connect MCP.
5. Call `join_call`.
6. Call `wait_for_events`.
7. Call `publish_actions`.
8. Verify actions appear in the inspector.
9. Verify auto-ack and manual-ack behavior both work.

## Incremental Delivery Plan

Implement in this order:

1. scaffold the new app server and static UI
2. add bridge session endpoints and human simulator flow
3. add the Node MCP harness and raw transcript API
4. add MCP console actions for the new tool set
5. add bridge inspector and action lifecycle controls
6. add tests and smoke verification

## Open Constraints

- The tester can show exact JSON-RPC frames only for MCP traffic that passes through its harness.
- If an external agent attaches directly to the MCP server outside the tester app, the bridge inspector will still show resulting events and actions, but the tester will not see that external client’s raw request/response transcript.

## Recommendation

Proceed with the standalone tester app and the server-side MCP harness. This gives the cleanest debugging surface, keeps the protocol honest, and avoids contaminating the existing room app with debug-only behavior.
