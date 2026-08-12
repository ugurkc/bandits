# bandit

This is an interactive essay for [ugurkc.github.io](https://ugurkc.github.io/),
deployed to `https://ugurkc.github.io/bandit/` on every push to `main`.

## What's here vs. what's not

The infrastructure is fully wired: GitHub Pages deploy, a content model, and a
browser CMS. The actual interactive tool and the real essay prose are **not**
built yet — that's the next piece of work. `src/App.tsx` currently just proves
the content model loads; replace it with the real essay layout + interactive
component once you know what this essay is about. The watershed repo
(github.com/ugurkc/watershed) is the reference implementation: theme toggle,
sidebar derived from section frontmatter, react-markdown rendering (memoized —
prose must not re-parse on animation frames), sticky tool aside.

If the essay gets a companion tool panel, also copy watershed's essay↔tool
bridge: prose links like `[the matrix](#tool:matrix)` scroll the matching
`data-tool-anchor` panel into view and pulse a highlight on it, and
`?preset=<id>`-style params let a link drive the tool, not just point at it.
It's three small pieces — `src/lib/toolBridge.ts` (DOM contract: focus/flash
+ a CustomEvent for commands), `src/components/ToolLink.tsx` (the inline
button), and the `EssayLink` markdown `a`-component mapping in `App.tsx` —
plus the `.tool-link`/`.tool-flash` CSS block in `index.css` and a guard
test that validates every `#tool:` link in content against the anchors
declared in components, so CMS typos fail CI instead of shipping dead links.

## Content model

- `src/content/meta.md` — the essay header: `eyebrow` + `title` frontmatter,
  and a body that's the subtitle (must stay a single paragraph — CI guards
  this).
- `src/content/sections/*.md` — one file per prose section. Frontmatter:
  `order` (drives sequence, required), optional `id` (anchor for deep links),
  optional `label` (gives the section a sidebar entry — requires `id`),
  optional `heading`.
- Loaded and validated by `src/lib/essayContent.ts` / `essayContent.test.ts`
  — read that test file before changing the content shape; it encodes real
  failure modes hit while building the first essay (unquoted CMS dates,
  empty-order sorting bugs, raw HTML silently dropped by markdown renderers).
- Editable in the browser at `https://ugurkc.github.io/bandit/admin/`
  (Sveltia CMS, vendored in `public/admin/`), or by hand — same files either
  way.

## Testing conventions

- Every CMS-editable surface (content shape, admin config) has a guard test.
  If you change what the CMS can write, update the matching test — don't
  just add the field.
- `npm run test` must reflect real coverage; never reintroduce
  `--passWithNoTests` once tests exist — it lets test-discovery regressions
  pass CI silently (a mistake made and fixed elsewhere in this system).
- The deploy workflow (`.github/workflows/deploy.yml`) runs the full suite
  before build, before deploy. A failing edit — from the CMS or from code —
  never reaches production; the live site stays on the last good version.
  Don't weaken this gate.

## Commit convention

No `Co-Authored-By` or "Generated with Claude Code" trailers on commits.

## Wider system

This essay is one of several under
[ugurkc.github.io](https://github.com/ugurkc/ugurkc.github.io) — see that
repo's README for the full personal-site recipe (publishing, the hub's own
CMS, the fine-grained PAT setup, adding this repo to the token's scope).
