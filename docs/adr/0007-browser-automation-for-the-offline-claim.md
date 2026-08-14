# Browser automation for the offline claim

This branch's headline claim - load the app, go offline, reload, and the data is
still there - is not reachable by any test this repo had. Unit suites cannot see a
browser, and the HTTP e2e suites cannot see a service worker or IndexedDB. Playwright
runs the browser suites under `@playwright/test`; `node --test` keeps `src/lib` and
the HTTP e2e. This reverses `PLAN.md`'s "no browser automation" non-goal.

## Considered options

- **Chrome DevTools Protocol over Node's built-in WebSocket.** Node 24 ships a global
  WebSocket and `test/harness.ts` already spawns a process and scrapes a URL from its
  output, so a launcher is roughly eighty lines and no dependency at all. Rejected for
  the protocol glue it leaves us owning and debugging.
- **puppeteer-core.** A documented API with no bundled browser download. Rejected
  because it still depends on whichever Chrome happens to be installed.
- **OPFS with SQLite WASM as the local store**, which would have made the same SQL run
  on both sides. Rejected on two facts from sqlite.org's own documentation: both OPFS
  VFSes are "only available in Worker threads, not the main UI thread", and neither
  tolerates a second connection - "if the same page is opened in two tabs, the second
  tab will hit a locking error". Two windows side by side is how sync gets shown.

## Consequences

- `AGENTS.md`'s "every suite is test/*.test.ts" is no longer true, and `pnpm test`
  chains two runners.
- `README.md`'s claim that a fresh clone needs no setup step is no longer true.
  `pnpm exec playwright install chromium` is required before the suite runs.
- Playwright manages its own browser installs, which is the reason it was chosen over
  the lighter options: the suite does not depend on what is on the machine.
