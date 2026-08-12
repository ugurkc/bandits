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
surface gaps and 4px rounded data-ends; no per-point value labels.

## Out of scope for v1

Essay prose (placeholder section stays), whale/delay UI toggles, the
essay↔tool bridge (`#tool:` links), OG image, mobile-first polish beyond
basic responsiveness.
