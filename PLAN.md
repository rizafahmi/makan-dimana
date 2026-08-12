# PLAN

## Decisions

- Routes: `/` is the public landing page and session list, `/new` renders and handles the create form, `/s/[id]` votes and shows the winner
- Access: no ownership or authentication; anyone can discover sessions from the public landing page and vote, close or reopen them
- Mutations: form POST, no /api routes; successful mutations redirect with 303 to the canonical session URL
- Detail page actions: hidden `action` field (upvote|downvote|close|reopen) plus `place` (1-4) for the vote actions
- Vote column selection: require the raw `place` value to be exactly one of the strings '1'-'4' (no coercion: '02', ' 2', '2.0' are 400), map it through a fixed ['place1_votes', ...] array; never interpolate the column name
- Vote updates: use one conditional UPDATE requiring `is_open = 1` and a non-null place name; never read is_open and update in separate statements. This is the only race guarantee the plan needs; no separate step asserts it
- Mutation status codes: run the conditional UPDATE first; only when it changes 0 rows, SELECT the session to classify the failure - no row is 404, NULL selected place name is 400, otherwise 409. This read is race-free because place names are immutable after creation; only is_open needs the in-UPDATE guard
- Close/reopen status codes: when the UPDATE changes 0 rows, SELECT to distinguish unknown session (404) from already-in-that-state (idempotent 303)
- Empty optional place slots are stored as NULL, never as the empty string. A CHECK constraint enforces it and every guard still tests `IS NOT NULL`, so a blank slot can never be voted on, rendered, or win
- Vote spam: unguarded by design; downvotes clamp at 0
- Error bodies: 400 and 409 responses render a minimal Indonesian message with a link back to the session (landing page when no session exists); they need not share the 404/500 templates
- Create input: trim all fields, discard empty place names, require 2-4 remaining names, and store them sequentially in place1 through place4; duplicate names are allowed. Length limits count UTF-16 code units via `String.prototype.length`
- Session ids: generate with a cryptographically secure random source; normalize lowercase, i/l to 1, and o to 0 before validating the canonical alphabet
- Normalization happens at lookup only. There is no canonical redirect, so `/s/ABC12QX` and `/s/abc12ox` serve the same session in place rather than 301ing. The share URL and QR are generated canonically, so users only meet a non-canonical URL if they typed one
- The database file is not committed. `data/` is gitignored and the schema self-creates on first import, so there is no committed artifact to keep in sync and no schema drift to guard against
- `created_at` is `datetime('now')`, which is UTC. The landing page shows it as Indonesian relative time (`baru saja`, `2 jam lalu`, `kemarin`), computed as the difference between two UTC instants, so no timezone conversion exists anywhere
- UI language: Indonesian with `<html lang="id">`
- Close/reopen: no confirmation; repeated close or reopen actions are idempotent
- Development: strict TDD; every `Done when:` below is written as a failing node:test and watched fail before the code that satisfies it
- Testing: node:test unit suites for `src/lib`, HTTP-level e2e with node:test + fetch for routes, no browser driver; the manual checks in step 6 are the only non-test criteria
- Domain logic lives in `src/lib` so closed-session and missing-slot behavior is unit-testable before the routes that expose it exist; pages stay thin wrappers that map results to status codes
- CSRF: keep Astro's default `security.checkOrigin: true`; undici's fetch sends no Origin header and Astro returns 403 for form-content-type POSTs without a matching one, so every e2e POST must send an `origin` header equal to the server origin
- Dependencies: `@astrojs/node`, `@astrojs/check` and `typescript` (step 1), and `qrcode` + `@types/qrcode` (step 5) are pre-approved. Anything else needs approval first

## Non-goals and accepted risks

- No authentication, ownership, private sessions, authorization, moderation, audit log, or admin interface
- Anyone who can reach the landing page can close or reopen every session listed on it
- No CSRF protection beyond Astro's built-in origin check; no vote rate limiting, voter identity, duplicate-vote prevention, or anti-spam controls
- No editing or deleting session titles or place names after creation
- No session expiration, pagination, export, analytics or database migration framework. The landing list is capped at 20 rows, which is a ceiling rather than pagination: older sessions stay reachable by link but drop off the list
- No client framework or browser automation
- Sessions and votes are retained indefinitely
- Public listing means possession of a session link is not an access-control boundary

## HTTP behavior

| Request condition | Result |
|---|---|
| Successful create | 303 to canonical `/s/[id]` |
| Invalid create input | 422 with the form, field errors, and submitted values preserved |
| Successful vote, close, or reopen | 303 to canonical `/s/[id]` |
| Malformed session id | 404 |
| Valid but unknown session id | 404 |
| Non-form or unparseable POST body | 400 |
| Request body larger than `bodySizeLimit` | 400 - the adapter throws inside `formData()` and the guard converts it |
| Missing or unsupported action | 400 |
| Missing, malformed, or out-of-range place | 400 |
| Vote for an empty optional place slot | 400 |
| Vote on a closed session | 409 with no count change |
| Close an already closed session | Idempotent 303 |
| Reopen an already open session | Idempotent 303 |
| Non-canonical but valid session id | Served in place, no redirect |

