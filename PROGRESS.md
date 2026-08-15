# Progress

One working session on `4-local-first`. A whole-branch code review ran and returned
fifteen findings, none of which were fixed. Then the work turned to a new surface: a big
screen board for driving a vote session from a projector, designed end to end and handed
to an implementation agent that is still building it.

## The code review

A background `/code-review` at `xhigh` effort, scoped to `git diff main...HEAD` - 74
files and roughly 10k added lines, since no upstream is configured. Fifteen findings.
Three of them were confirmed by executing the real modules rather than by reading them,
which is the only reason to trust those three more than the rest.

**`mergeDocs` throws on a document with no counters.** `src/lib/merge.ts` dereferences
`doc.up` and `doc.down` without checking either exists. `parseDoc` accepts such a
document, so a relayed one that lacks the counters is a `TypeError` during render, on
every device that pulls it. The rejection is unhandled, so nothing schedules a retry, and
after a reload the session page stays blank.

**A missing title is read as a title claim.** The creator test in `src/lib/merge.ts` is
`doc.title !== null`, so a document with no `title` key at all - undefined, not null -
becomes the session's identity claim. A session this device does not hold then renders as
present with an empty heading, instead of `Sesi tidak ditemukan`.

**Retry chains overlap.** `retrying()` in `src/scripts/sync.ts` cancels the pending timer
on a trigger but not an in-flight `run()`, and `attempt` and `timer` are shared state.
Concurrent triggers spawn overlapping chains that cannot all be cancelled.

The rest, in short:

- `exchange()` never checks `pulled.ok`, so a JSON error body is parsed as the document
  array.
- Two tabs on one device share a device id and silently overwrite each other's votes.
  Two browsers are two devices; two tabs are not, and the store does not know that.
- The landing sync rewrites every stored session and repaints on every trigger, ignoring
  the `applyPulled` "did anything change" helper it already has.
- `relativeTime` renders `NaN hari lalu` when `created_at` is null.
- `tallyView`'s share is unclamped, so a negative tally pushes another place past 100%.
- The unsubscribe closure in `src/lib/relay.ts` can drop a newer room and silence live
  subscribers.
- `AGENTS.md` and `docs/plan-v3.md` still describe `putDoc` as a blind
  `INSERT OR REPLACE`. It is a compare-and-set now, and its boolean is what drives the
  publish.

None of these were fixed. That is deliberate: the board work touches the client entry,
the layout and the service worker, and a pile of unrelated fixes landing in the same
uncommitted tree would make both harder to review. They are recorded here and left alone.

## A big screen for the room

The ask was a page for presenting: a session on a projector, at display size. `docs/talk.md`
already stages the moment - "the audience joins the vote on their own phones and the
tallies move live" - but the only surface for it was the phone-sized `/s/[id]`.

The half-remembered design turned out to be the `Kantin Malam Design System` project in
claude.ai/design, holding `ui_kits/kantin-malam/`: a click-through of `Landing.jsx`,
`NewSession.jsx`, `Session.jsx` and `ErrorPages.jsx`, plus tokens, guideline cards and
component specs. Those are the four routes that already exist. There is no big-screen
surface in it, so the board is a fifth surface and it is new - but the tokens and the
component vocabulary to build it from were already there.

Four questions settled it.

- **What is the big screen for?** A live room board for one session. A QR big enough to
  scan from the back row, place names and tallies at display size moving as phones vote,
  the winner revealed on close.
- **Does the presenter drive anything from it?** Yes, fully. Vote and close from the
  board; not a read-only display.
- **How is it driven?** Both keyboard and click. A projector laptop is a keyboard at
  arm's length, not a touchscreen.
- **What happens on close?** Whatever `winnerView` already renders on the phone, only
  larger. No board-specific reveal. That is the smallest-diff answer, and it is what
  `docs/talk.md` asks for: optimise the diff, not the code.

## Three approaches, one chosen

**A - new route, same mount, board layout expressed in tokens.** Chosen.
`src/pages/s/[id]/board.astro` ships the same `[data-session]` shell, flagged
`data-board`. `mountSession` renders it unchanged apart from a keyboard block gated on
the flag. Everything visual is `.km-board` redefining custom properties that already
exist - `--measure`, `--size-h1`, `--size-place`, `--size-vote`, `--qr-size` and the page
padding - so every existing component scales without a new class or a second renderer.
The board cannot drift from the phone, because it is the phone's renderer.

**B - new route, new `mountBoard`.** Its own DOM building, its own layout, its own tests.
Two renderers of one data shape and a permanent divergence risk. Given that the reveal is
just `winnerView` larger, it buys nothing.

