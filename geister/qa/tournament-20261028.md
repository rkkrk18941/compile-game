# Tournament verification — 2026-10-28

Implemented with Battle Line's Director, upward bracket, opening sequence, standings and 20 identity logos. Geister supplies private setup, move validation and ghost views.

## Automated checks

- `node tools/geister-tournament-test.cjs`: 44 assertions passed, including 2/3/6/8/12-player cup completion, six-player league pairings, parallel matches, shared-device exclusion, authorization, stale revisions, participant privacy, spectator visibility and disconnected-player CPU takeover.
- `node tools/game-bgm-gesture-test.cjs`: passed. A rejected pointerdown play is retried at pointerup/click without volume changes; saved mute/zero settings remain respected; initialization after an earlier user gesture is supported.
- `node tools/geister-rules-test.mjs`: 1,414 passed, zero failed.
- `node tools/hatatori-tournament-test.mjs`: 13,042 checks passed.
- JavaScript syntax and `git diff --check`: passed.

## Browser checks

- Six-player cup: connected upward tree has six actual entrants, collapsed byes, selectable zoom and advancing branches. Full bracket appears before matchup introductions and VS.
- Human setup remains usable while unrelated CPU matches progress; human moves and CPU responses use the existing board.
- Local transport, two browser tabs: room creation, guest joining, both private setups, a legal guest move and synchronized host/guest move counts passed. Cross-device PeerJS routing was not exercised in this environment.
- Participant ghost DOM: eight own colors, zero opponent colors. Spectator: eight colors for each side, including completed match inspection. Perspective toggle swaps the board sides; returning to the own match restores hidden opponent colors.
- Explicitly selected completed matches remain on screen without reopening the tournament dialog. Expanding the result list and zoom state survive bracket updates.
- 390 × 844 viewport: full tree initially fits horizontally, names and all six logos remain visible, zoom is available, and match buttons remain reachable. See `tournament-mobile.jpg`.
- Kosodoro: clicking “CPUと遊ぶ” starts BGM with the status “再生中” and `audio.paused === false`, without touching volume. Browser desktop check plus a simulated Android activation regression test; no physical Android device was used.

## Compact menu follow-up — 2026-10-29

The title now has two permanent actions (対戦する / 大会で遊ぶ), optional saved-game resume and a help icon at the top right. Browser checks at 390 × 844 passed for CPU / shared-device / online switching, cup / league switching, local / online tournament switching, returning from league to the default cup, and opening/closing help. The same tournament features remain available within the setup screen. Screenshot: `menu-compact-mobile.jpg`.
