# PLAN v2

v2 keeps v1's database, domain logic and validation untouched. It changes only where
rendering happens. Read `PLAN.md` first - everything it records still holds unless
contradicted below.

## Decisions

- Routes that load data render their shell on the server and fetch data from the client.
  Routes with no data to load stay fully server-rendered
- `/` and `/s/[id]` ship no session data. `/new`, `/404` and `/500` are unchanged
- `/s/[id]` still returns 404 server-side for a malformed id; a valid but unknown id
  renders the shell and the endpoint 404s
- Reads: `GET /api/sessions` and `GET /api/sessions/[id]`
- Mutations: form-encoded POST to `/api/sessions/[id]` via fetch. The `action` and
  `place` vocabulary, the precedence list, and the reason-to-status mapping are
  unchanged from `PLAN.md`
- Mutations respond with the updated session, so a vote costs one round trip, not two
- Endpoints return raw session rows. The client reuses `listPlaces`, `winningSlots` and
  `relativeTime` unchanged, so no domain logic is duplicated or retested
- Form-encoded bodies, not JSON. Keeps `readForm`, the unparseable-body 400 guard, and
  Astro's `checkOrigin`, which only applies to form content types
- Client rendering builds DOM with `createElement` and `textContent`. The QR `set:html`
  remains the only place auto-escaping is bypassed
- The loading state ships in the server-rendered HTML, not inserted by JavaScript. On a
  throttled connection the script is throttled too, so an inserted spinner would arrive
  after a blank screen
- `src/lib` splits into server-only (`db.ts`, `share.ts`) and isomorphic (`session.ts`,
  `time.ts`, `validate.ts`). Client code must never import a server-only module
- Client code lives in `src/scripts/*.ts`, imported from a bundled `<script>` so
  `astro check` sees it
- DOM plumbing has no automated test. Like configuration, it is manually verified

## Non-goals

- No service worker, no offline support - see `docs/adr/0001-no-service-worker-in-v2.md`
- No progressive enhancement - see `docs/adr/0002-v2-requires-javascript.md`
- No client framework. Vanilla DOM, no build-time framework, no hydration library
- No optimistic updates, no local cache, no request dedupe. v2 is meant to feel like
  the network
- No new components directory. Two pages do not justify one

## HTTP behavior

Additions and changes to the table in `PLAN.md`.

| Request condition | Result |
|---|---|
| `GET /s/[id]`, malformed id | 404 from the page |
| `GET /s/[id]`, any valid id | 200 shell with `data-state="loading"`, no session data |
| `GET /api/sessions` | 200, `listSessions()` rows as JSON |
| `GET /api/sessions/[id]`, malformed or unknown id | 404 |
| `GET /api/sessions/[id]` | 200, the raw session row as JSON |
| `POST /api/sessions/[id]` | The updated session as JSON, or the v1 status codes unchanged |

## Conventions

- `GET /api/sessions` returns `listSessions()` verbatim; the client formats `created_at`
  with `relativeTime`
- `GET /api/sessions/[id]` returns the raw row; the client calls `listPlaces(session)`
  then `winningSlots(places)`
- `POST /api/sessions/[id]` takes `action` (upvote|downvote|close|reopen) and `place`
  (1-4) form-encoded, and returns the same shape as the GET
- The data container carries `data-state`: `loading` -> `ready` | `error` | `missing`.
  Only `loading` appears in the server-rendered HTML
- Indonesian copy: `Memuat...` while loading, `Gagal memuat. Periksa koneksi.` with a
  `Coba lagi` button on error, `Sesi tidak ditemukan` for a valid but unknown id
- The container is `role="status"`; the spinner is CSS and collapses to static text
  under `@media (prefers-reduced-motion: reduce)`
- Endpoint suites assert over parsed JSON, not HTML substrings

## Steps

Ordered so every commit is green. The endpoints land alongside the existing pages, the
tests move across under green, then the pages give up their data, then the old path goes.

- [ ] `GET /api/sessions/[id]` returns the raw session row as JSON
      Done when: a seeded session round-trips through the endpoint with its title,
      is_open, place names and vote counts, and an unused slot comes back as null
- [ ] `GET /api/sessions/[id]` returns 404 for malformed and for valid but unknown ids
      Done when: a lookalike-typo id resolves to the same session, and `/api/sessions/zzzzzzz`,
      `/api/sessions/short` and `/api/sessions/abc12!3` all return 404
- [ ] `GET /api/sessions` returns `listSessions()` as JSON
      Done when: an empty database returns an empty array and seeded sessions come back
      newest first with the same ordering the landing list used
- [ ] `POST /api/sessions/[id]` applies the precedence list and returns the updated session
      Done when: an upvote returns the incremented row, a downvote at 0 clamps, a vote on
      a closed session is 409, an empty slot is 400, `place=02` and `action=bogus` are 400,
      close and reopen are idempotent, and a non-form body is 400
- [ ] Refactor under green: move the vote, close and landing assertions off HTML onto the
      endpoints. No production change
- [ ] `/s/[id]` ships a data-free shell and renders from the endpoint
      Done when: the page no longer contains any place name, does contain
      `data-state="loading"` and `Memuat...`, and a malformed id still 404s from the page
- [ ] `/` ships a data-free shell and renders the session list from the endpoint
      Done when: the page no longer contains any session title and does contain the
      loading hook, and the empty state still appears once the list has loaded
- [ ] Delete the form POST handling from `[id].astro` and its now-redundant tests
      Done when: `pnpm test` is green with one mutation path in the codebase

## Manual checks

- Throttle to Slow 3G and confirm the loading state appears on `/` and `/s/[id]` before
  the data does, and that a vote shows a pending state
- Confirm `prefers-reduced-motion: reduce` leaves readable static text
- Confirm the `<noscript>` message appears with JavaScript disabled
