# Deleting a session is a tombstone every device honors

A document can carry `deleted`. The merge returns null the moment any document in the
pile claims it, so a deleted session reads exactly like a session this device never
held: the landing list drops it and `/s/[id]` renders `missing`. Nothing is removed
from the relay, and nothing is removed from any device's store.

Deleting is monotonic, like closing. The flag ORs across documents, so it needs no
clock and no tiebreak, and there is no undelete for the same reason there is no
reopen - see `docs/adr/0004-closing-is-permanent.md`. A device that has been offline
for an hour cannot revive a session by reconnecting; its documents merge into a pile
that already contains a tombstone, and the pile still reads as gone.

The alternative was a local delete - drop the row from this device's IndexedDB and
leave every other device alone. `docs/adr/0005-the-landing-list-is-local.md` makes
that defensible, and it costs no document field. It was rejected because the sessions
worth deleting are demo sessions, and a demo runs on more than one device. A delete
that has to be repeated on every phone in the room is not a delete.

## Consequences

- The deleting device keeps its own document. It has to: the tombstone lives in that
  document, and dropping the row would drop the only copy this device can push. What
  is deleted is the session, not the record of the deletion.
- The relay stores those bytes forever. It is an opaque store with no delete endpoint
  and no reason to grow one - see `docs/adr/0003-server-is-an-opaque-relay.md`. A
  session is gone because every device agrees to read it as gone, not because the
  server forgot it.
- Opening the share link again does not bring the session back. The device pulls the
  pile, the pile contains a tombstone, and the page reads as missing. This is the one
  case where `missing` means "deleted" rather than "not here yet", and nothing in the
  UI distinguishes them. Accepted: to a device holding a dead link the two are the
  same fact.
- Anyone holding the link can delete for everyone. There are no accounts and no access
  control, so this is exactly as exposed as closing already was. The five-tap reveal is
  obscurity, not a permission.
- `deleted` is optional on the document. Documents minted before this decision carry no
  flag and read as not deleted, so an older device's copy still merges.
