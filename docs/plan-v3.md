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
- The client stays inside the API surface a non-secure context exposes. The two-device
  demo is a phone hitting a laptop over LAN HTTP, and `http://192.168.x.x` is not a
  secure context - only HTTPS and `localhost` are. `crypto.randomUUID` and
  `crypto.subtle` both carry `[SecureContext]` in the Web Crypto IDL and are simply
  absent there, and `navigator.serviceWorker` is absent with them, so the precache
  registration silently no-ops and the offline story needs HTTPS or `localhost` to be
  seen at all. `crypto.getRandomValues` carries no such annotation, which is why both
  generators in `id.ts` use it. The device id was `crypto.randomUUID()` until a real
  LAN run threw `TypeError: crypto.randomUUID is not a function`; `test/device.spec.ts`
  deletes both secure-context members before the page loads, so the next reach for one
  fails in the suite rather than on a phone
- The service worker precaches the shell and never caches data. The service worker
  serves the app; IndexedDB serves the data. It supersedes
  `docs/adr/0001-no-service-worker-in-v2.md`, which deferred the worker until the
  local store it serves existed. That ADR is left as written: it records why v2
  shipped without one, not a rule this branch has to keep
- The QR stays server-only and online-only. Offline the share block shows URL text.
  An offline QR cannot resolve a scan, so it is not worth a client-side bundle
- Sync fires on load, on `online`, on `visibilitychange` into visible, on a server-sent
  event saying that session changed, and on every reconnection of the stream that
  carries those events. No polling, no sync control - see
  `docs/adr/0008-changes-arrive-over-an-event-stream.md`. `visibilitychange` was taken
  out when the stream landed and is back beside it: it only ever fires when a device
  comes back to a tab, so it cannot carry the demo on its own, but it costs nothing
  when it does not fire and it is the cheapest cover for a phone that slept
- A trigger is a reason to try, not the try itself. An attempt that failed is retried
  on `retryDelay`'s schedule until one succeeds or the schedule runs out, which is not
  polling: a poll fires because time passed, a retry exists only because something
  failed, and a converged device that can reach the relay makes no request between
  triggers. Bounded at six attempts, 500ms doubling to 16 seconds; a fresh trigger
  restarts the chain
- The UI says nothing about the network. No staleness line, no offline banner, no age
  stamps. An unreachable session reuses `data-state="missing"`
- Sync bodies stay form-encoded, with `device` carrying this device's id and `doc`
  carrying its document as a string. This keeps `readForm`, the unparseable-body 400
  guard and Astro's `checkOrigin`, which only applies to form content types. The id
  travels beside the document rather than inside it because the row is keyed
  `(session_id, device_id)` and the server cannot read a device id out of a payload
  it never parses
- The demo serves the relay behind an HTTPS-terminating proxy, so the config has to
  name the tunnel's domain. `checkOrigin` compares the browser's `Origin` header
  against `Astro.url.origin`, and that URL is built from the request the server
  actually received - plain `http` on whatever `Host` arrived, because nothing
  reached the process over TLS. The browser sends `Origin: https://<host>.ts.net`,
  the scheme does not match, and every sync POST is a 403 while the page itself
  loads fine. `security.allowedDomains` is what lets Astro see the real external
  origin: with `[{ hostname: "**.ts.net", protocol: "https" }]` the forwarded
  `X-Forwarded-Proto` and `X-Forwarded-Host` are trusted, `Astro.url` becomes the
  address the phone typed, and the share URL and QR built from it become reachable
  too. `**` matches any subdomain depth, so it covers a MagicDNS name like
  `foxos.taila890ba.ts.net`. The trade is that anything able to reach the server
  directly could claim such a host; that is acceptable because the server binds
  `127.0.0.1` and only the funnel reaches it. `checkOrigin: false` and
  `allowedDomains: [{}]` both remove the 403 by removing the check instead, which is
  what `test/api.test.ts` pins against: a forwarded host off the allowlist, an
  `Origin` that disagrees with the forwarded host, and a lookalike host that merely
  ends in the allowed name are all still refused
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
| `GET /api/sessions/[id]/events`, malformed id | 404 |
| `GET /api/sessions/[id]/events` | 200 `text/event-stream`, held open |

A valid but unknown id is 200 with an empty array, not 404: the server cannot know
whether a session exists, only whether it holds documents for it. The stream is the
same: any valid id is subscribable, because holding nothing for a session is not the
same as knowing it does not exist.

All three handlers normalize the id before touching the store or the registry, so a
lookalike-typo link reads, writes and subscribes to the same row as the canonical one.

