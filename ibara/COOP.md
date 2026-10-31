# Online co-op (2–4 players)

Open https://rkkrk18941.github.io/compile-game/ibara/ and choose 「オンライン協力（2〜4人）」.
One player creates a room and tells the others the 4-letter code. When the host starts, everyone picks a character;
the same character may be chosen by several players (each keeps their own deck, card rewards and unlock level).

- The host's browser runs the rules engine (`bg/engine.js`, `bg/combat.js`). Guests receive the whole game state
  after each change and send only their answers and commands; the host checks that every answer belongs to the
  sender's seat (`bg/session.js`).
- Everybody plays the shared round at the same time: play cards in any order, end the turn, cancel while others are
  still playing. Map moves, group events and key decisions are votes (the host breaks ties).
- Information is open, as at the table: tap another player to see their hand, piles, powers and relics.
- Gold can be handed to another player outside combat, at the merchant and during events.
- Saves: the host's checkpoint is kept in `ibara.bg.coop.v3`; 「協力プレイを再開」 re-opens the same room code and
  players reconnect with 「部屋 XXXX に再接続」. Solo games use `ibara.bg.save.v3`.
- Unlock progress stays on each player's device. The host's sheet decides Ascension, Colorless and Act IV; each player
  brings the card unlock level of their own character.

Transport: PeerJS 1.5.5 (bundled, MIT) through the public PeerJS server; `?net=local` uses BroadcastChannel between tabs
for testing. There is no TURN relay, so some restrictive networks cannot connect.

Validation: `node tools/ibara-bg-browser-check.cjs` (three tabs) and `node tools/ibara-coop-net-test.cjs`.

## Official-data follow-up (2026-10-25)

Protocol 4 uses verified party HP tables, alternating Sentry summon cards and the four-row Act IV formation.
Spire Spear shares one HP pool across rows 1–2; Spire Shield shares one across rows 3–4.
Existing Act IV combat saves migrate the row footprints without changing HP or cards.
See RULES_AUDIT.md for exact sources, verification scope and remaining limits.

## Same character for several players (2026-10-31)

Protocol 8: any character can be chosen in online co-op, including one another player already chose (all four may
play the Defect, for example). Each player still has their own deck, card reward and rare decks, potions, relics and
card unlock level; Downfall Boss candidates exclude every character in the party, as before. Hosts and guests on
protocol 7 are asked to reload. Checks: `node tools/ibara-character-draft-test.cjs`, `node tools/ibara-bg-rules-test.cjs`
and `node tools/ibara-same-character-browser-check.cjs` (three tabs choosing the same character).
