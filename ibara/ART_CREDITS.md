# Artwork sources

Slay the Spire characters, card illustrations, card frames, enemy sprites, relic and potion images, event paintings and
promotional artwork are by Mega Crit and their respective artists. This is an unofficial fan implementation of the
board game's rules.

- Card portraits, card frames, cost orbs, relic, potion and event images: https://github.com/nkhoit/spire-archive
  (commit 4e6b0e040ccd00eb04fb1ab7fb0b298c222d2f29, STS1 data). Cards are composed into `img/c/*.webp` (frame + portrait);
  names, costs and texts are drawn by the page so that upgrades and cost changes stay correct.
  The 149 matching card composites were restored byte-for-byte from this repository's `fc41401` presentation;
  cards added after that version retain their current portraits with the restored card proportions and circular costs.
- Act I enemy sprites and character portraits: rendered by https://dood.gg/en/slay-the-spire/ (retrieved 2026-10-23).
  The Red Slaver is the Blue Slaver sprite recoloured (the same model in the video game).
- Donu, Deca, Spheric Guardian and Snake Dagger: single parts cut from the video game's texture atlases in spire-archive.
- Loaded Die and Miracle icons: LuaViper/StSBoardGameMod resources.
- 33 Act II–IV enemy portraits, plus the distinct Mugger: actual printed enemy-card paintings from
  [Contention Games' official Tabletop Simulator module](https://steamcommunity.com/sharedfiles/filedetails/?id=2884027954)
  (release 2023-10-11). They retain their original painted backgrounds in rectangular portrait excerpts.
  These are **official artwork**, not redrawn or AI-generated replacements. Every source sheet, card ID, crop and
  output hash is listed in `img/enemies/official-sources.json`.
- The previous vector illustrations in `bg/monster-art.js` are no longer used.
- The Golden Ticket card picture is an original drawing.
- Title artwork: Steam, app 646570. Music: see `../assets/bgm`.
- Battle hall and reward chest: generated bitmap artwork from the presentation update of 2026-10-23.

## Rendering/provenance check (2026-10-26)

All 62 registered enemy definitions resolve to existing image assets. The 33 official-card excerpts match every SHA-256 in the extraction manifest. This confirms the checked-in files still match the recorded extraction outputs; it does not make every displayed enemy an unmodified video-game sprite. The current renderer mixes video-game-derived still images, texture-atlas excerpts and printed board-game card excerpts. Red Slaver remains a recoloured Blue Slaver. Animation, crop, pose and on-screen presentation are not a pixel-identical recreation of the original game.

## Downfall expansion (work in progress, 2026-10-29)

Source: Contention Games' official **Slay the Spire: TBG – Downfall Public Playtesting** Tabletop Simulator module
(Steam Workshop 3687082014, saved 2026-07-23; see `DOWNFALL_WORKLOG.md` for the file hash) and the Downfall rulebook
v1.47 inside it.

- Downfall card pictures (`img/c/*` for the Slime Boss and The Hermit): the painting window of each printed card face of
  that module, composed into the same card frames as the base cards (spire-archive frames above). Names, costs and
  texts are drawn by the page.
- The Hermit portrait (`img/heroes/hermit.webp`, `img/hermit-select.webp`, `img/enemies/hermit-boss.webp`) and the
  Corrupted Shard icon: cut from the rulebook v1.47 illustrations (p.6, p.7); the Boss version is mirrored and enlarged.
- The Slime Boss, Guardian and Hexaghost portraits and selection pictures: mirrored crops of the Act I enemy sprites
  listed above (the same characters); selection backgrounds are generated glows.
- Downfall energy orbs: hue-shifted copies of the base orbs. Ability icons: crops of the portraits above.
