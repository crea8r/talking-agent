# PRD - Cross-Host "Call Me" Agent Trigger

Status: draft

Date: 2026-04-29

## Summary

The first product that should come out of this repo is a local-first voice and video call experience for coding agents that works across Codex, Claude Code, and ChatGPT.

The key trigger should not be a host-specific slash command. The user should be able to type a natural phrase such as `call me`, `let's talk`, or `start a call`. The agent then creates and sends back a call link. When the user opens that link, the local call experience launches on the user's machine and the user can immediately talk to the agent.

This is a better product shape than `/call` because it is portable across hosts. The host only needs two things:

- a way for the agent to create a call link
- a way for the user to open a clickable link

The room transport, media handling, orchestration, bridge state, and call UI still run locally on the user's machine. The link is a launch and handoff mechanism, not a hosted call surface.

## Why This Direction Is Better

Slash commands are host-specific UX. Natural language plus a call link is host-agnostic UX.

Benefits:

- works across Codex, Claude Code, and ChatGPT with the same user behavior
- removes the need to teach users a custom command syntax
- fits existing chat behavior better than product-specific command affordances
- gives the agent a chance to confirm intent and return the right link for the current task
- lets the website and local companion own launch and troubleshooting instead of each host owning custom command semantics

## Draft Assumptions

- "Everything runs local" means the call UI, room transport, media routing, state, and orchestration run on the user's machine. This draft does not yet assume the underlying model inference is fully local.
- The first release is one human and one agent only.
- The first release uses a local companion plus a host-facing tool that creates call links.
- The returned call link is a launch artifact, not a cloud-hosted meeting room.
- `call.knotwork.com` is the public discovery, install, and link handoff surface.
- The local companion may register a custom protocol such as `knotwork://` and may also expose a localhost launcher endpoint as fallback.
- ChatGPT is a supported host for link generation, but not assumed to be the primary in-app call runtime.

## Problem

Today the repo can demonstrate a live human-to-agent call, but the experience is still developer-oriented:

- the user starts the app server manually
- the user starts the MCP bridge manually
- the user opens the browser manually
- the user creates the call manually
- the user connects the external agent manually

That is a good spike and a poor product.

The original `/call` direction is also too narrow. Even if it works well in one host, it creates unnecessary product fragmentation:

- Codex would need one invocation model
- Claude Code would need another
- ChatGPT would need another

The first product should instead center on the one trigger pattern all of these surfaces already understand: the user asks for a call in plain language, and the agent returns a link.

## Product Goal

Make switching from text chat to live voice feel as simple as asking the agent to call.

The user should be able to:

1. discover the product at `call.knotwork.com`
2. install the local companion and host integration
3. type `call me` or a similar natural phrase in Codex, Claude Code, or ChatGPT
4. receive a call link from the agent
5. open the link and launch the local call surface
6. start talking right away
7. get spoken answers from an agent that understands the current repo and task

## Users

Primary user:

- a developer already working inside Codex, Claude Code, or ChatGPT

Primary jobs to be done:

- "I want to talk through a coding problem without stopping my current workflow."
- "I want faster back-and-forth than typing when debugging, planning, or reviewing code."
- "I want the agent to keep repo context instead of starting a disconnected voice demo."
- "I want the trigger to work the same way everywhere."

## Acquisition And Activation Journey

### Primary journey

1. The user hears about the product from social, a demo, or word of mouth.
2. The user lands on `call.knotwork.com`.
3. The site explains the promise in one sentence: ask your agent to call you, then talk live.
4. The site asks which host the user wants first:
   - Codex
   - Claude Code
   - ChatGPT
5. The site gives the install flow for that host.
6. The user installs the local companion and enables the host integration.
7. The site runs a readiness check:
   - local companion installed
   - microphone permission available
   - supported host integration enabled
8. The user returns to the host.
9. The user types `call me`.
10. The agent responds with a call link.
11. The user opens the link.
12. The local call surface launches and the first call succeeds.

### Website responsibilities

`call.knotwork.com` is not just marketing. It is part of the product.

It should:

- explain the product clearly
- show one short demo
- route the user to the correct install path
- verify prerequisites
- explain what stays local and what does not
- resolve or hand off launch links safely
- provide troubleshooting when a link cannot launch the local companion

