# Makan Dimana

Gather food place ideas and vote on them as a group. One person creates a vote session with two to four places and shares the link; everyone else votes. Closing the session reveals the winner.

It is local-first: every device keeps a complete copy of every session it knows and renders from that copy, so the app opens, votes and closes with the network gone. The server is a relay that carries copies between devices.

## Requirements

Node >= 24.0.0, where both `node:sqlite` and TypeScript type stripping work without a flag. No database server: the app uses `node:sqlite` against a local file at `data/makan.db`, overridable with the `MAKAN_DB` environment variable. The file is gitignored and created on first run, so running the app needs no setup step beyond `pnpm install`.

Running the tests does. The browser suites drive a real Chromium through Playwright, which manages its own browser install, so a fresh clone needs `pnpm exec playwright install chromium` once before `pnpm test` will pass. See `docs/adr/0007-browser-automation-for-the-offline-claim.md` for why.

## Project structure

```text
/
├── data/
│   └── makan.db        # gitignored, created on first run
├── docs/
│   ├── adr/            # decisions worth defending later
│   ├── plan-v2.md
│   ├── plan-v3.md
│   └── talk.md
├── public/
│   ├── fonts/
│   └── sw.js           # the service worker, hand-written
├── src/
│   ├── layouts/
│   │   └── Base.astro
│   ├── lib/            # db.ts, merge.ts, store.ts and the isomorphic helpers
│   ├── pages/
│   │   ├── api/
│   │   │   └── sessions/
│   │   │       ├── [id].ts
│   │   │       └── [id]/events.ts
│   │   ├── index.astro
│   │   ├── new.astro
│   │   └── s/[id].astro
│   ├── scripts/        # app.ts, idb.ts, sync.ts - the browser half
│   └── styles/
│       └── global.css
├── test/
├── AGENTS.md
└── PLAN.md
```

`/` lists the sessions this device created or opened, `/new` creates one, and `/s/[id]` is the share link where people vote and the winner appears. There is no list of everyone's sessions: a link is the only way in, and following one is what adds a session to your list.

Every page is rendered on demand by `@astrojs/node` and ships no session data. The data comes from IndexedDB in the browser, so nothing on screen is waiting on a request, and there is no UI framework. `/api/sessions/[id]` is an opaque relay: it stores one document per session per device, hands them all back on request, and never parses one. Combining them into a session is a pure function that runs on the client. `/api/sessions/[id]/events` holds a stream open and says when that session changed, without saying what changed - a device votes, publishes, and every other device open on that session pulls and repaints on its own.

A sync fires on load, on `online`, on coming back to the tab, and on anything the event stream says; an attempt that fails is retried on a bounded backoff until one succeeds, which is why a device that reconnects into a network that is not quite up yet still converges. Nothing polls, and nothing on screen mentions the network.

The service worker in `public/sw.js` precaches the shell, so with the network gone the app still loads, still renders and still takes votes; those votes reach the other devices at the next sync. It caches no data at all and declines `/api/**` outright. Its `version` constant is the cache name and is bumped by hand - after changing anything the shell ships, bump it or unregister the worker, `astro dev` included.

## Commands

| Command | Action |
| :------ | :----- |
| `pnpm install` | Install dependencies |
| `pnpm dev` | Start the dev server at `localhost:4321` |
| `pnpm build` | Build to `./dist/` |
| `pnpm preview` | Preview the production build |
| `pnpm test` | Typecheck, build, then run the `node:test` suites and the Playwright suites in `test/` |
| `pnpm exec playwright install chromium` | Download the browser the Playwright suites need, once per machine |

pnpm is the package manager; `packageManager` in `package.json` pins the version and `pnpm-workspace.yaml` sets `saveExact: true`, so `pnpm add <pkg>` writes exact versions without a flag.

`test/*.test.ts` runs under `node --test`: unit suites exercise `src/lib` directly, e2e suites spawn the built server and drive it over HTTP. `test/*.spec.ts` runs under `@playwright/test` and drives a real browser against the built server, which is the only way to reach the service worker, IndexedDB and offline behaviour. Every one of them runs against a temporary database, so they never touch your local `data/makan.db`.

`pnpm test` runs `astro check` first, because `astro build` strips types without checking them.

## Contributing

`docs/plan-v3.md` holds the build order and the decisions behind the local-first version. `PLAN.md` and `docs/plan-v2.md` are the closed records of the two versions before it, and `docs/adr/` holds the decisions that outlive any one plan. `AGENTS.md` holds the rules coding agents must follow in this repo and is the authority when any of them disagree.
