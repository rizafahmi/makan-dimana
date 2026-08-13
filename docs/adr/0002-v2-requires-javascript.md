# v2 requires JavaScript

`/` and `/s/[id]` ship a data-free shell and render from `/api/sessions`, so without
JavaScript both pages are permanently empty. Rather than keep a form-POST path that
still writes correctly but lands the user on a blank page, v2 drops it: mutations go
through `fetch` only, and a `<noscript>` says so.

## Consequences

- Progressive enhancement is gone on this branch by choice, not by neglect. v1 on
  `1-naive` has it and works fully without JavaScript.
- The vote and close forms keep the same `action` and `place` field names as v1, so
  `src/lib` and the precedence list in `PLAN.md` are untouched by the change.
- `/new` is unaffected. It loads no data, so it stays fully server-rendered with its
  422 re-render intact - a useful control when comparing branches.
