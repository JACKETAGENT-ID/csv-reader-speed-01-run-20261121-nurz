# csv-reader-speed — nurz

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/JACKETAGENT-ID/csv-reader-speed-01-run-20261121-nurz/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/JACKETAGENT-ID/csv-reader-speed-01-run-20261121-nurz/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for csv-reader 1.0.0: `solve.js` answers every `{text, header}`
exactly as csv-reader does — same `{columns, rows, errors}`, same broken-row
policy (BOM, CRLF, stray CR, quote junk, unterminated quote, short/long rows)
— but reads the text in one pass, cutting fields out with `substring()` between
separators found by `indexOf()`, instead of building them one character at a
time. `main.ts` is the house driver, unchanged.
