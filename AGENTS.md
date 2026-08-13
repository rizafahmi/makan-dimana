# Makan Dimana

A server-rendered Astro app where a group creates a vote session for food places, shares the link, collects votes, and reveals the winner when the session closes.

## Ground rules

Read this section before taking any action.

* Never create, edit, move, rename, or delete project files. Show me every proposed edit in the chat so I can type it in manually.
* Never run commands that modify files, install dependencies, or change repository state. Show me the command so I can run it myself.
* I'm an experienced developer. Do not explain syntax, APIs, programming concepts, or implementation details unless I ask.
* Routes that load data render their shell on the server and fetch data from the client: `/` and `/s/[id]`. Routes with no data to load stay fully server-rendered: `/new`, `/404`, `/500` - they still carry the shared client entry, which does nothing there.
* The app requires JavaScript. A deliberate trade on this branch, to make loading state visible.
* Client rendering builds DOM with `createElement` and `textContent`. Never pass user-supplied text through `innerHTML`.
* `src/lib/db.ts` and `src/lib/share.ts` are server-only. `id.ts`, `session.ts`, `time.ts` and `validate.ts` are isomorphic. Client code must never import a server-only module.
* Avoid third-party dependencies. Prefer `node:` builtins and Astro's own APIs. Adding any dependency needs my approval first.
* pnpm is the only package manager here. Never run `npm install` or `yarn` - a stray npm install prunes pnpm's tree and desyncs the lockfile.
* Pin exact versions. `pnpm-workspace.yaml` sets `saveExact: true`, so plain `pnpm add <pkg>` already writes an exact version; no flag to remember.
* Vanilla CSS only. No Tailwind, no CSS framework, no CSS-in-JS, no UI framework components.
* No comments, annotations, or JSDoc in source files.
* Test-driven development, always. See below.

## Test-driven development

No production code without a failing test first. Features, bug fixes, and behavior changes all qualify. The only exceptions are `astro.config.mjs` and other configuration, and DOM plumbing, which no test in this repo can reach.

Because I type every change myself, the loop is:

1. You propose exactly one failing test, and stop.
2. I type it, run it, and paste the failure.
3. Only once I have shown you a correct failure do you propose the implementation.
4. I type it, run it, and paste the result.
5. You propose refactors only while the suite is green.

Never put a test and its implementation in the same message. If a test passes the first time I run it, it is describing behavior that already exists - rewrite the test rather than moving on. If I show you a failure caused by a typo or a missing import rather than the missing feature, fix that and get a real red first.

## Stack

Astro 7.2.0 with `@astrojs/node` (`output: 'server'`), TypeScript on Node >= 24, `node:sqlite`, vanilla CSS.

Node 24 is the floor because both `node:sqlite` and TypeScript type stripping are unflagged there. No CLI flag is needed anywhere - not in the `test` script, not in the server start command.

## Commands

* `astro dev --background` starts the dev server. Manage it with `astro dev stop`, `astro dev status`, and `astro dev logs`.
* `pnpm build` produces the production build in `dist/`.
* `node --test test/db.test.ts` runs one suite with no build. This is the red-green loop.
* `pnpm test` runs `astro check && astro build && node --test`. Run it before calling any step done. `astro build` only strips types, so `astro check` is what enforces `astro/tsconfigs/strict`. Tests must never touch the default `data/makan.db`.

### Test layout

* Every suite is `test/*.test.ts`. Node 24 strips types unconditionally, so unit suites import `src/lib/*.ts` directly with the literal `.ts` extension in the specifier, and e2e suites are the same kind of file.
* Unit suites exercise `src/lib`; e2e suites spawn the built server and drive it over HTTP.
* A unit suite must set `process.env.MAKAN_DB` before the first import of `src/lib/db.ts`, and therefore import it dynamically. The connection opens at module evaluation.
* e2e suites reach the server over HTTP only. Never open the test database directly while the spawned server holds a connection - the `PRAGMA journal_mode` assertion silently no-ops when a second connection is open.
* No DOM parser is available, so e2e assertions are substring or regex matches over the raw HTML.
* Endpoint suites assert over parsed JSON rather than HTML substrings.

## Database

* Driver: `node:sqlite` (`DatabaseSync`); no third-party SQLite package
* File: `MAKAN_DB` env var, default `data/makan.db`. Not committed - `data/` is gitignored and the file is created on first import, so a fresh clone boots with no database
* Journal mode: keep SQLite's default `DELETE`. Never enable WAL, so a copied or backed-up file is always complete
* Assert it immediately after opening with `PRAGMA journal_mode = DELETE` and throw when the result is not `delete`. The pragma silently no-ops if another connection is open
* Hold one connection as a `globalThis` singleton so dev HMR cannot open concurrent connections
* Create the directory and the schema idempotently on first import of the db module with `CREATE TABLE IF NOT EXISTS`

## Data Model

vote_sessions:
- id, 7-char Crockford Base32 lowercase (0-9, a-z minus i/l/o/u), UNIQUE,
  retry on collision, case-insensitive lookup normalized to canonical lowercase
- title, non-empty
- is_open, default 1, CHECK IN (0, 1)
- place1_name, non-empty
- place1_votes, default 0, CHECK >= 0
- place2_name, non-empty
- place2_votes, default 0, CHECK >= 0
- place3_name, nullable, CHECK NULL or non-empty
- place3_votes, default 0, CHECK >= 0
- place4_name, nullable, CHECK NULL or non-empty
- place4_votes, default 0, CHECK >= 0
- created_at, `datetime('now')`, UTC, used for ordering and rendered on the landing list as Indonesian relative time. Relative time is the difference between two UTC instants, so no timezone conversion exists anywhere in the app

An unused optional place slot is NULL, never `''`. Every guard that skips, blocks voting on, or excludes a slot from the winner tests `IS NOT NULL`, and the CHECK constraints make the empty string unrepresentable.

`CREATE TABLE IF NOT EXISTS` never upgrades an existing file, so a schema change means deleting your local `data/makan.db` and letting it be recreated.

## Where To Look

* `PLAN.md` - the build order, plus decisions, non-goals, HTTP behavior, and session id handling. Read the relevant step before implementing anything.
* `docs/talk.md` - why this repo exists and why v2 is deliberately worse than v1. Read it before proposing an improvement to the baseline.
* `docs/plan-v2.md` - the v2 build order. `PLAN.md` is the closed v1 record; v2 contradicts a few of its decisions and says so.
* `docs/adr/` - decisions a reader will otherwise try to "fix": no service worker, and v2 requiring JavaScript.
* `src/lib/db.ts` - connection, schema, and session queries. Authoritative for the schema once it exists; keep it and the data model above in sync.
* `src/pages/` - routes. `/` is the landing page and public session list, `/new` creates a session, `/s/[id]` votes and shows the winner.
* `src/lib/` - domain logic, so closed-session and missing-slot behavior is unit-testable before the routes that expose it exist. Pages stay thin wrappers that map results to status codes.
* `src/layouts/Base.astro` and `src/styles/global.css` - the shared shell and the single stylesheet. Every page uses them from its first commit.
* `src/scripts/app.ts` - the only client entry, loaded from `Base.astro`. It renders `/` and `/s/[id]` from the JSON endpoints and owns every loading, error and empty state.
* `data/makan.db` - the local SQLite file. Gitignored, created on first import.
* `README.md` - project overview and commands for humans. `AGENTS.md` wins on any conflict.
* Astro docs: [routing and middleware](https://docs.astro.build/en/guides/routing/), [components](https://docs.astro.build/en/basics/astro-components/). Full docs: https://docs.astro.build
