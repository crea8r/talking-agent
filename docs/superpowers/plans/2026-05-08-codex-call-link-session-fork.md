# Codex Call Link Session-Fork Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user type `call me` in Codex, receive a call link, open `apps/one-to-one-agent-room`, and talk to a call-specific Codex runtime identified by a new `call_session_id` forked from the source `original_session_id`. Every call turn should resume `call_session_id` in the same project folder. When the call ends, the app should generate a summary from `call_session_id`, store that summary locally, write a short human-readable note back into `original_session_id`, and only then destroy the temporary call session state.

**Architecture:** Do not attach the live call to the original Codex thread. At link creation time, fork `original_session_id` into a new `call_session_id`. If the Codex CLI fork flow is available, use it; otherwise fall back to session-store copying only if needed. Each call runs on its own durable local call record and its own call-specific Codex home. Every live turn uses `codex exec resume <call_session_id>` with the same project root and approval policy `never`. The browser app remains a local voice/avatar shell and continues to use direct server-side Codex execution rather than MCP room bridging.

**Tech Stack:** Node HTTP server, Codex CLI `fork` plus `exec resume`, local JSON-backed call record store under `output/`, workspace-scoped setup store under `output/`, `apps/one-to-one-agent-room`, `packages/codex-exec`, `packages/production-voice`

**Accepted Constraints:**
- The call runtime is a forked snapshot, not a live shared thread with the original text chat.
- New text-chat turns created after the call link is minted are not automatically visible inside the active call.
- The original text session only receives a post-call record via a final `exec resume` note.
- Ended call links stay viewable indefinitely and should show the stored summary.
- If summary generation or write-back fails, the ended call remains in retry state and the `call_session_id` is preserved until retry succeeds.

---

### Task 1: Record the forked-call contract and launch payload

**Files:**
- Create: `docs/superpowers/plans/2026-05-08-codex-call-link-session-fork.md`
- Modify: `docs/prd-local-call-command.md`
- Modify: `README.md`

- [ ] Record the Codex-specific two-session model in docs:
  - `original_session_id` is the source text session
  - `call_session_id` is the forked call session
  - linked calls always speak to `call_session_id`
  - the original session only receives a final short note
- [ ] Define the launch payload contract for linked calls:
  - `launchId`
  - `originalSessionId`
  - `callSessionId`
  - `sourceCodexHome`
  - `callCodexHome`
  - `workspaceRoot`
  - `displayTitle`
  - `createdAt`
  - `status`
  - `endedAt`
  - `summary`
  - `retryState`
  - optional setup scope key
- [ ] Document the accepted limitation that the call session is a fork, not a live mirror, and that ended links open to a summary view instead of reactivating the call.

### Task 2: Add a call record store, setup store, and launch resolution path

**Files:**
- Create: `packages/call-record-store/index.mjs`
- Create: `packages/call-record-store/index.test.mjs`
- Create: `packages/workspace-setup-store/index.mjs`
- Create: `packages/workspace-setup-store/index.test.mjs`
- Modify: `apps/one-to-one-agent-room/server.mjs`
- Modify: `apps/one-to-one-agent-room/src/lib/app/launch-context.js`
- Modify: `apps/one-to-one-agent-room/src/lib/app/store.js`

- [ ] Create a local JSON-backed call record store under `output/one-to-one-agent-room-calls/`.
- [ ] Create a small server-side workspace-scoped setup store under `output/one-to-one-agent-room-setup/`.
- [ ] Persist the selected character model in the setup store keyed by workspace scope so linked-call creation can read it before the browser opens.
- [ ] Keep browser `localStorage` only as a local UX cache; the server-side setup store is the source of truth for linked-call bootstrap metadata.
- [ ] Store call records keyed by launch token or launch id rather than exposing raw workspace paths directly in the shared URL.
- [ ] Persist enough state to support both live-call resolution and ended-call summary viewing:
  - `originalSessionId`
  - `callSessionId`
  - `workspaceRoot`
  - `displayTitle`
  - `status: ready | active | ending | ended | retry-needed`
  - `summary`
  - `failureReason`
  - `createdAt`, `endedAt`
- [ ] Add server endpoints to resolve a launch token into either:
  - live linked-call session metadata, or
  - ended-call summary metadata
- [ ] Add server endpoints for reading and updating workspace-scoped setup metadata, at minimum the selected character model.
- [ ] Update browser launch-context parsing so linked calls load from a launch token and hydrate:
  - workspace root
  - workspace key
  - display title
  - original session id
  - call session id
  - launch status
- [ ] Keep manual mode working without a launch token.

### Task 3: Build a Codex-facing `create_call_link` tool

**Files:**
- Create: `apps/codex-call-link-tool/server.mjs`
- Create: `apps/codex-call-link-tool/README.md`
- Create: `apps/codex-call-link-tool/server.test.mjs`
- Modify: `README.md`

- [ ] Create a small local Codex tool server that exposes `create_call_link`.
- [ ] Validate what host metadata is available to the tool at runtime and capture the minimum required source context:
  - source Codex session id
  - source `CODEX_HOME`
  - source workspace root / `cwd`
- [ ] Return a structured failure if the tool cannot determine the source session id or project root.
- [ ] Add readiness checks so the tool only returns an “agent ready” link when these are available:
  - `one-to-one-agent-room` app server
  - production-voice backend
  - workspace-scoped voice sample profile
- [ ] Read the selected character model from the server-side workspace setup store at link-creation time.
- [ ] At link creation time, fork `original_session_id` into a new `call_session_id`.
- [ ] Use a short bootstrap prompt during fork so the call agent knows:
  - it is the voice-call version of the coding agent
  - the selected character identity from the workspace setup store
  - the expected behavior for concise spoken conversation
  - that it should keep using the correct tools for the same project
