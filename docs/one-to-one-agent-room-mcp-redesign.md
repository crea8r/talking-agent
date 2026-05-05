## One-to-One Agent Room MCP Redesign

Status: proposed

Date: 2026-05-01

## Summary

The current `one-to-one-agent-room` MCP bridge is snapshot-oriented. The agent polls session state, claims a turn, and submits a full reply. That works for a basic smoke test, but it is the wrong shape for a live talking agent because:

- the hot path resends more state than the agent needs
- partial speech is awkward to represent
- heartbeat and turn handling are separate concerns
- the app and MCP surface are coupled to a turn-worker model instead of a live participant model

This redesign changes the bridge to a hybrid live-participant protocol:

- the agent joins a call and stays attached
- the app sends compact incremental events, including partial transcript deltas
- the agent owns reply text and animation choice
- the app stays thin and executes agent-selected speech and animation actions
- repo and task context stay outside this MCP server

The target is lower token usage, better interruption handling, and a cleaner split between call/media infrastructure and agent reasoning.

## Scope

This document covers the MCP surface for `apps/one-to-one-agent-room` and `packages/agent-room-bridge`.

It does not cover:

- repo-aware task context
- external call-link generation
- group calls
- raw audio token streaming into the model
- custom non-MCP sidechannels

## Product Constraints

The redesign follows these decisions:

- interaction model: hybrid
- the agent stays attached to the call, but full reasoning should happen mainly on finalized user turns
- transcript delivery: partial plus final
- ownership of emotion and gesture: agent-owned
- scope of this MCP server: call/media bridge only
- app behavior: minimal logic; the app is primarily a tool executor for STT, TTS, avatar playback, and call lifecycle

## Problems With The Current Bridge

The current bridge exposes `bridge_status`, `list_sessions`, `get_session`, `heartbeat_agent`, `claim_next_turn`, and `submit_agent_reply`. That model has four problems for the long-lived call path:

1. It is snapshot-heavy. `get_session` and `list_sessions` return full session snapshots and turn history, which is wasteful once the agent is already attached.
2. It is turn-centric. `claim_next_turn` assumes a finalized pending turn queue instead of a live stream of speech events.
3. It splits liveness from work. `heartbeat_agent` is separate from the actual receive loop, which creates unnecessary protocol surface.
4. It models reply output too coarsely. `submit_agent_reply` sends one final text plus decoration fields, but does not generalize to richer action batches or interruption-aware output flow.

## Design Goals

- make the agent look like a live participant, not a poller
- minimize tokens on the hot path
- preserve MCP as the integration surface
- keep the browser app thin
- let the agent choose animation and gesture explicitly
- support partial transcripts, final transcripts, interruption, and hangup
- make recovery after agent restart straightforward

## Recommended Protocol Shape

The bridge should move from session snapshots to an append-only event log with cursors.

The core interaction becomes:

1. The agent joins the currently active call.
2. The agent receives a cursor plus static capability references.
3. The agent blocks on `wait_for_events`.
4. The app emits compact call and transcript events.
5. The agent responds with `publish_actions`, batching speech and animation together.
6. The agent leaves the call explicitly or the app ends the call on idle timeout, disconnect, or user hangup.

This replaces the claim/reply workflow with a long-lived receive loop.

## MCP Capabilities

The redesigned server should advertise:

- `tools`
- `resources`
- `prompts`

The resources and prompts should be static or slow-changing. The hot path should use tools only.

## Tools

### `join_call`

Purpose:
- attach an agent to the current active call and establish the event cursor

Input:
- `agentId`
- `agentLabel`
- optional `resumeFromCursor`

Output:
- `callId`
- `title`
- `state`
- `cursor`
- `leaseMs`
- `capabilitiesVersion`
- `activeModelId`
- `avatarCatalogUri`
- `avatarCatalogVersion`
- optional `recentFinalTurns[]` for restart recovery

Notes:
- this replaces the separate heartbeat bootstrap
- joining marks the agent as present in the call
- if no call is currently active, the tool should fail with a typed `no_active_call` error

### `wait_for_events`

Purpose:
- the hot-path receive primitive

Input:
- `callId`
- `cursor`
- `waitMs`
- `maxEvents`

Output:
- `callId`
- `nextCursor`
- `events[]`

