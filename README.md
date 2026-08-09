# Makan Dimana

Gather food place ideas and vote on them as a group. One person creates a vote session with two to four places and shares the link; everyone else votes. Closing the session reveals the winner.

## Requirements

Node >= 22.12.0. No database server: the app uses `node:sqlite` against a file committed to the repo at `data/makan.db`, overridable with the `MAKAN_DB` environment variable.

## Project structure

```text
/
├── data/
│   └── makan.db
├── public/
├── src/
│   ├── lib/
│   │   └── db.ts
│   └── pages/
│       ├── index.astro
│       └── s/[id].astro
├── test/
├── AGENTS.md
└── PLAN.md
```

Every page is rendered on demand by the server through `@astrojs/node`; there is no client-side data fetching and no UI framework.

## Commands

| Command | Action |
| :------ | :----- |
| `npm install` | Install dependencies |
| `npm run dev` | Start the dev server at `localhost:4321` |
| `npm run build` | Build to `./dist/` |
| `npm run preview` | Preview the production build |
| `npm test` | Build, then run the `node:test` suites in `test/` |

Tests spawn the built server on a random port against a temporary database, so they never touch `data/makan.db`.

## Contributing

`PLAN.md` holds the build order and the decisions behind it. `AGENTS.md` holds the rules coding agents must follow in this repo and is the authority when the two disagree.
