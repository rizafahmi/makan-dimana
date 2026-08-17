# Makan Dimana

A local-first Astro app where a group creates a vote session for food places, shares the link, collects votes, and reveals the winner when the session closes. Every device holds a complete copy of every session it knows and renders from it; the server carries copies between devices and never reads one.

## Ground rules

Read this section before taking any action.

* Never create, edit, move, rename, or delete project files. Show me every proposed edit in the chat so I can type it in manually.
* Never run commands that modify files, install dependencies, or change repository state. Show me the command so I can run it myself.
* I'm an experienced developer. Do not explain syntax, APIs, programming concepts, or implementation details unless I ask.
* Every route ships a data-free shell. `/` and `/s/[id]` render from IndexedDB in the browser and sync afterwards; `/new` is server-rendered markup the client entry takes over on submit; `/404` and `/500` carry the same entry and it does nothing there.
* The app requires JavaScript. Every page renders from the local store and creating a session is client-side, so without it `/` and `/s/[id]` stay empty and `/new` posts to a 405.
* Client rendering builds DOM with `createElement` and `textContent`. Never pass user-supplied text through `innerHTML`.
* `src/lib/db.ts`, `src/lib/relay.ts` and `src/lib/share.ts` are server-only. `src/scripts/` is client-only: `app.ts`, `idb.ts` and `sync.ts` never run on the server. The rest of `src/lib` - `coalesce.ts`, `id.ts`, `merge.ts`, `retry.ts`, `session.ts`, `store.ts`, `time.ts`, `validate.ts` - is isomorphic. Client code must never import a server-only module.
* Avoid third-party dependencies. Prefer `node:` builtins, browser builtins and Astro's own APIs. Adding any dependency needs my approval first.
* pnpm is the only package manager here. Never run `npm install` or `yarn` - a stray npm install prunes pnpm's tree and desyncs the lockfile.
* Pin exact versions. `pnpm-workspace.yaml` sets `saveExact: true`, so plain `pnpm add <pkg>` already writes an exact version; no flag to remember.
* Vanilla CSS only. No Tailwind, no CSS framework, no CSS-in-JS, no UI framework components.
* No comments, annotations, or JSDoc in source files.
* Test-driven development, always. See below.

## Test-driven development

No production code without a failing test first. Features, bug fixes, and behavior changes all qualify. The only exceptions are `astro.config.mjs` and other configuration, and the plumbing no test can reach - `src/scripts/idb.ts` is I/O against IndexedDB and nothing else. Playwright reaches the rest of the client, the service worker included, so "untestable" is a much smaller claim than it used to be.

Because I type every change myself, the loop is:

1. You propose exactly one failing test, and stop.
2. I type it, run it, and paste the failure.
3. Only once I have shown you a correct failure do you propose the implementation.
4. I type it, run it, and paste the result.
5. You propose refactors only while the suite is green.

Never put a test and its implementation in the same message. If a test passes the first time I run it, it is describing behavior that already exists - rewrite the test rather than moving on. If I show you a failure caused by a typo or a missing import rather than the missing feature, fix that and get a real red first.

## Stack

Astro 7.2.0 with `@astrojs/node` (`output: 'server'`), TypeScript on Node >= 24, `node:sqlite`, vanilla CSS. In the browser: IndexedDB for the local store and a hand-written service worker for the shell.

Node 24 is the floor because both `node:sqlite` and TypeScript type stripping are unflagged there. No CLI flag is needed anywhere - not in the `test` script, not in the server start command.

## Commands

* `astro dev --background` starts the dev server. Manage it with `astro dev stop`, `astro dev status`, and `astro dev logs`.
* `pnpm build` produces the production build in `dist/`.
* `node --test test/db.test.ts` runs one suite with no build. This is the red-green loop.
* `pnpm test` runs `astro check && astro build`, then `node --test` over `test/*.test.ts`, then `playwright test`. Run it before calling any step done. `astro build` only strips types, so `astro check` is what enforces `astro/tsconfigs/strict`. Tests must never touch the default `data/makan.db`.

### Test layout

