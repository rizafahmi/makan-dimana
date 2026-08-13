# The talk

This repo is a teaching artifact, not a product. Numbered branches walk an audience
from a cloud-first web app to a local-first one, one architectural change at a time.

- `main` - the untouched `create astro` scaffold. Nothing of the app lives here.
- `1-naive` - v1. Server-rendered Astro, forms and redirects, zero client JavaScript.
  Built to work, documented by `PLAN.md`.
- `2-ssr-csr` - v2, and the branch the talk actually opens with. Same app, same
  database, but `/` and `/s/[id]` ship a shell and load their data over the network
  so the dependency is visible. Documented by `docs/plan-v2.md`.

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
  works teaches nothing. v2's spinner spinning is the content.

## Demoing it

Throttle the connection in DevTools rather than going offline. v2 has no service worker,
so a dead connection produces the browser's own error page and none of the app's - see
`docs/adr/0001-no-service-worker-in-v2.md`.
