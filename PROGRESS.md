# Progress

Makan Dimana is a local-first Astro app where a group creates a vote session for food
places, shares a link, collects votes, and reveals the winner when the session closes.
Built as a teaching artifact across four numbered branches, each demonstrating one
architectural change from cloud-first to local-first.

## Branch 1: Naive server-rendered (1-naive)

Server-rendered Astro with forms and redirects, zero client JavaScript. 47 commits.

**What shipped:**

- SQLite database with `vote_sessions` table, `node:sqlite` driver
- Session creation at `/new` with 2-4 place names, 7-character Crockford Base32 ids
- Voting at `/s/[id]` with upvote/downvote, clamped at zero
- Close and reopen sessions, winner highlighting on close
- Public landing list at `/` ordered by `created_at` descending, capped at 20
- Indonesian relative time (`baru saja`, `N jam lalu`, `kemarin`)
- Session id normalization: lowercase, `i`/`l` to `1`, `o` to `0`
- QR code and share URL on session pages
- Custom Indonesian 404 and 500 pages
- Form validation with 422 re-render preserving submitted values

**Key decisions documented in PLAN.md:**

- No authentication, ownership, or authorization - anyone can vote or close
- Form POST mutations with 303 redirects, no `/api` routes
- Vote spam unguarded by design
- Empty optional slots stored as NULL, never empty string
- Sessions retained indefinitely, no expiration or pagination

## Branch 2: SSR with client fetch (2-ssr-csr)

Same app, but `/` and `/s/[id]` ship a shell and load data over the network. 18 commits
on top of v1. Deliberately worse - adds a round trip to make the network dependency
visible for the talk.

**What shipped:**

- JSON endpoints: `GET /api/sessions`, `GET /api/sessions/[id]`,
  `POST /api/sessions/[id]`
- Client entry `src/scripts/app.ts` with `createElement`/`textContent` rendering
- Loading state (`Memuat...`) in server-rendered HTML
- Error state with retry button (`Gagal memuat. Periksa koneksi.`)
- Missing state (`Sesi tidak ditemukan`) for valid but unknown ids
- Mutations via fetch with serialization and focus restoration
- `AbortSignal.timeout` on every request

**Key decisions documented in docs/plan-v2.md:**

- No service worker, no offline support (ADR 0001)
- JavaScript required (ADR 0002)
- Optimistic updates rejected - v2 is meant to feel like the network
- One inlined script entry to avoid external chunks on throttled connections

## Branch 3: Design system (3-improve-design)

v2's architecture with a design that survives a projector. 8 commits on top of v2.
Nothing about where the data lives changes here.

**What shipped:**

- Kantin Malam design system: one ground and one accent, self-hosted display type
- Winner promoted onto a hero plate
- Whole place row as the vote target
- Vote feedback with row flash
- Responsive layout for projector display

## Branch 4: Local-first (4-local-first)

The data moves onto the device. IndexedDB is the source of truth, the server becomes an
opaque relay, merging is a pure function on the client. 83 commits on top of v3.

**What shipped:**

### Core architecture

- IndexedDB local store with one document per session per device
- Pure merge function in `src/lib/merge.ts`: `emptyDoc`, `creatorDoc`, `applyVote`,
  `applyClose`, and `mergeDocs`
- PN-counters for votes: `up` and `down` per slot, sparse partial records
- Server as opaque relay: stores documents verbatim, never parses them
- `session_docs` table replaces `vote_sessions`: `(session_id, device_id, doc)`
- Client-side session creation with `crypto.getRandomValues`
- Device id generation and persistence in IndexedDB

### Sync and convergence

- Sync on load, `online`, `visibilitychange`, and server-sent events
- Push-then-pull ordering so local changes propagate before pulling
- Local write publishes immediately, not waiting for next sync
- Retry schedule: 500ms doubling to 16s, bounded at six attempts
- Per-element document parsing so one bad document cannot poison a session
- Repaint only when pull lands something, preserving focus and flash

### Event stream

- `GET /api/sessions/[id]/events` with SSE
- `ready` greeting, `changed` on document writes, keep-alive every 15s
- Publish only when stored bytes differ from existing
- Stream reconnection triggers sync
- Fatal close (non-200) rebuilt on retry schedule

### Service worker

- Hand-written `public/sw.js` with manual version constant
- Precaches `/`, `/new`, `/s/0000000`, fonts
- Cache-first for navigations, network on miss, generic session shell as fallback
- `/api/**` never cached
- Client validates shell's `data-id` against `location.pathname`

### Board surface (most recent work)

- `/s/[id]/board` route for projector display
- Same renderer as phone, scaled via CSS custom properties
- Keyboard controls: `1`-`4` vote slots, `Shift+1`-`4` cancel, `t` closes
- `event.code` detection for layout-independent keys
- Slot key caps as visible legends (slot, not position)
- Board-specific service worker shell for offline

**Key decisions documented in docs/plan-v3.md and ADRs:**

- ADR 0003: Server is an opaque relay, never validates documents
- ADR 0004: Closing is permanent, no reopen in v3
- ADR 0005: Landing list is local, `GET /api/sessions` deleted
- ADR 0006: Tallies can be negative (sum of up minus sum of down, unclamped)
- ADR 0007: Browser automation (Playwright) for the offline claim
- ADR 0008: Changes arrive over an event stream

## Known issues from code review

A whole-branch review at `xhigh` effort returned fifteen findings. Three confirmed by
execution, the rest by reading. None fixed yet - deferred to avoid mixing unrelated
fixes with the board work.

**Confirmed by execution:**

1. `mergeDocs` throws on a document with no counters - `parseDoc` accepts it, but merge
   dereferences `doc.up` and `doc.down`
2. A missing title key (undefined, not null) is read as a title claim, so an unknown
   session renders with an empty heading instead of missing
3. Retry chains overlap - `retrying()` cancels the timer but not an in-flight `run()`,
   and concurrent triggers spawn overlapping chains

**Found by reading:**

- `exchange()` never checks `pulled.ok`, so a JSON error body parses as documents
- Two tabs share a device id and silently overwrite each other's votes
- Landing sync rewrites every stored session ignoring the "did anything change" helper
- `relativeTime` renders `NaN hari lalu` when `created_at` is null
- `tallyView`'s share is unclamped, so a negative tally pushes another past 100%
- The unsubscribe closure in `relay.ts` can drop a newer room
- `CLAUDE.md` and `docs/plan-v3.md` describe `putDoc` as blind `INSERT OR REPLACE` but
  it is now a compare-and-set

## Open work

- The fifteen code-review findings, untouched
- `CLAUDE.md` and `docs/plan-v3.md` still contradict `src/lib/db.ts` about `putDoc`
- The Kantin Malam design-system project has no `Board.jsx` preview card

## Test infrastructure

- `node --test` for unit and HTTP e2e suites (`test/*.test.ts`)
- `@playwright/test` for browser suites (`test/*.spec.ts`), Chromium only
- Unit suites import `src/lib/*.ts` directly (Node 24 strips types)
- e2e suites spawn the built server with `MAKAN_DB` pointing at a temp database
- Browser suites: two contexts are two devices, enabling convergence tests
- `pnpm test` runs `astro check && astro build && node --test && playwright test`
