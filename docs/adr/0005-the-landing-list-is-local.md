# The landing list is local

`/` lists only the sessions this device created or opened. There is no list of all
sessions anywhere, and `GET /api/sessions` is deleted. A session is reached through
its share link or QR code, and reaching it is what puts it in your list.

This follows from the server being an opaque relay - see
`0003-server-is-an-opaque-relay.md`. A server that cannot read a title, an open flag
or a created_at cannot order, filter or render a list of them.

## Considered options

- **Plaintext index columns beside the document.** Keep id, title, is_open and
  created_at as ordinary columns purely so the server can build the list. Rejected
  because is_open would then exist in two places that can disagree, requiring a
  written rule about which wins and a client that pushes index updates on every sync.
- **Parse the document for the listing.** Simplest to write. Rejected because it
  makes the server a participant that understands the schema, which is the thing
  `0003` exists to prevent.

## Consequences

- `PLAN.md`'s "anyone can discover sessions from the public landing page" is
  reversed. Possession of a link is now the only route in, though it is still not an
  access-control boundary: anyone holding one can vote and close.
- `/` needs no network by construction, so it has no loading state, no staleness and
  nothing to invalidate.
- Clearing site data loses your list. The sessions still exist on the server and on
  every other device, but this device has no way to enumerate them - it has lost the
  links, and links are the only index.
