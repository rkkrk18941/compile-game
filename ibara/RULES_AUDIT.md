# Official-rule migration audit — 2026-10-24

**Status: incomplete. This build must not be described as fully identical to the official game.**
The requested outcome includes solo and cooperative play, cards, enemies, events, items, maps and progression. Changing only the multiplayer turn order does not satisfy that outcome.

## Sources and edition boundary

1. [Rulebook v2.30, official distributor PDF](https://cdn.svc.asmodee.net/production-asmodeeca/uploads/2025/12/Slay_the_Spire_-_Rulebook_v2.30_Reprint_Web.pdf). The 24-page rulebook is the primary source for setup, shared rounds, targeting, token limits, timing, merchant, rewards, progression and FAQs.
2. [Contention Games' public rulebook](https://contentiongames.com/_images/STS_KS_Rulebook.pdf). Earlier publisher PDF, used for comparison.
3. [Contention Games' official Tabletop Simulator module](https://steamcommunity.com/sharedfiles/filedetails/?id=2884027954). Downloaded through Steam's published-file API; embedded card sheets and Lua tables were inspected as data. The workshop file was last updated **2023-10-11**. Act I encounter mechanics in `data/board-act1.js` come from this archived publisher version. This does **not** establish that every card matches the current printing. The source/edition flag is exposed as `IBARA.BOARD_DATA_SOURCE.currentEditionVerified = false`.
4. [Community card-scan library](https://rustywolf.github.io/sts/). Used to inspect base/upgraded Bash, Twin Strike, Shrug It Off, Pommel Strike, Flame Barrier, Second Wind, Immolate, Neutralize, Survivor, Zap, Eruption and Vigilance. It is not an official maintained API or an edition guarantee.
5. [Official companion application](https://contentiongames.com/sts-app/), including the current card library. Its full current data was not available as a public structured export in this session. The Japanese publisher's PDF/FAQ endpoints returned 503/502 responses. Current-edition Japanese text and errata are therefore **not fully verified**.

No card-image sheets or TTS scripts are executed or redistributed by the website. The supplemental file contains mechanical data and concise effect descriptions.

## Implemented and tested

| Area | Behavior in this build | Evidence |
|---|---|---|
| Party | 1-player engine; online 2–4; unique characters | Rulebook p4; core/room/UI tests |
| Solo setup | Gold 2 + Loaded Die; character ability separated from inventory | Rulebook p4; core and solo-loop tests |
| Shared rounds | All players reset/draw before one die; everyone can play in any order; one enemy phase after everyone finishes | Rulebook p12–13; 1–4-player core and four-client UI tests |
| Die modifiers | Shared result; players choose which modifier holder acts next | Rulebook p12; canonical die-response checks |
| End effects | Chosen order across players, including poison, orbs, Wrath, powers and Ethereal; immediate victory can stop remaining effects | Rulebook p12,18; lethal-poison-before-Wrath test |
| Ethereal | Cards drawn by Dark Embrace during Ethereal exhaustion ignore that turn's end effects, Ethereal and discard | Rulebook p18; explicit FAQ test |
| Targeting | Any single enemy; AoE affects one chosen row plus boss; enemy row and area attacks routed separately | Rulebook p14–15,24; row/AoE and multi-hit tests |
| Enemy timing | Top row first; stable left-to-right; conditional acts-last; boss last; cubes after actions | Rulebook p13; shared engine |
| Defeat | One hero at zero ends the run; actual Fairy prevention retained; invented support/revival removed | Rulebook defeat condition; core tests |
| Limits | Daze supply 10; combined Status supply 36; status cards returned on Exhaust; poison 30 total; Shiv/Miracle supply 5 | Rulebook p3,16–18,24; supply tests |
| X | Player chooses energy paid, including zero, with immediate Miracle payment supported | Rulebook card-cost rules; X=0 test |
| Hand memory | Retain/cost-modifier state removed when a card leaves hand | Rulebook p18; memory test |
| Frost | End effect Block 1; Evoke Block 1 | Publisher's Defect board; mechanics/glossary corrected |
| Act I enemies | Four first encounters, 12 encounters, three elites, three bosses and their 35-card summon supply represented using archived publisher mechanics | TTS sheets and HP/reward Lua tables; 1–4-player traversal tests |
| Enemy HP | Printed party-size tables, including Hexaghost 36/75/112/150; ordinary row enemies do not receive a global HP multiplier | Archived publisher cards; HP table tests |
| Slime Boss | No half-HP split; death reserves Large/Acid/Spike summons for every row at the next round; pending summons prevent premature victory | Archived publisher card; delayed-summon test |
| Card corrections | Bash+ 4 damage/1 Vulnerable; Twin Strike+ two hits of 2; Shrug draws; Pommel 2 damage/draw 1 or 2; Neutralize+ 2 damage/1 Weak; Vigilance can shield any player; Flame Barrier uses intended hits; Immolate/Second Wind separated | Inspected base/upgraded scans; behavior tests |
| Shared supplies | Common item/encounter decks shared; shared merchant item offers cannot be double-purchased | Host-authoritative core |
| Saves | v2 keys avoid resuming incompatible v1 runs; guest checkpoint preserves shared supply on restore | Checkpoint and four-client UI tests |

The simulation traverses the **first act only**, with 1, 2, 3 and 4 heroes, and extra HP so the test verifies transitions rather than balance. It does not prove that the game content is fully official.

## Work still required for complete equivalence

| Area | Remaining gap |
|---|---|
| Current-edition content audit | Verify the archived 2023 enemy data against current English/Japanese printing and errata. Verify translations and all effect text. |
| Player cards | The current registry has 168 definitions, including Status/Curse and a legacy alias. Many are still original effects assigned to official names. The rulebook lists 381 physical player cards including unlocks; physical-card count is not a count of unique definitions. Every normal/upgraded card and deck multiplicity still needs a manifest and effect audit. |
| Trigger/copy semantics | Full deferred card-trigger queue; copy selection/retargeting and counting; free-play interactions; all card-specific exceptions. Start effects still run in a fixed per-player order, whereas official players may order the individual effects. |
| Events and Neow | The 12 current event definitions and 12 blessings remain original approximations. Replace them with the actual event/blessing decks and all shared-event exceptions. The base rulebook lists 14 blessings before unlocks. |
| Relics, potions, curses | Only 32 ordinary relics, 10 boss relics and 17 potions are currently defined; the rulebook lists 58 ordinary relics, 20 boss relics and 29 potions. Replace approximations, complete physical multiplicities, Curse deck, finite gold/status supplies and item exceptions. |
| Rewards | Reveal all rewards before committing choices; allow arbitrary order and skip; correctly retain/return physical cards; party-wide boss relic draft of n+1 (solo 3). Current boss victory ends the first-act demo without this complete draft/progression. |
| Merchant | Allow paying another player's costs; current-edition price/effect audit; colorless offers and unlocks; all shared-offer refresh behavior. |
| Position and item management | Choose/switch rows between combats; transfer potions outside combat; complete potion use timing and full-inventory options. |
| Maps | Replace generated maps/token bags with exact official maps and physical token counts. |
| Acts II–IV | Enemy/event/map data, act transitions, full healing, reward-deck resets, keys, Act IV, all bosses and endings remain unimplemented. The current game ends after Act I. |
| Unlocks and difficulty | Character/colorless/Act IV unlock packs, progress, Ascensions 1–13, achievements and official optional rules are not complete. |
| Compatibility | v1 saves remain stored but are intentionally not migrated into different rules. |
| Online acceptance | Four isolated local UI clients and simulated PeerJS pass. Actual cross-network WebRTC still needs an end-to-end acceptance check. |

Do not remove the title-screen migration notice or mark this checklist complete based on passing the present tests. Full equivalence requires closing the content/progression gaps and testing the corresponding actual rules.
