# Online cooperative adventure

Open the existing game URL and choose 「オンライン協力 · 最大6人」.
Choose a name and hero, create a room, and share its four-character code or invitation link.
Up to five guests join with their own heroes. The host starts the adventure.

Each player has their own HP, deck, relics, potions and rewards. All heroes share enemy HP and statuses.
The heroes alternate full turns; after each turn enemies target the hero who just acted.
Enemy base HP is multiplied by 1 + 0.7 × (party size − 1), with split offspring preserving the parent's remaining HP.
Support costs one energy, once per turn, and adds three block to a selected ally’s next turn.
A fallen hero is skipped, and revives at one HP if the other hero wins. The run ends when everyone falls.
The route leader alternates after each room. Other heroes can propose the next room.
Shops, campfires, treasure, events and card rewards are resolved for each hero separately.
Co-op starts without the solo blessing. The first act is available, as in solo mode.

The host alone runs the rules engine. Guest commands are checked against turn ownership,
current revision, allowed targets and canonical card references. Duplicate requests are ignored.
Choice prompts are owned by their player and remain available while the other player is choosing.
Room reconnects use a per-tab random credential, retained in sessionStorage, to keep the guest slot.
The transport uses the bundled MIT-licensed PeerJS 1.5.5 client and the public PeerJS signaling server.
Its default WebRTC connection may be restricted by some mobile or enterprise networks; no paid relay is configured.
`?net=local` selects a BroadcastChannel transport for deterministic multi-tab checks only.

Co-op saves use `ibara.coop.run.v1`, separate from `ibara.run.v1`.
A stable checkpoint is saved on all players’ browsers at each map boundary.
Guest copies are reordered so either player can host the next session with their own hero first.
Transient disconnects keep the host's in-memory battle and prompts and allow rejoining the same room.
Closing/reloading the host requires making a new room from the last checkpoint, before entering the current room.
Co-op does not provide account-based cloud saves or background hosting.

Validation:

```
node tools/ibara-coop-test.cjs
node tools/ibara-coop-net-test.cjs
node tools/ibara-coop-room-test.cjs
node tools/ibara-coop-ui-test.cjs
node tools/ibara-bgm-test.mjs
node --experimental-vm-modules tools/game-bgm-test.mjs
node tools/recorded-player-test.mjs
node tools/ibara-glossary-test.cjs
```

Rooms accept 2–6 players before starting. An in-progress run keeps its original party size; only returning participants can join. Disconnected seats retain their credentials; all players wait until connections are restored. At a map checkpoint, any participant can create a new room to resume with the same number of heroes. Legacy two-player checkpoints remain supported. Room rosters never broadcast reconnect credentials.
