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
