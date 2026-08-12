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
felt* rather than an abstract one. A 5-cell day board (`TRIAL_DAYS = 5`,
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

Reward sampling reuses the Act-2-shaped engine unchanged: a "day" is played
via `playWeek(day, oneHotAllocation(campaignId), rates, seed)` from
`src/lib/campaign/simulate.ts` (the `week` parameter is just an integer
index into the deterministic RNG stream — nothing about it implies a
7-day cadence). `installs(impressions, rate)` is a Normal approximation to
Binomial(impressions, rate) — mean `impressions × rate`, sd
`√(impressions × rate × (1 − rate))` — reusing `sampleNormal` from
`rng.ts` (not a second hand-rolled Box–Muller; the review pass on the race
engine already flagged that duplication once). Deterministic via the
existing counter-based `hash01`/`makeRng` streams, keyed on
`(seed, day, arm)` — same replayability guarantee as the race.

**The bridge**, after day 5 (`src/components/BanditBridge.tsx`): a short
recap of the reader's own noisy results, then the question — *"How do we
plan the weeks ahead of us?"* — followed by naming what they just did: this
is the **k-armed bandit problem** (k = 3 campaigns here) with **Bernoulli
rewards** — every pull returns a single yes/no outcome (did this impression
convert, or not) drawn from a fixed but unknown probability, and each
"day" was really thousands of those pulls happening at once. The three
strategies below are three different answers to "which arm do I pull next".
CTA hands off into the existing, unmodified automated race.

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

The automated race's engine is **not** rebuilt to be continuously
budget-denominated — a true fractional-allocation bandit is a different,
harder problem, and the existing discrete-pull engine already expresses a
budget in aggregate (a strategy's share of pulls over many rounds *is* its
long-run budget split — that's what the ArmCard share bars already show).
Act 1 and the automated race connect through framing and shared
vocabulary, not a shared implementation.

## Act 2: the budgeted quarter (built, not yet wired in)

A full 13-week budgeted continuation already exists in the codebase —
`src/state/useCampaignQuarter.ts`, `src/components/CampaignCalendar.tsx`
(a 13-week grid, `WEEKS_PER_QUARTER = 13`, `PICK_PHASE_WEEKS = 4`),
`src/components/BudgetSplitPanel.tsx` (a per-week 3-way dollar split,
`WEEKLY_BUDGET = $500`, must sum exactly) — tested and gated green, but
**not composed into `Playground.tsx`**. It is reserved for Act 2: once the
budget dimension is shown, "what to run" becomes "how much to spend on
each", surfacing the explore/hedge tension explicitly (spread the budget
evenly and you learn a little about every arm but confidently about none;
concentrate it and you learn a lot about one and nothing about the others).
Its reward math is identical to Act 1's — Act 1's single-pick day *is* this
system's one-hot allocation, so the two acts stay numerically comparable
whenever Act 2 gets built. Building this act, and deciding how it hands off
from Act 1 (a second race framed around budget share instead of pull
count? a separate page?) is future work, not scoped here.

## Out of scope for v1

Essay prose (placeholder section stays), whale/delay UI toggles, the
essay↔tool bridge (`#tool:` links), OG image, mobile-first polish beyond
basic responsiveness, Act 2's integration into Playground.
