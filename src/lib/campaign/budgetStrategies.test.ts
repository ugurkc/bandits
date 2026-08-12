import { describe, expect, it } from 'vitest'
import { makeRng, STREAM } from '../bandit/rng'
import { STRATEGY_IDS } from '../bandit/types'
import {
  allocateBudgetWeek,
  HANDOFF_EPSILON,
  oracleQuarterInstalls,
  quarterLeftOnTable,
  runBudgetQuarter,
  talliesFromWeeks,
  THOMPSON_SAMPLES,
  type ArmTallies,
} from './budgetStrategies'
import { playWeek } from './simulate'
import type { CampaignWeekResult, WeekAllocation } from './types'
import { WEEKLY_BUDGET, WEEKS_PER_QUARTER } from './types'

/** Cent-exact sum of an allocation's dollar values. */
function allocationCents(allocation: WeekAllocation): number {
  return Object.values(allocation).reduce((sum, v) => sum + Math.round(v * 100), 0)
}

function week(
  weekNumber: number,
  impressions: Record<number, number>,
  installs: Record<number, number>,
): CampaignWeekResult {
  return {
    week: weekNumber,
    allocation: { 0: WEEKLY_BUDGET },
    impressions,
    installs,
    totalInstalls: Object.values(installs).reduce((s, v) => s + v, 0),
  }
}

function zeroTallies(k: number): ArmTallies {
  return { impressions: new Array<number>(k).fill(0), installs: new Array<number>(k).fill(0) }
}

/** A rand that must never be consumed (deterministic branches). */
function forbiddenRand(): number {
  throw new Error('this branch must not consume randomness')
}

describe('constants', () => {
  it('handoff epsilon is 0.1', () => {
    expect(HANDOFF_EPSILON).toBe(0.1)
  })

  it('thompson uses 200 posterior draws per arm', () => {
    expect(THOMPSON_SAMPLES).toBe(200)
  })
})

describe('talliesFromWeeks', () => {
  it('empty weeks give all-zero tallies of length k', () => {
    expect(talliesFromWeeks([], 3)).toEqual({ impressions: [0, 0, 0], installs: [0, 0, 0] })
  })

  it('sums each arm across weeks', () => {
    const weeks = [
      week(1, { 0: 20000, 1: 0, 2: 0 }, { 0: 1400, 1: 0, 2: 0 }),
      week(2, { 0: 6667, 1: 6667, 2: 6666 }, { 0: 470, 1: 130, 2: 330 }),
    ]
    expect(talliesFromWeeks(weeks, 3)).toEqual({
      impressions: [26667, 6667, 6666],
      installs: [1870, 130, 330],
    })
  })

  it('treats arms missing from a week record as zero', () => {
    const weeks = [week(1, { 1: 20000 }, { 1: 900 })]
    expect(talliesFromWeeks(weeks, 3)).toEqual({
      impressions: [0, 20000, 0],
      installs: [0, 900, 0],
    })
  })
})

describe('allocateBudgetWeek: fixed-split', () => {
  it('sums to exactly $500.00 in cents', () => {
    const allocation = allocateBudgetWeek('fixed-split', zeroTallies(3), HANDOFF_EPSILON, forbiddenRand)
    expect(allocationCents(allocation)).toBe(WEEKLY_BUDGET * 100)
  })

  it('is near-even: every arm within one cent of budget/3', () => {
    const allocation = allocateBudgetWeek('fixed-split', zeroTallies(3), HANDOFF_EPSILON, forbiddenRand)
    for (let arm = 0; arm < 3; arm++) {
      expect(Math.abs(allocation[arm] - WEEKLY_BUDGET / 3)).toBeLessThanOrEqual(0.01)
    }
  })

  it('is deterministic and ignores both tallies and rand', () => {
    const withData: ArmTallies = { impressions: [20000, 100, 0], installs: [2000, 1, 0] }
    const a = allocateBudgetWeek('fixed-split', zeroTallies(3), HANDOFF_EPSILON, forbiddenRand)
    const b = allocateBudgetWeek('fixed-split', withData, 0.5, forbiddenRand)
    expect(a).toEqual(b)
  })
})

