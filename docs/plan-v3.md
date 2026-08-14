# PLAN v3

v3 keeps v1's validation and v2's isomorphic view helpers untouched. It changes where
the data lives. Read `PLAN.md` and `docs/plan-v2.md` first - everything they record
still holds unless contradicted below.

Every device holds a complete copy of every session it knows about and renders from
it. The server keeps one opaque document per session per device and never parses one.
Merging is a pure function on the client.

## Decisions

- Local-first means custody, not authority. No accounts, no login, no authorization;
  `PLAN.md`'s Access decision stands
- Reads and writes both work offline. The local store is the UI's source of truth and
  the network is an optimisation
- Local store is IndexedDB. No new runtime dependency
- A vote is a PN-counter per place per device. Unbounded stacking is preserved
- Tallies are rendered as computed and may be negative - see
  `docs/adr/0006-tallies-can-be-negative.md`
- `is_open` is monotonic; reopen is removed - see
  `docs/adr/0004-closing-is-permanent.md`
- The server is an opaque relay - see `docs/adr/0003-server-is-an-opaque-relay.md`
- The landing list is local; `GET /api/sessions` is deleted - see
  `docs/adr/0005-the-landing-list-is-local.md`
- `/new` becomes client-side. `validateCreate` runs unchanged in the browser, the
  device generates the id, and the creator document is written locally. `PLAN.md`'s
  303-on-create and 422 re-render are gone, and with them ADR 0002's control
- Session ids stay 7 characters. Client-side generation means no server-side
  collision retry; the risk is accepted at roughly 1% per 26,000 sessions and the
  merge keeps the creator document with the lower device id, so a collision is
  convergent-but-wrong rather than divergent
- Id generation moves from `db.ts` to `id.ts` and from `node:crypto` randomBytes to
  `crypto.getRandomValues`, which Node 24 and every browser both have
- The service worker precaches the shell and never caches data. The service worker
  serves the app; IndexedDB serves the data
- The QR stays server-only and online-only. Offline the share block shows URL text.
  An offline QR cannot resolve a scan, so it is not worth a client-side bundle
- Sync fires on load, `online` and `visibilitychange`. No polling, no sync control
- The UI says nothing about the network. No staleness line, no offline banner, no age
  stamps. An unreachable session reuses `data-state="missing"`
- Sync bodies stay form-encoded with one field, `doc`, carrying the document as a
  string. This keeps `readForm`, the unparseable-body 400 guard and Astro's
  `checkOrigin`, which only applies to form content types
- The merge returns the same row shape the endpoints returned in v2, so `listPlaces`,
  `tallyView`, `winnerView` and `relativeTime` are untouched and the whole render path
  in `app.ts` survives
- Playwright drives the browser suites under `@playwright/test`; `node --test` keeps
  `src/lib` and the HTTP e2e - see
  `docs/adr/0007-browser-automation-for-the-offline-claim.md`
- One branch. Unlike v1 and v2 this step is presented as a whole-branch diff, so
  `docs/talk.md`'s rule that every step fails visibly before the next repairs it does
  not apply to it

## Non-goals

- No public discovery, no list of all sessions, no pagination
- No reopen
- No server-side validation of documents. A hand-crafted POST can store anything
- No compaction, expiry or eviction. Documents are retained indefinitely, on the
  device and on the server
- No conflict UI. Merges are silent and there is nothing for a user to resolve
- No client framework. Vanilla DOM, unchanged from v2

## Data model

`vote_sessions` is dropped outright. `CREATE TABLE IF NOT EXISTS` never upgrades an
existing file, so delete your local `data/makan.db` and let it be recreated.

session_docs:
- session_id TEXT NOT NULL
- device_id TEXT NOT NULL
- doc TEXT NOT NULL
- updated_at TEXT NOT NULL DEFAULT (datetime('now'))
- PRIMARY KEY (session_id, device_id)

`doc` is never parsed by the server. Every row has exactly one writer.

## Document shape

Every device holds one document per session it knows. Only the creator's document
carries `title`, `places` and `created_at`; on every other document they are null.

