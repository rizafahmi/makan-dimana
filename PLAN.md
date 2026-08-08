# PLAN

## Decisions

- Access: no ownership or authentication; anyone can discover sessions from the public landing page and vote, close or reopen them
- Mutations: form POST, no /api routes; successful mutations redirect with 303 to the canonical session URL
- Detail page actions: hidden `action` field (upvote|downvote|close|reopen) plus `place` (1-4) for the vote actions
- Vote column selection: require the raw `place` value to be exactly one of the strings '1'-'4' (no coercion: '02', ' 2', '2.0' are 400), map it through a fixed ['place1_votes', ...] array; never interpolate the column name
- Vote updates: use one conditional UPDATE requiring `is_open = 1` and a non-null place name; never read is_open and update in separate statements
- Mutation status codes: run the conditional UPDATE first; only when it changes 0 rows, SELECT the session to classify the failure - no row is 404, NULL selected place name is 400, otherwise 409. This read is race-free because place names are immutable after creation; only is_open needs the in-UPDATE guard
- Close/reopen status codes: when the UPDATE changes 0 rows, SELECT to distinguish unknown session (404) from already-in-that-state (idempotent 303)
- Vote spam: unguarded by design; downvotes clamp at 0
- Error bodies: 400 and 409 responses render a minimal Indonesian message with a link back to the session(landing page when no session exists); they need not share the 404/500 templates
- Create input: trim all fields, discard empty place names, require 2-4 remaining names, and store them sequentially in place1 through place4; duplicate names are allowed
- Session ids: generate with a cryptographically secure random source; normalize lowercase, i/l to 1, and o to 0 before validating the canonical alphabet
- UI language: Indonesian with `<html lang="id">`
- Close/reopen: no confirmation; repeated close or reopen actions are idempotent
- Testing: HTTP-level e2e with node:test + fetch, no browser driver; the 320px layout is checked by eye
- CSRF: keep Astro's default `security.checkOrigin: true`; undici's fetch sends no Origin header and Astro returns 403 for form-content-type POSTs without a matching one, so every e2e POST must send an `origin` header equal to the server origin

## Non-goals and accepted risks

- No authentication, ownership, private sessions, authorization, moderation, audit log, or admin interface
- No CSRF protection beyond Astro's built-in origin check; no vote rate limiting, voter identity, duplicate-vote prevention, or anti-spam controls
- No editing or deleting session titles or place names after creation
- No session expiration, pagination, export, analytics or database migration framework
- No client framework or browser automation
- Sessions and votes are retained indefinitely
- Public listing means possession of a session link is not an access-control boundary

## HTTP behavior

| Request condition | Result |
|---|---|
| Successful create | 303 to canonical `/s/[id]` |
| Invalid create input | 422 with the form, errors, and submitted values preserved |
| Successful vote, close, or reopen | 303 to canonical `/s/[id]` |
| Unknown session | 404 |
| Missing or unsupported action | 400 |
| Non-form or unparseable POST body | 400 |
| Missing, malformed, or out-of-range place | 400 |
| Vote for an empty optional place slot | 400 |
| Vote on a closed session | 409 with no count change |
| Close an already closed session | Idempotent 303 |
| Reopen an already open session | Idempotent 303 |

## Session id handling

1. Lowercase the route id.
2. Map `i` and `l` to `1`, and `o` to `0`.
3. Validate exactly 7 characters from `0123456789abcdefghjkmnpqrstvwxyz`.
4. Return 404 when the normalized id is malformed.
5. Redirect a valid non-canonical GET to its canonical path with 301, preserving the query string.
6. Handle a valid non-canonical POST using the normalized id, then redirect successful mutations with 303 to the canonical path.
7. A valid but unknown non-canonical GET may redirect first and then return 404 at the canonical path.


## Steps

### 1. Foundation

- [ ] Install `@astrojs/node` with `npm install --save-exact`; configure `adapter: node({ mode: 'standalone', bodySizeLimit: 16384 })`, `output: 'server'`, and `trailingSlash: 'never'` so /s/[id] has one canonical URL
      Done when: `node dist/server/entry.mjs` serves the production build and a temporary timestamp changes between requests
      Remove the temporary timestamp before completing this step
