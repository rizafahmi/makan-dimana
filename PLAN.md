# PLAN

## Decisions

- Close/reopen: no ownership, anyone with the link can toggle is_open
- Mutations: form POST + redirect, no /api routes
- Vote spam: unguarded by design; downvotes clamp at 0
- Session listing: public by design

## Steps

### 1. Foundation

- [ ] Configure SSR: add @astrojs/node adapter, output: 'server'
      Done when: a page renders a fresh timestamp on every reload
- [ ] Add db connection module: create data/, open data/makan.db, assert journal_mode = delete, globalThis singleton
      Done when: booting creates data/makan.db with no -wal sidecar
- [ ] Create vote_sessions at startup with CREATE TABLE IF NOT EXISTS
      (id TEXT PK, title, is_open DEFAULT 1, created_at,
      place1_name/place2_name NOT NULL, place3_name/place4_name nullable,
      place1..4_votes DEFAULT 0)
      Done when: the table exists and a second boot is a no-op
- [ ] Add session id generator: 7-char Crockford Base32 lowercase
      Done when: node:test asserts length, alphabet, and absence of i/l/o/u
- [ ] Add createSession + getSession with UNIQUE collision retry
      Done when: node:test round-trips a session and covers a forced collision

### 2. Create and view

- [ ] Add /new page and minimal /s/[id]: form posts title + 4 place inputs, inserts, redirects; detail page shows the title
      Done when: submitting the form lands on a detail page showing the title
- [ ] Render place names and vote counts on /s/[id], skipping empty slots
      Done when: a 2-place session shows exactly 2 places at 0 votes
- [ ] Validate the create form: title required, min 2 places, re-render errors with input preserved
      Done when: submitting 1 place returns the form with an error and writes no row
- [ ] Implement landing page: sessions list ordered by created_at desc, open/closed state visible
      Done when: two sessions appear newest first

### 3. Voting

- [ ] Add upvote: form POST + redirect, atomic +1
      Done when: upvoting increments one place and survives a refresh
- [ ] Add downvote: atomic MAX(0, votes - 1)
      Done when: downvoting a place at 0 leaves it at 0

### 4. Closing and winner

- [ ] Add close: form POST sets is_open = 0, vote controls hidden
      Done when: a closed session renders without vote buttons
- [ ] Reject votes server-side when is_open = 0
      Done when: a hand-crafted POST to a closed session changes no counts
- [ ] Highlight the winner on a closed session, handle ties and all-zero
      Done when: a tie shows both leaders and an all-zero session shows no winner
- [ ] Add reopen: form POST sets is_open = 1
      Done when: reopening restores voting with counts intact

### 5. Routing edges and polish

- [ ] Return 404 for unknown session id
      Done when: /s/zzzzzzz returns 404, not a 500
- [ ] Redirect non-canonical id to canonical lowercase with 301
      Done when: /s/ABC12QX 301s to /s/abc12qx
- [ ] Implement QR Code in the detail page to make sure user able to share vote session easier. Use third-party deps
      Done when: scanning the QR on a phone opens the session
- [ ] Implement entertaining 404 and 500 pages
      Done when: an unknown URL renders the custom page in a production build
      (note: 500.astro only renders in a production build, not dev)
- [ ] Ensure a mobile-friendly, responsive viewport for all pages
      Done when: no horizontal scroll at 320px width
      (index.astro viewport meta is missing initial-scale=1)
