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
  serves the app; IndexedDB serves the data. It supersedes
  `docs/adr/0001-no-service-worker-in-v2.md`, which deferred the worker until the
  local store it serves existed. That ADR is left as written: it records why v2
  shipped without one, not a rule this branch has to keep
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
| `GET /s/[id]`, any valid id | 200 shell, no session data, no loading state |
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
  attaches its id and drops the ones that merge to null. `applyPulled(session, pulled,
  device)` is a whole exchange's worth of decision: the stored session a pull produces,
  or null when it produced nothing to store and nothing to draw
- `src/scripts/idb.ts` is the plumbing half and is nothing but I/O: `allSessions()`,
  `readSession(id)`, `writeSession(session)` and `deviceId()`. It is client-only, so it
  sits beside `app.ts` rather than in `src/lib`, and it holds no logic - anything
  resembling a decision belongs in the pure half
- `src/scripts/sync.ts` is the other plumbing module: `exchange(id, device, own)` is
  the round trip and `keepSynced(run)` is the triggers. Both are client-only and
  neither decides anything - what a pull does to the store is `mergePulled`'s call
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
  gone; `missing` remains and now also covers a session this device does not hold.
  The shell therefore ships its container empty and carries no `data-state` at all:
  reading IndexedDB is asynchronous, so a `Memuat...` in the markup would flash for
  about a millisecond, and a spinner that never survives a frame is worse than nothing
- Visiting a valid `/s/[id]` writes an empty stored record for that id, even when the
  device holds no documents for it. ADR 0005 makes links the only index, so a device
  that opens a shared link offline and closes the tab would otherwise lose that session
  permanently. A junk record for a mistyped-but-canonical id costs about thirty bytes,
  and `localList` already drops it for having no creator document
- `utcTimestamp(at)` in `src/lib/time.ts` formats a `Date` into `datetime('now')`
  shape, so `new Date()` at the create call site is the only clock reading in the path
  and `creatorDoc` stays pure
- The service worker is `public/sw.js` with a hand-bumped `version` constant as its
  cache name, `skipWaiting()` and `clients.claim()`, deleting every other cache on
  activate. `public/` is copied rather than processed, so there is no build stamp to
  inject and nothing generates that constant
- Navigations are cache-first on the exact URL, network on a miss, and the precached
  session shell as the last resort. Network-first would keep the QR right whenever
  there is a connection, and was rejected for what it costs: a round trip in front of
  the first paint, which is the one thing this branch exists to remove. Cache-first
  gives up almost nothing in exchange, because a miss already goes to the network -
  `/` and `/new` are precached, and a session's own shell is cached the first time it
  is opened, so a borrowed shell only ever appears for a link this device has never
  opened online. Either way the data comes from IndexedDB; only the shell is at stake
- Precached: `/`, `/new`, `/s/0000000` and the two woff2 fonts - everything the app
  can name. The stylesheet is hashed and the client script is inlined into the HTML,
  so a fixed list cannot reach either; every other same-origin GET is cached the first
  time it is used instead. Generating a manifest would name them and is not worth a
  build step. The cost is one uncached load: the first visit installs the worker but
  is not yet controlled by it, so the stylesheet only reaches the cache on the second
  navigation
- The fallback answers any navigation, not only `/s/*`. An offline navigation to a
  route that was never cached therefore gets the session shell, whose client reports
  the session as missing - the same class of answer `/404` gives, one condition
  cheaper
- `/api/**` is never cached and never served from a cache; the worker declines it
  before the cache is opened. A sync request answered from a cache stops devices
  converging while every document involved is correct, so it reads as a merge bug and
  gets debugged as one
- One shell serves an unbounded URL space, so nothing baked into it can be trusted.
  The client reads the session id from `location.pathname`, and where the shell's
  `data-id` disagrees it removes the server-rendered QR and writes the share URL from
  `location`. A QR is a link nobody can read before following it, so pointing one at
  another session is worse than showing none
- A cached shell is replaced only when `version` changes, `astro dev` included. Bump
  it, or unregister the worker, after changing anything the shell ships
- Malformed ids are rejected client-side by `normalizeSessionId` as well as by the
  page, since the service worker serves the shell for any `/s/*`
- A sync is push then pull, in that order, so a device that voted while it was away
  gets its own change up before it takes anyone else's down. The reverse order still
  converges, but it publishes every local change a round trip later than it had to.
  A spec asserts the pair of requests, in order
- A pulled document never overwrites this device's own. `mergePulled` skips any
  document carrying this device's id rather than re-applying the device's own copy
  last: the relay's copy can only be older - a vote made since the last push is in
  the store and not yet on the server - and skipping is order-independent, which
  re-applying last is not. The same rule has a second half at the call site, where
  the merge reads whatever the store holds when the network answers rather than the
  snapshot it held when the exchange began, so a vote cast mid-exchange is not
  rolled back by the answer
