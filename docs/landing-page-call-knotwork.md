# Landing Page Spec - `call.knotwork.com`

Status: draft

Date: 2026-04-29

Related:

- `docs/prd-local-call-command.md`

## Purpose

This document defines the landing page for `call.knotwork.com`.

The page is not just a marketing surface. It is the public entry point for the product and the first step in activation. Its job is to help a developer:

1. understand what the product does
2. believe the local-first promise
3. choose their host
4. install the local companion and host integration
5. complete a readiness check
6. successfully trigger the first call by typing `call me`

## Product Promise

The product promise the page must communicate is:

Type `call me` in Codex, Claude Code, or ChatGPT. The agent sends a link. Open it, and a local call launches so you can talk to your agent live.

Secondary promise:

The call runtime stays on your machine.

## Primary Audience

- developers already using Codex
- developers already using Claude Code
- developers already using ChatGPT for coding or repo reasoning

## Secondary Audience

- people who have seen a demo clip and want to try it
- early adopters who care about local-first AI tooling
- technical evaluators deciding whether this is real or just another voice demo

## What The Page Must Achieve

The landing page must answer these questions quickly:

- What is this?
- Why is it better than just typing?
- How do I use it in my current host?
- What exactly happens when I type `call me`?
- What runs local and what does not?
- How do I install it?
- How do I know it is working?

## Core Messaging

### Primary message

Talk to your coding agent live by typing `call me`.

### Supporting message

Works across Codex, Claude Code, and ChatGPT. The agent sends a link. Open it, and the local call launches on your machine.

### Trust message

The call UI, media transport, and orchestration run locally.

### Anti-hype rule

The page should avoid vague AI claims such as:

- revolutionary
- magical
- human-level
- seamless collaboration

The tone should be concrete, technical, and credible.

## Page Goals

### Primary conversion

Get the user to install the local companion and host integration.

### Secondary conversion

Get the user to complete readiness check and reach the first successful call.

### Tertiary conversion

Get the user to share a post-call quote card that links back to `call.knotwork.com`.

## User Journey

### Journey 1 - New visitor

1. User lands on the homepage.
2. User understands the trigger in under 10 seconds.
3. User selects their host.
4. User installs the local companion.
5. User enables the host integration.
6. User completes readiness check.
7. User goes back to Codex, Claude Code, or ChatGPT.
8. User types `call me`.
9. Agent returns link.
10. User opens link and the first call launches.

### Journey 2 - Returning visitor

1. User lands on the page from a share link, docs link, or previous bookmark.
2. Page detects that the local companion is already installed if possible.
3. User chooses host or directly opens setup/status panel.
4. User verifies readiness.
5. User goes back to host and triggers a call.

### Journey 3 - Broken setup

1. User installs companion or host integration incorrectly.
2. User returns to landing page from failed launch or help flow.
3. Page shows which layer failed:
   - local companion missing
   - host integration missing
   - microphone permission unavailable
   - launch handoff blocked
4. User gets a direct fix path instead of generic troubleshooting text.

## Information Architecture

The page should be structured in this order:

1. Hero
2. Host picker
3. How it works
4. Local-first explanation
5. Install flow
6. Readiness check
7. Demo or product proof
8. FAQ
9. Final CTA

## Section Spec

### 1. Hero

Purpose:

- establish the product in one sentence
- show the trigger phrase
- explain cross-host support
- drive the user to choose a host or install immediately

Required content:

- headline
- subheadline
- primary CTA
- secondary CTA
- compact host support row
- short visual or mock transcript

Recommended headline options:

- Type `call me`. Talk to your agent live.
- Ask your agent to call. Then talk instead of type.
- Your coding agent should be one call away.

Recommended subheadline:

Works across Codex, Claude Code, and ChatGPT. Type `call me`, get a link, open it, and launch a local voice call with your agent.

Primary CTA:

- `Install and Try It`

Secondary CTA:

- `See How It Works`

Hero proof element:

A compact three-step strip:

1. `call me`
2. agent sends link
3. local call opens

### 2. Host Picker

Purpose:

- make the page feel immediately relevant
- avoid a generic install flow
- reduce cognitive load

Hosts to support in v1:

- Codex
- Claude Code
- ChatGPT

Behavior:

- host picker updates installation instructions inline
- selected host persists during the session
- page can deep-link into a host-specific view

Host card copy should answer:

- where the user types `call me`
- what integration is required
- what the link will open

### 3. How It Works

Purpose:

- explain the product without jargon
- make the trigger model obvious

Recommended 4-step sequence:

1. Type `call me` in your current host.
2. The agent creates a secure call link.
3. Open the link to launch the local call.
4. Talk live with the same task context.

This section should explicitly say:

- the link is a launcher, not a hosted meeting room
- the call surface runs locally

### 4. Local-First Explanation

Purpose:

- resolve the biggest trust question early
- distinguish the product from browser-only demos