describe('allocateBudgetWeek: epsilon-greedy', () => {
  it('with no data, the untried lowest-index arm gets the exploit share', () => {
    const allocation = allocateBudgetWeek('epsilon-greedy', zeroTallies(3), 0.1, forbiddenRand)
    expect(allocation[0]).toBe(450)
    expect(allocation[1]).toBe(25)
    expect(allocation[2]).toBe(25)
  })

  it('an untried arm outranks every tried arm, even a great one', () => {
    const tallies: ArmTallies = { impressions: [20000, 20000, 0], installs: [2400, 400, 0] }
    const allocation = allocateBudgetWeek('epsilon-greedy', tallies, 0.1, forbiddenRand)
    expect(allocation[2]).toBe(450)
    expect(allocation[0]).toBe(25)
    expect(allocation[1]).toBe(25)
  })

  it('with clear tallies, (1-epsilon) of the budget lands on the argmax estimate', () => {
    const tallies: ArmTallies = {
      impressions: [10000, 10000, 10000],
      installs: [200, 1200, 700],
    }
    const allocation = allocateBudgetWeek('epsilon-greedy', tallies, 0.1, forbiddenRand)
    expect(allocation[1]).toBe(450)
    expect(allocation[0]).toBe(25)
    expect(allocation[2]).toBe(25)
  })

  it('estimate ties break to the lowest index', () => {
    const tallies: ArmTallies = {
      impressions: [10000, 10000, 10000],
      installs: [700, 700, 200],
    }
    const allocation = allocateBudgetWeek('epsilon-greedy', tallies, 0.1, forbiddenRand)
    expect(allocation[0]).toBe(450)
  })

  it('sums to exactly $500.00 in cents, including at awkward epsilons', () => {
    for (const epsilon of [0.1, 0.07, 1 / 3, 0.999]) {
      const allocation = allocateBudgetWeek('epsilon-greedy', zeroTallies(3), epsilon, forbiddenRand)
      expect(allocationCents(allocation)).toBe(WEEKLY_BUDGET * 100)
    }
  })
})

describe('allocateBudgetWeek: thompson', () => {
  it('sums to exactly $500.00 in cents', () => {
    const rand = makeRng(42, STREAM.BUDGET_STRATEGY, 2)
    const allocation = allocateBudgetWeek('thompson', zeroTallies(3), HANDOFF_EPSILON, rand)
    expect(allocationCents(allocation)).toBe(WEEKLY_BUDGET * 100)
  })

  it('is deterministic for a fixed rand stream', () => {
    const tallies: ArmTallies = { impressions: [6667, 6667, 6666], installs: [470, 130, 330] }
    const a = allocateBudgetWeek('thompson', tallies, HANDOFF_EPSILON, makeRng(7, STREAM.BUDGET_STRATEGY, 2))
    const b = allocateBudgetWeek('thompson', tallies, HANDOFF_EPSILON, makeRng(7, STREAM.BUDGET_STRATEGY, 2))
    expect(a).toEqual(b)
  })

  it('under ignorance the allocation is roughly even across many seeds', () => {
    const seeds = 100
    const meanShare = [0, 0, 0]
    for (let seed = 0; seed < seeds; seed++) {
      const allocation = allocateBudgetWeek(
        'thompson',
        zeroTallies(3),
        HANDOFF_EPSILON,
        makeRng(seed, STREAM.BUDGET_STRATEGY, 2),
      )
      for (let arm = 0; arm < 3; arm++) meanShare[arm] += allocation[arm] / WEEKLY_BUDGET / seeds
    }
    // Per-run share sd is ~sqrt((1/3)(2/3)/200) ~ 0.033; averaged over 100
    // seeds the sd of the mean is ~0.0033, so 0.02 is a ~6-sigma tolerance.
    for (let arm = 0; arm < 3; arm++) {
      expect(Math.abs(meanShare[arm] - 1 / 3)).toBeLessThan(0.02)
    }
  })

  it('with overwhelming evidence for one arm, that arm gets the large majority', () => {
    const tallies: ArmTallies = {
      impressions: [10000, 10000, 10000],
      installs: [1200, 200, 200], // 12% observed vs 2% and 2%
    }
    for (const seed of [0, 1, 42, 1234]) {
      const allocation = allocateBudgetWeek(
        'thompson',
        tallies,
        HANDOFF_EPSILON,
        makeRng(seed, STREAM.BUDGET_STRATEGY, 2),
      )
      expect(allocation[0]).toBeGreaterThan(0.9 * WEEKLY_BUDGET)
      expect(allocationCents(allocation)).toBe(WEEKLY_BUDGET * 100)
    }
  })
})