- Every pulled element is parsed on its own and anything that will not parse is
  skipped. The relay validates nothing, so one hand-crafted POST is enough to put a
  string that is not a document into every other device's pull - `parseDoc` returns
  null for it and for anything carrying no device id, and `mergePulled` drops it.
  A bare `JSON.parse` per element, or trusting the array as a whole, hands that one
  document the power to break every other device's merge
- A sync repaints only when the pull landed something. `mergePulled` hands back the
  array it was given when nothing applies, so `applyPulled` compares it by reference
  and returns null. Nothing anywhere edits a document array in place - every transform
  returns a new one - so the reference is an answer rather than a coincidence. The
  first version repainted unconditionally, which on the two-device demo fires on every
  `visibilitychange` and costs three things at once: focus drops to `BODY`, the
  just-voted flash goes with it because `draw` clears `voted` on its way out, and a tap
  whose `pointerdown` and `pointerup` straddle the rebuild is swallowed by a button
  that no longer exists
- A pulled document identical to one already held lands nothing either. Without that
  half the reference check only ever helps a device syncing alone: in the settled
  two-device state every pull returns the other device's unchanged document, `upsertDoc`
  replaces it with an equal copy, and the new array reads as news. Identity is
  `JSON.stringify` on both sides, which can only be wrong in the harmless direction -
  two equal documents whose keys were written in a different order compare unequal and
  cost one repaint
- A repaint nobody asked for puts focus back where it was, exactly as a vote's does.
  `vote` and `sync` share one `repaint`: read the focused slot, render, restore it
- The landing list is the exception and repaints on every sync, changed or not. Its
  rows render `relativeTime` and sync is the only thing that ever runs on that page,
  so that repaint is what keeps `baru saja` from still saying so an hour later
- The landing page fans its sessions out in parallel and repaints once when they
  have all answered. They are independent rows on the relay with no ordering between
  them, so serial would only multiply the round trips, and the list is bounded by
  being this device's alone - see `0005-the-landing-list-is-local.md` - so the
  fan-out needs no concurrency limit
- An exchange that throws resolves to no documents. A failure is silent by design:
  nothing on screen, nothing in the console, no retry - the next trigger is the retry
- `visibilitychange` is listened for on `document`, where it is fired. The real event
  bubbles to `window` and a synthetic one does not, which is a trap for the spec
  rather than for the app: headless Chromium keeps every page visible, so the spec
  dispatches the event instead of backgrounding the tab
- Browser suites are `test/*.spec.ts` under `@playwright/test`; everything else stays
  `test/*.test.ts` under `node --test`. Two browser contexts are two devices, which
  is what makes convergence testable at all

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
- [x] `/new` creates locally, then `/s/[id]` renders from the local store and votes
      write locally. Planned as two steps and done as one, in that order: neither is
      observable alone, because nothing populates the store until creating is
      client-side, and nothing shows what create wrote until the session page reads it
- [x] `/` renders the local list; `GET /api/sessions` is deleted. The route itself went
      with the relay step, so what landed here is the client half: `mountLanding` reads
      every stored session and runs `localList` over it, and `loader`, `request`, the
      retry button and the loading and error copy are all deleted with it. Both shells
      ship their container empty in the same commit, because the only thing still
      putting `Memuat...` on screen was markup describing a fetch that no longer happens
- [x] Sync on load, `online` and `visibilitychange`. The session page syncs its own
      session and the landing page fans out over every session it holds. Both paint
      from the store before the first request leaves, which is the whole point of
      the branch and is pinned by a spec that holds the relay open. A follow-up
      narrowed the session's repaint to a sync that landed something, which is what
      keeps a background sync off the user's focus, flash and taps
- [x] The service worker precaches the shell, and one cached shell learns to serve any
      session: the client takes the id from the path and drops a QR that was rendered
      for a different one
- [x] Delete dead code; update `AGENTS.md`, `README.md` and `docs/talk.md`. `PLAN.md`
      and `docs/plan-v2.md` are left exactly as they are - a closed record is not made
      wrong by being superseded, and this file is where the contradictions get written
      down - which is a correction to what this step originally said. What went: the
      CSS for the in-flight disabled state, unreachable since `/s/[id]` started
      rendering from the store; a `.km-input::placeholder` rule that never had a match;
      the smoke suite `shell.test.ts` already proves; and `playwright` as a direct
      dependency, which nothing imports and `@playwright/test` already brings.
      `docs/talk.md` gains `3-improve-design` and `4-local-first`, sends the demo
      offline here rather than throttled, and now states the whole-branch exception to
      its own every-step-fails-visibly rule. `AGENTS.md`'s data model was still
      `vote_sessions` column by column

## Manual checks

- Load `/`, tick Offline in DevTools, reload, and confirm the list and a session both
  render
- Vote offline on two devices, reconnect both, and confirm the tallies combine
- Close on one device offline while the other votes, reconnect, and confirm closed wins
- Confirm the `<noscript>` message still appears with JavaScript disabled