Notes:
- this should block until at least one event exists or the timeout expires
- repeated calls act as the agent heartbeat
- no full session snapshot should be returned on the hot path

### `publish_actions`

Purpose:
- the hot-path output primitive

Input:
- `callId`
- `actions[]`
  - each action must include a client-supplied `actionId`
- optional `inReplyToEventId`

Output:
- `acceptedActionIds[]`
- `nextCursor`

Notes:
- multiple actions should be accepted in one call
- the app executes the actions but does not reinterpret their meaning
- stable `actionId` values make retries idempotent

### `leave_call`

Purpose:
- detach the agent from the call or request hangup

Input:
- `callId`
- `agentId`
- optional `reason`
- optional `endCall`

Output:
- `callId`
- `state`

Notes:
- used when the agent intentionally drops after the user stops, or when the host runtime is shutting down

### `get_recent_turns`

Purpose:
- recovery-only transcript fetch for agent restart or debugging

Input:
- `callId`
- optional `limit`

Output:
- `turns[]`

Notes:
- return finalized turns only
- not intended for the hot path

## Resources

Resources should exist for static capability discovery, not for live call traffic.

### `bridge://capabilities`

Contains:

- protocol version
- supported tool names
- event types
- action types
- max batch sizes
- wait timeout limits
- interruption semantics
- hangup semantics

Why:
- the agent can read this once per session or cache it across sessions

### `avatar://catalog`

Contains:

- supported `gestureId` values
- supported `emoteId` values
- short descriptions
- optional tags like `greeting`, `listening`, `explaining`, `thinking`, `celebrating`, `apology`
- the catalog `version`

Why:
- the agent owns animation choice, so it needs a static symbolic catalog
- this prevents large runtime prompts or repeated instructions

### `avatar://catalog/<modelId>`

Contains:

- model-specific overrides when some gestures or emotes are unavailable on a given model

Why:
- keeps the base catalog stable while allowing per-model compatibility

### Catalog Loading Rule

The app should not send the full animation catalog on every turn.

Instead:

- `join_call` returns `activeModelId`, `avatarCatalogUri`, and `avatarCatalogVersion`
- the agent reads that resource once after join if it does not already have that version cached
- on normal turn traffic, the app sends only compact events and the agent replies with symbolic ids such as `gestureId` and `emoteId`
- if the active avatar model or available animation set changes mid-call, the app emits `avatar.catalog.changed` with the new `activeModelId`, `avatarCatalogUri`, and `avatarCatalogVersion`
- the agent then re-reads the resource once and continues

This keeps the app thin while avoiding repeated token-heavy catalog transfer.

## Prompts

Prompts should be minimal. The MCP server is not responsible for repo or task context.

### `call_agent_bootstrap`

Purpose:
- give a host agent a short setup pattern for this MCP server

Contents:

- join the call with `join_call`
- use `wait_for_events` as the heartbeat and receive loop
- reply with `publish_actions`
- leave with `leave_call`
- choose gestures and emotes from `avatar://catalog`

Why:
- useful for hosts that benefit from a one-time operating instruction
- not used on the hot path

No other prompt surface is required for v1.

## Event Model

The event model should be append-only and cursor-based.

Each event should have:

- `id`
- `seq`
- `type`
- `ts`
- event-specific payload

The minimum event set for v1 is:

- `call.joined`
- `call.ready`
- `call.ending`
- `call.ended`
- `avatar.catalog.changed`
- `utt.start`
- `utt.partial`
- `utt.final`
- `utt.cancelled`
- `user.interrupted_agent`
- `agent.playback.started`
- `agent.playback.finished`
- `idle.timeout`
- `error`

### Partial Transcript Rules

To minimize token usage:

- `utt.partial` should carry append-style deltas, not the full transcript-so-far
- `utt.final` should carry the canonical finalized text once
- each utterance should use a stable `uttId`
- the agent should not need the app to resend prior partials after the final event arrives

Example:

```json
{
  "nextCursor": "184",
  "events": [
    { "id": "e81", "seq": 81, "type": "utt.start", "ts": "2026-05-01T10:00:00Z", "uttId": "u17" },
    { "id": "e82", "seq": 82, "type": "utt.partial", "ts": "2026-05-01T10:00:01Z", "uttId": "u17", "delta": "can you" },
    { "id": "e83", "seq": 83, "type": "utt.partial", "ts": "2026-05-01T10:00:01.4Z", "uttId": "u17", "delta": " hear me" },
    { "id": "e84", "seq": 84, "type": "utt.final", "ts": "2026-05-01T10:00:02Z", "uttId": "u17", "text": "can you hear me?" }
  ]
}
```