- [ ] Add db connection module: create the directory, open MAKAN_DB (default data/makan.db), assert journal_mode = delete, globalThis singleton
      Done when: booting creates data/makan.db with no -wal sidecar, and MAKAN_DB points it elsewhere
- [ ] Create vote_sessions on first import of the db module with CREATE TABLE IF NOT EXISTS
      Use:
      - id TEXT PRIMARY KEY
      - title TEXT NOT NULL
      - is_open INTEGER NOT NULL DEFAULT 1 CHECK (is_open IN (0, 1))
      - place1_name/place2_name TEXT NOT NULL
      - place3_name/place4_name TEXT nullable
      - place1_votes through place4_votes INTEGER NOT NULL DEFAULT 0 with non-negative CHECK constraints
      - created_at TEXT NOT NULL DEFAULT (datetime('now'))
      Done when: the table exists and a second boot is a no-op
- [ ] Add createSession + getSession; createSession accepts an optional id generator (`createSession(input, generateId = defaultGenerateId)`) as the test seam; retry id generation at most 5 times only when INSERT fails with a primary-key violation (`errcode === 1555`, SQLITE_CONSTRAINT_PRIMARYKEY - never match on the message string), and propagate every other SQLite error
      getSession normalizes and validates the id before lookup
      Done when: node:test round-trips a session, covers a forced collision, propagates a non-collision database error, finds a session by a lookalike-typo id, and rejects malformed ids

### 2. Create and view

- [ ] Add /new and minimal /s/[id]: the form posts title + 4 place input to /new; successful insertion redirects with 303; the detail page shows the title
      Done when: submitting the form lands on  the canonical detail page showing the title, and refreshing does not submit again
- [ ] Add e2e harness in `test/*.test.mjs` (plain JS so `node --test` needs no type stripping): node:test spawns `node dist/server/entry.mjs` on a random high port, retrying on EADDRINUSE, with HOST, PORT, and MAKAN_DB pointing at a unique temporary database
      - Resolve and reject the test database path if it equals the default repository database
      - Poll an HTTP endpoint until ready with a bounded timeout
      - Capture child stdout/stderr; treat child exit before readiness as a failed attempt, retry with a new port only when stderr contains EADDRINUSE, and surface the captured output for any other startup failures
      - Use `redirect: 'manual'` when asserting response statuses and Location headers
      - Send an `origin` header matching the server origin on every POST; Astro's checkOrigin returns 403 otherwise
      - Always stop the child process and remove the temporary directory in teardown
      - Retain the existing `"test": "astro build && node --test"` script
      - Done when: npm test creates a session over HTTP, observes the 303 redirect, and asserts its title on /s/[id] without creating or modifying data/makan.db
- [ ] Return 404 for unknown or malformed session id
      Done when: /s/zzzzzz, /s/short, /s/abc12u3, and /s/abc12!3 return 404 rather than 500
- [ ] Render place names and vote counts on /s/[id], skipping empty slots, with data-place and data-votes attributes as test hooks
      Done when: a 2-place session shows exactly 2 places at 0 votes
- [ ] Validate the create form: trim title and all place names; title required and max 100 chars; each non-empty place max 60 chars; require 2-4 non-empty places; compact accepted place into sequential database slots
      Return 422 and re-render errors with the original submitted fields preserved
      Done when: submitting 1 place writes no row; whitespace-only places do not count; inputs in slots 2 and 4 are stored as place1 and place2; duplicate names are accepted
- [ ] Implement landing page: link to /new, empty state, and public sessions list ordered by `created_at DESC, rowid DESC`, with open/closed state visible
      Done when: sessions created within the same second still appear in deterministic newest-first order and fresh db shows the empty state

### 3. Voting

- [ ] Add upvote with one conditional SQL UPDATE that increments the mapped vote column only when the session is open and the selected place name is not null
      Done when: upvoting increments exactly one present place, survives a refresh, returns 400 for an empty place slot, and returns 409 without changing counts after closure
