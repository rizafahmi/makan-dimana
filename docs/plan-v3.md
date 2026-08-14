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
- Sync bodies stay form-encoded, with `device` carrying this device's id and `doc`
  carrying its document as a string. This keeps `readForm`, the unparseable-body 400
  guard and Astro's `checkOrigin`, which only applies to form content types. The id
  travels beside the document rather than inside it because the row is keyed
  `(session_id, device_id)` and the server cannot read a device id out of a payload
  it never parses
- A read returns an array of document *strings*, so the client runs `JSON.parse` per
  element. Concatenating the stored strings into one JSON array server-side would
  hand the client real objects while still parsing nothing, and it is the obvious
  thing to "simplify" this into - but then one malformed document poisons the whole
  response for every device in that session, and a single hand-crafted POST takes a
  session down for everyone. Per-element parsing keeps a bad document to the one
  device that wrote it
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

`doc` is never parsed by the server. Every row has exactly one writer, so `putDoc`
is a blind `INSERT OR REPLACE` and needs no merge, no compare-and-set and no
conflict handling. `listDocs` returns that session's document strings, in no
promised order - the merge is order-independent. `updated_at` is written and never
read; it is there for a human looking at the file.

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

`src/lib/merge.ts` owns the whole document vocabulary: the shape, the four transforms
that produce a device's next document, and the merge that reads a pile of them. Every
transform returns a new document rather than editing the one it was given, because the
store hands the same object to the renderer.

- `emptyDoc(device)` is what a device starts with when it opens someone else's
  session: no title, no places, no `created_at`, nothing voted, not closed
- `creatorDoc(device, title, places, createdAt)` is the one document that carries the
  session's identity. It takes the timestamp instead of reading a clock, the way
  `relativeTime(then, now)` takes `now`, so it stays pure
- `applyVote(doc, slot, delta)` increments `up` for a positive delta and `down` for a
  negative one. Both are increments - `down` counts cancellations and is never itself
  negative. The argument order matches v2's `recordVote(id, place, delta)`
- `applyClose(doc)` sets `closed`. There is deliberately no `applyReopen`: closing is
  one-way, so the merge can OR the flags and needs no clocks - see
  `docs/adr/0004-closing-is-permanent.md`

The transforms trust their inputs. `validateCreate` is what rejects an empty title or a
one-place session and it runs in the browser before `creatorDoc` is reached, so nothing
here re-checks; a slot that no place occupies is a counter no view reads.

## Merge

`mergeDocs(docs)` returns v2's row shape: `title`, `is_open` as 1 or 0,
`place1_name` through `place4_name` with unused slots null, `place1_votes` through
`place4_votes`, and `created_at` - or null when no document carries a title.

- Identity comes from the document with a non-null title; on a tie the lower device
  id wins, so a client-generated id collision is convergent
- No title anywhere means no identity, so the merge returns null instead of a row
  with a null title and no places. A device can hold vote documents for a session
  whose creator document has not reached it yet, and an empty document set is the
  same case; both are `data-state="missing"`. Callers must narrow the return
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
| `GET /api/sessions/[id]`, id the server holds nothing for | 200, empty array |
| `GET /api/sessions/[id]` | 200, that session's documents as a JSON array of strings |
| `POST /api/sessions/[id]`, fields `device` and `doc` | 204, stored verbatim |
| `POST /api/sessions/[id]`, malformed id | 404 |
| `POST /api/sessions/[id]`, non-form body or a non-string field | 400 |

A valid but unknown id is 200 with an empty array, not 404: the server cannot know
whether a session exists, only whether it holds documents for it.

Both handlers normalize the id before touching the store, so a lookalike-typo link
reads and writes the same row as the canonical one.

## Conventions

- A sync POST carries both `device` and `doc`. Neither is validated beyond being a
  string: a device names itself, and the server takes its word for it
- The client talks to a narrow store port so the IndexedDB adapter stays the only
  untestable part. A stored session is `{ id, docs }` - a session's id and the
  documents this device holds for it, at most one per device
- `src/lib/store.ts` is the pure half and holds every decision. `upsertDoc(docs, doc)`
  returns a new array with this device's document replaced or a new device's appended,
  which is how both a local vote and a sync pull land. `ownDoc(docs, device)` returns
  this device's document or a fresh `emptyDoc(device)`, so `applyVote` and `applyClose`
  always have something to transform. `localList(sessions)` merges each stored session,
  attaches its id and drops the ones that merge to null
- `src/scripts/idb.ts` is the plumbing half and is nothing but I/O: `allSessions()`,
  `readSession(id)`, `writeSession(session)` and `deviceId()`. It is client-only, so it
  sits beside `app.ts` rather than in `src/lib`, and it holds no logic - anything
  resembling a decision belongs in the pure half
- The device id is `crypto.randomUUID()`, generated once and persisted in IndexedDB's
  `meta` store. Get-or-create stays in the adapter rather than becoming a pure
  function: the only decision in it is a `??`, and persisting the result is its whole
  substance. One read-write transaction covers the read and the write, so two callers
  racing on a fresh device cannot mint two ids
- `localList` orders by `created_at` descending, matching v2's `listSessions`, and
  breaks a tie on the session id, descending. `datetime('now')` has one-second
  resolution, so ties are ordinary rather than exotic. The id carries no time
  information and is not pretending to; it is there because the order has to be total,
  or a list of same-second sessions reshuffles on every render. `listSessions`'s
  `LIMIT 20` does not come across - it existed to bound a list of everyone's sessions,
  and this one is only ever this device's
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

Green does not mean whole: from the relay step until `/new` creates locally there is
no way to create a session at all, and the v2 client keeps asking for endpoints that
have changed shape or gone. That is what "one branch, one whole-branch diff" buys -
a temporary server-side create would be code written only to be deleted.

- [x] `mergeDocs` turns a lone creator document into a session row
- [x] `mergeDocs` sums PN counters across documents, unclamped and possibly negative
- [x] `mergeDocs` closes when any document is closed, picks the lower device id when
      two documents both claim a title, and returns null when none does
- [x] `emptyDoc`, `creatorDoc`, `applyVote` and `applyClose` as pure document
      transforms
- [x] Id generation moves to `id.ts` on `crypto.getRandomValues`
- [x] `session_docs` replaces `vote_sessions`; `GET` and `POST /api/sessions/[id]`
      become the relay, and the e2e suites are rewritten onto it in the same commit
- [x] Playwright and `@playwright/test` are installed and `pnpm test` chains both
      runners
- [x] The store port and its IndexedDB adapter, with the device id
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
