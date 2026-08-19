import { describe, expect, it } from 'vitest'
import { STREAM } from '../bandit/rng'
import { WEEKLY_BUDGET } from './types'
import {
  impressionsForBudget,
  oneHotAllocation,
  playWeek,
  sampleInstalls,
} from './simulate'

describe('impressionsForBudget', () => {
  it('$500 at CPM=1000 is exactly 500 impressions', () => {
    expect(impressionsForBudget(500)).toBe(500)
  })

  it('$0 is 0 impressions', () => {
    expect(impressionsForBudget(0)).toBe(0)
  })

  it('is linear in dollars', () => {
    expect(impressionsForBudget(250)).toBe(impressionsForBudget(500) / 2)
    expect(impressionsForBudget(1000)).toBe(impressionsForBudget(500) * 2)
  })
})

describe('sampleInstalls', () => {
  it('is deterministic: same inputs, same output', () => {
    const a = sampleInstalls(20000, 0.07, 42, 3, 1)
    const b = sampleInstalls(20000, 0.07, 42, 3, 1)
    expect(a).toBe(b)
  })

  it('never negative and never exceeds impressions, across many combos', () => {
    const seeds = [0, 1, 7, 42, 9999]
    const weeks = [1, 4, 5, 13]
    const arms = [0, 1, 2]
    const rates = [0.02, 0.05, 0.07, 0.1, 0.12]
    for (const seed of seeds) {
      for (const week of weeks) {
        for (const arm of arms) {
          for (const rate of rates) {
            const installs = sampleInstalls(20000, rate, seed, week, arm)
            expect(installs).toBeGreaterThanOrEqual(0)
            expect(installs).toBeLessThanOrEqual(20000)
          }
        }
      }
    }
  })

  it('impressions=0 always gives 0 installs, no NaN', () => {
    for (let seed = 0; seed < 20; seed++) {
      const installs = sampleInstalls(0, 0.07, seed, 1, 0)
      expect(installs).toBe(0)
      expect(Number.isNaN(installs)).toBe(false)
    }
  })

  it('statistical sanity: mean across seeds approaches impressions * rate', () => {
    const impressions = 20000
    const rate = 0.07
    const expectedMean = impressions * rate // 1400
    let sum = 0
    const n = 500
    for (let seed = 0; seed < n; seed++) {
      sum += sampleInstalls(impressions, rate, seed, 1, 0)
    }
    const mean = sum / n
    expect(Math.abs(mean - expectedMean) / expectedMean).toBeLessThan(0.05)
  })

  // The 20,000-impression cases above are a fossil of the launch-era $25 CPM.
  // At the shipped CPM of $1000, a $500 quarter week buys 500 impressions, a
  // three-way split buys ~167, and a $300 pilot week buys 300 — so every
  // assertion above validates the Normal approximation only where it is
  // essentially exact, and never where the app actually runs it. These pin
  // the real operating range, where n*p falls to ~3 and the approximation is
  // at its weakest.
  describe('at the volumes the app can actually produce', () => {
    const REAL_VOLUMES = [500, 300, 167, 100, 50]

    it('stays within [0, impressions] across the real rate band', () => {
      for (const impressions of REAL_VOLUMES) {
        for (const rate of [0.02, 0.05, 0.07, 0.1, 0.126]) {
          for (let seed = 0; seed < 60; seed++) {
            const installs = sampleInstalls(impressions, rate, seed, 1, 0)
            expect(Number.isInteger(installs)).toBe(true)
            expect(installs).toBeGreaterThanOrEqual(0)
            expect(installs).toBeLessThanOrEqual(impressions)
          }
        }
      }
    })

    it('mean tracks impressions * rate within the sampling error of the run', () => {
      // Tolerance derived from the actual standard error rather than a round
      // number: at n=4000 draws the SE of the mean is sqrt(p(1-p)/n) *
      // impressions, and 4 SE is a ~1-in-16000 false-failure rate. The old
      // 5%-at-n=500 bound was ~30 SE — wide enough to pass almost any
      // regression.
      const draws = 4000
      for (const impressions of REAL_VOLUMES) {
        for (const rate of [0.02, 0.07, 0.126]) {
          let sum = 0
          for (let seed = 0; seed < draws; seed++) {
            sum += sampleInstalls(impressions, rate, seed, 1, 0)
          }
          const mean = sum / draws
          const expected = impressions * rate
          const se = Math.sqrt((rate * (1 - rate)) / draws) * impressions
          // The clamp at 0 truncates the left tail, which biases the mean UP
          // at small n*p; allow for that explicitly rather than pretending
          // it isn't there.
          expect(mean).toBeGreaterThan(expected - 4 * se)
          expect(mean).toBeLessThan(expected + 4 * se + 0.15 * Math.max(0, 1 - expected / 10))
        }
      }
    })

    it('actually varies at pilot volume — not a constant dressed up as a draw', () => {
      // A sampler that returned round(impressions * rate) would satisfy every
      // mean-based assertion in this file.
      const seen = new Set<number>()
      for (let seed = 0; seed < 200; seed++) seen.add(sampleInstalls(300, 0.07, seed, 1, 0))
      expect(seen.size).toBeGreaterThan(8)
    })
  })

  it('a chosen pair of adjacent weeks yields different draws (verified by running)', () => {
    // impressions=20000, rate=0.07, seed=42, arm=0: week 1 -> 1400, week 2 -> 1352.
    const week1 = sampleInstalls(20000, 0.07, 42, 1, 0)
    const week2 = sampleInstalls(20000, 0.07, 42, 2, 0)
    expect(week1).toBe(1400)
    expect(week2).toBe(1352)
    expect(week1).not.toBe(week2)
  })

  it('the default stream tag is STREAM.WEEKLY_REWARD (existing draws unchanged)', () => {
    expect(sampleInstalls(20000, 0.07, 42, 1, 0, STREAM.WEEKLY_REWARD)).toBe(
      sampleInstalls(20000, 0.07, 42, 1, 0),
    )
  })

  it('different stream tags give different draws for the same (seed, week, arm)', () => {
    let differing = 0
    for (let seed = 0; seed < 50; seed++) {
      const weekly = sampleInstalls(20000, 0.07, seed, 1, 0, STREAM.WEEKLY_REWARD)
      const trial = sampleInstalls(20000, 0.07, seed, 1, 0, STREAM.TRIAL_REWARD)
      if (weekly !== trial) differing++
    }
    // Independent draws can collide on a few seeds; near-total overlap would
    // mean the tag is being ignored.
    expect(differing).toBeGreaterThan(40)
  })
})

