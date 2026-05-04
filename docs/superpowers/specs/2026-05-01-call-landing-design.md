# call landing page design

Date: `2026-05-01`

## Goal

Replace the current `apps/call-landing` experience with a standalone, one-screen landing page for `call` that feels like a luxury app launch instead of a SaaS template.

## Approved direction

- Primary conversion: `Install`
- Install behavior: show an instruction and ask the user to feed it to their agent
- Headline: `call your agent`
- Supporting explainer: `video call any agent`
- Layout: one-screen landing page with a sticky top bar
- Style: glossy Apple-style launch page, premium and sleek
- Theme: bright, optimistic, light-first, with a few dark glass panels for contrast
- Visual system: one large hero avatar, plus the same VRM model shown in different moods and reads
- Avatar source: bundled `Bhf_1_2.vrm` model via `packages/avatar-layer-browser`
- Product framing: exaggerated marketing version of the product, not literal app chrome everywhere
- Social proof: testimonial quotes
- Must not resemble: a SaaS template

## Page structure

1. Sticky top bar
   - lowercase `call` wordmark
   - short supporting note
   - persistent `Install` button
2. Hero copy column
   - eyebrow
   - `call your agent` headline
   - concise premium lede
   - primary `Install` action and secondary proof jump
   - compact promise bullets
   - inline install prompt panel that reinforces the “feed this to your agent” flow
3. Hero visual column
   - one dominant dark-glass call stage
   - one large live VRM canvas using `bhf-1-2`
   - supporting chrome that makes it read as a call screen
   - two smaller dark-glass mood cards using the same model with different stage / emote / gesture combinations
4. Proof strip
   - supported agent chips
   - three short testimonial-style quote cards
5. Install dialog
   - exact instruction text
   - copy button
   - clear prompt to give the instruction to the user’s agent

## Interaction rules

- `Install` never starts a fake installer; it opens the instruction dialog
- Motion stays subtle: shimmer, soft hover response, no chaotic movement
- The page should fit in one screen on desktop, while remaining scrollable on smaller widths
- The landing app stays independent from `apps/one-to-one-agent-room`

## Technical notes

- Extend `apps/call-landing/server.mjs` to serve:
  - `/vendor/avatar-layer-browser.js`
  - `/vendor/animation-manifest.js`
  - `/models/`
  - `/animations/`
  - `three` and `@pixiv` vendor paths
- Replace SVG-led hero art with live canvases powered by `createAvatarLayer`
- Keep the app self-contained under `apps/call-landing`
