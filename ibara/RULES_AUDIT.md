# Rules audit — board-game edition (2026-10-25)

The game at `/ibara/` now runs on a new engine (`bg/`) that implements *Slay the Spire: The Board Game*:
all four characters, every player card, curse and status card, 58 relics, 20 boss relics, 29 potion cards (21 kinds),
the Neow's Blessing deck, the event decks of Acts I–III, Acts I–IV with their encounters, elites, bosses and summon decks,
the three keys, the unlock boxes (character cards, Colorless, Act IV) and Ascension 1–13, for 1 player or 2–4 players online.
The previous engine (Act I only) and its tests were removed.

This file records where each rule comes from, and every point that could not be confirmed against a primary source.

## Sources

| Source | Used for |
|---|---|
| Rulebook v2.30 reprint (Asmodee, Dec 2025), read through a text extraction | Setup, rounds, rows and targeting, token limits, rewards, merchant, events, keys, Act IV, unlocks, Ascension 1–13 (A13 "Double Act 3 Boss"), FAQ |
| [LuaViper/StSBoardGameMod](https://github.com/LuaViper/StSBoardGameMod) (Java source, read as data) | Card numbers and texts, monster behaviour (the mod's bestiary transcription of the printed cards), events, relic and potion effects, summon decks, Burning Elite (2 Burns), Sapphire key at Elites |
| [LuaViper/StSBoardGame](https://github.com/LuaViper/StSBoardGame) `cards.json` | Card rarity and unlock level of every card |
| [rustywolf/sts](https://rustywolf.github.io/sts/) card scans (Oct 2023 printing) | Relic and potion texts and printed prices, "once per room" relics |
| Publisher's Tabletop Simulator module (2023, archived data from the previous build) | Act I party-size HP tables (Nob, Lagavulin, Slime Boss, Hexaghost, Guardian) and gremlin team sizes |
| [nkhoit/spire-archive](https://github.com/nkhoit/spire-archive) | Japanese names from the video game's localisation; card, relic, potion and event artwork |

Where sources disagreed, the order of trust was: rulebook → printed scans → the mod's bestiary text → the mod's code.

## Implemented rules (summary)

- **Rounds.** All players gain 3 energy (+relic energy, max 6), keep or lose Block, draw 5, then one shared die is rolled. Die modifiers (Gambling Chip, The Abacus, Toolbox — once per room — and Gambler's Brew) are offered to every holder before die abilities resolve. Everyone plays in any order and ends their turn; the host serialises commands. End of turn: damage effects first (poison, Lightning, powers), then Ethereal, then Block effects, then damage to players (Burn, Decay, Pain, Wrath, Beat of Death), then retain/discard. Enemies act by row, top to bottom; acts-last actions and bosses act after; cubes advance afterwards.
- **Rows.** One row per player. Single-target cards may hit any enemy; area attacks hit one chosen row plus bosses. Enemy attacks hit the player in their row; "AOE" attacks and bosses hit everyone. Elites are placed on the bottom row. Rows may be swapped outside combat. Act IV elite: `max(2, players)` rows, players may switch rows (empty rows included) after start-of-turn effects, then take the Facing ability of the enemy in their row.
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

## Points not confirmed by a primary source

- **Party-size HP of Act II–IV elites and bosses.** Only the Act I tables were available. These enemies use the printed one-player HP × number of players. Hexaghost at Ascension 10: the party table + 2 per player.
- **Colorless unlock size.** 3 boxes (Act IV: 5) — the box counts could not be read from the extracted rulebook text.
- **Sapphire key rooms.** The extracted rulebook text has the room icons missing; Elite and Treasure follow the mod and the optional "Choose Your Relic" rule. A third-party transcription reads "Treasure or Merchant".
- **Nemesis** "can't lose HP this turn" is applied while its cube is on a Scythe box (the players' turn before it attacks).
- **Sensory Stone** is added to the Act III deck only with the Colorless unlock.
- **Summons in multiplayer** (gremlin teams, sentries, slaver pairs, Collector/Reptomancer minions) are created per row as listed in `bg/monsters.js`.
- **Current Japanese printing.** Japanese text uses the video game's localisation terms; the Japanese board-game edition's own wording was not available.

## Removed or not reproduced

- The previous build's tutorial battle was removed together with the old engine; the title screen has a rules summary ("遊び方").
- Optional rules from the rulebook (e.g. "Choose Your Relic") are not offered.

## Tests

```
node tools/ibara-bg-rules-test.cjs          # rules checks + 24 random 1–4 player games through every act
node tools/ibara-bg-browser-check.cjs       # tap-through solo Act I, resume, 3-tab online game (Playwright)
node tools/ibara-coop-net-test.cjs          # transport
node tools/ibara-bgm-test.mjs               # music
```