## Why This Product First

This repo already has the right discovery assets:

- `apps/meeting-link-probe` proved local room control
- `apps/voice-loop-lab` proved browser voice turn-taking
- `apps/avatar-puppet-lab` proved agent presence and playback
- `apps/one-to-one-agent-room` proved the full integration path

The next step should not be another spike. It should be the first product shell that compresses those learnings into one user-facing workflow with a cross-host trigger.

## Goals

- Natural-language trigger such as `call me` instead of a host-specific command.
- Same user behavior across Codex, Claude Code, and ChatGPT.
- Clear path from `call.knotwork.com` to first successful call.
- One local user and one local-orchestrated agent per call.
- Local media transport and local call orchestration.
- Shared task context with the current repo and active conversation.
- Spoken replies by default, with visible agent presence.
- Human interruption support so conversation feels live instead of turn-locked.
- Typed fallback when microphone or speech recognition is unavailable.
- Local persistence of session artifacts such as transcript, logs, and summary.
- One lightweight share loop that creates an attributable backlink to the product.

## Non-Goals

- Group calls.
- Cloud-hosted media transport owned by this repo.
- Multi-agent rooms.
- Cross-device calls in v1.
- Mobile-first product design.
- Calendar, scheduling, contacts, or meeting links in the traditional sense.
- Perfect human-like avatar quality in v1.
- Host-specific command UX as the primary product entrypoint.

## Success Criteria

Product success for v1 means:

- a new user can go from `call.knotwork.com` to first successful call without reading repo docs
- the user can type `call me` or a similar phrase in a supported host and get a valid call link
- the user does not need to memorize a slash command
- the user does not need to manually start a second server or copy an MCP bootstrap command
- the user can ask a repo-specific question by voice and receive a spoken answer that reflects current task context
- the user can interrupt the agent mid-reply and ask a follow-up
- all room state and media routing stay local to the machine

## Core User Stories

- As a new user, I can land on `call.knotwork.com` and know exactly how to install the product for my host.
- As a user in Codex, Claude Code, or ChatGPT, I can simply type `call me` instead of remembering a command.
- As a user, I receive a clickable link that launches the call.
- As a caller, I can speak immediately after granting microphone permission.
- As a caller, I hear the agent reply out loud and see a visual agent presence.
- As a caller, I can interrupt the agent if it is too slow, wrong, or verbose.
- As a caller, I can keep using the same repo and task context instead of re-explaining my problem.
- As a caller, I can fall back to typing if microphone capture or speech recognition fails.
- As a caller, I can end the call and keep a local transcript or summary for later reference.
- As a satisfied caller, I can share a useful call outcome with one click in a way that links back to the product.

## V1 Experience

### Discover to first call

1. The user lands on `call.knotwork.com`.
2. The site asks which host they want:
   - Codex
   - Claude Code
   - ChatGPT
3. The site gives the install and integration flow.
4. The site explains local prerequisites and runs a readiness check.
5. The user completes install and returns to the host.
6. The user types `call me`.
7. The agent returns a call link.
8. The user opens the link and launches the local call.

### Happy path

1. The user is inside Codex, Claude Code, or ChatGPT in a repo-aware conversation.
2. The user types `call me`.
3. The host integration makes a `create_call_link` tool available to the agent.
4. The agent uses that tool and receives a signed, short-lived call link.
5. The agent replies with a short message and the call link.
6. The user opens the link.
7. The website or protocol handoff resolves the link into the local companion.
8. The local orchestrator starts or reuses the required local processes.
9. A local call window opens automatically.
10. The user sees agent-ready status and grants microphone access if needed.
11. Listening starts.
12. The user asks a question by voice.
13. The local voice layer finalizes the turn and hands it to the agent bridge.
14. The agent adapter gets a reply from the active coding context.
15. The avatar speaks the reply and shows a simple matching gesture or emote.
16. On hang-up, the session summary and transcript are written locally.

### Failure-tolerant path

1. If the host integration is missing, the agent replies with install guidance from `call.knotwork.com`.
2. If the link opens on a machine without the local companion, the website shows install and recovery guidance.
3. If microphone permissions fail, the call window stays usable with typed input.
4. If camera permissions fail, the call still works because human camera is optional in v1.
5. If the agent runtime cannot attach to the current session, the UI makes that explicit and offers a local fallback mode or a fresh session mode.
6. If the room transport fails, the user gets a direct local error instead of a silent broken state.

