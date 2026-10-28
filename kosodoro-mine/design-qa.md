# Character-only artwork with the previous mine theme

Date: 2026-10-28 JST

The requested visual baseline is the browser design before the full original-art replacement, commit `8cf642841ad4957c73a748cf6a0e0640df8b5e02`. Only the character illustrations remain from the original Japanese edition.

- Restored the exact previous inline CSS, dark green background, wooden title/signs and player tags, card dimensions and layout, green/red/blue action cards, component icons, card backs, gold ore and minecart.
- Removed the original-theme stylesheet from the page, full printed-card panels, original cover/logo, printed ore tokens and card-inspection dialog.
- Characters are transparent cutouts of the original character stickers; original identity/ability assignments and saved-game indices are unchanged. The rabbit cutout includes its complete ears.
- Verified by direct comparison that the complete inline stylesheet matches the baseline byte for byte. Only metadata/credits and cache-version parameters differ from the baseline HTML.
- Browser checked: title, all eight characters, advanced-rule hand, choosing Labour, confirming, simultaneous reveal and advancing to round 2.
- Desktop: 1363×936. Screenshot: `qa/character-only-desktop.jpg`.
- Mobile: same-origin 390×844 iframe viewport. Board area client and scroll sizes: 390×529, no board overflow; all four hand controls and confirmation button visible.
- Page-origin console errors: none. Browser-extension messages excluded.
- Existing rule tests: 32 passed, 0 failed. JavaScript syntax checks and `git diff --check` passed.
- This supersedes the full-card design QA from 2026-10-27. Older screenshots under `qa/` are historical evidence of that previous design.

final result: passed