## Action Model

The agent should send explicit actions. The app executes them and reports playback-related events back into the event log.

The minimum action set for v1 is:

- `speech`
- `anim`
- `hangup`

Every action must include:

- `actionId`
- `type`

### `speech`

Fields:

- `text`
- optional `voice`
- optional `interruptPolicy`

Meaning:
- speak this text through the app TTS pipeline

### `anim`

Fields:

- `gestureId`
- optional `emoteId`
- optional `stageId`
- optional `durationMs`

Meaning:
- switch or play the requested expressive state

### `hangup`

Fields:

- optional `reason`

Meaning:
- end the call cleanly

Example:

```json
{
  "callId": "c1",
  "actions": [
    { "actionId": "a1", "type": "anim", "gestureId": "lean_in", "emoteId": "focused" },
    { "actionId": "a2", "type": "speech", "text": "Yes. I can hear you clearly." }
  ]
}
```

## Best App-To-Agent Communication For Low Token Usage

The best communication pattern for requirement `(3)` is:

- one long-lived attached agent per call
- one blocking receive tool, `wait_for_events`
- one batched output tool, `publish_actions`
- compact partial transcript deltas
- one final canonical transcript event
- static catalogs loaded through resources, not repeated in tool responses
- no full session snapshots on the hot path

This is better than repeated snapshot polling because:

1. The agent only receives new information.
2. Partial speech is incremental rather than repetitive.
3. The app never needs to resend full turn history after each event.
4. Gesture and emote choice use short symbolic ids.
5. Speech and animation can be batched in one output call.
6. The same receive loop also serves as the liveness signal.

## App Responsibilities

The app should remain thin and deterministic. Its responsibilities are:

- capture user speech
- produce partial and final transcript events
- run VAD and idle timeout
- render the 3D model
- execute TTS playback
- execute agent-selected gesture, emote, and stage changes
- emit playback and lifecycle events
- persist the event log and finalized turns for recovery

The app should not:

- choose gestures on behalf of the agent by default
- rewrite agent text
- infer emotional intent when the agent has already specified it
- own repo or task reasoning

## Migration From The Current Bridge

Replace:

- `heartbeat_agent` with `join_call` plus repeated `wait_for_events`
- `get_session` polling with `wait_for_events`
- `claim_next_turn` with append-only transcript events
- `submit_agent_reply` with `publish_actions`

Deprecate:

- `bridge_status`
- large session snapshots in the normal model loop

## Error Handling

The bridge should define explicit behavior for:

- stale cursor
- duplicate action publish
- publish after call end
- event backlog overflow
- app playback failure
- agent disconnect

Recommended rules:

- cursors are monotonically increasing and opaque to the agent
- `publish_actions` should be idempotent when a caller repeats an action batch with the same client action ids
- playback failures should surface as `error` events, not as silent drops
- if the call ends, `wait_for_events` should return a terminal `call.ended` event

## Testing

The redesign should be validated with:

- unit tests for event log append, cursor reads, and idempotent action publish
- browser integration tests for partial transcript emission and playback events
- smoke tests for agent join, partial transcript handling, final reply, interruption, and hangup
- restart recovery tests using `get_recent_turns`

## Recommended Implementation Order

1. Introduce the event log and cursor read path in `packages/agent-room-bridge`.
2. Add the new MCP tool surface in `packages/agent-room-bridge/mcp-server.mjs`.
3. Keep the old tools temporarily behind a compatibility layer while the app migrates.
4. Change the browser app to append transcript and playback events instead of relying on pending-turn snapshots.
5. Migrate the operator UX to the new call model.
6. Remove the old claim/reply protocol after the new loop is stable.

## Decision

For `one-to-one-agent-room`, the MCP bridge should be a call/media event bridge, not a repo-context bridge. The hot path should be:

- `join_call`
- `wait_for_events`
- `publish_actions`
- `leave_call`

Resources should expose static capability and avatar catalogs. Prompts should be minimal and optional. The agent should own reply text and animation selection, while the app remains a thin executor of media and avatar actions.