### Precedence for POST /s/[id]

Checks run in this order, and the first failure wins. Request shape is fully validated before any database read, so an unknown session with an unsupported action is 400, not 404.

1. Normalize and validate the route id; malformed is 404
2. `Astro.request.formData()`; any throw is 400
3. `action` missing or not one of upvote|downvote|close|reopen is 400
4. For vote actions, `place` not exactly '1'-'4' is 400
5. Run the conditional UPDATE
6. On 0 rows changed, SELECT and classify: no row is 404, NULL place name is 400, closed session is 409 for votes and an idempotent 303 for close/reopen

## Session id handling

1. Lowercase the route id.
2. Map `i` and `l` to `1`, and `o` to `0`.
3. Validate exactly 7 characters from `0123456789abcdefghjkmnpqrstvwxyz`.
4. Return 404 when the normalized id is malformed.
5. Look up and serve using the normalized id, whatever form the request used. GETs never redirect; successful POSTs redirect with 303 to the canonical path.

## Conventions

Pin these before writing the first test; the e2e suites hard-code them.

- Create form posts `title`, `place1`, `place2`, `place3`, `place4` to `/new`
- Detail page forms post `action`, plus `place` for vote actions, to `/s/[id]`
- `src/lib/db.ts` exports `createSession({ title, places }, generateId?)` where `places` is an array of 2-4 trimmed non-empty names, and `getSession(id)`
- `src/lib` mutation helpers return a discriminated result - `{ ok: true }` or `{ ok: false, reason: 'not_found' | 'closed' | 'no_such_place' }` - and pages map `reason` to the status codes above
- Validation lives in `src/lib` so it is unit-testable without HTTP
- Layout is `src/layouts/Base.astro` importing `src/styles/global.css`; every page uses it from its first commit
- Every suite is `test/*.test.ts`. Node 24 strips types unconditionally, so unit suites import `src/lib/*.ts` directly with the literal `.ts` extension in the specifier, and e2e suites are the same kind of file
- Unit suites must set `process.env.MAKAN_DB` before the first import of `src/lib/db.ts` and therefore import it dynamically; the connection opens at module evaluation
- e2e suites reach the server over HTTP only. Never open the test database directly while the spawned server holds a connection - the `PRAGMA journal_mode` assertion silently no-ops when a second connection is open
- e2e assertions are substring or regex matches over the raw HTML; no DOM parser is available. Keep test-hook attributes on one line

## Steps

### 1. Foundation

- [x] Add e2e harness in `test/*.test.ts`: node:test spawns `node dist/server/entry.mjs` with `PORT=0`, HOST, and MAKAN_DB pointing at a unique temporary database
      - `PORT=0` lets the OS assign a free port, so there is no port collision to retry. First confirm the adapter logs its *resolved* listening address rather than the configured value; if it does not, fall back to a random high port with retry-on-EADDRINUSE
      - Read the assigned port from the child's stdout, then poll an HTTP endpoint until ready with a bounded timeout
      - Capture child stdout/stderr and surface both when startup fails. Never treat non-empty stderr as failure on its own - a Node deprecation warning is not a startup failure. Readiness is the HTTP poll
      - Resolve and reject the test database path if it equals the default `data/makan.db`
      - Use `redirect: 'manual'` when asserting response statuses and Location headers
      - Send an `origin` header matching the server origin on every POST; Astro's checkOrigin returns 403 otherwise
      - Always stop the child process and remove the temporary directory in teardown
      - Retain the existing `"test": "astro build && node --test"` script
      This item's red half stands alone; its green half cannot land until the adapter in the next item exists. Leave it unchecked until both are done
      Done when: the harness first fails because no `dist/server/entry.mjs` exists, then passes on a 200 from `/` once the adapter is configured, without creating or modifying data/makan.db
- [x] Install `@astrojs/node` with `pnpm add @astrojs/node`; configure `adapter: node({ mode: 'standalone', bodySizeLimit: 16384 })` and `output: 'server'`. Leave `trailingSlash` at its default; with no canonical redirect there is nothing for it to enforce
      Done when: the harness smoke test turns green
- [x] Install `@astrojs/check` and `typescript` with `pnpm add -D @astrojs/check typescript`, then change the test script to `astro check && astro build && node --test` so `astro/tsconfigs/strict` is actually enforced
      `astro build` only strips types; without this step type errors reach runtime
      Done when: `pnpm test` reports zero type errors and still runs every suite, and a deliberately introduced type error makes it exit non-zero before the build runs
