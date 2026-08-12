/**
 * Act 2's budgeted strategy variants: the three Act 1 strategies, re-expressed
 * as weekly dollar allocators. Each week a strategy looks at the cumulative
 * per-arm impression/install tallies and splits `WEEKLY_BUDGET` across all
 * k arms — same strategy identities (ids, labels, colors) as the automated
 * race, never re-invented.
 *
 * See "Act 2: the budgeted quarter" in
 * docs/plans/2026-08-12-simulator-design.md — change this together with
 * that doc.
 */

import { makeRng, sampleBeta, STREAM } from '../bandit/rng'
import type { StrategyId } from '../bandit/types'
import { STRATEGY_IDS } from '../bandit/types'
import { impressionsForBudget, playWeek } from './simulate'
import type { CampaignWeekResult, WeekAllocation } from './types'
import { WEEKLY_BUDGET, WEEKS_PER_QUARTER } from './types'

/** Cumulative per-arm observations; both arrays have length k. */
export interface ArmTallies {
  impressions: number[]
  installs: number[]
}

/** Exploration share for the budgeted ε-greedy handoff. */
export const HANDOFF_EPSILON = 0.1

/** Posterior draws per arm per week for budgeted Thompson sampling. */
export const THOMPSON_SAMPLES = 200

/** Sums each arm's impressions and installs across the played weeks. */
export function talliesFromWeeks(weeks: CampaignWeekResult[], k: number): ArmTallies {
  const impressions = new Array<number>(k).fill(0)
  const installs = new Array<number>(k).fill(0)
  for (const week of weeks) {
    for (let arm = 0; arm < k; arm++) {
      impressions[arm] += week.impressions[arm] ?? 0
      installs[arm] += week.installs[arm] ?? 0
    }
  }
  return { impressions, installs }
}

/**
 * Exact-sum rounding convention, used by every strategy branch: round each
 * raw dollar share to cents, then assign whatever cent remainder is left
 * (positive or negative) to the largest-share arm (ties to the lowest
 * index). The result always sums to exactly `WEEKLY_BUDGET`, satisfying
 * `playWeek`'s exact-sum gate without float slop.
 */
function exactSumAllocation(shares: number[]): WeekAllocation {
  const targetCents = Math.round(WEEKLY_BUDGET * 100)
  const cents = shares.map((share) => Math.round(share * 100))
  const sumCents = cents.reduce((sum, c) => sum + c, 0)
  let largest = 0
  for (let i = 1; i < shares.length; i++) {
    if (shares[i] > shares[largest]) largest = i
  }
  cents[largest] += targetCents - sumCents
  const allocation: WeekAllocation = {}
  for (let i = 0; i < cents.length; i++) {
    allocation[i] = cents[i] / 100
  }
  return allocation
}

/**
 * ε-greedy's "best current estimate": highest installs/impressions, with
 * UNTRIED arms (zero impressions) ranked above every tried arm, ties to the
 * lowest index.
 */
function bestEstimateArm(tallies: ArmTallies): number {
  const value = (i: number): number =>
    tallies.impressions[i] > 0 ? tallies.installs[i] / tallies.impressions[i] : Infinity
  let best = 0
  for (let i = 1; i < tallies.impressions.length; i++) {
    // Strict > keeps the lowest index on ties (Infinity > Infinity is false,
    // so among several untried arms the first one wins).
    if (value(i) > value(best)) best = i
  }
  return best
}

/**
 * One week's dollar allocation for a budgeted strategy, from the cumulative
 * tallies. `rand` is the strategy's own sequential stream (only Thompson
 * consumes it). Every branch returns an exact-sum allocation (see
 * `exactSumAllocation`).
 */
