# No service worker in v2

A local-first demo with no service worker looks like an oversight, so: v2 is demoed by
throttling the connection, not by killing it. A throttled request still completes, so
there is nothing for a service worker to intercept and nothing it would add. The offline
story - and the service worker that carries it - belongs to a later branch, where the
local store it serves actually exists.

## Considered options

- **Service worker plus a cached offline page.** Designed in full, then dropped when the
  demo method settled on throttling. It bought a branded offline page and auto-recovery
  for a failure mode this branch never shows.
- **Nothing at all, no client rendering.** The most honest baseline, and free. Rejected
  because a server-rendered app has no loading state of its own: on a throttled
  connection the browser holds the previous page and spins its own tab spinner, so
  there is nothing on screen that belongs to the app.

## Consequences

Killing the wifi or ticking Offline in DevTools produces Chrome's error page, not ours.
That is expected on this branch. Throttling is the supported demo method.
