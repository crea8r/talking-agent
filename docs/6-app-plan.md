# Six-App Plan

This repo will evolve through six small apps before the final product shell.

## 1. `meeting-link-probe`

- Use case: validate that a self-hosted LiveKit room can be the substrate for a human participant now and a future headless agent participant later.
- Current stack: static web app + built-in Node server + local LiveKit token minting.
- Main unknown: can we control the room layer ourselves cleanly enough to support browser humans and machine participants without depending on public meeting products.
- Why this is separate: the public meeting-link hypothesis failed for headless agent joins, so transport control has to be proven before voice and avatar work can integrate.

## 2. `voice-loop-lab`

- Use case: one human talks to one agent and hears a spoken reply.
- Current spike stack: browser-native web app using speech recognition + deterministic routing + browser TTS, with typed fallback and latency instrumentation.
- Later stack: small web client + runtime + STT/TTS + text LLM only.
- Main unknown: latency, interruption handling, and cost per minute.
- Why this is separate: the product fails if the voice loop feels slow or too expensive.

## 3. `avatar-puppet-lab`

- Use case: an avatar talks, emotes, and changes simple appearance outside a live room.
- Expected stack: web renderer + VRM/GLB or 2D avatar system + viseme-driven lip sync.
- Main unknown: avatar quality versus complexity.
- Why this is separate: avatar rendering and media transport are different problems.

## 4. `one-to-one-agent-room`

- Use case: one human joins a room with one live talking avatar agent.
- Expected stack: chosen room layer + voice loop + avatar module.
- Main unknown: whether the integrated 1:1 experience is stable and believable.
- Why this is separate: this is the first full-system integration point.

## 5. `group-room-with-agent`

- Use case: multiple humans talk with one or more agents in the same room.
- Expected stack: app 4 stack plus active-speaker logic and room orchestration.
- Main unknown: turn-taking, interruption, and moderation logic.
- Why this is separate: group conversation is not a small extension of 1:1 calls.

## 6. `external-agent-connect`

- Use case: connect an agent/runtime triggered from another chat surface into a room.
- Expected stack: signed setup links, agent registry, capability handshake, runtime bridge.
- Main unknown: how much onboarding can be automated across external agent surfaces.
- Why this is separate: capability mismatch across agent surfaces is highly unpredictable.

## Working Order

- `1`, `2`, and `3` are discovery tracks.
- `4` starts after enough signal is gathered from `1` to `3`.
- `5` follows `4`.
- `6` follows `4`, and ideally after some learning from `5`.
