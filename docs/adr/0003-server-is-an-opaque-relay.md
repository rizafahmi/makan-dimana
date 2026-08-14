# The server is an opaque relay

The server stores one document per session per device and never parses one. It has
no idea what a vote is, cannot compute a tally, and cannot tell an open session from
a closed one. Every document is written by exactly one device, so a blind
INSERT OR REPLACE is safe and the server needs no merge, no compare-and-set and no
conflict handling of any kind. Merging happens on the client, as a pure function
over the array of documents the server hands back.

## Considered options

- **Server-side merge over a normalised schema.** Per-device counter rows the server
  sums into a tally. Keeps SQL doing real work and keeps the landing list a plain
  SELECT. Rejected because it puts the vote model in two places that must agree
  forever, and every change to it becomes a coordinated client-server deploy.
- **One document per session with an ETag.** Smallest storage, one row to inspect.
  Rejected because every concurrent voter then collides and retries, and a lost
  update is one forgotten If-Match away.

## Consequences

- The server cannot serve the landing list - see `0005-the-landing-list-is-local.md`.
- The merge is a pure function with no I/O, so it is unit-testable in node:test with
  no browser and no database.
- Client and server no longer share a schema, so the document shape can change
  without touching the server at all.
- Nothing server-side validates a vote. A hand-crafted POST can store any document
  it likes, which the client will merge. This is the same posture v1 had - see the
  accepted risks in `PLAN.md` - not a new hole.