- [ ] Create a call record only after the fork succeeds, then return a localhost link that opens `one-to-one-agent-room` in `linked-call` mode with everything ready.

### Task 4: Replace the isolated executor with a fork-aware executor

**Files:**
- Modify: `packages/codex-exec/index.mjs`
- Modify: `packages/codex-exec/index.test.mjs`
- Create if needed: `packages/codex-exec/forked-call.test.mjs`

- [ ] Split the current isolated executor behavior from the new forked-session behavior so manual fallback and linked-call mode can be handled explicitly.
- [ ] Add a helper to create `call_session_id` from `original_session_id` using `codex fork` when available.
- [ ] If `codex fork` does not return the new id directly, detect the created `call_session_id` from the local session index delta.
- [ ] Create a call-specific `CODEX_HOME` under `output/` that can persist the call session state independently of the original text session.
- [ ] Run live voice turns with:
  - `CODEX_HOME=<call-codex-home>`
  - `codex exec resume <call_session_id>`
  - `-C <workspace-root>`
  - `-a never`
- [ ] Remove the current call-path restrictions that disable tools or force read-only behavior in linked-call mode.
- [ ] Preserve the original config/tool surface in the call runtime, only changing approval behavior to `never`.
- [ ] Add a helper to run `codex exec resume <call_session_id> "<summary prompt>"` and capture the returned summary text.
- [ ] Add a helper to run `codex exec resume <original_session_id> "<short assistant note>"` against the original `CODEX_HOME`.
- [ ] Add helpers to mark the call record as retry-needed and retain `call_session_id` when either summary generation or original-session write-back fails.
- [ ] Add a helper to destroy the call-specific Codex home only after the entire finalize flow succeeds.

### Task 5: Rewire the room server and direct-call runtime around `call_session_id`

**Files:**
- Modify: `apps/one-to-one-agent-room/server.mjs`
- Modify: `apps/one-to-one-agent-room/lib/server/direct-codex-agent.mjs`
- Modify: `apps/one-to-one-agent-room/lib/server/direct-session-runtime.mjs`
- Modify: `apps/one-to-one-agent-room/lib/server/direct-codex-agent.test.mjs`
- Modify: `apps/one-to-one-agent-room/lib/server/direct-session-runtime.test.mjs`

- [ ] Replace `createIsolatedCodexExecutor` in the linked-call path with the new fork-aware executor.
- [ ] Store the linked launch metadata inside each runtime session so every voice turn knows:
  - original session id
  - call session id
  - original Codex home
  - call Codex home
  - workspace root
- [ ] Keep all call turns inside the same `call_session_id` so the voice conversation accumulates state across the call.
- [ ] Reject a second open while the call is still active.
- [ ] On hang-up or page-close teardown:
  - finalize the transcript
  - run a summary prompt against `call_session_id`
  - store the summary in the call record store
  - run the short assistant note against `original_session_id`
  - mark the call record `ended`
  - delete the call Codex home
- [ ] Keep manual mode functional, either by retaining the isolated executor as fallback or by explicitly rejecting linked-only capabilities when source-session metadata is absent.
- [ ] If finalize fails at either summary or original-session write-back, keep the call record in `retry-needed` state and keep `call_session_id` available for retry.

### Task 6: Tighten browser linked-call behavior around launch tokens, active locks, and ended-call summaries

**Files:**
- Modify: `apps/one-to-one-agent-room/src/app.js`
- Modify: `apps/one-to-one-agent-room/src/lib/app/call-session.js`
- Modify: `apps/one-to-one-agent-room/src/lib/app/session-controller.js`
- Modify: `apps/one-to-one-agent-room/src/lib/app/events.js`
- Modify: `apps/one-to-one-agent-room/src/lib/app/presenter.js`

- [ ] Make linked-call startup depend on successful launch-token resolution instead of raw query-string workspace data.
- [ ] Keep linked-call mode call-first and auto-starting once launch metadata and setup prerequisites are ready.
- [ ] Whenever the user changes the selected character in `Setup`, sync that choice to the server-side workspace setup store immediately.
- [ ] If the resolved call is already active in another tab, show a rejected second-open state instead of joining.
- [ ] If the resolved call is ended, show `call ended` plus the stored summary instead of trying to reconnect.
- [ ] Preserve the existing interruption behavior for speech, playback, and subtitles.
- [ ] On browser close, send a best-effort call-stop request so the server can summarize and tear down the copied call home.
- [ ] Tighten visible call-state messaging so linked calls clearly distinguish:
  - preparing
  - listening
  - thinking
  - speaking
  - ending
  - ended
  - retry needed

### Task 7: Verify the end-to-end fork lifecycle

**Files:**
- Modify if needed after verification: `README.md`

- [ ] Run targeted tests for call-record storage, workspace setup storage, fork creation, explicit `call_session_id` resume, summary write-back, second-open rejection, ended-link rendering, and teardown cleanup.
- [ ] Run `node --check` on all changed server, executor, and browser modules.
- [ ] Verify a linked-call happy path manually:
  - create call link
  - confirm a new `call_session_id` is created at link time
  - open linked call
  - confirm turns use `call_session_id`
  - confirm tool-enabled Codex replies still work
  - end call
  - confirm a summary is stored locally
  - confirm the original text session receives the short note
  - confirm reopening the link shows the ended summary
  - confirm the call Codex home is deleted
- [ ] Verify the failure path:
  - force summary or write-back failure
  - confirm the call record enters `retry-needed`
  - confirm `call_session_id` is preserved for retry
- [ ] Document any host integration gap discovered while extracting the current source session id for `create_call_link`.