## Scope For V1

### In scope

- one local human participant
- one agent participant
- a local companion that can launch calls
- natural-language trigger support through host tool integration
- signed, short-lived call link generation
- local room creation and teardown
- local call window with agent stage
- microphone capture
- optional human camera preview
- browser or local-shell based video UI
- avatar speech playback
- typed fallback
- session transcript and summary saved locally
- host integration for Codex
- host integration for Claude Code
- host integration for ChatGPT link generation
- website onboarding and install flow at `call.knotwork.com`
- a small post-call share card with backlink support

### Out of scope

- multiple humans in the same room
- multiple simultaneous agent personalities
- remote guest join links for other people
- hosted sync across devices
- billing, user accounts, or admin controls
- production-grade analytics backend

## Functional Requirements

### 1. Discovery and install

- `call.knotwork.com` must be the default public entry point.
- The website must provide host-specific onboarding for Codex, Claude Code, and ChatGPT.
- The website must provide installation steps for the local companion and host integration.
- The website should provide a short local readiness check before the first call.
- The website must make the local-first privacy model clear.

### 2. Trigger model

- The primary user trigger must be natural language, not a host-specific command.
- The product should recognize phrases such as `call me`, `let's talk`, `start a call`, and similar variants.
- Supported hosts must expose a tool that lets the agent create a call link when the user expresses call intent.
- The agent reply should be short and should include a clear call-to-action link.

### 3. Call link generation

- The product must expose a `create_call_link` capability to supported hosts.
- The generated call link must be signed and short-lived.
- The link must carry enough metadata to attach the call to the current task or context handoff.
- The link should be HTTPS so it renders reliably in chat surfaces.
- The launch flow may hand off from HTTPS to a custom protocol or localhost launcher once opened on the user's machine.

### 4. Local orchestration

- The product must start or reuse the local processes needed for a call automatically after link open.
- The user must not need to manually launch the browser app, bridge server, or room service glue in normal operation.
- Local services must bind to local interfaces only by default.
- The product must clean up stale sessions and recover cleanly after an ungraceful exit.

### 5. Call window

- A local call window must open automatically after the link handoff succeeds.
- The call window must show call status, agent readiness, microphone state, and failure states.
- The call window must show a visible agent presence.
- The call window should show local human preview when camera is enabled, but camera is optional for v1.

### 6. Voice and turn-taking

- The user must be able to start speaking with minimal friction after opening the call.
- The system must support spoken input and typed fallback.
- The system must support interruption of agent speech by the human.
- The system should surface partial and final transcript states clearly enough to debug turn handling.

### 7. Agent context and reply loop

- The agent answering the call must be attached to the current repo or conversation context.
- The product should reuse the current task context when possible instead of opening a blind new agent instance.
- If exact session reuse is not possible, the product must create an explicit context handoff snapshot and tell the user what was transferred.
- Agent replies must support spoken playback plus lightweight structured direction such as gesture or emote.

### 8. Local artifacts

- The product must write local session artifacts to a stable output location.
- Artifacts should include session metadata, transcript, logs, and a short summary.
- Per-session outputs are preferred over a single long-lived shared state file for product mode.

### 9. Configuration

- The user must be able to configure default microphone, camera, locale, avatar choice, and runtime target.
- Reasonable defaults must exist so most users do not need to configure anything before the first call.
- The product must document prerequisites clearly, including any local room dependency that still exists in v1.

### 10. ChatGPT support

- ChatGPT support should focus on allowing the model to create and return a call link inside a normal chat flow.
- ChatGPT support may use an Apps SDK-compatible MCP server or equivalent connector path to expose the `create_call_link` tool.
- The first ChatGPT version should not assume that the full live call runtime happens inside ChatGPT itself.
- The safe default is ChatGPT as trigger surface plus local handoff surface.

### 11. Share loop

- After a successful call, the product should offer one optional share action.
- The v1 share action should generate a short share card from the session summary or a user-selected quote.
- The share action should prefill an X post that links back to `call.knotwork.com`.
- The share flow must require explicit user confirmation and allow editing before posting.
- The share flow must avoid publishing raw code, secrets, or full transcripts by default.

