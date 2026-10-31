# Splendor reference-board comparison

Source visual truth: `/workspace/scratch/1ade7d9b785d/reference-board.png` (695 × 324, cropped from the user-supplied 695 × 1536 phone screenshot; black device chrome excluded).
Implementation: browser tab `Reference comparison`, `http://terminal.local:4173/qa-splendor-reference/`; browser-rendered comparison screenshot in this conversation (reference above, live implementation below, both 695 × 324 CSS px, 1:1 scale). No separate filesystem screenshot-export capability is exposed by this browser runtime.
State: three players, human turn. Original screenshot is mid-game; implementation is a fresh game, so cards, player names, scores and token counts differ intentionally.

## Comparison history

1. Earlier released implementation: purple background, photographic card faces, dark rectangular counters, stacked bottom panels. P1: major mismatch to source palette, illustration, information density and proportions.
   Fix: dedicated illustrated architecture and noble assets; raster blue table and nine-slice gold panels; reference-sized 695 × 324 board; small star scores, corner bonuses and compact circular costs; opponents left, market centre, bank and staggered nobles right, separate score/hand/action panels below.
   Browser comparison: captured both source and rendered board together after these changes.
2. First combined comparison: P2 blue background too saturated; P2 card faces too uniformly cream.
   Fix: reduce saturation and luminance of the table background; add restrained colour-specific pastel fields through asset colour blending. Preserve white diamond costs rather than changing rule colour names to amethyst.
   Final post-fix comparison: captured in the combined browser view after reload; the revised blue field and tinted cards match the reference hierarchy. Dedicated Roman deck raster art replaced the overdecorated nine-slice deck borders.

3. Portrait capture: P2 light scores lost contrast against ivory player panels.
   Fix: dark brown scores for portrait layouts.
   Post-fix evidence: browser `Portrait board check`, 390 × 844, three opponents with legible brown zero scores; table clientHeight=scrollHeight=794 and clientWidth=scrollWidth=390.

## Required fidelity surfaces

- Typography: bold compact sans-serif UI and small counters; serif Roman deck levels. Japanese copy replaces English labels; dynamic game values remain engine-driven.
- Spacing/layout: card/deck rows at x=175, y=15/96/177 in a 695 × 324 board; 52 × 70 cards, 10px column gaps. Bank at x=493, nobles at x=553, hand at x=208/y=259, own score lower left, actions lower right.
- Colours: blue raster backdrop, ivory and gold panels, pastel card fields, consistent coloured gem counters.
- Image fidelity: generated local raster architectural and noble illustrations follow the supplied flat mobile-game art direction. Original gem cutouts retained for colour/shape recognition; chip containers in payment, return and selection UI have explicit dimensions; standard Font Awesome star icon is locally bundled (CC BY 4.0 attribution in the source).
- Copy/content: Japanese interface and real game data, accessible complete cost/bonus labels. No fake End Turn pass: selected-gem confirmation ends the turn; default button gives a hint.

## Findings / validation

- No actionable P0/P1/P2 differences remain within the requested reference-led redesign.
- Full-view evidence: combined browser capture of source and final live implementation at 695 × 324.
- Focused review: the same capture resolves the compact cost circles, corner bonus gem, star point labels, gold deck borders and noble requirement columns; detail-dialog and portrait captures confirm numeric/label readability at larger and smaller sizes.
- Primary interactions tested through the browser UI: three distinct gems, two gems of the same colour, selected-gem confirmation/turn advance, card purchase with white×3, resulting permanent red bonus, card reservation and resulting gold token, CPU turns, and saved-game resume.
- Responsive checks: 667 × 320 four-player view shows 12 cards and 5 nobles with the action button wholly inside the viewport; 390 × 844 four-player portrait has no horizontal/vertical table overflow.
- Console review: no application-origin errors; only unrelated chrome-extension metadata-send errors were present.
- Rules: 18 tests pass. All 90 card mappings, 10 noble mappings, legacy gem assets and illustrated raster decodes pass.
- No separate screenshot download/export API is provided by this CUA runtime. Browser-rendered screenshot evidence is retained in the conversation, rather than fabricating a filesystem PNG path.
- P3: generated character identities/buildings are original approximations of the reference art direction; original gem cutouts are more faceted than reference cartoon tokens. These are deliberate asset substitutions, not a claim of pixel identity.

final result: passed