This section must clearly separate:

What runs local:

- call UI
- room transport
- mic and camera handling
- local orchestration
- session artifacts

What may still use remote compute depending on host:

- underlying model inference
- host platform behavior

Suggested heading:

- What stays on your machine

Suggested supporting line:

The link is only the handoff. The call runtime runs locally.

### 5. Install Flow

Purpose:

- move from interest to action
- avoid making the user search docs or repo files

Requirements:

- one path per host
- one path for installing the local companion
- one path for enabling host integration
- one path for recovery if launch fails

Install flow modules:

- Step 1: install local companion
- Step 2: enable host integration
- Step 3: return to your host and type `call me`

Each module should include:

- exact action
- platform note if needed
- expected success state

### 6. Readiness Check

Purpose:

- reduce failed first-run attempts
- make the site operational, not passive

Checks to include if feasible:

- local companion detected
- browser can request microphone permission
- host selected
- host integration confirmed manually or semi-automatically
- launch handoff available

Possible states:

- ready
- needs install
- needs permission
- needs host integration
- needs retry

Primary CTA in ready state:

- `Go Trigger Your First Call`

### 7. Demo or Product Proof

Purpose:

- prove the product is real
- reduce skepticism

Recommended proof formats:

- short terminal-to-call clip
- animated transcript showing `call me` -> link -> call window
- screenshot trio:
  - host chat
  - returned link
  - local call window

The proof section should show:

- user typing `call me`
- agent replying with a link
- local call stage opening

### 8. FAQ

Required FAQ items:

- What does the link actually do?
- What runs locally?
- Does this work in Codex?
- Does this work in Claude Code?
- Does this work in ChatGPT?
- Do I need a slash command?
- Do I need to keep a local server running manually?
- What happens if the link opens on the wrong machine?
- Can I use text instead of mic?

### 9. Final CTA

Purpose:

- catch users who read to the bottom
- re-route them into install or readiness flow

Recommended heading:

- Ready to talk to your agent instead of typing?

Primary CTA:

- `Install for My Host`

Secondary CTA:

- `Run Readiness Check`

## Copy Guidelines

### Tone

- direct
- technical
- specific
- calm

### Avoid

- startup fluff
- inflated claims
- abstract AI language
- long paragraphs in the hero

### Emphasize

- `call me`
- cross-host consistency
- local runtime
- short path to first success

## CTA System

Primary CTAs across the page should map to three intents only:

- install
- verify readiness
- trigger first use

Avoid CTA sprawl.

Recommended CTA labels:

- `Install and Try It`
- `Choose My Host`
- `Run Readiness Check`
- `See Setup Steps`

## Host-Specific Content Requirements

### Codex

Page should explain:

- how the host integration exposes the call-link capability
- that the user can simply type `call me`
- what the response should look like

### Claude Code

Page should explain:

- how the integration is enabled
- that the user should use normal language, not a custom command
- what success looks like

### ChatGPT

Page should explain:

- ChatGPT is supported as a trigger surface
- the agent can return a call link in normal conversation
- the link hands off to the local runtime
- the live call is not assumed to run inside ChatGPT itself in v1

## Launch Handoff Requirements

The page must support the fact that the link may:

- open a web handoff page first
- then launch a custom protocol or localhost handler
- or fall back to install/recovery guidance

The handoff page should:

- explain what is happening
- attempt launch immediately
- provide manual fallback action
- provide install path if the companion is missing

## SEO and Discovery

Primary search intent:

- voice call with coding agent
- talk to Codex
- talk to Claude Code
- talk to ChatGPT coding agent
- local AI call tool

Suggested title direction:

- Talk to Your Coding Agent Live | call.knotwork.com

Suggested meta description direction:

- Type `call me` in Codex, Claude Code, or ChatGPT. Get a link, open it, and launch a local live call with your agent.

## Analytics and Conversion Events

Track at minimum:

- page visit
- host selected
- install CTA clicked
- readiness check started
- readiness check passed
- host integration instructions opened
- call link handoff page opened
- companion launch success
- companion launch failure
- share card generated

## Design Constraints

Brand is currently deferred, so the page should not overfit to a premature visual system.

However, the page should still feel intentional:

- strong headline hierarchy
- crisp technical UI
- clear host-selection affordance
- visible trigger phrase treatment
- proof before hype

The page should feel closer to a developer tool launch page than a consumer AI toy page.

## Non-Goals

- full product docs
- complete architecture explanation
- enterprise pricing or packaging
- marketplace-style feature matrix
- generic AI assistant positioning

## Open Questions

- Should the hero lead with `call me` or with the local-first promise?
- Should the page default to a web handoff model or a custom protocol model in the copy?
- How much of the readiness check can be automated in-browser versus explained manually?
- Should the proof section use a real video first, or can static step visuals ship first?
- Should the share card be shown on the landing page as social proof, or only after first successful use?
