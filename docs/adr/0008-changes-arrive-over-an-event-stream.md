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
they reach everyone else at the next load, `online`, `visibilitychange`, connection
that succeeds, or retry of an attempt that did not.

That last one was added after a second two-device run over the funnel lost a phone's
votes outright, and it is the half this ADR originally got wrong. A trigger was
treated as an attempt: `exchange` caught every throw and returned an empty array, so
"I could not reach the relay" and "the relay has nothing new" arrived as the same
answer, and nothing retried either. `online` fires when the interface comes up, which
is routinely before DNS and routing work, so the one request that trigger was worth
failed and the device stayed stale until it was reloaded. Measured: one refused
request at the reconnect edge, and a device sat on its own tally indefinitely with
the network fully back. A trigger is now a reason to try, and trying until it works
is separate from being told to.

## Considered options

- **Poll the relay on a timer.** Four lines, no new endpoint, no connection to keep
  alive, and no proxy in the path can buffer it. Rejected because the interval is a
  choice between a demo that looks broken and a phone that spends the talk waking its
  radio, and because a request every few seconds against an idle session is the exact
  shape of load this branch removed from the first paint. The retry added later does
  not reopen this: a poll fires because time passed and keeps firing when everything
  is fine, and a retry exists only because an attempt failed and stops the moment one
  succeeds. A converged device that can reach the relay makes no request at all
  between triggers, which is the property polling gives up.
- **A visible sync control.** A button, or a pull-to-refresh. Honest about the network
  and costs nothing when nobody presses it. Rejected twice: the branch's own rule is
  that the UI says nothing about the network - no staleness line, no offline banner,
  no age stamps - and a refresh button is all three at once. It also makes the demo a
  lie, because the point being shown is two screens agreeing without anyone asking.
- **Keep `visibilitychange` and add the push.** The smallest possible fix, and it
  covers a phone coming back to the tab. Rejected as *the* fix, because it does not
  cover the demo: two screens sitting side by side are both visible, so neither ever
  fires it. It is back as one trigger among several, which is a different claim and
  reverses nothing decided here - it was never polling and never a control, it costs
  nothing when it does not fire, and it is the cheapest cover for the sleeping phone
  this ADR listed as an open gap.
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
  now, and the greeting has to stay silent for it to mean only that. What is skipped is
  narrower than "the first one": it is an `open` on a page that has not yet been without
  a stream. A connection that failed before it ever opened counts as being without one,
  so the connection that finally succeeds seconds later does sync - the load sync it
  would have duplicated is long past, and the window between them is exactly what
  nothing else can replay.
- A trigger fires an attempt, and an attempt that fails is retried on `retryDelay`'s
  schedule - 500ms doubling to 16 seconds, six attempts, then it stops. The schedule is
  a pure function in `src/lib/retry.ts` with a unit suite; the timer that reads it is
  plumbing in `src/scripts/sync.ts`. Bounded matters in both directions: a device that
  is genuinely unreachable stops asking rather than burning a radio for the length of
  the talk, and a device whose network came back a second late gets six more chances
  instead of one. A fresh trigger during a chain restarts it, because a trigger is new
  evidence and the wait so far was for the old one.
- Failure had to become sayable before any of that could work. `exchange` returns the
  pulled documents beside whether this device's own document landed, or null when it
  could not read the relay at all, and a push that answers a non-2xx counts as not
  landed - a 503 from a restarting relay and a 403 from a misconfigured funnel are
  both writes that did not happen, and answering 204-shaped success to them is how a
  device convinces itself it is converged while its votes sit at home. The pull still
  runs when the push was refused, so a device the relay will not take writes from
  keeps taking everyone else's in rather than going blind in both directions at once.
- The write path had the same bug and needed the same answer. A local write publishes
  immediately and swallowed its own failure, on the reasoning that the next sync would
  republish the same document - true only if a next sync happens. Measured: a vote made
  while the relay was unreachable was still missing from the relay eight seconds after
  it came back, with the page open and online the whole time. A push that did not land
  now kicks the retry loop, which pushes and pulls; it stays fire-and-forget, so the
  repaint never waits on the network.
- A stream can die in a way `EventSource` does not recover from. A non-200 - a proxy
  answering 502 while the relay restarts is the ordinary way to get one - is fatal by
  specification: `readyState` goes to `CLOSED`, and measured, that is one attempt and
  no retry, ever. Every device on the session would be left with load, `online` and
  `visibilitychange` as its only triggers, which two laptops sitting side by side never
  fire. A `CLOSED` stream is rebuilt on the same bounded schedule, and because the page
  has been without a stream by then, the reopen syncs.
- What is left uncovered is a device that stops being reachable for longer than the
  schedule and then becomes reachable again silently - no `online`, no visibility
  change, no stream reconnection. On a session page that is close to unreachable in
  practice, because `EventSource` retries a transient failure on its own for as long
  as the page lives and the reopen is a sync; the landing page holds no stream and is
  the real exposure. Uncovered too: a stream that is open and dead. A socket that a
  NAT or proxy dropped without telling either end sits in `readyState === OPEN` while
  nothing can flow, and there is nothing on the client to time out against, because
  the heartbeat is a `:` comment and `EventSource` never surfaces comments to script.
  Convergence survives that through the other triggers; liveness through that stream
  does not. There is still no timer and no visible control - both were rejected, and
  none of this reopens them.
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
