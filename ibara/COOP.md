# Cooperative adventure: shared rounds

Open https://rkkrk18941.github.io/compile-game/ibara/ and choose 「オンライン協力 · 最大4人」.
The roster accepts 2–4 different characters. The transport is kept separate from the rules engine.

This is an incomplete migration toward the official board-game rules, **not a complete official implementation**.
See [RULES_AUDIT.md](RULES_AUDIT.md) for sources, implemented behavior, and outstanding gaps.
The title screen and instructions disclose this limitation.

## Current behavior

- Each player resolves a blessing before the first encounter.
- Players have individual decks, HP, energy, hands, rewards, relics and potions.
- Encounter cards are drawn separately for each row. Elites occupy one shared encounter; their setup may place summons across all rows. Bosses use their printed party-size HP tables.
- Every round resets/draws all players, rolls one shared die, then opens play to everybody. The host serializes commands; there is no private enemy phase after each player.
- Each player can signal completion and cancel that signal until everyone is done.
- End-of-turn effects can be resolved in a chosen order across all players, followed by hand discard. Poison is one shared effect, not one effect per player. Ethereal/Dark Embrace draws follow the rulebook exception.
- Enemies act by row, from top to bottom, left to right. Conditional acts-last actions and bosses follow normal enemies. Normal attacks target the player in the enemy's row; area attacks target all players. Enemy Strength/Block gains occur once.
- Any player's death defeats the party immediately. A real Fairy potion can prevent death. The old support action and automatic revival are removed.
- Common relic, boss-relic, potion and encounter decks are shared. The merchant has shared relics/potions and individual card offers; a sold item cannot be bought again through an older prompt.
- Stable checkpoints are stored under `ibara.coop.run.v2`. Old v1 records are left intact and are not resumed under the new rules. Solo records use `ibara.run.v2` independently.

The host validates player ownership, canonical card references, current revisions and legal targets.
Reconnects retain a per-tab credential in sessionStorage. Disconnected seats remain reserved.
Only returning participants may reconnect during an adventure. All players wait for connections to return.
A map checkpoint can be rehosted with the same party, reordered so the new host's hero is first.

PeerJS 1.5.5 is bundled under its MIT license. There is no configured paid TURN relay.
Local four-client tests use BroadcastChannel. Simulated PeerJS tests cover connection isolation and reconnects.
A real Internet connection between independent remote networks has not been verified here.

## Validation

```
node tools/ibara-coop-test.cjs
node tools/ibara-coop-room-test.cjs
node tools/ibara-coop-ui-test.cjs
node tools/ibara-coop-net-test.cjs
node tools/ibara-bgm-test.mjs
node --experimental-vm-modules tools/game-bgm-test.mjs
node tools/recorded-player-test.mjs
node tools/ibara-glossary-test.cjs
```

The transport test still exercises five guest channels to verify channel isolation; the game roster itself is capped at four players.