* Unit and HTTP e2e suites are `test/*.test.ts` under `node --test`. Node 24 strips types unconditionally, so unit suites import `src/lib/*.ts` directly with the literal `.ts` extension in the specifier, and e2e suites are the same kind of file.
* Browser suites are `test/*.spec.ts` under `@playwright/test`, Chromium only. `playwright.config.ts` starts the built server on a fixed port against its own temporary database, so `node --test` and `playwright test` never share one. The two runners are kept apart by the `test` script's `test/*.test.ts` glob and the config's `testMatch`; never let either pattern widen to catch the other's files.
* Unit suites exercise `src/lib`; e2e suites spawn the built server and drive it over HTTP; browser suites are for what neither can reach - the service worker, IndexedDB and offline.
* `pnpm exec playwright install chromium` is required once per machine before the browser suites run.
* A unit suite must set `process.env.MAKAN_DB` before the first import of `src/lib/db.ts`, and therefore import it dynamically. The connection opens at module evaluation.
* e2e suites reach the server over HTTP only. Never open the test database directly while the spawned server holds a connection - the `PRAGMA journal_mode` assertion silently no-ops when a second connection is open.
* No DOM parser is available, so e2e assertions are substring or regex matches over the raw HTML.
* Endpoint suites assert over parsed JSON rather than HTML substrings.
* `startServer` takes env overrides for the spawned process. `test/events.test.ts` passes `MAKAN_BEAT` so the stream's keep-alive is observable in a test rather than fifteen seconds away.
* A stream never ends, so every read of one races a timer. Assert on what has arrived so far and cancel the reader when done; an uncancelled one holds the suite open.
* Two browser contexts are two devices. That is what makes convergence testable, and every sync spec is built on it.

## Database

The database belongs to the relay, not to the app. It holds one opaque document per session per device and never parses one - see `docs/adr/0003-server-is-an-opaque-relay.md`.

* Driver: `node:sqlite` (`DatabaseSync`); no third-party SQLite package
* File: `MAKAN_DB` env var, default `data/makan.db`. Not committed - `data/` is gitignored and the file is created on first import, so a fresh clone boots with no database
* Journal mode: keep SQLite's default `DELETE`. Never enable WAL, so a copied or backed-up file is always complete
* Assert it immediately after opening with `PRAGMA journal_mode = DELETE` and throw when the result is not `delete`. The pragma silently no-ops if another connection is open
* Hold one connection as a `globalThis` singleton so dev HMR cannot open concurrent connections
* Create the directory and the schema idempotently on first import of the db module with `CREATE TABLE IF NOT EXISTS`
* Two statements, both blind. Every row has exactly one writer, so `putDoc` is an `INSERT OR REPLACE` with no merge, no compare-and-set and no conflict handling, and `listDocs` hands back a session's document strings in no promised order

## Data Model

session_docs:
- session_id, 7-char Crockford Base32 lowercase (0-9, a-z minus i/l/o/u). The device mints it with `crypto.getRandomValues`, so there is no collision retry; both handlers normalize a lookalike typo to the canonical id before touching the store
- device_id, the id a device gave itself. The server takes its word for it
- doc, that device's document as a string, stored verbatim and never parsed
- updated_at, `datetime('now')`, UTC, written and never read. It is there for a human looking at the file
- PRIMARY KEY (session_id, device_id)

A document is the client's shape, not the database's, and `src/lib/merge.ts` owns it: `device`, `title`, `places`, `created_at`, `closed`, `deleted`, `round`, and the sparse `up` and `down` PN counters keyed by slot. Only the creator's document carries a title, places and a `created_at`; on every other document all three are null. `deleted` and `round` are optional: documents minted before those decisions carry neither, so the merge reads them as `false` and `0` rather than discarding an older device's copy.

`mergeDocs` folds a pile of documents into the row shape the views read - `title`, `is_open`, `round`, `place1_name` through `place4_name` with unused slots null, `place1_votes` through `place4_votes`, and `created_at` - or null when no document claims a title, which is how a session this device does not hold reads as missing. It returns null for a deleted session too, so `missing` covers both. Identity comes from the document with a title, and the lower device id wins a tie.

An unused optional place slot is null, never `''`. `validateCreate` drops empty place names before `creatorDoc` is reached, and every guard that skips a slot, blocks voting on it or excludes it from the winner tests for null.

