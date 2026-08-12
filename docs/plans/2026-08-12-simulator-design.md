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
src/lib/bandit/strategies.ts  — the three StrategyImpls
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
(values for all three series at the hovered round); share bars get 2px
surface gaps and 4px rounded data-ends; no per-point value labels. The chart
measures its container (ResizeObserver) and derives the viewBox width from it
so 1 viewBox unit = 1 CSS px — text keeps its declared size at any width and
the tooltip clamps in real pixels.

## The pitch phase (landing)

The playground's opening state. The reader *becomes the studio's marketing
lead*: a scenario card briefs them ("you have a quarter to find which
campaign gets people installing"), they write three ad campaign pitches
(headline/hook copy) in free text, and the gap between what they wrote and a
**hidden truth text** (what messaging actually resonates with this
playerbase, shipped per scenario) becomes the campaigns' hidden install
rates. Campaigns, not features: the whole premise of a bandit is cheap,
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
  caveat (a bandit only optimizes among the options you gave it). Seeded
  ±0.3pp tie-nudge keeps the race from degenerating on identical scores.

Privacy: everything runs client-side; pitches are never stored or sent
anywhere (the model download is a static asset fetch). This is stated
visibly under the pitch boxes.

## The manual campaign calendar

Between scoring and the automated race: the reader runs the quarter by hand
first, so the algorithms solve a problem the reader has *already felt*
rather than an abstract one. One 13-week grid (`WEEKS_PER_QUARTER = 13`)
used throughout, weeks unlocking **sequentially** — only the next unplayed
week is interactive; played weeks lock in and show their result; future
weeks stay greyed. Planning the whole quarter up front was considered and
rejected: it collapses into "commit to a fixed schedule", which just
reenacts the fixed-split strategy by hand and loses the point — seeing a
noisy result and changing your mind mid-quarter.

One underlying weekly simulation, not two: a week is always **a 3-way dollar
split** across the campaigns, `WEEKLY_BUDGET = $500`. Phase 1's "pick one
campaign" is the degenerate case — the full $500 on a single campaign, a
one-hot split. This means Phase 1 and Phase 2 share one reward function and
are numerically comparable (a full-budget week in either phase yields the
same ~20,000 impressions via `IMPRESSIONS_PER_DOLLAR = budget / CPM`,
`CPM = $25`).

- **Weeks 1–4 — "which campaign works?"** The reader can change which single
  campaign runs each week. Drag a campaign card onto the current (unlocked)
  week; dropping commits the week (whole budget, one-hot split) and reveals
  that week's installs. Re-running the same campaign in a later week draws a
  *different* number — the noise itself is the lesson before any algorithm
  shows up to handle it.
- **Weeks 5–13 — "how do you divide the budget?"** The decision changes from
  *what* to run to *how much* to spend on each: a per-week panel with three
  amounts that must sum to $500. Same reward function, now with impressions
  split across up to three campaigns — hedge evenly and you learn a little
  about all three but confidently about none; concentrate and you learn a
  lot about one and nothing about the others. That tension is exactly what
  the bandit algorithms exist to resolve.
- **Scoreboard**, after week 13: total installs across the reader's own
  quarter, before the handoff line into the automated race ("let the
  algorithm run this same quarter, at full speed").

Reward sampling: `installs(impressions, rate)` is a Normal approximation to
Binomial(impressions, rate) — mean `impressions × rate`, sd
`√(impressions × rate × (1 − rate))` — reusing `sampleNormal` from
`rng.ts` (not a second hand-rolled Box–Muller; the review pass on the race
engine already flagged that duplication once). Rounded to an integer,
clamped to `[0, impressions]`. Deterministic via the existing counter-based
`hash01`/`makeRng` streams, keyed on `(seed, week, arm)` — same
replayability guarantee as the race.

Drag-and-drop is custom pointer-event tracking (pointerdown/move/up), not
native HTML5 DnD (no real touch support) and not a new dependency. A
click-to-select-a-card, click-to-place-on-the-week fallback covers keyboard
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

The automated race's engine is **not** rebuilt to be continuously
budget-denominated — a true fractional-allocation bandit is a different,
harder problem, and the existing discrete-pull engine already expresses a
budget in aggregate (a strategy's share of pulls over many rounds *is* its
long-run budget split — that's what the ArmCard share bars already show).
The manual calendar and the automated race connect through framing and
shared vocabulary, not a shared implementation.

## Out of scope for v1

Essay prose (placeholder section stays), whale/delay UI toggles, the
essay↔tool bridge (`#tool:` links), OG image, mobile-first polish beyond
basic responsiveness.
