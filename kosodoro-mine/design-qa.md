# こそどろ鉱山 — original-art fidelity QA

Date: 2026-10-27 JST

## Source and implementation

- Visual truth: publisher's Japanese rulebook, pages 1–3 and 12–13, linked from https://gamemarket.jp/game/188031. Provenance and identity mapping: `assets/original/SOURCES.md`.
- Source component renders: `assets/original/character-*.webp`, `action-*.webp`, `special-*.webp`. Complete original PDF Figure groups are rendered independently; these are not drawings made to resemble the original.
- Browser-rendered implementation: `qa/desktop.jpg` (1363×936), `qa/mobile-390.jpg` (390×844), and `qa/detail-360.jpg` (360×640).
- Combined comparison input: `qa/comparison.jpg` (1600×950), showing the original card designs and the actual mobile implementation together.
- State: eight players, advanced rules, season 1 round 2, following one completed labour round; expansion dialog also checked.
- Density: browser images are 1 CSS pixel per image pixel. PDF is vector-rendered at higher density; the comparison sheet scales those source renders for viewing. No claim of pixel comparison between physical tabletop placement and digital page layout is made.

## Comparison history

1. P1: the earlier app used eight unrelated helmeted animals, green/blue action labels, wooden tag-shaped player panels, and a generated minecart. Replaced all component art with original character/action/special cards, purple printed card backs, and white/yellow/red ore tokens. Restored the eight original character identities and their associated special numbers without changing saved-game index semantics.
2. P2: first implementation used a paper crop containing rule text, which became large background lettering. Replaced it with the rulebook's blank paper region. Post-fix full-view evidence: `qa/desktop.jpg` and `qa/mobile-390.jpg`.
3. P2: action slots could overlap the separate ore-count row. Moved the slots into the artwork region and put counts below the printed card. Post-fix evidence: the same captures; all ore numbers and names are visible.
4. Final comparison: reviewed the original component renders and browser mobile screenshot in the same combined image, plus enlarged card details in the real browser. No actionable P0/P1/P2 differences remain for the recreated game components and usable page layout.

## Required fidelity surfaces

- **Fonts/typography:** printed text and logos remain inside the original artwork, so original outlines and spacing are retained. Digital controls use the existing Zen Maru Gothic font with system fallbacks. Small cards can be expanded by tap or keyboard; full card artwork is preserved rather than clipped.
- **Spacing/layout:** horizontal original character cards keep their printed aspect ratio. Vertical action cards display their complete front and border. The 390×844 eight-player board measured 390×507, scrollWidth 390 and scrollHeight 507; the 360×640 board measured width/scrollWidth 360 and height/scrollHeight 342. Main board and permanent controls fit without board scrolling. Desktop log remains beside the board.
- **Colors/tokens:** original PDF ICC color space retained. Labour yellow/orange, theft red/pink, defence teal/green, specials purple; original 1/5/10 denominations in white/yellow/red. Interface palette uses the original brown/paper/orange range.
- **Image fidelity/quality:** eight full character cards, three full ordinary actions, eight full specials, ore tokens, back and title use original PDF artwork. No custom SVG/icon approximation remains in these game components. Inspected image loads: 92 rendered original-art images, zero broken images in the tested eight-player mobile state.
- **Copy/content:** original character names and character-to-special assignments match rulebook pages 2, 12 and 13. Legacy invented animal and special-card names removed from the active artwork/mapping. Original attribution retained; source documentation updated.

## Interactions and checks

- CPU setup, eight-player game with specials, select Labour, confirm, simultaneous reveal, ore transfer, next round, saved-game resume.
- Tap a character and open its full printed character card plus the corresponding special card and readable effect; close the dialog.
- Browser checks at desktop 1363×936, phone 390×844, and compact phone 360×640 (phones rendered in same-origin, fixed-size browser iframes).
- Browser console checked: no page-origin errors; unrelated browser-extension metadata messages excluded.
- `node tools/kosodoro-rules-test.mjs`: 32 passed, 0 failed.
- JavaScript syntax checks and `git diff --check`: passed.

## Intentional digital additions and remaining limits

- The physical game has no browser UI. Name/ore counters, selectable controls, log, status stamps, responsive spacing and expansion dialog are digital controls; the printed components themselves use the original images.
- Inactive players are faded and marked for readability; the original character image stays underneath.
- Phone tests use browser iframe viewports; physical Android/iOS hardware and a new remote online match were not tested in this visual change. Network protocol and rule effects were not changed.
- P3: the card-back example in the publisher's rulebook is smaller than the other artwork; it is used at small slot sizes only.

final result: passed
