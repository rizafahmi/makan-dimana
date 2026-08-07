# Makan Dimana
Web app to allow a group to gather ideas for food places. Group member can create a new vote session and add food places options and share the voting page. Then another group member can give their votes. When vote session is closed, the winner place is revealed.

## Tech Stack
- Frontend: Astro
- Backend: Node.js + TypeScript
- Database: SQLite
- Styling: Vanilla CSS

## Data Model

vote_sessions:
- id, 7-char Crockford Base32 lowercase (0-9, a-z minus i/l/o/u), UNIQUE,
  retry on collision, case-insensitive lookup normalized to canonical lowercase
- title
- is_open, default 1
- place1_name
- place1_votes, default 0
- place2_name
- place2_votes, default 0
- place3_name, nullable
- place3_votes, default 0
- place4_name, nullable
- place4_votes, default 0
- created_at

## Database

* Driver: `node:sqlite` (`DatabaseSync`); no third-party SQLite package
* File: `data/makan.db`, committed to the repo; create `data/` at startup
* Journal mode: keep SQLite's default `DELETE`. Never enable WAL, so the committed file is always complete
* Assert it at startup with `PRAGMA journal_mode = DELETE` and throw when the result is not `delete`. The pragma silently no-ops if another connection is open
* Hold one connection as a `globalThis` singleton so dev HMR cannot open concurrent connections
* Create the schema idempotently at startup with `CREATE TABLE IF NOT EXISTS`

## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Coding Conventions
* Server-Side Rendering (SSR): Every page must be rendered on the server
* Minimalist Dependencies: Prioritize lightweight modules; avoid third-party dependencies whenever possible.
* Pin the version
* No Code Annotations: Do not include comments, annotations, or JSDoc in the source files.

## Constraints

I want to understand every line of code that goes into this project. Never create, edit, move, rename, or delete project files unless I explicitly ask you to do so. Instead, show me every proposed edit in the chat so I can type it in manually.

Do not run commands that modify project files, install dependencies, or change repository state unless I explicitly request that action. Instead, show me those commands in the chat so I can run them manually.

I'm an experienced developer. Do not explain syntax, APIs, programming concepts, or implementation details unless explicitly asked.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)
