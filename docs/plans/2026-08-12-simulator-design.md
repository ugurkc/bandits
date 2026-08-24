# k-armed bandit visual simulator — design

The interactive core of the *bandit* essay (working framing: "the house becomes
the gambler" — in live-ops the studio is the gambler and every offer variant is
an arm). This document specifies v1: the simulator only, no essay prose.

## What the reader sees

Three allocation strategies race on the same k offer variants with hidden
conversion rates:

- **Fixed A/B split** — equal allocation forever (round-robin). The baseline.
- **ε-greedy** — explore with probability ε, else exploit the best estimate.
- **Thompson sampling** — sample each arm's Beta posterior, pick the max.

(Since 2026-08-24 two more race alongside them — **UCB1-Tuned** and
**uniform random** — see the dated entry at the end of this doc. Older
sections below describe the original three-strategy spec.)

The money chart is **cumulative expected regret** (conversions lost vs. an
oracle always playing the best arm): three lines racing upward, fixed-split
linear, bandits bending flat. Arm cards show per-strategy allocation shares
and estimates converging on the truth. A **reveal** toggle shows/hides the
true rates. A **drift** toggle turns on non-stationary rates (random walk) —
the frozen strategies' regret bends up again while adaptive ones recover.

## Fairness: common random numbers

All strategies face the identical world. At round t, arm i's would-be outcome
is a single deterministic draw `hash01(seed, CONVERSION, t, i) < rate(t, i)`
shared by every strategy — they differ only in which arm they choose. This
makes races fair, runs replayable, and everything unit-testable.

## Architecture

Precompute-then-scrub: `simulate(config)` runs the entire horizon up front
(deterministic, O(horizon × k), trivial at 20k rounds) and returns per-round
series. The UI never simulates; it just moves a playhead `t` through the
precomputed result. Play/pause/step/scrub are free and always consistent.

```
src/lib/bandit/types.ts       — shared contracts (this is the API; agents build to it)
src/lib/bandit/rng.ts         — hash01 counter RNG, makeRng streams, sampleBeta
                                (Marsaglia–Tsang gamma + Box–Muller, all from rand())
src/lib/bandit/arms.ts        — defaultBaseRates, computeRates (drift random walk)
src/lib/bandit/strategies.ts  — the StrategyImpls (five since 2026-08-24)
src/lib/bandit/simulate.ts    — simulate(config): SimulationResult, statsAt helper
src/state/useSimulation.ts    — config state + result memo + playhead + rAF loop
src/components/Playground.tsx — composition
src/components/RegretChart.tsx— SVG line chart (see chart spec)
src/components/ArmCard.tsx    — one per arm: reveal-able true rate, per-strategy
                                rows (pulls share bar, estimate)
src/components/Controls.tsx   — play/pause/step/reset, speed, ε, k, horizon,
                                drift, reveal, reshuffle-seed
src/components/ThemeToggle.tsx— movements pattern (data-theme + localStorage)
```

Engine details:

- Regret increment at t: `bestRate(t) − rate(t, chosen)`, in conversion units.
- ε-greedy and Thompson play each arm once first (t < k → arm t); ties break
  to the lowest index. Fixed split is round-robin `t % k`.
- Strategy randomness comes from per-strategy sequential streams
  (`makeRng(seed, STRATEGY, index)`), never from the shared outcome draws.
- Drift: reflected random walk per arm, per-round Gaussian step (volatility
  σ), clamped to [0.005, 0.6]; rates matrix computed once per config.
- Whale purchases (rare, high-multiplier conversions) are engine-ready in the
  config/types but not surfaced in the v1 UI — the essay's later "wrinkle"
  work.
- Base rates default to a live-ops-plausible band (~2–12% conversion) with a
  close second-best so the race is interesting; horizon default 5000.

## Chart spec (dataviz-skill compliant, palette validated)

Strategy series colors (CSS custom properties, set per theme — validated with
the dataviz six-checks script in both modes on 2026-08-12):

