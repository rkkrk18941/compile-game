# GRASP ALL — unofficial browser adaptation

Static Japanese game using the repository’s local Three.js r160 module. CPU or pass-and-play for two people; no network multiplayer. Open `index.html` through an HTTP server. Links back to `../games/`.

## Rule provenance and interpretation

- Original: https://gamemarket.jp/game/173701 (Glory's Works / Lotus; original art by GAI)
- Public rule explanation: https://bodoge.hoobby.net/games/grasp-all/instructions/15191
- Cross-check: https://boadgamekazoku.com/grasp-all/

Confirmed from public explanations: six cards per player, three life, five coins, alternating offers; pass stays hidden; revealed money cards transfer one/two coins from offerer; skull costs recipient one life and recovers cards; zero life or money loses; final remaining cards penalize their owners.

Not independently verified in an official manual: exact deck multiplicities, recovery of already revealed cards, first player after a recovery, penalty money recipient, simultaneous losses. This version uses $100 x3, $200 x2, skull x1 (one coin = $100, `COIN_VALUE` in `engine.mjs`); full six-card recovery; uninterrupted alternating turns; final-card money paid to the bank; simultaneous defeat is a draw. These interpretations are explicitly disclosed in the in-game rules. Do not describe it as an exact official implementation until the manual is verified.

Original procedurally painted card art, no original game assets redistributed. Currency is fictional, with no payments or real-money betting.

## Verification

`node grasp-all/engine.test.mjs`

Covers transfer amounts, insufficient funds, skull damage/reset, pass confidentiality, final-card penalties and simultaneous defeat, both win conditions, CPU's restricted observation, and 1,000 random complete matches. CPU decision functions receive no opponent hand or hidden card values. The local handoff clears the table DOM and requires acknowledgement; dismissing the handoff dialog via Escape is prevented.

## 3D presentation

Three.js tabletop with walnut rails, green felt, engraved silver coins, ruby life gems, two-sided extruded cards, soft shadows, metallic reflections, and a furnished salon. Card offers and reveals animate in world space. Drag to orbit, pinch/wheel or buttons to zoom; reset view and low-quality mode supported. No remote assets or CDN requests. Browsers without WebGL use a CSS perspective tabletop with the same artwork and interactions. Reduced-motion preference is respected.

The scene only receives the viewer’s allowed hand, opponent hand count, public discards, public resources, and the offered card after reveal. Local handoff removes all scene pieces and hides the whole stage.

Layout: the canvas fills the screen below the header; `app.mjs` measures the area the HUD/speech bubble and the control panel leave free and passes it to the renderer (`setInsets`), which fits the playing area into it with a camera view offset (taller screens get a slightly more top-down default view). The control panel keeps a fixed height so the table does not jump between phases. Phones in landscape get a side panel.

Card faces are separate planes placed just outside the extruded card body (which is ±0.019 thick including the bevel); keep them outside or the body caps hide the artwork.

Presentation checks: WebGL rendering verified in headless Chrome with SwiftShader at 390×844, 390×664, 844×390, 768×1024 and 1280×800 (card faces, skull reveal, coin transfer, crowded discard piles), plus the CSS 3D compatibility renderer at the same sizes and the local handoff screens.
