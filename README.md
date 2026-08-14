# Makan Dimana

Gather food place ideas and vote on them as a group. One person creates a vote session with two to four places and shares the link; everyone else votes. Closing the session reveals the winner.

## Requirements

Node >= 24.0.0, where both `node:sqlite` and TypeScript type stripping work without a flag. No database server: the app uses `node:sqlite` against a local file at `data/makan.db`, overridable with the `MAKAN_DB` environment variable. The file is gitignored and created on first run, so running the app needs no setup step beyond `pnpm install`.

Running the tests does. The browser suites drive a real Chromium through Playwright, which manages its own browser install, so a fresh clone needs `pnpm exec playwright install chromium` once before `pnpm test` will pass. See `docs/adr/0007-browser-automation-for-the-offline-claim.md` for why.

## Project structure

```text
/
├── data/
│   └── makan.db        # gitignored, created on first run
├── public/
├── src/
│   ├── layouts/
│   │   └── Base.astro
│   ├── lib/
│   │   └── db.ts
│   ├── pages/
│   │   ├── index.astro
│   │   ├── new.astro
│   │   └── s/[id].astro
│   └── styles/
│       └── global.css
├── test/
├── AGENTS.md
└── PLAN.md
```

`/` lists the public sessions, `/new` creates one, and `/s/[id]` is the share link where people vote and the winner appears.

Every page is rendered on demand by the server through `@astrojs/node`; there is no client-side data fetching and no UI framework.

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

`PLAN.md` holds the build order and the decisions behind it. `AGENTS.md` holds the rules coding agents must follow in this repo and is the authority when the two disagree.