The stream's frames are `event: ready\ndata: ok` once, on connect; `data: changed`
whenever a document for that session is written to something other than what was
already there; and a `:` comment line every `MAKAN_BEAT` milliseconds, 15000 by
default. A POST that stores the same bytes still answers 204 and notifies nobody -
see `docs/adr/0008-changes-arrive-over-an-event-stream.md`.

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
  the round trip, `pushDoc` is a local write's publish, `keepSynced(run)` and
  `keepListening(id, run)` are the triggers, and `retrying(run)` is the timer that
  re-runs an attempt that failed. All client-only, and none of them decides anything -
  what a pull does to the store is `mergePulled`'s call, and how long to wait before
  trying again is `retryDelay`'s
- `src/lib/retry.ts` holds that schedule and nothing else. `retryDelay(attempt)` is the
  delay before that attempt, or null once the schedule is spent, which is what makes
  the retry bounded rather than a timer nobody can stop. It is pure and unit-tested for
  the same reason every other decision here is: a browser is a bad place to find out
  that a backoff never terminates
- The device id is `generateDeviceId()`, generated once and persisted in IndexedDB's
  `meta` store. Get-or-create stays in the adapter rather than becoming a pure
  function: the only decision in it is a `??`, and persisting the result is its whole
  substance. One read-write transaction covers the read and the write, so two callers
  racing on a fresh device cannot mint two ids. A device that already holds one keeps
  it, whatever shape it is in: the id names that device's rows on the relay, so
  re-minting would orphan every document it ever pushed
- `generateDeviceId` reuses the session id's Crockford alphabet and its uniform
  `byte % 32` mapping - 256 is a multiple of 32, so there is no modulo bias - and takes
  26 characters, which is 130 bits, against the 122 a v4 uuid carries. A device id
  never reaches a URL, so length costs nothing and there is no reason to trade entropy
  for a shorter one. Fixed width over an alphabet that is already in ASCII order makes
  plain `<` a total order on two ids, which is what `mergeDocs` breaks a creator tie on
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
- Every local write publishes this device's document immediately: `vote` and `close`
  both go through `change`, which writes to IndexedDB and then fires `pushDoc` without
  waiting for it. Before that the only push was a sync's, so a vote sat on the device
  until the next trigger and the relay had nothing to notify anyone about - a stream
  is worth nothing if writes do not reach the server that feeds it. The push does not
  block the repaint - it is fired without being waited on - but it is no longer forgotten:
  a push that did not land kicks the retry loop. Swallowing it on the reasoning that the
  next sync republishes the same document is only true if a next sync happens, and a vote
  made while the relay was unreachable was measured still missing from the relay eight
  seconds after it came back, on a page that stayed open and online throughout. It is
  deliberately still not `exchange` on the happy path: pulling there would repaint a
  device in the middle of its own tap for no news
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
  event the relay sends and costs three things at once: focus drops to `BODY`, the
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
- A device is notified of its own writes and nothing filters that out server-side. The
  relay would have to know whose document it just stored and whose connection each
  subscriber is, which is state it has no reason to keep. It costs nothing on the
  client: the pull comes back holding this device's own document, `mergePulled` skips
  it for carrying this device's id, `applyPulled` returns null and no repaint happens.
  A spec pins it by voting and watching the just-voted flash and the focus survive the
  round trip - so the two rules above are what make the self-notification harmless,
  and breaking either of them shows up as a page that flickers under its own taps
- The landing list is the exception and repaints on every sync, changed or not. Its
  rows render `relativeTime` and sync is the only thing that ever runs on that page,
  so that repaint is what keeps `baru saja` from still saying so an hour later
- The landing page fans its sessions out in parallel and repaints once when they
  have all answered. They are independent rows on the relay with no ordering between
  them, so serial would only multiply the round trips, and the list is bounded by
  being this device's alone - see `0005-the-landing-list-is-local.md` - so the
  fan-out needs no concurrency limit
- An exchange says whether it worked. It answers null when it could not read the relay,
  and otherwise the pulled documents beside whether this device's own document landed;
  a push answering a non-2xx counts as not landed. Returning an empty array for both
  "unreachable" and "nothing new" is what made a device give up silently and stay
  stale, which is the whole of the convergence bug this branch shipped with. The pull
  still runs when the push was refused, so a relay that will not take this device's
  writes - the funnel's `checkOrigin` 403 is the live example - does not also cost it
  everyone else's. Failure stays silent on screen: no banner, no console, nothing about
  the network in the UI. It is just no longer silent to the code
- The session page subscribes to `/api/sessions/[id]/events` and pulls on every
  `message`. `EventSource` owns the reconnection for a transient failure and retries it
  for as long as the page lives, so nothing here duplicates that. What it does not own
  is a fatal one: a non-200 - a proxy answering 502 while the relay restarts - closes
  the stream by specification, one attempt and no retry, and that was measured. A
  stream found in `readyState === CLOSED` is rebuilt on `retryDelay`'s schedule. The
  landing page subscribes to nothing - see
  `docs/adr/0008-changes-arrive-over-an-event-stream.md`
