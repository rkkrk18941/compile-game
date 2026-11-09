# GRASP ALL — unofficial browser adaptation

Static, dependency-free Japanese game. CPU or pass-and-play for two people; no network multiplayer. Open `index.html` through an HTTP server. Links back to `../games/`.

## Rule provenance and interpretation

- Original: https://gamemarket.jp/game/173701 (Glory's Works / Lotus; original art by GAI)
- Public rule explanation: https://bodoge.hoobby.net/games/grasp-all/instructions/15191
- Cross-check: https://boadgamekazoku.com/grasp-all/

Confirmed from public explanations: six cards per player, three life, five coins, alternating offers; pass stays hidden; revealed $500/$1000 transfers one/two coins from offerer; skull costs recipient one life and recovers cards; zero life or money loses; final remaining cards penalize their owners.

Not independently verified in an official manual: exact deck multiplicities, recovery of already revealed cards, first player after a recovery, penalty money recipient, simultaneous losses. This version uses $500 x3, $1000 x2, skull x1; full six-card recovery; uninterrupted alternating turns; final-card money paid to the bank; simultaneous defeat is a draw. These interpretations are explicitly disclosed in the in-game rules. Do not describe it as an exact official implementation until the manual is verified.

Original SVG/CSS card art, no original game assets redistributed. Currency is fictional, with no payments or real-money betting.

## Verification

`node grasp-all/engine.test.mjs`

Covers transfer amounts, insufficient funds, skull damage/reset, pass confidentiality, final-card penalties and simultaneous defeat, both win conditions, CPU's restricted observation, and 1,000 random complete matches. CPU decision functions receive no opponent hand or hidden card values. The local handoff clears the table DOM and requires acknowledgement; dismissing the handoff dialog via Escape is prevented.