**C - no new route, a `?board` query on `/s/[id]`.** Smallest diff of all, but then the
URL on the projector is the URL you would hand a phone, and the service worker's navigate
fallback cannot tell them apart. The ask was a new page, and this is not one.

Astro's nested dynamic routing was confirmed against in-repo precedent rather than
assumed: `src/pages/api/sessions/[id].ts` and `src/pages/api/sessions/[id]/events.ts`
already coexist, so `/s/:id` and `/s/:id/board` will too.

## The approved design

`src/pages/s/[id]/board.astro` is near-identical to `src/pages/s/[id].astro`: the same
`normalizeSessionId` guard, the same 404 on a malformed id.

**The QR and the share URL encode `/s/<id>`, the phone URL - not the board's own path.**
Called out because it is the one thing here that fails silently. A board QR encoding the
board sends the whole room to the projector view instead of the voting page, and nothing
on screen says so.

No `Semua sesi` back link. Nav chrome does not belong on a projector.

`src/layouts/Base.astro` grows one optional `board?: boolean` prop, rendering
`class:list={["km-page", { "km-board": board }]}`. Checked before committing to it:
nothing in the suite pins `<main class="km-page">`, so the change is additive.

Keyboard, gated on the board flag: `1` through `4` vote a slot up, `Shift`+`1` through
`4` take that vote back, `t` closes. Inert on a closed session, and inert while typing in
an input.

Two traps the keyboard has to dodge. Both are written down because they are the kind of
thing a later reader will try to simplify back out.

1. Detection uses `event.code` - `Digit1`, `KeyT` - not `event.key`, because `Shift+1` is
   `!` on a US layout and something else elsewhere.
2. A number key means the **slot**, not the screen position. `listPlaces` sorts by votes
   descending, so rows reorder live, and a positional key would move the target under the
   presenter's fingers mid-talk. Each row therefore renders its slot number as a visible
   key cap, which doubles as the on-screen legend and replaces the phone's `km-hint`
   text.

`t` closes with no confirmation. Closing is permanent - `docs/adr/0004-closing-is-permanent.md`
- but the on-screen `Tutup sesi` button is already one click from the same outcome, so
the keyboard is not the new risk.

`public/sw.js` needs a change. `generic = "/s/0000000"` is the navigate fallback for any
uncached navigation, so offline a board reload would have served the *phone* shell. The
fix is a board generic in the precached `shell` array, a fallback picked by path, and a
bumped `version` constant.

Two of these were decided by judgment rather than asked about, and a reader should know
they are open to challenge: number key means slot with a visible key cap, and `t` closes
without a confirm.

## Test order

One red at a time, no production code before it, and a test that passes on its first run
is describing behavior that already exists and gets rewritten rather than kept. The
planned sequence:

1. The route exists and ships a board-flagged shell. Fails 404 first, because `[id]`
   matches a single path segment.
2. The QR points at the phone URL.
3. A malformed id 404s.
4. Slot key caps render.
5. `Digit1` votes slot 1.
6. `Shift+Digit1` takes it back.
7. `KeyT` closes.
8. Keys inert on a closed session.
9. Keys inert while typing.
10. The layout is at display scale.
11. An offline reload of `/s/<id>/board` serves the board shell, not the phone shell.

Node suites go in `test/board.test.ts`, browser suites in `test/board.spec.ts`.

## The rule that was suspended

`CLAUDE.md` normally forbids the agent from touching a file at all - every edit is
proposed in chat and typed by hand. For this task only, that was lifted: the agent
implements the board from start to finish. The suspension is scoped to the board. The
rest of `CLAUDE.md` stayed fully in force - strict TDD, no comments in source, vanilla
CSS, no new dependencies, pnpm only, `createElement` and `textContent` and never
`innerHTML`.

## Where things stand

On `4-local-first`, HEAD at `721c93b`, and the working tree is not clean. An
implementation agent is building the board now against the brief above, under the
red-green loop, and is required to show a passing `pnpm test` before reporting done. The
board is in flight, not finished, and whatever files exist in the tree at any given
moment are a partial diff rather than the shape of the work. Nothing has been committed;
it will land in the working tree for review.

Open, and none of it started:

- The fifteen code-review findings, untouched. The three confirmed by execution are the
  ones to take first.
- No commit exists for any of this.
- The Kantin Malam design-system project has no `Board.jsx` and no preview card for this
  fifth surface. Deferred on purpose, not forgotten.
- `AGENTS.md` and `docs/plan-v3.md` still contradict `src/lib/db.ts` about `putDoc`.
