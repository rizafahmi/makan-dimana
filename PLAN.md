# PLAN

## Decisions

- Close/reopen: no ownership, anyone with the link can toggle is_open
- Mutations: form POST + redirect, no /api routes
- Vote spam: unguarded by design; downvotes clamp at 0
- Session listing: public by design

## Steps

- [ ] Configure SSR: add @astrojs/node adapter, output: 'server'
      Done when: a page renders a fresh timstamp on every reload
- [ ] Add db connection module: create data/, open data/makan.db, assert journal_mode = delete, globalThis singleeton
      Done when: booting creates data/makan.db with no -wal sidecar
- [ ] Create vote_sessions at startup with CREATE TABLE IF NOT EXISTS
- [ ] Add session id generator: 7-char Crockford Base32 lowercase
      Done when: node:test assert length, alphabet, and absence of i/l/o/u
- [ ] Add createSession + getSession with UNIQUE collision retry
      Done when: node:test round-trips a session and covers a forced collision
- [ ] Add /new page and minimal /s/[id]: from post title + 4 place inputs, inserts, redirects; detail page shows the title
      Done when: submitting the form lands on a detail page showing the title
- [ ] Render place names and vote counts on /s/[id], skipping empty slots
      Done when: a 2-place session shows exactly 2 places at 0 votes
- [ ] Validate the create form: title required, min 2 places, re-render errors with input preserved
      Done when: submitting 1 place returns the form with an error and write no row
- [ ] Implement landing page: sessions list ordered by created_at desc,
      open/closed state visible
      Done when: two sessions appear newest first
- [ ] Add upvote: form POST + redirect, atomic +1
      Done when: upvoting increments one place and survives a refresh
- [ ] Add downvote: atomic MAX(0, votes - 1)
      Done when: downvoting a place at 0 leaves it at 0
- [ ] Add close: form POST sets is_open = 0, vote controls hidden
      Done when: a closed session renders whitout vote buttons
- [ ] Reject votes server-side when is_open = 0
      Done when: a hand-crafted POST to a closed session changes no counts
- [ ] Highlight the winner on a closed session, handle ties and all-zero
      Done when: a tie shows both leaders and an all-zero session shows no winner
- [ ] Add reopen: form POST sets is_open = 1
      Done when: reopening restores voting with counts intact
- [ ] Return 404 for unknown session id
- [ ] Redirect non-cannonical id to cannonical lowercase with 301
      Done when: /s/abc12-x 301s to its normalized form
- [ ] Implement QR Code in the detail page to make sure user able to share vote session easier. Use third-party deps
- [ ] Implement entertaining 404 and 500 pages
    (note: 500.astro only renders in a production build, not dev)
- [ ] Ensure a mobile-friendly, responsive viewport for all pages
      (index.astro viewport meta is missing initial-scale=1)