A tally is the sum of every `up` minus every `down` across the documents standing at the highest `round`, unclamped and possibly negative - see `docs/adr/0006-tallies-can-be-negative.md`. Documents at a lower round contribute nothing, which is what makes a reset survive votes it never saw - see `docs/adr/0009-a-reset-starts-a-new-round.md`.

Three flags are monotonic and merge without a clock. `closed` ORs: any document closing a session closes it everywhere, forever, and there is no reopen - see `docs/adr/0004-closing-is-permanent.md`. `deleted` ORs the same way and there is no undelete - see `docs/adr/0010-deleting-is-a-tombstone.md`. `round` takes the maximum, so a reset can only move forward.

`created_at` is UTC in `datetime('now')` shape and is rendered on the landing list as Indonesian relative time. Relative time is the difference between two UTC instants, so no timezone conversion exists anywhere in the app.

`CREATE TABLE IF NOT EXISTS` never upgrades an existing file, so a schema change means deleting your local `data/makan.db` and letting it be recreated.

## Where To Look

* `docs/plan-v3.md` - this branch: what local-first means here, the document shape, the merge, HTTP behavior, the build order and the conventions the client follows. Read the relevant step before implementing anything.
* `PLAN.md` and `docs/plan-v2.md` - the closed v1 and v2 records. Accurate about what they built; v3 contradicts a few of their decisions and says which ones.
* `docs/talk.md` - why this repo exists and what each branch is for. Read it before proposing an improvement to a baseline.
* `docs/adr/` - ten decisions a reader will otherwise try to "fix", including the opaque relay, permanent closing, the local landing list, negative tallies, the event stream, rounds behind reset and the delete tombstone. `0001` and `0002` are about v2 and are superseded here, not wrong.
* `CONTEXT.md` - the domain language. Use these words in code, copy and tests.
* `src/lib/merge.ts` - the document shape, the six transforms that produce a device's next document, and the merge that reads a pile of them. Authoritative for what a document is.
* `src/lib/store.ts` - the pure half of the local store: replace or append a device's document, hand a device its own, build the local list, and decide what a pull changed.
* `src/lib/db.ts` - the relay's one table and its two statements. Authoritative for the schema; keep it and the data model above in sync.
* `src/lib/relay.ts` - the in-memory registry of who is listening to which session. It carries no payload and never sees a document; a publish says only that a session was written.
* `src/lib/` - domain logic, so merge, closed-session and missing-slot behavior is unit-testable before the routes and the client that expose it exist. Pages stay thin wrappers that map results to status codes.
* `src/pages/` - routes. `/` is this device's session list, `/new` creates one in the browser, `/s/[id]` votes and shows the winner, `/api/sessions/[id]` is the relay, and `/api/sessions/[id]/events` is the stream that says when it changed - which is when a write stored bytes the row did not already hold.
* `src/layouts/Base.astro` and `src/styles/global.css` - the shared shell and the single stylesheet. Every page uses them from its first commit.
* `src/scripts/app.ts` - the only client entry, loaded from `Base.astro`. It renders `/` and `/s/[id]` from IndexedDB, answers the create form, and owns the empty and missing states. There is no loading state and no error state to own.
* `src/scripts/idb.ts` and `src/scripts/sync.ts` - client-only plumbing: IndexedDB I/O, the relay round trip, the push that follows every local write, the triggers - load, `online`, `visibilitychange`, the session's event stream and every reconnection of it - and the timer that retries an attempt that failed. Neither decides anything; a decision belongs in `src/lib/store.ts`, whether an overlapping run happens at all belongs in `src/lib/coalesce.ts` and how long to wait before trying again belongs in `src/lib/retry.ts`.
* `public/sw.js` - the service worker. Hand-written, precaches the shell, never touches `/api/**`. Bump its `version` constant after changing anything the shell ships.
* `data/makan.db` - the local SQLite file. Gitignored, created on first import.
* `README.md` - project overview and commands for humans. `AGENTS.md` wins on any conflict.
* Astro docs: [routing and middleware](https://docs.astro.build/en/guides/routing/), [components](https://docs.astro.build/en/basics/astro-components/). Full docs: https://docs.astro.build
