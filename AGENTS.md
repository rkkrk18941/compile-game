# Repository workflow

## CPU training tasks

Whenever a task asks to analyze match logs or strengthen the CPU, run this before inspecting manually attached logs:

```powershell
node tools/fetch-cpu-training.mjs
```

Analyze every ID listed in `pendingMatches`; the ignored raw files are under `logs/cpu-training-inbox/pending/`. After the related CPU changes and regression tests are complete, move only the analyzed IDs out of the pending queue with:

```powershell
node tools/fetch-cpu-training.mjs --ack MATCH_ID
```

When `newlyLinkedRooms` is non-empty, the phone may need up to 20 seconds to notice the first receiver link. If the user may still have the game open, wait about 25 seconds and run the fetch command once more before concluding that there are no new logs.

Use `--ack-all` only when every pending match has actually been analyzed. Never commit `logs/`, the collector refresh token, or raw player logs.
