# Audio and parent markers

- Open **効果音・BGMの設定** from the title or the game menu.
- Four card sounds: felt (default), soft paper, wood and a quiet chime.
  Card voices have 12–14ms attacks, low-pass filtered noise and small peaks.
  Effects share a volume bus, high-frequency rolloff and a compressor. The
  old unfiltered 0.35-level card noise and loud 0.8 drum are removed.
- Effects and BGM have independent on/off and volume controls. Preferences
  use `sk.audio` in browser storage; the old `sk.sound=false` is honored.
  Defaults: effects 40%, BGM 18%, felt, 疑心のテーブル. Previews are explicit on the
  title screen; BGM loops during games and pauses when the page is hidden.
- `audio.mjs` reuses NOTE / Music Studio's `Player` and instrument engine.
  Six original scores live in `../music-studio/skullking-scores.mjs` and
  are also editable presets in that app. The earlier sea pieces are 凪の港 (88 BPM, 3 beats), 帆をあげて
  (104 BPM, 4 beats), 月明かりの航路 (76 BPM, 4 beats). They use rests, varied
  dynamics, spread chord attacks and small timing offsets. They contain no
  vocals and are synthesized on the device.
- The **親** badge and top label identify the round's initial leader,
  `roundLeader`. The separate **先出し** label identifies the current trick's
  first player, including Graybeard in two-player games. A trick's winner
  can change the next first player without changing the round's parent.

Tests: `node tools/skullking-audio-test.mjs`, the existing scoring settings
test, and `node tools/skullking-rules-test.mjs`.


## Psychological-game edition

The default is now 疑心のテーブル (112 BPM). 暗号の駆け引き (124 BPM) and
最後の宣告 (96 BPM) are alternatives. Each original score runs 32 bars, with a
four-bar breakdown and rebuilt final groove. They use filtered synth bass,
sequenced plucks, glass FM, minor/add9/b9 voicings and restrained percussion.
The previous three sea pieces remain selectable. Version-1 preferences migrate
once: harbor→mind, sailing→cipher, moonlight→verdict. `bgmEdition:2` preserves
subsequent deliberate selections, including the sea pieces. Volume and mute
preferences survive migration. No soundtrack audio or melodies are included.
