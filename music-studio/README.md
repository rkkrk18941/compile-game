# NOTE / Music Studio

Public URL: https://rkkrk18941.github.io/compile-game/music-studio/

AI writes a symbolic score; this app plays and edits it. No AI inference, remote API, audio samples, account or paid dependency is used by the music editor. Synthesis and WAV conversion run on the visitor's device. Scores are autosaved in that browser and can be exported as JSON for backup or to request changes from an AI.

## Score format

```json
{
  "version": 1,
  "title": "My BGM",
  "tempo": 100,
  "beatsPerBar": 4,
  "bars": 8,
  "tracks": [
    {
      "name": "Melody",
      "instrument": "piano",
      "volume": 0.65,
      "pan": 0,
      "notes": [{"pitch": "C4", "beat": 0, "duration": 1, "velocity": 0.75}]
    }
  ]
}
```

`beat` and `duration` are quarter-note beats, measured from the start of the song. MIDI pitches (0–127) and note names (`C4`, `Bb3`, `F#5`) are accepted. `C4` is MIDI 60. Notes must fit inside `bars * beatsPerBar`. Instruments: `piano`, `bell`, `pluck`, `pad`, `strings`, `bass`, `lead`, `chip`, `drums`. These are synthesized instrument approximations, not recorded acoustic samples.

Drum mapping: 36 kick, 38 snare, 42 closed hi-hat, 46 open hi-hat, 49 crash, 45/47/50 toms. Other drum pitches use noise percussion.

Compact notes may be arrays: `["C4", 0, 1, 0.75]`. Repeated phrases can use `patterns` alongside or instead of `notes`:

```json
{"at":0,"length":4,"repeat":8,"notes":[["C3",0,1,0.7],["G3",2,1,0.6]]}
```

Within a pattern, note beats are relative to each repetition; `at` is the initial global beat. Import expands patterns to editable notes. Export writes expanded notes for compatibility.

Limits: 30–240 BPM, 1–128 bars, 1–7 quarter-note beats per bar, 1–12 tracks, 20,000 notes total, duration at most 180 seconds. WAV export is 16-bit, 22,050Hz stereo with the release tail folded into the beginning for a fixed-length loop. MIDI export uses General MIDI approximations; sound differs between MIDI players.

## Editing

Select a part and bar. Tap empty piano-roll cells to insert notes; tap notes to edit pitch, global beat, duration and velocity. Eraser removes tapped notes. Copy/paste replaces notes beginning in the selected bar. Undo restores changes, including importing a new score. Switching away from the browser pauses playback. MIDI and WAV include audible tracks only, honoring mute and solo; JSON retains all tracks.

## Hosting and testing

Buildless ES modules, served over HTTP(S). Keep this folder beside `games/`, not inside the board-game shelf. Do not replace the repository root `index.html`, which is the existing COMPILE game.

The shelf's common settings service is a separate Sites project, `playroom-settings`, with server-side password verification and conditional R2 storage. No admin password or token is included in this repository. Settings use password headers over HTTPS, are not saved in browser storage, and can be changed in the settings dialog. Hidden games remain reachable through their direct URLs.