- `EventSource` owning the reconnection is also what reports it: it fires `open` for
  every connection it makes, so the second and every later one means the stream was
  down and a change could have passed unseen, and `keepListening` syncs there. The
  first `open` is skipped - it lands beside the load sync, and syncing there is a
  whole extra push and pull on every page load, which the push-before-pull spec sees
  and fails on. It is the reason the greeting is a named `ready` event: `open` is the
  reconnect signal, so the greeting must not double as one. The skip is keyed on
  whether the page has been without a stream rather than on which connection this is,
  so a first connection that failed fatally is a gap like any other and the connection
  that replaces it syncs
- A spec that wants the stream to drop under a page runs the events request through a
  local proxy it can destroy the socket of - `cuttableStream` in `test/browser.ts`,
  which rewrites the request's URL with `route.continue`. Routing alone cannot do it:
  a route is matched when a request starts, and the request being severed here has
  been open for seconds. Cutting the connection rather than the network is the point,
  since `setOffline` would fire `online` on the way back and that is the trigger the
  spec has to rule out
- A spec that wants a sync without a stream event dispatches `online` on `window`, or
  `visibilitychange` on `document`, where each is listened for. Both stand in for a
  trigger that is hard to stage rather than for a real network or visibility
  transition
- A spec that wants the reconnect edge a real radio has runs the page's API requests
  through a route that refuses the first of them - `refuseSync` in `test/browser.ts`.
  `context.setOffline(false)` is not that edge: it restores the network and fires
  `online` in the same instant, so the request the trigger makes always succeeds and
  the sequence that broke two real devices passes on it. What broke them is that
  `online` arrives before DNS and routing do, and one refused request is the whole of
  it
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
- [x] A local write publishes at once, and the relay grows an event stream the session
      page subscribes to. A real two-device run found the branch had no live path at
      all in either direction: nothing pushed on a vote, and nothing pulled while a tab
      stayed visible. `visibilitychange` goes with it, so the trigger list is load,
      `online` and the stream. Written after the branch was already presented, which is
      why it is a step of its own rather than a correction to the sync step above
- [x] A reconnection of the stream is a sync, which closes the gap the step above left
      open: a phone that sleeps through a change wakes with its stream dropped, and the
      connection it has to remake is the signal that something may have passed it.
      Two findings came with it. The relay published every write, so a device's own
      change frame triggered a sync whose push republished - one tap became an endless
      exchange, over five hundred pushes in a second and a half, on every device on the
      session; the relay now publishes only a write that stored different bytes. And
      syncing on the first `open` rather than only on later ones costs an extra push
      and pull on every page load, which the push-before-pull spec catches
- [x] An attempt that failed is retried, so a trigger is a reason to try rather than
      the only try. A third two-device run over the funnel lost a phone's votes for
      good: the phone voted offline and pushed on the way back, the desktop voted while
      still offline, and the desktop came back to its own tally and stayed there. Three
      things were wrong at once and each was measured on its own. `exchange` answered
      an empty array for "could not reach the relay" and for "nothing new" alike, and
      nothing retried, so one refused request at the reconnect edge was permanent. A
      push that answered a non-2xx was counted as landed. And a local write's push
      swallowed its failure, so a vote made while the relay was down never reached it -
      still missing eight seconds after the relay came back, on a page that never left.
      `visibilitychange` returns as a trigger beside the stream rather than instead of
      it, and a stream the relay closed outright is rebuilt on the same schedule

## Manual checks

- Open one session on two devices, vote on one, and confirm the other moves without
  being touched - no reload, no tab switch, no tap
- Open the session on a phone, let the screen sleep, vote on the laptop, and confirm
  the phone is already showing it when the screen comes back - no reload, no tap
- Load `/`, tick Offline in DevTools, reload, and confirm the list and a session both
  render
- Vote offline on two devices, reconnect both, and confirm the tallies combine
- Vote offline on the phone, bring the phone back while the laptop is still offline,
  vote on the laptop, then bring the laptop back, and confirm both screens end on the
  combined tally - the ordering is the point, because the laptop's own pull is the only
  thing that can rescue it
- Restart the relay with both devices on a session, vote on one, and confirm the other
  moves without being touched - the stream each device had is gone and has to come back
  on its own
- Close on one device offline while the other votes, reconnect, and confirm closed wins
- Confirm the `<noscript>` message still appears with JavaScript disabled
- Open the app from a second device over LAN HTTP and create a session there, which is
  the only check that runs outside a secure context
