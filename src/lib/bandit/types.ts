/**
 * Shared contracts for the k-armed bandit simulator.
 *
 * This file is the API boundary between the engine (src/lib/bandit/*) and
 * the UI (src/components/*, src/state/*). Both sides build against these
 * types; change them only together with docs/plans/2026-08-12-simulator-design.md.
 */

export type StrategyId = 'fixed-split' | 'epsilon-greedy' | 'thompson'

/** Fixed order everywhere: legend, colors, result arrays. Never re-sort. */
export const STRATEGY_IDS = ['fixed-split', 'epsilon-greedy', 'thompson'] as const

export const STRATEGY_LABELS: Record<StrategyId, string> = {
  'fixed-split': 'Fixed A/B split',
  'epsilon-greedy': 'ε-greedy',
  thompson: 'Thompson sampling',
}

/** Compact labels for tight rows (arm cards), where the chip carries identity. */
export const STRATEGY_SHORT_LABELS: Record<StrategyId, string> = {
  'fixed-split': 'Fixed',
  'epsilon-greedy': 'ε-greedy',
  thompson: 'Thompson',
}

/** CSS custom property carrying each strategy's validated series color. */
export const STRATEGY_COLOR_VARS: Record<StrategyId, string> = {
  'fixed-split': 'var(--series-fixed)',
  'epsilon-greedy': 'var(--series-egreedy)',
  thompson: 'var(--series-thompson)',
}

export interface DriftConfig {
  enabled: boolean
  /** Per-round std-dev of the reflected random walk applied to each arm's rate. */
  volatility: number
}

/** Engine-ready; not surfaced in the v1 UI. */
export interface WhaleConfig {
  enabled: boolean
  /** Probability that a conversion is a whale purchase. */
  share: number
  /** Revenue of a whale purchase, as a multiple of a normal one (= 1). */
  multiplier: number
}

export interface SimulationConfig {
  seed: number
  /** Number of arms (offer variants), 2–6. */
  k: number
  /** Rounds simulated, 100–20000. */
  horizon: number
  /** True base conversion rate per arm, length k, each in (0, 1). */
  baseRates: number[]
  /** Exploration probability for ε-greedy, 0–1. */
  epsilon: number
  drift: DriftConfig
  whales: WhaleConfig
}

/** One strategy's full precomputed run. All arrays have length `horizon`. */
export interface StrategyRun {
  id: StrategyId
  /** Arm chosen at round t. */
  chosen: number[]
  /** 1 if the chosen arm converted at round t, else 0. */
  converted: (0 | 1)[]
  /** Revenue realized at round t (0, 1, or the whale multiplier). */
  reward: number[]
  /** Cumulative expected regret after round t, in conversion units. */
  regret: number[]
  /** Cumulative realized revenue after round t. */
  revenue: number[]
}

export interface SimulationResult {
  config: SimulationConfig
  /** rates[t][arm]: true conversion rate at round t (varies only under drift). */
  rates: number[][]
  /** bestRate[t]: max over arms of rates[t]. */
  bestRate: number[]
  /** One run per strategy, in STRATEGY_IDS order. */
  strategies: StrategyRun[]
}

/** Per-arm tallies for one strategy at a playhead position. */
export interface ArmStats {
  /** Times each arm was pulled in rounds [0, t). */
  pulls: number[]
  /** Conversions observed on each arm in rounds [0, t). */
  successes: number[]
}