- [x] Add db connection module: create the directory, open MAKAN_DB (default data/makan.db), assert journal_mode = delete, globalThis singleton
      Done when: a node:test written first, pointing MAKAN_DB at a temporary path, passes - the file is created, `PRAGMA journal_mode` returns delete, no -wal sidecar appears, and importing twice yields the same connection
- [x] Create vote_sessions on first import of the db module with CREATE TABLE IF NOT EXISTS
      Use:
      - id TEXT PRIMARY KEY
      - title TEXT NOT NULL CHECK (length(title) > 0)
      - is_open INTEGER NOT NULL DEFAULT 1 CHECK (is_open IN (0, 1))
      - place1_name/place2_name TEXT NOT NULL CHECK (length(placeN_name) > 0)
      - place3_name/place4_name TEXT nullable CHECK (placeN_name IS NULL OR length(placeN_name) > 0)
      - place1_votes through place4_votes INTEGER NOT NULL DEFAULT 0 with non-negative CHECK constraints
      - created_at TEXT NOT NULL DEFAULT (datetime('now'))
      Done when: a node:test written first asserts the columns, defaults, and CHECK constraints - including that an empty-string place name is rejected - and that a second import is a no-op
- [x] Add createSession + getSession; createSession accepts an optional id generator (`createSession(input, generateId = defaultGenerateId)`) as the test seam; retry id generation at most 5 times only when INSERT fails with a primary-key violation (`errcode === 1555`, SQLITE_CONSTRAINT_PRIMARYKEY - never match on the message string), and propagate every other SQLite error
      createSession writes NULL, never '', into unused place slots
      getSession normalizes and validates the id before lookup
      Done when: node:test round-trips a session, stores NULL for the unused slots of a 2-place session, covers a forced collision, propagates a non-collision database error, finds a session by a lookalike-typo id, and rejects malformed ids - each case watched fail before the code that satisfies it

### 2. Create and view

- [x] Add /new and minimal /s/[id] on `src/layouts/Base.astro`: the form posts title + 4 place inputs to /new; successful insertion redirects with 303; the detail page shows the title
      Blank place inputs are inserted as NULL from the first commit, so the CHECK constraint never fires
      Done when: an e2e test written first - POST /new with a title and 2 places, asserting a 303 to the canonical /s/[id], the title on that page, `<html lang="id">`, and the viewport meta - goes red then green, and refreshing the detail page does not resubmit
- [x] Return 404 for unknown or malformed session id
      Done when: /s/zzzzzzz (well-formed but unknown), /s/zzzzzz, /s/short, /s/abc12u3, and /s/abc12!3 all return 404 rather than 500
- [x] Render place names and vote counts on /s/[id], skipping empty slots, with data-place and data-votes attributes as test hooks
      Done when: a 2-place session shows exactly 2 places at 0 votes
- [x] Validate the create form: trim title and all place names; title required and max 100 chars; each non-empty place max 60 chars; require 2-4 non-empty places; compact accepted places into sequential database slots
      Return 422 and re-render errors with the original submitted fields preserved
      Done when: submitting 1 place writes no row; whitespace-only places do not count; inputs in slots 2 and 4 are stored as place1 and place2; duplicate names are accepted; and the 422 body contains both the field error messages and the previously submitted title and place values
- [ ] Implement landing page: link to /new, empty state, and public sessions list ordered by `created_at DESC, rowid DESC` with `LIMIT 20`, with open/closed state visible
      Done when: a fresh db shows the empty state, the rendered list shows each session's open or closed state, a 21st session pushes the oldest off the list while staying reachable by link, and a unit test on the query - seeding rows with identical `created_at` values directly - asserts deterministic newest-first order without depending on wall-clock timing
- [ ] Add an Indonesian relative-time formatter to `src/lib` and show each listed session's age with it
      It takes two UTC instants and returns `baru saja`, `N menit lalu`, `N jam lalu`, `kemarin`, or `N hari lalu`. No timezone conversion and no `Intl` locale data
      Done when: unit tests written first pin each boundary - under a minute, exactly 1 minute, 59 minutes, 1 hour, 23 hours, 1 day, 2 days - passing both instants in explicitly so nothing reads the clock, and the landing list renders the result next to each session

### 3. Voting

- [ ] Add `recordVote(id, place, delta)` and `setSessionOpen(id, isOpen)` to `src/lib`, each as one conditional SQL UPDATE. recordVote increments or decrements only the mapped column, requires `is_open = 1` and a non-null place name, and clamps downvotes with MAX(0, votes - 1)
      Done when: unit tests written first cover incrementing exactly one present place, clamping a 0-vote place at 0, `reason: 'no_such_place'` for an empty slot, `reason: 'closed'` after setSessionOpen(id, false), and `reason: 'not_found'` for an unknown id - all provable before any close route exists
