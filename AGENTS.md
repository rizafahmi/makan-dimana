# Makan Dimana

A server-rendered Astro app where a group creates a vote session for food places, shares the link, collects votes, and reveals the winner when the session closes.

## Ground rules

Read this section before taking any action.

* Never create, edit, move, rename, or delete project files. Show me every proposed edit in the chat so I can type it in manually.
* Never run commands that modify files, install dependencies, or change repository state. Show me the command so I can run it myself.
* I'm an experienced developer. Do not explain syntax, APIs, programming concepts, or implementation details unless I ask.
* Every page renders on the server. No client-side data fetching.
* Avoid third-party dependencies. Prefer `node:` builtins and Astro's own APIs. Adding any dependency needs my approval first.
* Pin exact versions. Install with `npm install --save-exact`.
* Vanilla CSS only. No Tailwind, no CSS framework, no CSS-in-JS, no UI framework components.
* No comments, annotations, or JSDoc in source files.
* Write end-user documentation to @docs/user_documentation.md. Write a high-level internal documentation about the implementation into @docs/internal_documentation.md. Never write any local memories. You must include the memories in one of these documentation markdown files instead. If needed, create additional files in the docs/#{topic}.md directory and add them to git.
* Test-driven development, always. See below.

## Test-driven development

No production code without a failing test first. Features, bug fixes, and behavior changes all qualify; `astro.config.mjs` and other configuration are the only exceptions.

Because I type every change myself, the loop is:

1. You propose exactly one failing test, and stop.
2. I type it, run it, and paste the failure.
3. Only once I have shown you a correct failure do you propose the implementation.
4. I type it, run it, and paste the result.
5. You propose refactors only while the suite is green.

Never put a test and its implementation in the same message. If a test passes the first time I run it, it is describing behavior that already exists - rewrite the test rather than moving on. If I show you a failure caused by a typo or a missing import rather than the missing feature, fix that and get a real red first.

## Stack

Astro 7.2.0 with `@astrojs/node` (`output: 'server'`), TypeScript on Node >= 22.18, `node:sqlite`, vanilla CSS.

## Commands

* `astro dev --background` starts the dev server. Manage it with `astro dev stop`, `astro dev status`, and `astro dev logs`.
* `npm run build` produces the production build in `dist/`.
* `node --test test/db.test.ts` runs one suite with no build. Type stripping is on by default, so tests may import `src/lib/*.ts` directly. This is the red-green loop.
* `npm test` runs `astro build && node --test`. Suites live in `test/*.test.mjs` as plain JS so `node --test` needs no type stripping. Run it before calling any step done. Tests must never create or modify `data/makan.db`.

## Database

* Driver: `node:sqlite` (`DatabaseSync`); no third-party SQLite package
* File: `MAKAN_DB` env var, default `data/makan.db`, committed to the repo; create the directory before opening
* Journal mode: keep SQLite's default `DELETE`. Never enable WAL, so the committed file is always complete
* Assert it immediately after opening with `PRAGMA journal_mode = DELETE` and throw when the result is not `delete`. The pragma silently no-ops if another connection is open
* Hold one connection as a `globalThis` singleton so dev HMR cannot open concurrent connections
* Create the schema idempotently on first import of the db module with `CREATE TABLE IF NOT EXISTS`

## Data Model

vote_sessions:
- id, 7-char Crockford Base32 lowercase (0-9, a-z minus i/l/o/u), UNIQUE,
  retry on collision, case-insensitive lookup normalized to canonical lowercase
- title
- is_open, default 1
- place1_name
- place1_votes, default 0
- place2_name
- place2_votes, default 0
- place3_name, nullable
- place3_votes, default 0
- place4_name, nullable
- place4_votes, default 0
- created_at

## Where To Look

* `PLAN.md` - the build order, plus decisions, non-goals, HTTP behavior, and session id handling. Read the relevant step before implementing anything.
* `src/lib/db.ts` - connection, schema, and session queries. Authoritative for the schema once it exists; keep it and the data model above in sync.
* `src/pages/` - routes. `/` creates a session, `/s/[id]` votes and shows the winner.
* `data/makan.db` - the committed SQLite file.
* `README.md` - project overview and commands for humans. This file wins on any conflict.
* Astro docs: [routing and middleware](https://docs.astro.build/en/guides/routing/), [components](https://docs.astro.build/en/basics/astro-components/). Full docs: https://docs.astro.build
