# Original-edition component artwork

The development-card faces, nobles and gem-token illustrations use the original
2014 edition of Splendor. Artwork © SPACE Cowboys / Asmodee, Pascal Quidault.
This remains an unofficial personal browser implementation.

## Sources

- **90 development cards:** the perspective-corrected photographs at
  https://github.com/anicolao/splendor (the two `PXL_20260304_*.jpg` photographs).
  The extraction pipeline validated all 90 cards' coloured badges and printed
  cost/prestige numerals. `card-map.json` records the exact source photo card and
  printed properties for every engine ID. Each complete card face is preserved,
  including the original artwork, bonus, prestige and costs.
- **10 nobles:** the embedded 649 × 663 component images on page 3 of
  https://themindcafe.sg/wp-content/uploads/2018/05/Splendor.pdf
  (Chris Conboy / Liumas, Splendor Brief, May 2014).
  `noble-map.json` records each portrait and its printed requirements.
- **6 token types and gem emblems:** original component illustrations in the
  published rulebook, page 2:
  https://boardgamechamps.com/wp-content/uploads/2025/01/ba-splendor-rulebook.pdf
  (also https://cdn.1j1ju.com/medias/7f/91/ba-splendor-rulebook.pdf).
  The token crops retain the coloured rim, printed gem face and visible thickness.

## Packing

- `cards-classic.webp`: 10 columns × 9 rows, 252 × 352 per card, ordered by engine ID.
- `cards/0.webp` … `cards/89.webp`: individual crops from the card atlas,
  used during play to avoid downloading / decoding all 90 faces for one board.
- `nobles-classic.webp`: 5 columns × 2 rows, 320 × 327 per noble, ordered by engine ID.
- `chip-0.webp` … `chip-5.webp`: 224 × 224 transparent canvases, with the printed
  component's proportions retained rather than stretching the photographed token.
- `gem-0.webp` … `gem-5.webp`: 128 × 128 emblems from the same printed illustrations.

The printed illustration is overlaid with high-contrast engine-generated costs
(horizontal coloured circles, colour name and count), prestige and bonus. These remain usable if an illustration
fails to load. Existing accessible labels,
tap targets, affordability badges and card-detail dialogs still use engine data.
The deck backs keep the app's symbolic level/count display, with the original
green / yellow-gold / blue level colours.

Validation: `node tools/splendor-art-test.cjs` and
`node tools/splendor-rules-test.mjs`.

## Illustrated game skin (2026-10-31)

The active game uses `toon/buildings.webp` (5 bonus colours × 3 tiers),
`toon/nobles.webp` (5 × 2 characters), `toon/panel-gold.webp`,
`toon/table-blue.webp`, `toon/decks.webp` and cropped `toon/avatar-*.webp`.
These are original generated raster assets following the user-provided mobile
board-game reference. Visible points, costs, bonuses and noble requirements
always come from the unchanged engine. The older complete printed faces remain
available in the source archive but are not drawn by the illustrated skin.
Original gem cutouts remain in use inside coloured token controls.

`toon/star.svg` is Font Awesome Free 6.7.2 by Fonticons, Inc., CC BY 4.0:
https://github.com/FortAwesome/Font-Awesome/blob/6.x/svgs/solid/star.svg
https://fontawesome.com/license/free
