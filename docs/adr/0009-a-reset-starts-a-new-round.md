# A reset starts a new round

Every document carries a `round`. The merge takes the highest round any document
claims and tallies only the documents standing at it; documents from an earlier
round contribute nothing. A reset writes `round + 1` with empty counters, so the
tally reads zero everywhere without a single vote being subtracted.

The obvious reset is to subtract what you can see - write `down` counters equal to
the current tally. It converges on nothing. A device that voted offline pushes those
votes afterwards and the tally climbs back off zero, and two devices resetting at the
same time subtract the same votes twice and land below it. Neither failure is visible
at the moment of the reset; both surface later, on someone else's screen.

Rounds keep the property the rest of the model is built on. `round` is merged with
`max`, the way `closed` is merged with OR - associative, commutative, idempotent, and
needing no clock and no tiebreak. Votes are still increment-only; nothing is ever
taken away. A stale document is not corrected, it is simply no longer standing at the
current round, so a device that has been offline for an hour cannot undo a reset by
reconnecting. See `docs/adr/0004-closing-is-permanent.md` for the same reasoning
applied to closing.

## Consequences

- `round` is optional on the document. Documents minted before this decision carry no
  round and read as round 0, so an older device's copy still merges rather than being
  discarded. `mergeDocs` reads `doc.round ?? 0` everywhere.
- A device that votes while offline and then receives a reset loses those votes. That
  is the intent, and it is the opposite of how closing treats unsynced votes, which
  are kept. Closing preserves what happened; a reset declares it did not count.
- Concurrent resets from two devices both land on `round + 1`, so they collapse into
  one round rather than skipping to `+ 2`. Two rounds only ever separate when a
  device resets a round it has already seen someone else start.
- Nothing reads the old rounds. The counters from a previous round stay in each
  device's document, ignored, until that device resets again and clears them.
- The reset is hidden behind five taps on the session id, not behind a permission.
  There are no accounts here, so this is obscurity and not access control - anyone who
  knows the gesture can reset any session they hold a link to.
