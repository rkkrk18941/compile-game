# Clean containment edition

B1 always uses yellow architecture and wallpaper. All rooms begin with steady lighting. Fluorescent hum is quieter and has independent enable/volume controls. Surfaces are maintained; wall, floor and ceiling modules are authored in Blender.

Six special-forces kits: Shino pistol 15 / 7s; Minato rifle 45 / 50s; Kagura three bomb types / 180s independently; Rei sniper 5 / 24s; Gou shotgun 8 / 20s with shield; Haruka pistol 10 / 12s with medical supply 45s and revival supply 120s. Co-op roles are unique unless the host enables duplicates. Survival mode has three firearms and one common ammunition pool. Backpack explains the five consumables and firearms; no stamina boosts are dropped.

Discovery hunters remain slow or stationary until provoked or detected, survive their first dormant hit, and vary their active approach. Mimics appear at least 18m from the copied player, copy that operator and name, approach other players and maintain a feeding restraint until killed. Seventeen creature rigs and six operators have new Blender-authored meshes and editable `.blend` sources.

Blue zones have supplies and restraint/slow traps with loud alarms; their hunters cannot leave. Red zones have no traps and denser monster populations. Every colour has downstairs entrances, increasing yellow < blue < red < black. B2 and below have connected sloped terrain and local pools of varied depths. Floors can continue beyond B5 while preserving the original extraction objective.

Bullets subtract local geometry from walls, pillars and furniture shells. Floor and ceiling impacts also create local apertures. Large openings permit passage, and holes remain on revisits. Timed explosives accept 5–120s fuses, remote explosives have an explicit detonation control, and thrown explosives display a trajectory and detonate on contact. Placed bombs detonate when shot. Aiming cancellation consumes neither a bomb nor its cooldown.

## Rebuild and validation

- `npm ci`
- `node tools/noclip/regression.mjs`
- `npm run build:noclip`
- Blender assets: `blender -b -P tools/blender/containment.py -- REPO`, then `blender -b -P tools/blender/containment-rooms.py -- REPO`.

The regression suite covers generation, exit ordering, loot, kit stats, reservations, dormant defence, geometry subtraction, Rapier wall restoration, model decoding, joint animation and integrated game-system updates. Browser preview infrastructure was unavailable. GPU/mobile rendering and live multi-device co-op still require browser testing. These models are an initial anatomy pass; reference-level photorealism and realistic motion remain unfinished.