- [ ] Wire upvote and downvote on /s/[id] to recordVote and map results to status codes
      Done when: an e2e upvote increments one place and survives a refresh, a downvote at 0 stays at 0, an empty place slot returns 400, and neither changes any other count
- [ ] Reject malformed mutation requests on /s/[id] before touching the database, following the precedence list above
      Done when: a POST with no `action` returns 400, `action=bogus` returns 400, a vote with no `place` returns 400, `place=02` and `place=5` return 400, none of them change any count, and each response body carries the Indonesian error message and a link back to the session
- [ ] Guard `Astro.request.formData()` on every POST endpoint (/new and /s/[id]) so a non-form, unparseable, or oversized POST body returns 400 instead of an unhandled 500
      Done when: a POST with `content-type: application/json` and a garbage body returns 400 on both /new and /s/[id], a body over `bodySizeLimit` returns 400, and neither changes any count

### 4. Closing and winner

- [ ] Add close: form POST calls setSessionOpen(id, false), redirects with 303, and hides vote and close controls
      Done when: a closed session renders without vote buttons, shows the reopen control, and closing it again is an idempotent 303 and the landing list shows the closed session as Sudah ditutup with data-open="0"
- [ ] Verify the closed-session rejection over HTTP now that close is reachable
      Done when: an e2e test creates a session, closes it, then posts an upvote and gets 409 with the count unchanged and the Indonesian error body
- [ ] Highlight the winner only among populated place slots on a closed session, using `data-winner` and a text label rather than color alone
      - One leader: mark that place as winner
      - Positive tie: mark every tied leader and show `Seri!`
      - All zero: mark no winner and show `Belum ada pemenang`
      Done when: one leader is marked, a tie shows both leaders, all-zero marks none, and NULL slots never participate
- [ ] Add reopen: form POST calls setSessionOpen(id, true) and redirects with 303
      Done when: reopening restores voting with counts intact, hides winner presentation while open, and reopening again is an idempotent 303

### 5. Routing edges and polish

- [ ] Serve valid non-canonical ids in place, without redirecting
      Done when: /s/ABC12QX renders the same session as /s/abc12qx with 200, /s/abc12ox renders the same session as /s/abc120x with 200, voting through a non-canonical URL updates the same row the canonical one shows, and malformed ids still return 404
- [ ] Install with `pnpm add qrcode` and `pnpm add -D @types/qrcode`; render the QR server-side with `QRCode.toString(url, { type: 'svg' })` so no client JS is added
      The payload is the absolute canonical session URL based on the current request origin; deployment must preserve the public scheme and Host header
      The SVG is injected with `set:html`. That is the only place in the app where Astro's auto-escaping is bypassed, and the input is library-generated; user-supplied titles and place names must never be rendered that way
      Show the canonical share URL as text and give the QR an accessible Indonesian label
      If QR generation fails, the detail page still renders the text share URL
      Done when: the encoded QR value equals the canonical absolute URL and the text URL remains available even when generation throws
- [ ] Implement custom Indonesian 404 and 500 pages
      - 404 heading: `Nyasar, ya?`, with a link back to the landing page
      - 500 heading: `Dapurnya lagi meledug`, with retry and landing-page links
      Done when: an unknown URL renders status 404 with custom content in a production build
      Done when: a temporary controlled SSR throw returns status 500 with custom content in a production build; remove the temporary throw before completing the step
      Note: 500.astro only renders in a production build, not dev
- [ ] Fill in the shared shell: descriptive per-page titles, visible labels on every form control, validation errors associated with their fields, winner state never conveyed by color alone, and visible keyboard focus on interactive controls
      Done when: every page has a distinct `<title>`, each input has a `<label for>`, and each 422 field error is referenced by its input's `aria-describedby`

### 6. Final verification

- [ ] Run `pnpm test`
      Done when: `astro check` reports zero errors, the build succeeds, and all node:test suites pass
- [ ] Verify a clean checkout boots
      - `data/` is gitignored, so a fresh clone has no database at all
      - Confirm the db module creates the directory and the schema on first import, and that no -wal or -shm sidecar appears
      Done when: deleting data/, then starting the production build, creates a working empty database and serves the landing page
- [ ] Perform the manual checks
      - Landing, new, validation-error, open-session, closed single-winner, closed tie, 404, and 500 pages have no horizontal scroll at 320px
      - Bind the server to a LAN interface with `--host` for the QR check; the QR payload comes from the request Host header, so a localhost-bound server encodes an unreachable URL
      Done when: all listed pages pass the responsive check and a phone opens the session URL from the QR
