# csv-reader-speed-01 — fast drop-in for csv-reader 1.0.0

[![make.fun](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/c/csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/Azet17/makefun-csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/c/csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/Azet17/makefun-csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/c/csv-reader-speed-01-run-20261121)

A faster drop-in for make.fun's own csv-reader 1.0.0 for the competition
[Read broken CSV files faster, 21 November 2026](https://make.fun/c/csv-reader-speed-01-run-20261121):
`solve.js` returns exactly csv-reader's `{columns, rows, errors}` for every
input, with the same broken-row policy (BOM drop, LF/CRLF record ends, empty
lines skipped, stray CRs dropped with `stray_cr`, quoted-field rules incl.
doubled quotes, `quote_junk`, `unterminated_quote` re-read as unquoted,
`short_row`/`long_row` padding and cutting) — only faster.

## Approach

The reference reader builds every field one character at a time. This entry
never does that on the common path:

- **Unquoted fields** are cut with `indexOf(',', '\n')` plus one `slice` —
  no per-character loop, no per-character string building. A field is only
  scanned character by character when it actually holds a stray CR.
- **Quoted fields** run `indexOf('"')` to the next quote; doubled quotes are
  folded in, and only segments that hold a CR or LF go through the
  newline-normalising loop (CRLF and lone CR inside quotes each become one
  LF, and count as one line).
- **Records** are built with pre-sized field arrays; rows are padded or cut
  to the first record's width exactly as the reference does.
- `main.ts` is the harness driver: it reads `/input/cases.json`, answers each
  case alone with `run`, and writes `/output/answers.json`. It turns V8's
  incremental marking off before importing `solve.js`, the same flag the
  house baseline runs with.

Dependency-free, ES module only, no network, no WASM, no native addons.

## Layout

- `solve.js` — the fast reader, `run(input)` → `{columns, rows, errors}`
- `main.ts` — the harness driver
- `LICENSE` — MIT
