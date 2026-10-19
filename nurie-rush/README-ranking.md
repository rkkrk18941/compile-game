# Shared 60-card ranking

The public game URL stays at https://rkkrk18941.github.io/compile-game/nurie-rush/ .

The ranking service is a separate Sites project, `appgprj_6ad561691c7881919203ddffcdf44ce0`, at https://obake-catch-ranking.kd37yg.chatgpt.site . Edit that existing Site when changing the API; do not create another service. Its source uses Vinext and Cloudflare D1 (`DB`), with the schema and immutable migrations in its source repository.

- `GET /api/rankings?mode=basic&name=...` (or `mode=call`) returns the top 100, total participants, and the named player's rank even outside the top 100.
- `POST /api/rankings` accepts `{version:1,name,mode,answers:[{card,type,item,rt}]}`. Exactly 60 unique card IDs (0–59) are required. The service recomputes correctness from the canonical deck, and sums integer response times in milliseconds.
- Names are normalized with NFKC, trimmed, and limited to 10 characters. They identify public records as requested; there is no name ownership/account login. Basic and call rules have separate records.
- Sort by correct answer count descending, then total response time ascending. Exact ties share a rank. A single atomic conditional upsert replaces an existing name only for more correct answers, or the same correct count with a shorter total time.
- Answer/explanation display and pauses are excluded from total response time. Thinking time before a pause is retained. Every card's first answer counts; wrong answers add no time penalty.
- Failed submissions are retained under `obake.ranking.pending.v1` and can be retried from the result or ranking setup screen. Only the best pending result per name/rule is kept.

The service has its own executable API/SQL regression test at `tests/ranking.test.mjs`; run it from that Site checkout. Never seed test players into the production leaderboard.
