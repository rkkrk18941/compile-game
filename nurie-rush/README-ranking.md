# Shared 60-card ranking (V2)

The public game URL stays at https://rkkrk18941.github.io/compile-game/nurie-rush/ .

The ranking service is a separate Sites project, `appgprj_6ad561691c7881919203ddffcdf44ce0`, at https://obake-catch-ranking.kd37yg.chatgpt.site . Edit that existing Site when changing the API; do not create another service. Its source uses Vinext and Cloudflare D1 (`DB`), with the schema and immutable migrations in its source repository.

- `GET /api/rankings?version=2&mode=basic&name=...` (or `mode=call`) returns the top 100, total participants, and the named player's rank even outside the top 100. Each entry includes `correct`, `totalMs` and server-calculated `scoreMs`.
- `POST /api/rankings` accepts `{version:2,name,mode,answers:[{card,type,item,rt}]}`. Exactly 60 unique card IDs (0–59) are required. The service recomputes correctness from the canonical deck, and sums integer response times in milliseconds. Client-claimed scores are ignored.
- Names are normalized with NFKC, trimmed, and limited to 10 characters. They identify public records as requested; there is no name ownership/account login. Basic and call rules have separate records.
- Sort by `scoreMs = totalMs + (60 - correct) * 6000`, ascending. Exact score ties share a rank, even with different accuracy. A single atomic conditional upsert replaces a name only for a strictly shorter adjusted time.
- Every card's first answer counts. Timing runs from the first visible question until answering, including pauses and delays caused by resuming the same question. Answer explanations and normal between-card delays are excluded. A pause before the card is initially visible does not start its clock.
- At the owner's explicit request, legacy records are recalculated and merged into the current board. An idempotent conditional upsert imports each name/rule and keeps the strictly better adjusted time when it overlaps with a current record. Late V1 pending uploads also join the current board. The old-board selector is removed; the V1 API is retained only for cached-client compatibility. Original uncounted pause time cannot be reconstructed and is not invented during import.
- Failed submissions are retained under `obake.ranking.pending.v1` and can be retried from the result or ranking setup screen. The key is preserved so old unsent attempts survive. Only the best pending result per version/name/rule is kept, using that version's comparison.
- The +6s initial calibration uses the 3 observed basic-rule best records and explicit guessing-safety assumptions; it is not a statistical optimum. The service repository documents assumptions in `docs/ranking-calibration.md`; run `node scripts/calibrate-ranking.mjs` to reproduce calculations. Keep the coefficient fixed within V2.

The service has its own executable API/SQL regression test at `tests/ranking.test.mjs`; run it from that Site checkout. The game repository's `node tools/nurie-ranking-test.mjs` covers legacy compatibility; `node tools/nurie-ranking-v2-test.mjs` tests new client scoring, versioned pending submissions and paused-question timing. Never seed test players into the production leaderboard.

