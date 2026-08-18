# bandits

This is an interactive essay for [ugurkc.github.io](https://ugurkc.github.io/),
deployed to `https://ugurkc.github.io/bandits/` on every push to `main`.

## What's here

The essay is built: a k-armed bandit simulator wrapped in **four
horizontally-navigable acts** (acts bar + `#act-0`…`#act-3` hash routing,
free navigation, every act self-seeds). `src/components/ActsShell.tsx` owns
the act index and ALL cross-act state; the act components are pure views.

- **Act 0 — The Introduction** (`Act0Intro`): the header prose from
  `src/content/meta.md`, images, and a "Begin Act I" CTA. No simulator.
- **Act I — Trial & Error** (`Act1TrialError`): pitch three ad campaigns
  (blank boxes + worked example + generate button; scored by semantic or
  lexical similarity against a hidden truth) → a five-week manual pilot
  (`useTrialWeeks`, `TrialWeekBoard`) → the automated strategy race
  (`SimulatorPanel`).
- **Act II — Rationing** (`Act2Rationing`): the budgeted 13-week quarter
  (`useCampaignQuarter`); self-seeds with example campaigns
  (`src/lib/exampleCampaigns.ts`) when the reader hasn't pitched.
- **Act III — Learning from the Best** (`Act3Lab`): per-strategy teaching
  cards plus a free-play lab on its own independent `useSimulation`.

`docs/plans/2026-08-12-simulator-design.md` is the living design doc — the
engine's calibration rationale, CRN scheme, palette validation, and the
acts-restructure section live there. Change design-relevant code together
with that doc.

## Content model

- `src/content/meta.md` — the ONLY content file: `eyebrow` + `title`
  frontmatter, and a body of one or more paragraphs split on blank lines
  (each renders as its own `<p>` in Act 0). Inline `**bold**`/`*italic*`
  are supported via `src/lib/inlineMarkdown.ts`; headings, links, and raw
  HTML are NOT (guard tests in `essayContent.test.ts` enforce this — they
  render as literal text otherwise).
- The former `src/content/sections/` collection was deleted in the
  2026-08-18 acts restructure — do not recreate it; act prose lives in the
  act components.
- Loaded and validated by `src/lib/essayContent.ts` / `essayContent.test.ts`
  — read that test file before changing the content shape.
- Editable in the browser at `https://ugurkc.github.io/bandits/admin/`
  (Sveltia CMS, vendored in `public/admin/`), or by hand — same file either
  way.

## House rules

- **No new npm dependencies.** Hand-rolled utilities only (see
  `inlineMarkdown.ts`, `similarity/lexical.ts` for the pattern).
- Vite is configured with `base: '/bandits/'` — `public/` assets must be
  referenced via `${import.meta.env.BASE_URL}…`, never a leading-slash
  absolute path.
- Accessibility bar: view seams move focus to the incoming view
  (`tabIndex={-1}` + ref focus) and announce through the shell's single
  always-mounted polite live region. Keep that pattern when adding seams.

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
