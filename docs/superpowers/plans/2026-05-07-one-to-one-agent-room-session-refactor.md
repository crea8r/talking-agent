# One-To-One Agent Room Session Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `apps/one-to-one-agent-room` into a session-first voice call UI with agent setup, a single call control, dual subtitles, interruption handling, and a structured Codex reply contract.

**Architecture:** Keep the existing MCP bridge and browser avatar stack, but remove visible room setup from the user flow. The browser will own listening, subtitles, playback timing, idle/thinking motion, and interruption, while Codex returns structured speech actions with optional subtitle and coarse animation beats. The app stays thin by reusing the existing workspace packages and extending the bridge schema instead of introducing a new backend.

**Tech Stack:** Vanilla browser app, Node HTTP server, Web Speech API, browser speech synthesis, `@talking-agent/avatar-layer-browser`, `@talking-agent/avatar-speech-browser`, `@talking-agent/voice-layer-browser`, `@talking-agent/agent-room-bridge`

---

### Task 1: Save the new product contract in docs and bridge metadata

**Files:**
- Create: `docs/superpowers/plans/2026-05-07-one-to-one-agent-room-session-refactor.md`
- Modify: `docs/6-app-plan.md`
- Modify: `apps/one-to-one-agent-room/src/lib/app/call-session.js`

- [ ] Record the session-first app goal, setup surface, subtitle behavior, and Codex contract in docs.
- [ ] Update the app prompt builder so Codex is instructed to return `spokenText` plus coarse animation intent through `publish_actions`.
- [ ] Keep the bridge metadata aligned with the repo’s reusable package strategy.

### Task 2: Extend the bridge contract for setup metadata, subtitles, and interruptions

**Files:**
- Modify: `packages/agent-room-bridge/index.mjs`
- Modify: `packages/agent-room-bridge/mcp-server.mjs`
- Modify: `packages/agent-room-bridge/resources.mjs`
- Modify: `apps/one-to-one-agent-room/server.mjs`

- [ ] Extend session creation and join payloads to carry agent setup metadata needed by Codex.
- [ ] Extend speech actions to accept subtitle text and a coarse animation sequence.
- [ ] Add a mutation path for `user.interrupted_agent` and expose it through the app server.
- [ ] Update bridge capabilities and MCP tool descriptions so the contract matches the new browser behavior.

### Task 3: Refactor app state and controller around a local call session

**Files:**
- Modify: `apps/one-to-one-agent-room/src/lib/app/store.js`
- Modify: `apps/one-to-one-agent-room/src/lib/app/call-session.js`
- Modify: `apps/one-to-one-agent-room/src/lib/app/session-controller.js`
- Modify: `apps/one-to-one-agent-room/src/lib/app/events.js`
- Modify: `apps/one-to-one-agent-room/src/lib/app/presenter.js`

- [ ] Remove room-first assumptions from the primary call path.
- [ ] Make `Start Call` create or refresh a bridge session, mark it live, and start speech recognition immediately.
- [ ] Add interruption handling so new human speech cancels active agent playback and records the interruption in bridge events.
- [ ] Add local idle, listening, thinking, and speaking animation orchestration on top of the existing avatar package.

### Task 4: Redesign the UI into setup + call with subtitles

**Files:**
- Modify: `apps/one-to-one-agent-room/src/index.html`
- Modify: `apps/one-to-one-agent-room/src/styles.css`
- Modify: `apps/one-to-one-agent-room/src/ui/dom.js`
- Modify: `apps/one-to-one-agent-room/src/ui/render.js`
- Modify: `apps/one-to-one-agent-room/src/app.js`

- [ ] Collapse the UX into an `Agent Setup` surface and a simple `Call` surface.
- [ ] Add agent setup inputs for model, browser voice configuration, and voice sample metadata capture.
- [ ] Add dual subtitle lanes for human and agent, including a thinking subtitle.
- [ ] Preserve diagnostics as a secondary/debug surface instead of removing observability entirely.

### Task 5: Verify the refactor end to end

**Files:**
- Modify if needed after verification: `README.md`

- [ ] Run targeted static verification on the changed JS modules with `node --check`.
- [ ] Run a lightweight session-flow verification against the bridge endpoints.
- [ ] Confirm the app server still boots and returns healthy runtime config for the new flow.
- [ ] Document any remaining external dependency gap, especially real voice cloning and full browser E2E transport.
