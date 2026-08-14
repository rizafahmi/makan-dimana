# Closing a session is permanent

Closed is monotonic: merging two documents ORs their closed flags, so once any
device closes a session it is closed on every device, forever. Reopen is removed
from the product.

A boolean that can be flipped both ways cannot converge without ordering, and every
way of getting ordering costs something. Wall-clock timestamps trust phone clocks,
and one skewed device wins every conflict until real time catches up to its fake
future - a failure that is silent and nearly impossible to demo-proof. A version
counter avoids clocks but adds machinery to every document and a tiebreak rule to
explain. A one-way flag needs none of it: OR is associative, commutative and
idempotent, so the merge is correct by construction.

## Consequences

- The "Buka lagi" control is gone. `setSessionOpen(id, isOpen)` becomes a one-way
  close, and `PLAN.md`'s idempotent-reopen behaviour applies to close alone.
- A device that has not yet synced still shows the session as open and will still
  accept votes. Those votes are kept - closing stops nothing retroactively, it only
  stops what has not merged yet.
- Closing by mistake is unrecoverable. Accepted: the cost of a wrong close is
  starting a new session, and it buys a merge with no clocks in it.
