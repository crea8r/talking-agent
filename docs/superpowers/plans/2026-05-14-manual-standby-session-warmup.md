# Manual Standby Session Warmup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide the first manual-mode Codex `initial` turn by prewarming a standby session before the user presses `Start Call`.

**Architecture:** Manual mode will create a direct call session in the lobby, sync the current setup onto it, start a hidden Codex warmup, and wait until that warmup reports ready before enabling `Start Call`. Setup and capability changes will discard the unused standby session and build a new one. Linked-call flow remains unchanged.

**Tech Stack:** Node.js, browser fetch/session controller, direct session runtime, native `node:test`

---

### Task 1: Add runtime support for standby warmup lifecycle

**Files:**
- Modify: `apps/one-to-one-agent-room/lib/server/direct-session-runtime.mjs`
- Test: `apps/one-to-one-agent-room/lib/server/direct-session-runtime.test.mjs`

- [ ] Add failing runtime tests for standby warmup start, completion state, and discard cleanup.
- [ ] Implement runtime standby state tracking on the session payload and expose a manual standby warmup method.
- [ ] Implement runtime discard cleanup for unused manual standby sessions.
- [ ] Run targeted runtime tests until green.

### Task 2: Expose standby/discard routes from the app server

**Files:**
- Modify: `apps/one-to-one-agent-room/server.mjs`

- [ ] Add the HTTP route for starting standby warmup on a session.
- [ ] Add the HTTP route for discarding an unused standby session.
- [ ] Keep linked-call behavior unchanged.

### Task 3: Rework manual-mode lobby preparation on the client

**Files:**
- Modify: `apps/one-to-one-agent-room/src/lib/app/session-controller.js`
- Modify: `apps/one-to-one-agent-room/src/app.js`
- Test: `apps/one-to-one-agent-room/src/lib/app/session-controller.test.mjs`

- [ ] Add failing client tests for standby preparation, setup-change rebuilds, and start-call reuse of the warmed session.
- [ ] Change lobby preparation to create, setup, warm, and wait for standby readiness before clearing `sessionPreparing`.
- [ ] Change manual `Start Call` to reuse the prepared session instead of forcing a fresh one.
- [ ] Trigger standby rebuilds on manual-mode setup mutations and after a manual call ends.
- [ ] Run targeted client tests until green.

### Task 4: Verify end-to-end behavior with focused tests

**Files:**
- Test: `apps/one-to-one-agent-room/lib/server/direct-session-runtime.test.mjs`
- Test: `apps/one-to-one-agent-room/src/lib/app/session-controller.test.mjs`
- Test: `apps/one-to-one-agent-room/src/lib/app/session-controller.hello.test.mjs`

- [ ] Run the targeted standby and startup greeting test set.
- [ ] Fix any regressions without broadening scope into linked-call mode.
- [ ] Summarize the user-visible behavior change and any known follow-up work.
