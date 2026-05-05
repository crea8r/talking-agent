# Brand - call

call helps AI power users video call their own agent, whether that agent is ChatGPT, Codex, Claude, OpenClaw, Hermes, or something else.

_Generated on 2026-05-01 from brand interview inputs. This repo does not yet have one shared frontend theme target, so this file defines the brand system and implementation intent for future apps._

## Core Positioning

- Product name style: `call` always lowercase
- Primary line: `call your agent`
- Supporting explainer: `video call any agent`
- Audience: AI power users
- Category: consumer/social
- Mood: bold, playful
- Product feel: futuristic AI portal
- Core surface: call screen first, not team chat, not productivity dashboard

## Brand Thesis

call should feel like the moment a remote intelligence picks up the line. It is live, face-to-face, and slightly uncanny, but still trustworthy. The product is not a generic AI shell and not a cute mascot app. It is the cleanest, most emotionally present way to reach your own agent.

The energy should borrow from high-production game interfaces more than SaaS. Think vivid presence, sharp silhouettes, reactive surfaces, and strong personalities on the other end of the call. The reference point is not "work software with AI features." The reference point is "you opened a portal and someone answered."

Even when the interface is playful, it should stay composed. call can be expressive and a little mischievous, but it should never become noisy, childish, chaotic, or ironic for its own sake.

## Visual Direction

### Palette - Portal Signal

This is the working palette direction for future UI work:

| Role | Color | Hex | Use |
|---|---|---|---|
| Core dark | Void Ink | `#0B1020` | Dark backgrounds, deep panels, cinematic depth |
| Core light | Cloud White | `#F5F7FF` | Light backgrounds, bright mode base, clean contrast |
| Primary | Cosmic Violet | `#7C5CFF` | Brand recognition, active call states, hero accents |
| Secondary | Electric Blue | `#2FA8FF` | Motion, live states, voice energy, focus accents |
| Third accent | Signal Lime | `#C8FF47` | Sparse highlights, status energy, mischievous edge |

Guidance:

- Light mode matters as much as dark mode. Do not build the brand as "dark mode first with a neglected light theme."
- Light mode should feel luminous, glossy, and high-energy, not sterile or productivity-like.
- Dark mode should feel rich and dimensional, not muddy and not cyberpunk-black.
- Violet and electric blue carry the identity. Lime is a sharp accent, not a main fill color.
- Avoid rainbow palettes, soft pastels, beige neutrals, and grayscale-heavy screens.

### Materials

- Prefer glossy layered panels over flat cards.
- Use translucent surfaces, edge highlights, and controlled bloom.
- Use restrained gradients: one portal/background gradient and one accent gradient.
- Let the gloss come more from lighting, shimmer, and surface treatment than from giant saturated fills.

### Visual Motifs

- Subtle glitch treatment
- Portal glow
- Reactive voice-wave energy
- Surreal digital being presence
- MMO-grade UI confidence without literal fantasy ornament

Glitch is an accent, not the default state. It should appear on transitions, active speaking states, and identity moments, not on every static panel.

## Typography

- Primary sans: `Sora`
- Mono/system accent: `JetBrains Mono`

Why:

- `Sora` gives the product a sleek sci-fi tone without looking childish or overly gamer-coded.
- `JetBrains Mono` supports agent names, timing, diagnostics, and live counters with technical clarity.

Usage:

- Headlines should be compact, confident, and slightly futuristic.
- Body copy should stay clean and highly legible.
- Mono should appear in timestamps, session states, live metrics, and machine-like details.

Avoid:

- Friendly startup default typography
- Overly decorative gamer fonts
- Corporate neo-grotesk neutrality that drains personality

## Motion

- Motion style: subtle shimmer
- Secondary behavior: reactive voice-wave energy
- Transition tone: precise, live, responsive

Preferred motion patterns:

- Soft holographic shimmer on hero surfaces
- Light glitch pulse on connect, answer, and speaking transitions
- Gentle waveform or ring response when an agent is active
- Fast but smooth panel transitions

Avoid:

- Constant jitter
- Meme-level chaotic animation
- Heavy parallax
- Slow luxury fades that kill the live-call feeling

## Voice and Tone

The voice should be playful but professional. It should feel intimate in the sense of direct presence and trust, not flirtation. call is helping someone reach their own agent, so the product tone should feel capable, slightly sly, and emotionally aware without pretending to be the agent itself.

Write like the product knows what it is doing. Keep copy short, active, and a little sharp. Favor phrases that suggest immediacy, presence, and human connection through a machine interface.

The product should sound current, but not internet-brained. It can be stylish and lightly self-aware, but it should not become meme copy or undercut trust with jokes that try too hard.

### Words to use

- face-to-face
- voice
- trust
- call
- live
- signal

### Words to avoid

- synergy
- seamless
- bestie
- productivity
- optimize
- workflow

### Example voice lines

- `call your agent`
- `face-to-face with the model you actually use`
- `pick up where the conversation gets real`
- `live voice. live presence. your agent on call.`

## UI Principles

- Design around the call screen as the emotional center of the product.
- Treat agent presence as the hero, not settings or workspace chrome.
- Let strong personalities show up through motion, framing, and accents rather than cartoon styling.
- Keep interfaces bright and readable even when they are glossy and atmospheric.
- Use light mode proudly. The product should still feel premium and alive in daylight.
- Make active states feel electric and responsive.
- Keep secondary screens consistent with the main call experience; no sudden collapse into plain admin UI.

## What call Should Never Feel Like

- Corporate
- Sterile productivity software
- Childish
- Romance-coded
- Generic AI wrapper
- Dark-mode-only hacker aesthetic

## Dos and Don'ts

**Do**

- Keep the lowercase `call` wordmark treatment
- Use violet and electric blue as the unmistakable brand anchors
- Use lime only for sharp emphasis and live energy
- Build both light and dark themes with equal care
- Keep copy short and confident
- Make agent interactions feel live, direct, and emotionally legible

**Don't**

- Turn the product into a workspace app
- Overuse glitch effects
- Rely on flat grayscale UI
- Use childish mascots or cutesy language
- Use rainbow gradients everywhere
- Write copy that sounds like enterprise AI tooling

## Implementation Notes

- This brand is repo-level guidance for future apps in `apps/` and shared UI work in `packages/`.
- When a durable frontend emerges, derive a concrete token set from this palette for that app rather than forcing one global theme onto every spike.
- Early spike apps should validate interaction unknowns first, then inherit this brand system selectively.
- If a future app needs a full token file, start from Portal Signal and preserve the light-mode quality bar.

---

Last updated: `2026-05-01`