describe('playWeek', () => {
  const rates = [0.07, 0.05, 0.09]

  it('totalInstalls equals the sum of per-campaign installs', () => {
    const alloc = { 0: 200, 1: 200, 2: 100 }
    const result = playWeek(5, alloc, rates, 42)
    const sum = Object.values(result.installs).reduce((s, v) => s + v, 0)
    expect(result.totalInstalls).toBe(sum)
  })

  it('a one-hot allocation gives zero installs to the other two campaigns', () => {
    const alloc = oneHotAllocation(1)
    const result = playWeek(2, alloc, rates, 42)
    expect(result.installs[0]).toBe(0)
    expect(result.installs[2]).toBe(0)
    expect(result.impressions[0]).toBe(0)
    expect(result.impressions[2]).toBe(0)
    expect(result.installs[1]).toBeGreaterThan(0)
  })

  it('throws on an allocation that does not sum to WEEKLY_BUDGET', () => {
    expect(() => playWeek(1, { 0: 100, 1: 100, 2: 100 }, rates, 42)).toThrow()
  })

  it('is deterministic: same week called twice gives the same result', () => {
    const alloc = { 0: 300, 1: 100, 2: 100 }
    const a = playWeek(6, alloc, rates, 7)
    const b = playWeek(6, alloc, rates, 7)
    expect(a).toEqual(b)
  })

  it('two adjacent weeks with the same allocation/rates/seed produce different installs', () => {
    const alloc = oneHotAllocation(0)
    const week1 = playWeek(1, alloc, rates, 42)
    const week2 = playWeek(2, alloc, rates, 42)
    expect(week1.installs[0]).not.toBe(week2.installs[0])
  })
})

describe('oneHotAllocation', () => {
  it('sums to WEEKLY_BUDGET', () => {
    for (const id of [0, 1, 2] as const) {
      const alloc = oneHotAllocation(id)
      const sum = Object.values(alloc).reduce((s, v) => s + v, 0)
      expect(sum).toBe(WEEKLY_BUDGET)
    }
  })

  it('has only one nonzero entry', () => {
    for (const id of [0, 1, 2] as const) {
      const alloc = oneHotAllocation(id)
      const nonZero = Object.values(alloc).filter((v) => v !== 0)
      expect(nonZero).toHaveLength(1)
    }
  })
})