- device: string, the device id
- title: string | null
- places: string[] | null, 2-4 trimmed non-empty names
- created_at: string | null, `datetime('now')` format, UTC
- closed: boolean
- up: Partial<Record<'1'|'2'|'3'|'4', number>>
- down: Partial<Record<'1'|'2'|'3'|'4', number>>

Both counters are sparse. A slot a device never touched carries no key at all, and a
missing key reads as zero, so a device that voted for one place holds one entry rather
than three zeros. `Partial` is what makes the empty `{}` on a fresh document assignable
under `astro/tsconfigs/strict`.

## Merge

`mergeDocs(docs)` returns v2's row shape: `title`, `is_open` as 1 or 0,
`place1_name` through `place4_name` with unused slots null, `place1_votes` through
`place4_votes`, and `created_at`.

- Identity comes from the document with a non-null title; on a tie the lower device
  id wins, so a client-generated id collision is convergent
- `is_open` is 0 when any document has `closed` true
- Each slot's tally is the sum of every `up` minus the sum of every `down`, unclamped

## HTTP behavior

Replaces the table in `docs/plan-v2.md`.

| Request condition | Result |
|---|---|
| `GET /` | 200 shell, no session data, no loading state |
| `GET /new` | 200 shell; the form is handled entirely by the client |
| `POST /new` | 405. Creating is client-side |
| `GET /s/[id]`, malformed id | 404 from the page |
| `GET /s/[id]`, any valid id | 200 shell, no session data |
| `GET /api/sessions` | 404. The route is deleted |
| `GET /api/sessions/[id]`, malformed id | 404 |
| `GET /api/sessions/[id]`, unknown id | 200, empty array |
| `GET /api/sessions/[id]` | 200, every document for that session as a JSON array |
| `POST /api/sessions/[id]`, form field `doc` | 204, document stored verbatim |
| `POST /api/sessions/[id]`, non-form or missing `doc` | 400 |

A valid but unknown id is 200 with an empty array, not 404: the server cannot know
whether a session exists, only whether it holds documents for it.

## Conventions

- The device id is `crypto.randomUUID()`, generated once and persisted in IndexedDB
- The client talks to a narrow store port so the IndexedDB adapter stays the only
  untestable part
- `data-state` goes straight to `ready`. `loading`, `error` and the retry button are
  gone; `missing` remains and now also covers a session this device does not hold
- The service worker is `public/sw.js` with a hand-bumped `version` constant as its
  cache name, `skipWaiting()` and `clients.claim()`, deleting every other cache on
  activate
- Malformed ids are rejected client-side by `normalizeSessionId` as well as by the
  page, since the service worker serves the shell for any `/s/*`
- Browser suites are `test/*.spec.ts` under `@playwright/test`; everything else stays
  `test/*.test.ts` under `node --test`

## Steps

Ordered so every commit is green. The pure functions land first, then the server, then
the client, then the service worker.

- [ ] `mergeDocs` turns a lone creator document into a session row
- [ ] `mergeDocs` sums PN counters across documents, unclamped and possibly negative
- [ ] `mergeDocs` closes when any document is closed, and picks the lower device id
      when two documents both claim a title
- [ ] `emptyDoc`, `applyVote` and `applyClose` as pure document transforms
- [ ] Id generation moves to `id.ts` on `crypto.getRandomValues`
- [ ] `session_docs` replaces `vote_sessions`; `GET` and `POST /api/sessions/[id]`
      become the relay, and the e2e suites are rewritten onto it in the same commit
- [ ] Playwright and `@playwright/test` are installed and `pnpm test` chains both
      runners
- [ ] The store port and its IndexedDB adapter, with the device id
- [ ] `/s/[id]` renders from the local store and votes write locally
- [ ] `/` renders the local list; `GET /api/sessions` is deleted
- [ ] `/new` creates locally and navigates to the new session
- [ ] Sync on load, `online` and `visibilitychange`
- [ ] The service worker precaches the shell
- [ ] Delete dead code; update `AGENTS.md`, `README.md`, `PLAN.md` and `docs/talk.md`

## Manual checks

- Load `/`, tick Offline in DevTools, reload, and confirm the list and a session both
  render
- Vote offline on two devices, reconnect both, and confirm the tallies combine
- Close on one device offline while the other votes, reconnect, and confirm closed wins
- Confirm the `<noscript>` message still appears with JavaScript disabled