| series | light | dark |
|---|---|---|
| `--series-fixed` (Fixed A/B) | `#b45309` | `#d97706` |
| `--series-egreedy` (ε-greedy) | `#0d9488` | `#0d9488` |
| `--series-thompson` (Thompson) | `#4f46e5` | `#7a72ef` |

Rules the components must follow: colors are fixed per strategy and never
reassigned; 2px line weight; one y-axis (regret); recessive grid in
`--border`; legend always present AND direct labels at line ends; text always
in ink/muted tokens, never series colors; crosshair + tooltip on hover
(values for every series at the hovered round); share bars get 2px
surface gaps and 4px rounded data-ends; no per-point value labels. The chart
measures its container (ResizeObserver) and derives the viewBox width from it
so 1 viewBox unit = 1 CSS px — text keeps its declared size at any width and
the tooltip clamps in real pixels.

## The pitch phase (landing)

The playground's opening state. The reader *becomes the studio's marketing
lead*: a scenario card briefs them ("you have a quarter to find which
campaign gets people installing — and a short pilot week before it
starts"), they write three ad campaign pitches (headline/hook copy) in
free text, and the gap between what they wrote and a **hidden truth text**
(what messaging actually resonates with this playerbase, shipped per
scenario) becomes the campaigns' hidden install rates. The pilot-week
clause is what makes the timeline cohere: Act 1's five trial days are that
pilot week; the 13-week quarter it precedes is Act 2's.

Truth texts are **want-forward**: they describe what players respond to in
positive vocabulary, naming the disliked thing at most once and with words
the distractor placeholders don't use. Both engines score topic, not
stance — a truth that spends tokens naming the hated mechanic (FOMO,
streaks, timers) hands the negation-blind lexical fallback to the pitch
that *sells* that mechanic (caught by the 2026-08-13 adversarial review:
the cozy scenario's FOMO distractor near-tied the aligned pitch). For the
same reason the truth-aligned starter pitch sits in a different slot per
scenario (2, 3, 1) and paraphrases the truth instead of quoting it —
scoring the untouched defaults still picks the aligned pitch decisively
(lexical margins 10.0x / 4.5x / 9.1x over the best distractor, and lexical
is the floor: it matches only surface tokens), but through shared topical
vocabulary rather than a pre-cooked slot or copied keywords. Campaigns, not features: the whole premise of a bandit is cheap,
reversible, weekly switching between arms — a feature ships and can't be
un-shipped mid-quarter, but an ad creative can rotate every week. That's why
the domain is ad campaigns and the reward is installs, not "feature
reception".

Flow: scenario brief → three pitch boxes (editable example placeholders; the
first words become the arm/campaign labels) → Score → **the manual campaign
calendar** (below) → the existing automated race with k=3 and the derived
rates, reframed as "how the algorithms would have run your same quarter, at
full speed" → reveal: the truth text, per-pitch similarity, and the
preference distribution.

Similarity engine — two implementations behind one interface
(`SimilarityEngine.score(pitches, truth)`):

- **semantic** (primary): transformers.js + a quantized MiniLM-class
  sentence encoder, in-browser, weights from the Hugging Face CDN (free; no
  backend). Prefetch starts when the pitch phase mounts — the download rides
  under the reader's typing time. WebGPU when available, WASM otherwise.
- **lexical** (fallback): zero-dep TF-cosine + Jaccard blend over
  normalized/stemmed tokens, with stopwords removed; also returns matched
  terms for the reveal's explainability. Used automatically when the model
  isn't ready ~4s after Score, fails to load, or the device can't run it.
  The reveal names which engine scored the round.

Similarity → rates, two mappings used together:

- **Preference distribution (display):** softmax over the three similarities
  (temperature knob) — "if players saw all three roadmaps…". Sums to 1.
- **Arm conversion rates (simulation):** absolute affine map
  `rate = 0.02 + 0.10 × similarity`, clamped to the existing 2–12% band, and
  deliberately NOT normalized across pitches: three bad pitches all get low
  rates, and the bandit finds the best of a bad lot — the essay's core
  caveat (a bandit only optimizes among the options you gave it). Tie
  separation is sort-walk-enforce-gap-unsort: rates are sorted (with their
  original indices), walked upward enforcing a ≥ 0.3pp gap — nudges only go
  UP, so the floor clamp can never undo a separation — then unsorted. The
  earlier pairwise ±0.3pp nudge left exact ties behind in ~25–50% of seeds
  (caught by the 2026-08-13 adversarial review). Guarantees: every pair
  ≥ 0.3pp apart, a strictly higher similarity never maps below a lower
  one, and rates stay in `[0.02, 0.12 + (k−1)·0.003]` (the headroom is k
  exact ties at the top of the band, spaced upward). The seed's only job is
  deciding which of two EXACTLY tied pitches lands on top, so identical
  pitches don't get a winner predetermined by box order.

Privacy: everything runs client-side; pitches are never stored or sent
anywhere (the model download is a static asset fetch). This is stated
visibly under the pitch boxes.

## Two acts — do not merge them

The manual, hands-on section and the budgeted variant are two separate
narrative acts, not two halves of one continuous calendar. **Act 1 is a
complete, self-contained arc** — pitch → 5 manual trial days → a bridge that
names the k-armed bandit problem with Bernoulli rewards → the full automated
race — and it ships and works on its own before Act 2 exists. **Act 2
(budgets) is a separate, later addition**, built as its own arc after Act 1
is solid, not interleaved into the same UI.

## Act 1: five trial days, then the automated race

Between scoring and the automated race: the reader runs a handful of trials
by hand first, so the algorithms solve a problem the reader has *already
felt* rather than an abstract one. In-fiction these five days are the
scenario brief's pilot week — the short run the brief grants *before* the
13-week quarter — so Act 1's day-scale play and Act 2's week-scale quarter
sit on one continuous timeline instead of contradicting each other. A 5-cell day board (`TRIAL_DAYS = 5`,
`src/state/useTrialDays.ts` + `src/components/TrialDayBoard.tsx`), days
unlocking **sequentially** — only the next unplayed day is interactive;
played days lock in and show their result; future days stay greyed.
Planning all 5 days up front was considered and rejected (same reasoning as
below): it collapses into "commit to a fixed schedule", which just reenacts
the fixed-split strategy by hand and loses the point — seeing a noisy result
and changing your mind.

Every day is a **single-campaign pick** — Act 1 never shows a budget or a
split; the dollar amount behind a pick is an implementation detail, not
something the reader sees. Drag a campaign card onto the current (unlocked)
day, or select-then-confirm as a full pointer-free fallback; dropping
reveals that day's installs. Re-picking the same campaign on a later day
draws a *different* number — the noise itself is the lesson before any
algorithm shows up to handle it.

Reward sampling calls `sampleInstalls` from `src/lib/campaign/simulate.ts`
directly — **not** `playWeek`, which is gated on Act 2's $500 weekly budget
and translates dollars to impressions via the CPM. Act 1's volume is
calibrated for noise, not a literal ad spend, so it bypasses that
translation entirely: `TRIAL_DAY_IMPRESSIONS = 300`
(`src/state/useTrialDays.ts`). At the 20,000 impressions $500 originally
bought (the launch-era $25 CPM), a single day already reads a rate almost
noise-free (SE ≈ 0.2pp at the rates this simulator uses), so a
clearly-better pitch separates instantly and the "manual guessing is
costly" lesson never lands — caught by testing the tool, 2026-08-12. At 300
impressions the SE (√(p(1−p)/300) ≈ 0.8–1.9pp across the 2–12% band:
0.81pp at p = 0.02 up to 1.88pp at p = 0.12) sits close to the ~2pp gap
between two merely-different campaigns: telling them apart from a handful of noisy days
is genuinely hard, while an obviously-better campaign is still usually —
not certainly — findable by day 5. (Act 2 later got the same calibration
treatment via its CPM — see the Act 2 section.) `installs(impressions,
rate)` is a Normal approximation to Binomial(impressions, rate) — mean
`impressions × rate`, sd `√(impressions × rate × (1 − rate))` — reusing
`sampleNormal` from `rng.ts` (not a second hand-rolled Box–Muller; the
review pass on the race engine already flagged that duplication once).
Deterministic via the existing counter-based `hash01`/`makeRng` streams,
keyed on `(seed, day, arm)` in Act 1's own `STREAM.TRIAL_REWARD` stream —
same replayability guarantee as the race, but separate from Act 2's
`STREAM.WEEKLY_REWARD` so trial day d never replays quarter week d's luck
arm-for-arm (`sampleInstalls` takes an optional trailing stream tag,
defaulting to the weekly stream).

**Quantifying the cost**: alongside the raw install counts, `useTrialDays`
computes `installsLeftOnTable` — the gap between the reader's total and a
perfect-foresight oracle's REALIZED run of the same days
(`realizedOracleInstalls` in `budgetStrategies.ts`: the best arm's own
`sampleInstalls` draws, day by day, under the same seed and stream). Common
random numbers make this comparison noise-free by construction: a reader
who picks the truly best campaign every day lands on exactly the oracle's
draws and shows exactly 0, and every positive gap is attributable to
picks, not luck. (An earlier version compared against the oracle's
*expectation*, which showed perfect-play readers a positive "cost" ~half
the time — an expectation minus a realization charges the reader for their
own sampling noise; caught by the 2026-08-13 adversarial review.) Still
clamped to ≥ 0. This gives the bridge a concrete, honest number — the
calibrated ambiguity above and this quantified number are two independent
reinforcements of the same point, not redundant.

**The bridge**, after day 5 (`src/components/BanditBridge.tsx`): a short
recap of the reader's own noisy results, the installs-left-on-the-table
figure, then the question — *"How do we plan the quarter ahead of us?"* —
followed by naming what they just did: this is the **k-armed bandit
problem** (k = 3 campaigns here) with **Bernoulli rewards** — every pull
returns a single yes/no outcome (did this impression convert, or not)
drawn from a fixed but unknown probability, and each "day" was really
hundreds of those pulls happening at once. The three strategies below are
three different answers to "which arm do I pull next". CTA hands off into
the existing, unmodified automated race.

Drag-and-drop is custom pointer-event tracking (pointerdown/move/up), not
native HTML5 DnD (no real touch support) and not a new dependency. A
click-to-select-a-card, click-to-place-on-the-day fallback covers keyboard
and switch users, matching the a11y level already built into the rest of
the simulator.

Campaign identity gets its own validated 3-color categorical palette,
**distinct from the reserved strategy colors** (`--series-fixed/egreedy/
thompson` are never reassigned — see the chart spec above). Validated with
the dataviz six-checks script in both modes on 2026-08-12:

| campaign | light | dark |
|---|---|---|
| `--campaign-a` (rose) | `#be123c` | `#e11d48` |
| `--campaign-b` (sky) | `#0369a1` | `#0284c7` |
| `--campaign-c` (lime) | `#65a30d` | `#65a30d` |

Two further reserved tokens sit alongside (validated with the same
six-checks script, both modes, on 2026-08-13, against the strategy AND
campaign palettes they share screens with):

| token | light | dark | role |
|---|---|---|---|
| `--you` (fuchsia) | `#c026d3` | `#c026d3` | the reader's own data series ("You" in the quarter comparison) — a dedicated token, NOT `--accent`, which doubles as Thompson's hue and made the two bars read as twins (caught by the 2026-08-13 adversarial review) |
| `--danger` | `#b91c1c` | `#f87171` | status/error only ("over budget") — ≥ 4.5:1 on both `--paper` and `--card` in both modes (6.1–6.8:1); the earlier reuse of `--campaign-a` failed AA in dark mode and, sitting under campaign A's rose chip, read as blaming that campaign specifically |

The automated race's engine is **not** rebuilt to be continuously
budget-denominated — a true fractional-allocation bandit is a different,
harder problem, and the existing discrete-pull engine already expresses a
budget in aggregate (a strategy's share of pulls over many rounds *is* its
long-run budget split — that's what the ArmCard share bars already show).
Act 1 and the automated race connect through framing and shared
vocabulary, not a shared implementation.

## Act 2: the budgeted quarter

Entered from Act 1's race screen (pitch-derived races only) via an explicit
CTA — Act 1 remains a complete arc on its own; Act 2 fulfills the bridge's
promise to "bring back the budgeting constraint".

**The problem shift**: in Act 1 the decision was *what to run*; in Act 2 it
is *how to divide the money*. Every week of a 13-week quarter the reader
splits `WEEKLY_BUDGET = $500` across all three campaigns
(`useCampaignQuarter` — the hook has no pick concept left: `derivePhase`
is 'budget' through week 13 and 'complete' past it, plus a transient
'auto' phase while a handoff plays out; picking single campaigns is Act
1's trial board). Same hidden rates,
same reward engine, same seed — but Act 2's weekly draws live in their own
`STREAM.WEEKLY_REWARD` stream, separate from Act 1's trial-day stream, so
the quarter doesn't replay the pilot week's luck. The explore/hedge
tension is the lesson: spread the budget evenly and you learn a little
about every arm but confidently about none; concentrate it and you learn a
lot about one and nothing about the others.

**Signal-to-noise calibration** (`CPM = $1000` in `campaign/types.ts`, so
$500/week buys 500 impressions): the original $25 CPM gave 20,000
impressions/week — exactly the volume the Act 1 section above says reads a
rate almost noise-free, so one even-split week identified the best
campaign in ~100% of seeds and the hedge-vs-learn tension the act is built
around did not exist in its own engine (caught by the 2026-08-13
adversarial review). Recalibrated by Monte Carlo (2,500 seeds per config,
rate configs from the real mapping band — best 10–12%, second 1–3pp
behind, third far), over candidate CPMs {250, 500, 1000}:

- P(even-split week-1 argmax = true best), 2pp best-vs-second gap:
  0.887 / 0.783 / **0.702** — only $1000 sits below the ~0.75 target, so
  hedged learning genuinely takes multiple weeks (and 0.576 at a 1pp gap,
  0.790 at 3pp).
- P(Thompson full-quarter total > fixed-split, CRN): 1.000 at every
  candidate; at $1000 the mean margin is ~160 installs (~682 vs ~521,
  +31%) — concentrating still visibly wins the quarter.
- Weekly installs stay readable at $1000: ~55/week all-in on an 11% arm,
  ~18 per arm under an even split — 2-digit numbers, same scale as Act
  1's trial days.

**The handoff mechanic** — the act's payoff. After the reader has split at
least `HANDOFF_MIN_WEEKS = 2` weeks by hand (they must feel the tension
before being rescued from it), a card offers to hand the *remaining* weeks
to one of the three strategies they met in Act 1 — now in budgeted form,
and crucially **seeded with the reader's own accumulated data** (the
strategy inherits the tallies from the manual weeks, so it finishes *your*
quarter, it doesn't start a fresh one). Budgeted variants
(`src/lib/campaign/budgetStrategies.ts`, weekly allocation from cumulative
per-arm impression/install tallies):

- **fixed-split** → even thirds every week, forever.
- **epsilon-greedy** → (1−ε) of the budget on the best current estimate,
  ε split evenly across the rest. ε defaults to `HANDOFF_EPSILON = 0.1`;
  `handOff(strategyId, epsilon?)` threads an explicit ε through to
  `runBudgetQuarter`, so the UI can hand over the ε the reader set on the
  race screen instead of silently substituting 0.1. Cold start: while 2+ arms are
  untried there is no estimate to exploit, so the whole budget splits
  evenly across the untried arms (pure exploration); a single untried arm
  counts as best (ties to lowest index). Dumping (1−ε) on the
  lowest-index untried arm — the earlier rule — biased the from-scratch
  full-quarter comparison by box order.
- **thompson** → probability matching: S = 200 Beta(1+installs,
  1+failures) posterior draws per arm (via the deterministic `sampleBeta`
  stream `STREAM.BUDGET_STRATEGY = 8`), budget allocated proportional to
  win counts. Starts near-even under ignorance and concentrates as
  evidence accumulates — the visible signature of the strategy.

On the card, each strategy button carries a one-line plain-English
explainer of what it would do with the weekly budget
(`STRATEGY_EXPLAINERS` in `strategyExplainers.ts`); the race chart's legend
reuses the same lines as title/aria enrichment, so both surfaces tell one
story about each strategy.

Allocations are rounded to cents with the remainder assigned to the
largest share, so they always satisfy `playWeek`'s exact-sum gate. Because
`sampleInstalls` draws depend only on `(seed, week, arm)` (plus
impressions for scale), the strategy's auto-completed weeks face the same
world the reader's manual weeks would have — same replayability, and a
fair "it finished your quarter" claim.

The handoff is computed synchronously (`runBudgetQuarter` returns every
remaining week at once — pure and testable) but **revealed
progressively**: the hook queues the results and appends one to the
calendar every `HANDOFF_WEEK_MS = 180` ms, holding `phase = 'auto'` while
the queue drains and landing on 'complete' only when it empties. The
reader watches the strategy's allocation concentrate week by week —
Thompson's start-near-even-then-narrow signature plays out as behavior on
the calendar, not only as a static stacked-bar timeline in the debrief
afterwards (the earlier single-frame handoff skipped the act's payoff
beat; caught by the 2026-08-13 adversarial review). `reset()` and the
(rates, seed) rewind cancel the animation by clearing the queue. The
handoff card is only rendered while `phase === 'budget'`, so it
disappears the moment the animation starts — no second hand-off to offer
while one is draining.

Every view seam — the act transitions, the handoff, quarter completion
(whether the animation drained week 13 or the reader played it by hand),
and the resets — moves keyboard focus to the incoming view's topline
(`tabIndex={-1}` + ref focus) and announces itself through one
always-mounted polite live region owned by `Playground`, so activating a
control that unmounts itself is never a silent event for a screen-reader
user (caught by the 2026-08-13 adversarial review).

**Quarter results**, once week 13 is played (by hand or by handoff):
totals; installs left on the table vs. a perfect-foresight oracle — the
oracle's REALIZED run of the same quarter (`realizedOracleQuarter`: $500
all-in on the truly best arm through the same `playWeek` draws, weeks
1–13). By CRN construction perfect play lands on exactly the oracle's own
draws and shows exactly 0 left on the table — the earlier
expectation-vs-realization version charged perfect-play readers a
positive "cost" ~half the time (2026-08-13 adversarial review) — and a
positive gap is a statement about choices under the same draws, not about
luck. (`quarterLeftOnTable` takes the seed; its seedless form falls back
to the old expectation for legacy callers, and `oracleQuarterInstalls`
stays exported for copy that wants the expectation.) A per-week **allocation
timeline** (stacked bars in the campaign colors, handoff point marked) that
makes the reader's hedging visually contrast with a strategy's
concentration; and a **full-quarter comparison** — each strategy re-run
over all 13 weeks from scratch, next to the reader's own total and the
oracle. Strategy identity uses the reserved strategy colors; the reader's
own bar uses the dedicated `--you` token (see the palette tables above —
the accent token it originally reused is Thompson's hue family); the
oracle is muted — never color-alone, every bar direct-labeled with its
value. The week timeline is a `role=list` of rows rather than an `<ol>`,
so the handoff divider can sit between rows without being announced as a
phantom 14th week; each played week's accessible name — in the debrief
AND on the live calendar — comes from one shared builder (`weekAria`:
the campaign-by-campaign dollar split plus the installs total, ", run by
X" on auto weeks), so the proportional color chips are never the only
encoding of where the money went.

## Out of scope for v1

Essay prose (placeholder section stays), whale/delay UI toggles, the
essay↔tool bridge (`#tool:` links), OG image, mobile-first polish beyond
basic responsiveness.

## The acts restructure (2026-08-18)

The one-page essay became **four horizontally-navigable acts** — an acts
bar with prev/next arrows and per-act tabs, hash-synced (`#act-0`…`#act-3`)
so acts deep-link and browser back/forward walk between them
(`src/acts.ts`, `src/components/ActsShell.tsx`). Navigation is **free**
(no sequential unlock); every act self-seeds so no deep link ever lands
broken. All cross-act state (pitch outcome, both simulations, the pilot,
the quarter) lives in the shell, so moving between acts never resets
progress; the act components are pure views and unmount freely. One
always-mounted polite live region serves the shell and every act's
internal seams; act changes move focus to the incoming panel.

- **Act 0 — The Introduction**: the header prose (meta.md + images) and a
  "Begin Act I" CTA, nothing else. The six essay sections that used to sit
  below the demo are **deleted** (content files, `loadSections`, the CMS
  `sections` collection, their tests).
- **Act I — Trial & Error**: the pitch → manual pilot → automated race arc
  (`Act1TrialError`). The pilot is now **five weeks**, not five days —
  same 5-round engine, renamed throughout (`useTrialWeeks`,
  `TRIAL_WEEKS`, `TrialWeekBoard`, scenario briefs now grant "a short
  five-week pilot"). The pitch phase starts with **blank boxes**: a worked
  example above them (from a co-op heist game none of the scenarios cover,
  so it can't leak an answer), plus a "Generate example pitches" button
  that fills the scenario's curated examples (`Scenario.examplePitches`,
  the former `placeholders`). "Skip" now jumps to Act III's lab — the
  race screen no longer has a sandbox branch.
- **Act II — Rationing**: the budgeted quarter, unchanged in substance.
  When entered without a scored pitch it **self-seeds** with the current
  scenario's example pitches scored through the *synchronous lexical*
  engine and the same `similaritiesToRates` mapping
  (`src/lib/exampleCampaigns.ts`), with a banner naming them as examples
  and linking back to Act I. A test guards that the truth-aligned example
  wins under lexical scoring in every scenario, so the self-seeded quarter
  never quietly teaches that a distractor converts best. Scoring real
  pitches later swaps the rates in, which rewinds the quarter by the
  hook's existing (rates, seed) identity contract.
- **Act III — Learning from the Best** (`Act3Lab`): per-strategy teaching
  cards (how it thinks / where it wins and loses / take it home, plus
  pseudocode) next to a **free-play lab** — the old sandbox, now a
  separate `useSimulation` instance so tuning it never disturbs Act I's
  pitch-derived race. One-click experiment presets (crank ε, starve ε,
  drift, k = 6) configure the lab and start playback to demonstrate each
  card's claims.

The race-view internals (controls + chart + arm cards + throttled
`statsAt` derivation) were extracted from the old `Playground` into
`SimulatorPanel`, shared by Act I's race and Act III's lab; `Playground`
itself is gone.

## Regret gets its own act (2026-08-24)

The four-act structure above became **five**: the automated strategy race
moved out of Act I into a new **Act II — Regret** (`Act2Regret`), and
every act from the old Act II onward shifted up by one — Rationing is now
Act III (`Act3Rationing`, renamed from `Act2Rationing`), and the lab is
now Act IV (`Act4Lab`, renamed from `Act3Lab`; `act3.css` → `lab.css`,
`a3-*` classes → `lab-*`). Hash routing grew to `#act-0`…`#act-4`.

- **Why split it out**: regret is the essay's one formal concept, and it
  was previously taught as an aside bolted onto Act I's race screen — a
  chart caption's "(Statisticians call this regret.)" plus a paragraph in
  `BanditBridge`. Giving it a named act puts the explanation where the
  chart actually is, and the act title itself primes the reader before
  they hit play.
- **Act I's bridge** (`BanditBridge`) keeps the pilot recap and the
  k-armed-bandit-problem naming, and gained new copy: an
  exploration/exploitation paragraph (most readers try all three options
  first, then exploit the best one — a very human answer to "when do we
  stop exploring?") ending on the word "regret" as a tease the new act
  picks up by name. The old "one honest caveat" paragraph (single-campaign
  vs. real budgets, promising to "bring back the budgeting constraint")
  was cut along with the `bb-question` line ("How do we plan the quarter
  ahead of us?") it was answering — that setup now belongs to Act II's
  own closing CTA into Act III instead.
- **Act II can't self-seed** the way Act III does: its whole framing is
  "YOUR campaigns, re-run," so a reader who deep-links `#act-2` (or
  navigates there) without a scored pitch sees a gate note pointing back
  to Act I rather than a race over borrowed campaigns.
- **Act I lost its race entirely** — `Act1Mode` is now `'pitch' | 'trial'`
  (no more `'race'`), and `SimulatorPanel` no longer imports into
  `Act1TrialError`. The bridge's CTA (`onGoToRegret`) navigates to Act II
  instead of swapping the mode in place.
- **PitchPhase's action row was reordered**: "Skip to the strategy lab"
  moved to the left, the engine-status line and "Score my pitches" grouped
  on the right (`.pp-actions-go`) — advancement now lives on the
  right-hand side everywhere in the essay, escape hatches on the left.

## Five strategies, a conclusion act, and coarser budget steps (2026-08-24, later)

Three changes in one pass:

- **UCB1 and uniform random joined the strategy roster** (`STRATEGY_IDS`
  is now five entries; it is APPEND-ONLY, because each strategy's private
  RNG stream is keyed by its index in that list, in both `simulate` and
  `runBudgetQuarter`). UCB is **UCB1-Tuned** (Auer et al. §4: the confidence
  bonus scales with observed variance), a measured choice, not a default:
  plain UCB1's sqrt(2 ln t / n) bonus dwarfs the arm gaps at
  install-rate-scale rewards, leaving avg final regret 116 vs the fixed
  split's 231 at H=5000 (8 seeds), which would put the lab's "bending line"
  teaching on screen as false; Tuned lands at 42 (H=5000) and 58 vs
  ε-greedy's 119 at H=20000. Deterministic, consumes no randomness. Uniform
  random is the floor every learner has to beat. Budgeted variants for
  Act III: UCB goes all-in on its optimistic pick (even split across
  untried arms on cold start, mirroring ε-greedy's documented convention);
  random goes all-in on a uniformly random arm each week, because
  probability-matched 1/k shares would duplicate the fixed split and hide
  what randomness costs. Series colors: gold (`--series-ucb`) and pink
  (`--series-random`), validated with the dataviz six-checks script against
  both surfaces on 2026-08-24, including the six-slot QuarterResults bar
  order with `--you`.
- **Act V — The Conclusion** (`Act5Conclusion`, `#act-5`): a prose-only
  bookend to Act 0. The playground's simplifications named as choices, then
  the real-world version of the problem: contextual bandits, fed observable
  state, closing the log-decide-observe loop, delayed rewards, permanent
  exploration, iterating as dynamics shift. Act IV gained a `pg-next-cta`
  into it.
- **Act III's budget inputs step by $50** (was $5; `BUDGET_STEP` in
  `BudgetSplitPanel`), and a "Randomize split" button fills a uniformly
  random $50-granular split (Math.random on purpose: reader-hand
  convenience, not simulation state — the committed allocation flows
  through the same deterministic `playWeek` either way).
