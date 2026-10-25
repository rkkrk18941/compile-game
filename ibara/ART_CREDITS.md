# Artwork sources

Slay the Spire characters, card illustrations, card frames, enemy sprites, relic and potion images, event paintings and
promotional artwork are by Mega Crit and their respective artists. This is an unofficial fan implementation of the
board game's rules.

- Card portraits, card frames, cost orbs, relic, potion and event images: https://github.com/nkhoit/spire-archive
  (commit 4e6b0e040ccd00eb04fb1ab7fb0b298c222d2f29, STS1 data). Cards are composed into `img/c/*.webp` (frame + portrait);
  names, costs and texts are drawn by the page so that upgrades and cost changes stay correct.
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
