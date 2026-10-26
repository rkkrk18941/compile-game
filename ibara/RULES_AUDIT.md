# Rules audit — board-game edition (2026-10-25)

The game at `/ibara/` now runs on a new engine (`bg/`) that implements *Slay the Spire: The Board Game*:
all four characters, every player card, curse and status card, 58 relics, 20 boss relics, 29 potion cards (21 kinds),
the Neow's Blessing deck, the event decks of Acts I–III, Acts I–IV with their encounters, elites, bosses and summon decks,
the three keys, the unlock boxes (character cards, Colorless, Act IV) and Ascension 1–13, for 1 player or 2–4 players online.
The previous engine (Act I only) and its tests were removed.

This file records where each rule comes from, and the remaining limits of verification. The 2026-10-25 follow-up below supersedes the previous HP estimates.

## Sources

| Source | Used for |
|---|---|
| Rulebook v2.30 reprint (Asmodee, Dec 2025), read through a text extraction | Setup, rounds, rows and targeting, token limits, rewards, merchant, events, keys, Act IV, unlocks, Ascension 1–13 (A13 "Double Act 3 Boss"), FAQ |
| [LuaViper/StSBoardGameMod](https://github.com/LuaViper/StSBoardGameMod) (Java source, read as data) | Card numbers and texts, monster behaviour (the mod's bestiary transcription of the printed cards), events, relic and potion effects, summon decks, Burning Elite (2 Burns), Sapphire key at Elites |
| [LuaViper/StSBoardGame](https://github.com/LuaViper/StSBoardGame) `cards.json` | Card rarity and unlock level of every card |
| [rustywolf/sts](https://rustywolf.github.io/sts/) card scans (Oct 2023 printing) | Relic and potion texts and printed prices, "once per room" relics |
| [Publisher's official Tabletop Simulator module](https://steamcommunity.com/sharedfiles/filedetails/?id=2884027954), release 2023-10-11 | Act I–IV printed card faces; all party HP tables (including A1/A10/A11/A12); summon formations; Nemesis; Shield/Spear footprints and Facing timing. Card pictures take precedence over Lua metadata. |
| [Kenbill Japanese FAQ](https://docs.google.com/document/d/1qMjtJkqXERMqMytuHUu6KnGAd8kMgVyxYSeguUHyGJU/edit), linked by [the Japanese publisher](https://kibidango.com/projects/2313/reports/18012), read 2026-10-25 | Collector/Torchhead timing, Gremlin Leader's summon source, Champ's transition tokens and other Japanese rulings |
| [nkhoit/spire-archive](https://github.com/nkhoit/spire-archive) | Japanese names from the video game's localisation; card, relic, potion and event artwork |

Where sources disagreed, the order of trust was: rulebook → printed scans → the mod's bestiary text → the mod's code.

## Implemented rules (summary)

- **Rounds.** All players gain 3 energy (+relic energy, max 6), keep or lose Block, draw 5, then one shared die is rolled. Die modifiers (Gambling Chip, The Abacus, Toolbox — once per room — and Gambler's Brew) are offered to every holder before die abilities resolve. Everyone plays in any order and ends their turn; the host serialises commands. End of turn: damage effects first (poison, Lightning, powers), then Ethereal, then Block effects, then damage to players (Burn, Decay, Pain, Wrath, Beat of Death), then retain/discard. Enemies act by row, top to bottom; acts-last actions and bosses act after; cubes advance afterwards.
- **Rows.** One row per player. Single-target cards may hit any enemy; area attacks hit one chosen row plus bosses. Enemy attacks hit the player in their row; "AOE" attacks and bosses hit everyone. Elites are placed on the bottom row. Rows may be swapped outside combat. Act IV elite: four rows, Spear spans the top two and Shield the bottom two (one shared HP pool per enemy); players may switch into an unoccupied row after start-of-turn effects, then take the Facing ability in their final row.
- **Tokens and limits.** Block 20, Strength 8 (+1 per HIT), Weak (−1 per HIT, removed one per attack), Vulnerable (×2, removed after each card/attack), Weak and Vulnerable cancel, Poison 30 in total, Shivs 5, Miracles 5, Dark orbs 3, Daze supply 10, Status supply 36. Copies cost 0, retarget, are affected by Weak/Vulnerable separately and cannot be copied.
- **Rewards.** Gold/potion printed on each encounter card, a card reward (3 cards, Golden Ticket reveals the top rare), elite relics, upgraded card rewards from Act II elites, boss gold (3, A10: 2) and a rare reward after Act I/II bosses, a party draft of `players + 1` boss relics (3 solo). Unpicked cards return to the bottom of their decks.
- **Rooms.** Merchant (3 relics with the first discounted by 1, 3 potions, 3 cards per player, 3 Colorless cards when unlocked, one card removal per player for 3 gold, A8: 4), campfire (rest 3 HP, smith, Peace Pipe, Coffee Dripper, Fusion Hammer), treasure (a relic each), events (below), the official map layouts and token pools, Act IV map from the back of the Heart.
- **Keys and Act IV.** Ruby: every player takes no action at a campfire. Sapphire: every player skips the relic at an Elite or Treasure room (relics may be revealed first). Emerald: defeat the Burning Elite (each player shuffles 2 Burns into their deck). With all three keys after Act III the party may enter Act IV (rest, merchant, elite at A11+, Corrupt Heart).
- **Start of later acts.** Heal to full (A6: heal 4), reshuffle each card reward deck, new map, new decks.
- **Unlocks.** Each player checks *bosses defeated + 1* boxes per finished game: own character first (locks after 1, 3 and 4 boxes), then Colorless or Act IV. Ascension *n+1* unlocks after defeating an Act II boss (Act III solo) while playing at your highest unlocked level. The sheet is kept per device; boxes can also be set by hand to match a physical sheet.
- **Ascension 1–13.** Harder elites (A1, A12), −1 max HP, Ascension 3 event cards, 2-potion limit, Ascender's Bane, heal 4 between acts, Ascension 7 encounters and summons, removal cost 4, start damaged, A10 bosses, A11 Heart and Act IV elites, a second different Act III boss (A13).

## Events

Each player chooses one bracketed option and resolves it once (rulebook "Event"); "Pay"/"Give" options need what they ask for, and players can hand gold over first. All Act I–III event cards and the Ascension 3 cards are implemented, with the numbers of the mod's event classes. Hallway Encounter, Merchant Encounter and Dead Adventurer are redrawn when drawn in the first ? room of Act I (floor 2), as their card says.

Interpretations for 2–4 players, where the card text is written for one player:

| Event | Interpretation |
|---|---|
| Lab, Dead Adventurer | One shared die roll; "each player"/"everyone"/"one player" as printed; the host names the "one player" |
| Hallway, Merchant Encounter, Colosseum, Secret Portal | The whole party acts together (vote, host breaks ties) |
| Mind Bloom [I am War] | If anyone chooses it, the whole party fights a random Act I boss; the players who chose it gain a relic |
| Wheel of Change, The Joust, Scrap Ooze, Ominous Forge, Mausoleum | Each player who picks a die option rolls separately; any die modifier holder may modify it |
| Face Trader [Exchange] | Offered only in multiplayer, as described by the event's text |

Excluded: Big Fish's "[Restraint]" option, which exists only in the mod as a joke ("bend the rules a little").

## Primary-source follow-up (2026-10-25)

### Verified and corrected

| Previously uncertain point | Primary evidence and result |
|---|---|
| Act II–IV party HP | Read the official module's actual card faces and `associateEnemyHP`. Replace the multiplication estimates with the printed 1/2/3/4-player tables. `bg/monsters.js` contains all 23 enemy/phase tables; the independently retained transcription is `../tools/fixtures/ibara-official-hp.json`. |
| Colorless and Act IV unlock size | Visually read rulebook v2.30 p.20: Colorless **3 boxes**, Act IV **5 boxes**. Character lock groups are **1, 3, 4 additional boxes** (cumulative thresholds 1, 4, 8). Existing unlock code was correct. |
| Sapphire key rooms | Visually read the icons in rulebook v2.30 p.22: **Elite or Treasure**, all players skip their relic together; revealed relics are discarded. Existing implementation was correct. |
| Nemesis HP-loss prevention | Official card faces 316401 / 317201 / 317301 explicitly tie it to the current cube position. It applies while the cube is on either protected Scythe action, including the Player Turn and Poison; it is not an effect that begins only after the attack. Existing prevention code was correct. |
| Multiplayer summons | Rulebook pp.10–11 plus printed summon boxes and official `associateSummons`: gremlin hallway extras 2 solo / 3 multiplayer; Sentries total 3 per player including the Elite, with alternating summon behaviours; Gremlin Leader 2 per row; Taskmaster 1 Blue + 1 Red per row; Automaton 1 Bronze Orb per row; Awakened One 2 Cultists per row; Collector/Reptomancer refill to 2 minions per row. The Sentry formation now selects the actual matching card rather than an arbitrary shuffled behaviour. |
| Collector summon timing | Kenbill FAQ: freshly summoned Torchheads do not act on that same Enemy Turn; existing action-order snapshot already achieves this. A regression check now verifies the first and second turns. |
| Act IV rows and Facing | Official Shield/Spear cards 288400 / 288500: Spear occupies top 2 rows, Shield bottom 2. Corrected the previous one-row-per-enemy implementation. Four rows remain available at every party size. Each pair displays and targets the same enemy object/HP; it is not two copies. Facing occurs after start-of-turn effects and row switches. |
| Japanese primary rulings | The publisher's FAQ is now read directly. This verifies the rulings above; it does not claim that every Japanese on-card sentence/name has been compared with a physical current printing. |

### HP corrections that change play

Numbers are ordered **1 / 2 / 3 / 4 players**. Other verified linear tables remain explicit in code.

| Enemy and Ascension | Printed HP |
|---|---|
| Taskmaster A0 | 13 / 28 / 42 / 56 |
| Taskmaster A1–11 | 15 / 32 / 48 / 64 |
| Gremlin Nob A1–11 | 17 / 35 / 53 / 70 |
| Gremlin Nob A12+ | 19 / 39 / 61 / 85 |
| Lagavulin A12+ | 24 / 49 / 76 / 105 |
| Book of Stabbing A12+ | 36 / 74 / 118 / 162 |
| Gremlin Leader A12+ | 40 / 82 / 130 / 172 |
| Taskmaster A12+ | 16 / 34 / 56 / 82 |
| Giant Head A12+ | 90 / 185 / 280 / 380 |
| Nemesis A12+ | 36 / 74 / 116 / 162 |
| Reptomancer A12+ | 42 / 90 / 140 / 194 |
| Slime Boss A10+ | 23 / 46 / 68 / 92 |
| Hexaghost A10+ | 38 / 80 / 120 / 160 |

These are the values on the publisher's available **2023-10-11 official release**, not a claim to have inspected every later physical printing. The official workshop change log specifically records the A12/multiplayer HP adjustment in that release.

### Remaining verification limits

- **Sensory Stone's named unlock membership.** Rulebook p.20 says to add the Colorless Events when unlocking Colorless; the official module has Sensory Stone and its Colorless-only rewards. However, the available official face does not show a readable C-lock, and the rulebook does not name the event. Its current inclusion only after Colorless unlock is retained as an **inference**, not relabelled as a directly verified named ruling.
- **Japanese wording.** The official Japanese FAQ was checked; the entire physical Japanese card set was not available for a word-for-word comparison. Display names still mainly follow the video-game localisation.
- This follow-up verifies the previously listed uncertainties and the corrected formations. It is **not a claim that the entire engine is now an exact physical-game reproduction**. For example, the engine currently automates a fixed order of start/end-of-turn abilities instead of letting the party freely order every trigger, and token limits use numeric caps rather than every physical token denomination. The Japanese FAQ describes the latter physical-supply restriction. These existing implementation limits remain separate from the confirmed HP/Nemesis/formation rules above.

### Enemy artwork

33 Act II–IV portraits (including a distinct Mugger) now use **actual official card paintings**, excerpted from the publisher's module. These are original pixels with their printed backgrounds, not generated approximations. Source URLs, card IDs, extraction rectangles and output hashes are in `img/enemies/official-sources.json`. The previous hand-drawn vector enemy module is no longer loaded. Existing official single-piece sprites for Donu, Deca, Spheric Guardian and Dagger remain.

### Reproducible source identity

- Workshop ID: `2884027954`; publisher-labelled “Official Mod”.
- Release: 2023-10-11, v14.08.09.
- Public module: https://cdn.steamusercontent.com/ugc/2106054011649736402/C11DDA95E6C5E389F2A70D9ECBCFBC97433706E8/
- SHA-256 is recorded with the HP fixture and art-source manifest.
- The HP fixture is factual transcription, not executable third-party code. Third-party Lua was read as source and was not executed.
- Network protocol advanced to 4 so clients with the old formations cannot join a new host silently. Existing saves preserve HP/cards; Act IV footprints migrate on load.

## Full data re-audit (2026-10-26)

Every data table was compared again, item by item, with the mod's Java classes (comments stripped) and `cards.json`. Result: **no rule or number deviations were found**; nothing in the engine data had to change.

| Area | What was compared | Result |
|---|---|---|
| Player cards (286) | Base and upgraded cost of every card (266 matched by name, the 20 classes that reuse vanilla string keys read by hand); every damage/Block/number in the base and upgraded text against `baseDamage`/`baseBlock`/`baseMagicNumber` and the `upgrade…()` deltas; rarity and type against `cards.json` | 0 differences. The 8 apparent mismatches were implicit “1”s (Double Tap, Burst, Envenom, Madness) or description-only upgrades (Reinforced Body, Buffer, Burn), all correct. Claw follows `BGClaw` (top discard costs 0 → +1, upgraded +3); `BGClaw2` is an unused alternative. Burn cannot be upgraded (empty `upgrade()`), as in our data. |
| Enemies (62 definitions) | Every action, number, AOE marker, “acts last”, track order and loop point, for each Ascension tier in `Bestiary-Monsters.json`; disputed points in the monster classes | All match. Elite Sentries at A0 use the die (1–3: 2 HIT, 4–6: Dazed) exactly as `BGSentry.dieMove` does (the bestiary text shows the A1 track there). Hexaghost’s Block is a flat 5 (only The Guardian’s is per player). Taskmaster A1+ is 1 HIT, then 2 HIT + Dazed + Strength (`BGTaskmaster`). Spiker Thorns cap at 5 and Beat of Death at 3 (5 at A11), as in the powers. |
| Relics (58 + 20 boss + 2 special) | Deck composition (`AbstractBGRelic` decks), texts, printed prices (`getPrice`) | Composition and texts match (Eternal Feather was removed from the boss deck in the mod too). Prices match for 57 of 58; **Red Skull** is 9 here and 8 in the mod — the value from the printed-card scan used earlier is kept, but it could not be re-checked offline. |
| Potions (21 kinds, 29 cards) | Deck composition (`PotionHelperPatch`), prices, potencies | Identical. |
| Events (42) | Options and numbers against the event classes (e.g. Sensory Stone 1 or 2 rewards, Woman in Blue 2 purchases, Knowing Skull 1 HP per pick up to 2 picks, Golden Wing 2 HP / 2 gold with no damage requirement, Joust bet 2, Bonfire rewards, Winding Halls 2/3, World of Goop 3/2/1, Library 3, Big Fish 2, Beggar 2, Golden Shrine 2/7) | All match. |
| Character abilities | Burning Blood, Ring of the Snake, Cracked Core, Miracles, Loaded Die | Match. |

Interpretation kept (not printed on the cards): in 2–4 player games, Darkling **Regrow** returns a row's dead Darklings while another Darkling of the same row (the same encounter card) is still alive; in solo this is identical to the printed text.

## Removed or not reproduced

- The previous build's tutorial battle was removed together with the old engine; the title screen has a rules summary ("遊び方").
- Optional rules from the rulebook (e.g. "Choose Your Relic") are not offered.

## Tests

```
node tools/ibara-bg-rules-test.cjs          # rules checks + 24 random 1–4 player games through every act
# Browser: CUA preview verified Act II official portraits and Act IV row-switch/Facing; see follow-up work log
node tools/ibara-coop-net-test.cjs          # transport
node tools/ibara-bgm-test.mjs               # music
```
