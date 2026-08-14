# Changes arrive over an event stream

The relay holds a `text/event-stream` open at `GET /api/sessions/[id]/events` and
emits a bare `data: changed` every time a document for that session is written to
something other than what was already stored. A device on a session page subscribes to
it and pulls when it fires, and pulls again whenever that subscription reconnects,
since a connection it had to remake is a window it could not have been told about.
Nothing about the document travels on the stream: the relay knows which row it just
wrote because the session id is the primary key and is already in the URL, and that is
the whole of what it says. `0003-server-is-an-opaque-relay.md` survives intact - the
server still never parses a document, still cannot compute a tally, and still cannot
tell an open session from a closed one.

This exists because the branch had no live path in either direction, which a two-device
run over a Tailscale funnel made obvious: a vote wrote to IndexedDB and stopped, and a
tab that stayed visible never synced again. Both halves are fixed here - a local write
publishes immediately, and the stream is what tells the other device to pull.

The stream is a notification channel, not a dependency. Correctness and first paint
both still come entirely from IndexedDB. With the stream refused the app behaves
exactly as it does offline, which is to say correctly: it renders, it takes votes, and
they reach everyone else at the next load, `online`, or connection that succeeds.

## Considered options

- **Poll the relay on a timer.** Four lines, no new endpoint, no connection to keep
  alive, and no proxy in the path can buffer it. Rejected because the interval is a
  choice between a demo that looks broken and a phone that spends the talk waking its
  radio, and because a request every few seconds against an idle session is the exact
  shape of load this branch removed from the first paint.
- **A visible sync control.** A button, or a pull-to-refresh. Honest about the network
  and costs nothing when nobody presses it. Rejected twice: the branch's own rule is
  that the UI says nothing about the network - no staleness line, no offline banner,
  no age stamps - and a refresh button is all three at once. It also makes the demo a
  lie, because the point being shown is two screens agreeing without anyone asking.
- **Keep `visibilitychange` and add the push.** The smallest possible fix, and it
  covers a phone coming back to the tab. Rejected because it does not cover the demo:
  two screens sitting side by side are both visible, so neither ever fires it.
- **WebSockets.** Bidirectional, so the push could ride the same connection. Rejected
  for what it costs to get nothing extra: the traffic here is one-way, `EventSource`
  reconnects on its own where a socket needs that written by hand, and the existing
  form-encoded POST already carries the write through Astro's `checkOrigin`.
- **Send the changed document on the stream.** It would save the pull entirely.
  Rejected because it is `0003` in reverse: the relay would be handing out a payload it
  would then be tempted to read, and one hand-crafted POST would reach every subscriber
  without passing the per-element parse that keeps a bad document to the device that
  wrote it.

## Consequences

- The relay now keeps state that is not in SQLite: a registry of open connections per
  session, in memory, lost on restart. A restart drops every stream, `EventSource`
  reconnects, and nothing has to be recovered because the stream carries no data.
- A device is told about its own writes. Filtering that server-side would mean the
  relay knowing whose document it just stored and whose connection each subscriber is,
  so it does not: the pull comes back holding the device's own document, `mergePulled`
  skips it, and no repaint happens.
- A write that stores the same bytes tells nobody. Publishing every write
  unconditionally is what makes a device's own notification a cycle rather than an
  echo: the sync it triggers pushes before it pulls, that push republishes, and one tap
  turns into an endless exchange - measured at over five hundred pushes in a second and
  a half, on every device on the session at once. The relay compares the stored row to
  the incoming one and publishes only when they differ, which is a byte comparison and
  not a parse, so `0003` still holds. The self-notification stays as designed; it just
  terminates.
- The stream still cannot deliver what happened while a device was away, and nothing
  replays it - there is no `Last-Event-ID` handling and no cursor, because there is no
  event log to seek in. What stands in for the replay is a resync: `EventSource` fires
  `open` for every connection it makes, so a second one means the connection dropped
  and came back, and a device that was away pulls the moment it returns. Nothing has
  to detect the drop, because the reconnection is the detection.
- The first `open` is skipped. It arrives beside the load sync, and syncing there costs
  a second push and pull on every page load - which is what the push-before-pull spec
  measures, and it fails with the whole extra pair in it. This is also why the greeting
  is a named `ready` event rather than a `message`: `open` carries the reconnect signal
  now, and the greeting has to stay silent for it to mean only that.
- What is left uncovered is the device that never reconnects, and that is a narrower
  set than it sounds. A device whose stream stayed up cannot have missed anything,
  because the stream is what carries the news; a device that had a stream and lost it
  reconnects and pulls, whether it was asleep for a second or an hour, and whether or
  not `online` fires on the way back. What is left is the device whose page loaded
  with the network already down: its load sync failed, it never had a first `open` to
  spend, and the connection it eventually makes is that first one, which is skipped.
  It still relies on `online` firing, and if it does not fire, that device stays stale
  until it is reloaded. There is no timer and no visible control to fall back on -
  both were rejected, and this does not reopen them. It is the same class of staleness
  the branch already accepts, and the local-first posture is what makes it survivable
  rather than a bug: what is on screen is this device's own copy, not a stale cache of
  someone else's.
- The landing page does not subscribe. One stream per held session is an unbounded
  number of connections for a list whose only live element is a relative timestamp,
  and it already syncs on load and on `online`. A spec pins that `/` opens none.
- An idle connection through a proxy gets closed, so the stream emits a comment line
  every `MAKAN_BEAT` milliseconds - 15000 by default, and lowered in the suite so a
  test can watch one arrive.
- A subscriber registry that only grows is a leak, and devices disconnect constantly.
  Both ends are handled: the route unsubscribes and clears its timer on an aborted
  request and on a cancelled stream, and the registry drops a session's room when its
  last subscriber leaves.
- `pnpm test` runs slower by the length of one heartbeat, because proving the stream
  survives an idle period means waiting one out.