## Non-Functional Requirements

### Privacy and locality

- Media transport, bridge state, orchestration, and call UI must run locally.
- The product must not require a repo-owned hosted media service.
- Any network usage that still exists because of the chosen model provider must be explicit in docs and product copy.
- The public call link must function as launcher and handoff only, not as the primary media runtime.

### Portability

- The trigger model must feel the same across supported hosts.
- Host differences should be handled in the integration layer, not pushed onto the user.

### Responsiveness

- Call link creation should feel immediate after the user asks for a call.
- Warm start from clicking the link to ready-to-talk state should be under 10 seconds on a healthy local machine.
- Short spoken turns should feel conversational, with a target of first audible agent response within 5 seconds after final transcript.

### Reliability

- Re-running the flow after a crash should not require manual file cleanup.
- The product must surface actionable errors for missing host integration, failed link launch, missing mic permission, missing local services, and failed agent attachment.

### Security

- Default network bindings must stay on localhost unless the user opts into broader exposure.
- Link tokens must expire quickly and be scoped to a single launch or session.
- Local tokens and bridge files must use least-privilege defaults.

## Product Shape In This Repo

The repo should keep using the current monorepo discipline:

- `apps/` for runnable product shells and disposable spikes
- `packages/` for reusable transport, voice, avatar, and bridge layers
- `docs/` for durable decisions

Recommended implementation shape:

- keep `apps/one-to-one-agent-room` as the integration spike reference
- create a local companion product shell that can launch and join calls
- create a host-facing integration layer that exposes `create_call_link`
- add product docs and onboarding copy for `call.knotwork.com`
- keep extracting stable logic into:
  - `packages/room-layer`
  - `packages/voice-layer-browser`
  - `packages/avatar-layer-browser`
  - `packages/avatar-speech-browser`
  - `packages/agent-room-bridge`

Recommended product split:

- local companion for call launch and runtime
- website onboarding and link handoff surface at `call.knotwork.com`
- host integrations for Codex, Claude Code, and ChatGPT

## Dependencies

- Node `>=20`
- a local room transport implementation, currently LiveKit-based
- browser audio and optional camera permissions
- a local companion that can receive link handoff
- a host integration that exposes `create_call_link`

## Risks

- Different hosts may differ in how reliably they surface tool-triggered links.
- Some hosts may treat custom protocol links differently, so HTTPS handoff is safer but adds one extra hop.
- Sharing exact live session context with a voice surface may be harder than sharing a summarized handoff.
- Browser speech recognition, mic permissions, and echo behavior may vary materially across machines.
- Live local voice quality may be acceptable before local packaging quality is acceptable.

## Milestones

### Milestone 1 - Website and local companion

- `call.knotwork.com` exists with a clear install path
- the local companion can launch a call from a signed handoff link
- the core call runtime no longer requires manual bootstrap steps

### Milestone 2 - Cross-host trigger

- Codex integration can create and return a call link
- Claude Code integration can create and return a call link
- ChatGPT integration can create and return a call link
- the user can type `call me` in all supported hosts

### Milestone 3 - Shared-context conversation

- voice turn loop works against live repo or conversation context
- typed fallback works
- interruption works

### Milestone 4 - Product hardening

- per-session artifacts are stable
- crash recovery is acceptable
- link launch failures are explicit and recoverable

## Release Criteria

The first product is ready to ship when:

- a new user can discover the product, install it, and succeed from `call.knotwork.com`
- the user can type `call me` in a supported host and receive a working call link
- the happy path works from link open to spoken agent answer
- failure states are explicit and recoverable
- the implementation no longer depends on the operator manually stitching together spike components

## Open Questions

- Does "everything runs local" also require model inference to be local, or is local orchestration around Codex or Claude acceptable for v1?
- Should the link open a browser page first and then hand off to the local companion, or should it open the companion directly when possible?
- How much current conversation context can each host safely hand into the call link flow?
- Is human camera on by default, optional, or omitted in v1?
- Is the visible avatar mandatory for the first shipped version, or is audio plus a simpler speaking indicator acceptable if it materially speeds up launch?