- [ ] Add downvote with one conditional SQL UPDATE using MAX(0, votes - 1), with the same open-session and present-place conditions
      Done when: downvoting a place at 0 leaves it at 0; an empty slot returns 400; a closed session returns 409 without changing counts
- [ ] Cover close-versus-vote behavior without a read-then-update race
      Done when: the vote query itself includes `is_open = 1`, so a vote cannot succeed after a close update commits
- [ ] Guard `Astro.request.formData()` on every POST endpoint (/new and /s/[id]) so a non-form or unparseable POST body returns 400 instead of an unhandled 500
      Done when: a POST with `content-type: application/json` and a garbage body returns 400 on both /new and /s/[id], and changes no counts

### 4. Closing and winner

- [ ] Add close: form POST sets is_open = 0, redirects with 303, and hides vote and close controls
      Done when: a closed session renders without vote buttons, shows the reopen control, and closing it again is an idempotent 303
- [ ] Reject votes server-side when is_open = 0
      Done when: a hand-crafted POST to a closed session returns 409 and changes no counts
- [ ] Highlight the winner only among populated place slots on a closed session, using `data-winner` and a text label rather than color alone
      - One leader: mark that place as winner
      - Positive tie: mark every tied leader and show `Seri!`
      - All zero: mark no winner and show `Belum ada pemenang`
      Done when: one leader is marked, a tie shows both leaders, all-zero marks none, and hidden slots never participate
- [ ] Add reopen: form POST sets is_open = 1 and redirects with 303
      Done when: reopening restores voting with counts intact, hides winner presentation while open, and reopening again is an idempotent 303

### 5. Routing edges and polish

- [ ] Redirect valid non-canonical GET ids to their canonical form with 301 and preserve the query string
      Done when: /s/ABC12QX 301s to /s/abc12qx, and /s/abc12ox 301s to /s/abc120x, malformed ids return 404, and redirect assertions use `redirect: 'manual'`
- [ ] Install `qrcode` and `@types/qrcode` with `npm install --save-exact`; render the QR server-side with `QRCode.toString(url, { type: 'svg'})` so no client JS is added
      The payload is the absolute canonical session URL based on the current request origin; deployment must preserve the public scheme and Host header
      Show the canonical share URL as text and give the QR an accessible Indonesian label
      If QR generation fails, the detail page still renders the text share URL
      Done when: the encoded QR value equals the canonical absolute URL, the text URL remains available, and scanning the QR on a phone opens the session
- [ ] Implement custom Indonesian 404 and 500 pages
      - 404 heading: `Nyasar, ya?`, with a link back to the landing page
      - 500 heading: `Dapurnya lagi meledug`, with retry and landing-page links
      Done when: an unknown URL renders status 404 with custom content in a production build
      Done when: a temporary controlled SSR throw returns status 500 with custom content in a production build; remove the temporary throw before completing the step
      Note: 500.astro only renders in a production build, not dev
- [ ] Add a shared mobile-friendly page shell with `<html lang="id">`, descriptive titles, and `<meta name="viewport" content="width=device-width, initial-scale=1">`
      Every form control has a visible label; validation errors are associated with their fields; winner state is not conveyed only by color; interactive controls have visible keyboard focus
      Done when: landing, new, validation-error, open-session, closed single-winner, close tie, 404, and 500 pages have no horizontal scroll at 320px
      
### 6. Final verification

- [ ] Run `npm test`
      Done when: the build and all node:test suites pass
- [ ] Verify the default committed database
      - Tests must not create or modify data/makan.db
      - Stop the server before inspecting or staging database
      - Confirm no -wal, -shm, or live-journal sidecar remains
      Done when: data/makan.db contains an empty vote_sessions table and production startup can reopen it
- [ ] Perform the manual 320px and QR checks with MAKAN_DB pointing at a scratch database so the committed data/makan.db stays empty
      Done when: all listed pages pass the responsive check and a phone opens the canonical session URL from the QR