export function allocateBudgetWeek(
  strategyId: StrategyId,
  tallies: ArmTallies,
  epsilon: number,
  rand: () => number,
): WeekAllocation {
  const k = tallies.impressions.length

  if (strategyId === 'fixed-split') {
    return exactSumAllocation(new Array<number>(k).fill(WEEKLY_BUDGET / k))
  }

  if (strategyId === 'epsilon-greedy') {
    if (k === 1) return exactSumAllocation([WEEKLY_BUDGET])
    const best = bestEstimateArm(tallies)
    const exploreShare = (epsilon * WEEKLY_BUDGET) / (k - 1)
    const shares = new Array<number>(k).fill(exploreShare)
    shares[best] = (1 - epsilon) * WEEKLY_BUDGET
    return exactSumAllocation(shares)
  }

  // Thompson: probability matching. Each of the THOMPSON_SAMPLES rounds
  // draws one Beta(1 + installs, 1 + failures) posterior sample per arm; the
  // argmax arm wins the round (ties to the lowest index). Budget is
  // proportional to win counts — an arm with zero wins gets $0, which is
  // correct behavior (playWeek treats zero entries fine).
  const wins = new Array<number>(k).fill(0)
  for (let round = 0; round < THOMPSON_SAMPLES; round++) {
    let bestArm = 0
    let bestDraw = -Infinity
    for (let arm = 0; arm < k; arm++) {
      const successes = tallies.installs[arm]
      const failures = tallies.impressions[arm] - tallies.installs[arm]
      const draw = sampleBeta(1 + successes, 1 + failures, rand)
      if (draw > bestDraw) {
        bestDraw = draw
        bestArm = arm
      }
    }
    wins[bestArm]++
  }
  return exactSumAllocation(wins.map((w) => (w / THOMPSON_SAMPLES) * WEEKLY_BUDGET))
}

/**
 * Auto-completes a quarter: seeds tallies from the reader's `priorWeeks`
 * (the strategy inherits their accumulated data — it finishes *their*
 * quarter, it doesn't start a fresh one), then allocates and plays every
 * week from `startWeek` through `WEEKS_PER_QUARTER`.
 *
 * Rewards go through the same `playWeek(week, allocation, rates, seed)` the
 * reader's manual weeks used, so the draws depend only on (seed, week, arm)
 * — the strategy faces the same world the reader would have. The strategy's
 * own randomness is one sequential stream created once per run:
 * `makeRng(seed, STREAM.BUDGET_STRATEGY, strategyIndex)`.
 */
export function runBudgetQuarter(
  strategyId: StrategyId,
  rates: number[],
  seed: number,
  startWeek: number,
  priorWeeks: CampaignWeekResult[],
  epsilon: number = HANDOFF_EPSILON,
): CampaignWeekResult[] {
  const k = rates.length
  const tallies = talliesFromWeeks(priorWeeks, k)
  const strategyIndex = STRATEGY_IDS.indexOf(strategyId)
  const rand = makeRng(seed, STREAM.BUDGET_STRATEGY, strategyIndex)

  const results: CampaignWeekResult[] = []
  for (let week = startWeek; week <= WEEKS_PER_QUARTER; week++) {
    const allocation = allocateBudgetWeek(strategyId, tallies, epsilon, rand)
    const result = playWeek(week, allocation, rates, seed)
    for (let arm = 0; arm < k; arm++) {
      tallies.impressions[arm] += result.impressions[arm] ?? 0
      tallies.installs[arm] += result.installs[arm] ?? 0
    }
    results.push(result)
  }
  return results
}

/**
 * Expected installs from putting the full weekly budget on the truly best
 * arm every week. Pure.
 */
export function oracleQuarterInstalls(weeks: number, bestRate: number): number {
  return weeks * impressionsForBudget(WEEKLY_BUDGET) * bestRate
}

/**
 * Installs given up versus a perfect-foresight oracle over the played weeks.
 * Never negative — a lucky noisy run beating the oracle's *expectation* is
 * luck, not something "left on the table". Mirrors `installsLeftOnTable` in
 * useTrialDays.ts. Pure.
 */
export function quarterLeftOnTable(actualTotal: number, playedWeeks: number, rates: number[]): number {
  if (rates.length === 0 || playedWeeks === 0) return 0
  const best = Math.max(...rates)
  return Math.max(0, Math.round(oracleQuarterInstalls(playedWeeks, best) - actualTotal))
}
