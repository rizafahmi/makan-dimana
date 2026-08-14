# Tallies can be negative

A place's tally is the sum of every device's increments minus the sum of every
device's decrements, rendered exactly as computed. It can be negative, and -1
appears on screen as -1. There is no clamp, and `CHECK (placeN_votes >= 0)` is gone
from the schema.

Two devices offline against a tally of 1, each cancelling a vote, each correctly
showing 0 locally, merge to -1. No clamp fixes this. `max(0, x)` is not commutative
under concurrent deltas, so clamping during a merge makes the result depend on merge
order and devices stop agreeing - which is strictly worse than a negative number,
because it is wrong differently on every screen.

## Considered options

- **Clamp at render.** Keep the merge pure and put `Math.max(0, ...)` in `tallyView`.
  Convergence survives, since the clamp is only a view concern. Rejected because the
  underlying value keeps drifting: a place at -2 silently swallows the next two
  genuine upvotes, so the display is stable and lying.
- **Refuse to emit a decrement at a local zero.** Makes the common case impossible
  and only needs a render clamp as a backstop. Rejected together with the clamp it
  depends on.

## Consequences

- Do not add a clamp. A `Math.max(0, ...)` anywhere in the merge breaks convergence,
  and one in the view reintroduces silent drift.
- Cancelling is not "take back my vote" - there is no my. It decrements the counter,
  and any device can cancel any vote. The UI copy already said "batalin" without
  claiming ownership; the merge just makes it literal.
