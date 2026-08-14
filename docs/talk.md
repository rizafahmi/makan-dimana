# The talk

This repo is a teaching artifact, not a product. Numbered branches walk an audience
from a cloud-first web app to a local-first one, one architectural change at a time.

- `main` - the untouched `create astro` scaffold. Nothing of the app lives here.
- `1-naive` - v1. Server-rendered Astro, forms and redirects, zero client JavaScript.
  Built to work, documented by `PLAN.md`.
- `2-ssr-csr` - v2, and the branch the talk actually opens with. Same app, same
  database, but `/` and `/s/[id]` ship a shell and load their data over the network
  so the dependency is visible. Documented by `docs/plan-v2.md`.
- `3-improve-design` - v2's architecture with a design that survives a projector: one
  ground and one accent, self-hosted display type, the winner promoted onto a hero
  plate, and the whole place row as the vote target. Nothing about where the data
  lives changes here, so the local-first diff is never competing with a restyle.
- `4-local-first` - v3, where the data moves onto the device. IndexedDB is the source
  of truth and every page renders from it, the server becomes an opaque relay that
  stores one document per device and never parses one, merging is a pure function on
  the client, and a service worker precaches the shell. Documented by
  `docs/plan-v3.md`.

Each branch builds on the one above it, so the diff between two adjacent branches is
the unit the talk works in.

## Why v2 is worse than v1

Deliberately. v2 adds a round trip and gets slower. That is the point: v1's network
dependency is invisible because the server hides it inside one HTML response, and an
invisible dependency cannot be removed on stage. v2 makes waiting visible - a spinner
on a throttled connection, a vote that costs a round trip - so the local-first version
has something to be measured against.

## Rules for changes on these branches

- **Keep the baseline honest.** Do not make the cloud-first version artificially slow.
  Astro plus SQLite on one box was never the bottleneck, and an audience that spots a
  straw man stops believing the rest of the talk. The weakness on display is the round
  trip, not invented latency.
- **Optimise the diff, not the code.** These files get read on a wall. When two designs
  are close, pick the one that makes the diff to the next branch smaller and more
  legible, even when the other is better production code.
- **Every step must fail visibly before the next one fixes it.** A step that quietly
  works teaches nothing. v2's spinner spinning is the content. `4-local-first` is the
  single exception and a deliberate one: it is presented as a whole-branch diff rather
  than a sequence of visible failures, because its intermediate states - a relay no
  client can write to yet, a client creating sessions the server cannot serve - fail in
  ways that teach nothing about local-first, and a temporary server-side create would
  be code written only to be deleted. `docs/plan-v3.md` records it as a decision.

## Demoing it

Which failure to stage depends on the branch.

- `1-naive`, `2-ssr-csr` and `3-improve-design`: throttle the connection in DevTools
  rather than going offline. None of them has a service worker, so a dead connection
  produces the browser's own error page and none of the app's - see
  `docs/adr/0001-no-service-worker-in-v2.md`. On the two client-rendered branches the
  throttle is the demo: the spinner spins, and every vote costs a round trip.
- `4-local-first`: tick Offline instead, because there is now something to see. The
  service worker serves the shell and IndexedDB serves the data, so the app loads,
  renders, votes and closes with nothing on the wire. Two browser windows are two
  devices: vote offline in both, come back online, and the tallies combine.
  `docs/plan-v3.md`'s "Manual checks" is the shortlist worth rehearsing beforehand.

One thing not to promise on stage: the QR is rendered by the server, so offline the
share block shows the URL as text. That is by design - an offline QR cannot resolve a
scan - but it is a surprise if you meant to scan one on camera.

### Serving it to a second device

A phone reaching the laptop over LAN HTTP - `HOST=0.0.0.0 node dist/server/entry.mjs`
at `http://192.168.x.x` - is **not a secure context**, and three things the browser
otherwise provides are simply absent there: `navigator.serviceWorker`,
`crypto.randomUUID` and `crypto.subtle`. The client already avoids the latter two, and
`test/device.spec.ts` deletes both before page scripts run so nothing can reach for
them again. The service worker is the one that cannot be worked around: registration
silently no-ops, so the phone syncs and votes fine but a reload while offline dies on
the browser's own error page - the exact failure `4-local-first` exists to remove.

So put the demo behind a real HTTPS origin. Tailscale Funnel is the least fragile way
to get one: it gives a *stable* hostname with a real certificate, free and without
owning a domain.

    tailscale up
    pnpm build
    node dist/server/entry.mjs
    tailscale funnel --bg 4321

That publishes `https://<machine>.<tailnet>.ts.net`, which is the same address at every
rehearsal and on the day. `tailscale funnel off` takes it down, and taking it down *is*
the offline demo: the worker keeps serving the shell from cache with nothing on the
wire, which is what `test/offline.spec.ts` pins.

Funnel is public to the whole internet, which cuts both ways. It means the QR on screen
is scannable by the room - a genuinely good moment, since the audience joins the vote on
their own phones and the tallies move live. It also means an unauthenticated vote app is
briefly on the open internet, and `PLAN.md` is explicit that possession of a link is not
an access boundary. Use `tailscale serve` instead of `funnel` for the same stable HTTPS
hostname restricted to your own tailnet, if you would rather the room could not join.
Funnel needs a `funnel` node attribute in the tailnet policy file; enabling it from the
CLI adds that for you the first time, so do it before the day rather than on stage.

A `cloudflared tunnel --url http://localhost:4321` quick tunnel also works and needs no
account and no domain, but it mints a **new random hostname every run**. Service worker
registrations and IndexedDB are per-origin, so restarting it between setup and the talk
hands you a fresh device with no worker and no sessions. Prefer a stable hostname; if
you must use a quick tunnel, start it once and do not touch it.

One trap survives whichever you pick: **set up while you still have internet, and load
each device twice.** The first visit installs the worker without being controlled by it,
so the shell only reaches the cache on the second navigation.

Both devices can sit on the same origin. They converge either way - the relay is one
server and one SQLite file whichever origin reaches it - but sharing an origin keeps the
QR, the share link and the worker scope all agreeing with each other.
