# GRASP ALL — unofficial browser adaptation

Static Japanese game using the repository’s local Three.js r160 module. CPU or pass-and-play for two people; no network multiplayer. Open `index.html` through an HTTP server. Links back to `../games/`.

## Rule provenance and interpretation

- Original: https://gamemarket.jp/game/173701 (Glory's Works / Lotus; original art by GAI)
- Public rule explanation: https://bodoge.hoobby.net/games/grasp-all/instructions/15191
- Cross-check: https://boadgamekazoku.com/grasp-all/

Confirmed from public explanations: six cards per player, three life, five coins, alternating offers; pass stays hidden; revealed $500/$1000 transfers one/two coins from offerer; skull costs recipient one life and recovers cards; zero life or money loses; final remaining cards penalize their owners.

Not independently verified in an official manual: exact deck multiplicities, recovery of already revealed cards, first player after a recovery, penalty money recipient, simultaneous losses. This version uses $500 x3, $1000 x2, skull x1; full six-card recovery; uninterrupted alternating turns; final-card money paid to the bank; simultaneous defeat is a draw. These interpretations are explicitly disclosed in the in-game rules. Do not describe it as an exact official implementation until the manual is verified.

Original procedurally painted card art, no original game assets redistributed. Currency is fictional, with no payments or real-money betting.

## Verification

`node grasp-all/engine.test.mjs`

Covers transfer amounts, insufficient funds, skull damage/reset, pass confidentiality, final-card penalties and simultaneous defeat, both win conditions, CPU's restricted observation, and 1,000 random complete matches. CPU decision functions receive no opponent hand or hidden card values. The local handoff clears the table DOM and requires acknowledgement; dismissing the handoff dialog via Escape is prevented.

## 3D presentation

Three.js tabletop with walnut rails, green felt, engraved silver coins, ruby life gems, two-sided extruded cards, soft shadows, metallic reflections, and a furnished salon. Card offers and reveals animate in world space. Drag to orbit, pinch/wheel or buttons to zoom; reset view and low-quality mode supported. No remote assets or CDN requests. Browsers without WebGL use a CSS perspective tabletop with the same artwork and interactions. Reduced-motion preference is respected.

The scene only receives the viewer’s allowed hand, opponent hand count, public discards, public resources, and the offered card after reveal. Local handoff removes all scene pieces and hides the whole stage.

Presentation checks: CPU skull reveal, local money transfer, handoff with zero visible card elements, and 390×844 mobile layout verified in-browser. Three.js scene construction, finite geometry and default-camera hand framing at desktop/mobile sizes were checked with a stub renderer; the cloud QA browser disables WebGL, so GPU appearance and performance require a WebGL-capable device. The CSS 3D compatibility renderer was visually verified.