const RATES = [0.04, 0.11, 0.06]
const SEED = 42

describe('runBudgetQuarter', () => {
  it('fills exactly weeks startWeek..13, in order', () => {
    for (const strategyId of STRATEGY_IDS) {
      const results = runBudgetQuarter(strategyId, RATES, SEED, 5, [])
      expect(results).toHaveLength(WEEKS_PER_QUARTER - 5 + 1)
      expect(results.map((r) => r.week)).toEqual([5, 6, 7, 8, 9, 10, 11, 12, 13])
    }
  })

  it('returns empty when startWeek is already past the quarter', () => {
    expect(runBudgetQuarter('thompson', RATES, SEED, WEEKS_PER_QUARTER + 1, [])).toEqual([])
  })

  it('is deterministic: same args give deep-equal results', () => {
    for (const strategyId of STRATEGY_IDS) {
      const priors = [playWeek(1, { 0: WEEKLY_BUDGET }, RATES, SEED)]
      const a = runBudgetQuarter(strategyId, RATES, SEED, 2, priors)
      const b = runBudgetQuarter(strategyId, RATES, SEED, 2, priors)
      expect(a).toEqual(b)
    }
  })

  it('seeds tallies from priorWeeks: heavy evidence changes the first allocated week', () => {
    // Priors where every arm was tried and arm 2 looks overwhelmingly best.
    const priors = [
      week(1, { 0: 10000, 1: 10000, 2: 10000 }, { 0: 200, 1: 300, 2: 1200 }),
    ]
    const withPriors = runBudgetQuarter('epsilon-greedy', RATES, SEED, 2, priors)
    const withoutPriors = runBudgetQuarter('epsilon-greedy', RATES, SEED, 2, [])
    // With priors, the exploit share follows the evidence to arm 2; without
    // priors, untried-first sends it to arm 0.
    expect(withPriors[0].allocation[2]).toBe(450)
    expect(withoutPriors[0].allocation[0]).toBe(450)
    expect(withPriors[0].allocation).not.toEqual(withoutPriors[0].allocation)
  })

  it('CRN world consistency: each week matches an independently recomputed playWeek', () => {
    for (const strategyId of STRATEGY_IDS) {
      const results = runBudgetQuarter(strategyId, RATES, SEED, 3, [])
      for (const result of results) {
        expect(result).toEqual(playWeek(result.week, result.allocation, RATES, SEED))
      }
    }
  })

  it('every allocated week satisfies the exact-sum budget gate', () => {
    for (const strategyId of STRATEGY_IDS) {
      for (const result of runBudgetQuarter(strategyId, RATES, SEED, 1, [])) {
        expect(allocationCents(result.allocation)).toBe(WEEKLY_BUDGET * 100)
      }
    }
  })

  it('thompson concentrates by the late weeks under these separated rates', () => {
    const results = runBudgetQuarter('thompson', RATES, SEED, 1, [])
    const last = results[results.length - 1]
    expect(last.allocation[1]).toBeGreaterThan(WEEKLY_BUDGET / 2)
  })
})

describe('oracleQuarterInstalls', () => {
  it('is weeks * weekly impressions * bestRate', () => {
    expect(oracleQuarterInstalls(13, 0.11)).toBeCloseTo(13 * 20000 * 0.11, 10)
  })

  it('is linear in weeks', () => {
    expect(oracleQuarterInstalls(6, 0.08)).toBeCloseTo(2 * oracleQuarterInstalls(3, 0.08), 10)
    expect(oracleQuarterInstalls(0, 0.08)).toBe(0)
  })
})

describe('quarterLeftOnTable', () => {
  it('is 0 for empty rates or 0 played weeks', () => {
    expect(quarterLeftOnTable(1000, 5, [])).toBe(0)
    expect(quarterLeftOnTable(1000, 0, RATES)).toBe(0)
  })

  it('uses the max rate as the oracle arm', () => {
    // Oracle over 2 weeks at 11%: 2 * 20000 * 0.11 = 4400.
    expect(quarterLeftOnTable(4000, 2, RATES)).toBe(400)
  })

  it('clamps at zero when a lucky run beats the oracle expectation', () => {
    expect(quarterLeftOnTable(999999, 13, RATES)).toBe(0)
  })

  it('rounds the gap to a whole install count', () => {
    expect(quarterLeftOnTable(4000.4, 2, RATES)).toBe(400)
  })
})
