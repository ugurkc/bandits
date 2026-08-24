import { describe, expect, it } from 'vitest'
import { STREAM } from '../lib/bandit/rng'
import { realizedOracleInstalls } from '../lib/campaign/budgetStrategies'
import { impressionsForBudget, sampleInstalls } from '../lib/campaign/simulate'
import { PILOT_WEEKLY_BUDGET, WEEKLY_BUDGET } from '../lib/campaign/types'
import {
  installsLeftOnTable,
  isTrialComplete,
  oracleInstalls,
  playTrialWeek,
  TRIAL_WEEK_IMPRESSIONS,
  TRIAL_WEEKS,
} from './useTrialWeeks'

describe('isTrialComplete', () => {
  it('is false for every week within the pilot', () => {
    for (let week = 1; week <= TRIAL_WEEKS; week++) {
      expect(isTrialComplete(week)).toBe(false)
    }
  })

  it('flips true exactly one past the last pilot week', () => {
    expect(isTrialComplete(TRIAL_WEEKS)).toBe(false)
    expect(isTrialComplete(TRIAL_WEEKS + 1)).toBe(true)
  })

  it('stays true for anything further out', () => {
    expect(isTrialComplete(TRIAL_WEEKS + 5)).toBe(true)
  })
})

describe('oracleInstalls (expectation)', () => {
  it('scales linearly with played weeks and the best rate', () => {
    expect(oracleInstalls(0, 0.1)).toBe(0)
    expect(oracleInstalls(1, 0.1)).toBeCloseTo(TRIAL_WEEK_IMPRESSIONS * 0.1)
    expect(oracleInstalls(5, 0.1)).toBeCloseTo(5 * TRIAL_WEEK_IMPRESSIONS * 0.1)
  })
})

describe('the pilot budget explains the pilot volume', () => {
  it('pins the exact figures the scenario briefs and Act I topline quote', () => {
    // These literals are NOT redundant with the derivation below. Act I's
    // topline and all three briefs hard-code "$300 a week", "$500 a week" and
    // "five weeks"; nothing else in the suite would notice if a constant
    // moved, and the copy would quietly start lying about dollars.
    expect(PILOT_WEEKLY_BUDGET).toBe(300)
    expect(WEEKLY_BUDGET).toBe(500)
    expect(TRIAL_WEEKS).toBe(5)
    expect(TRIAL_WEEK_IMPRESSIONS).toBe(300)
  })

  it('derives the pilot volume from the pilot budget at the shared CPM', () => {
    // Asserting TRIAL_WEEK_IMPRESSIONS against impressionsForBudget(
    // PILOT_WEEKLY_BUDGET) alone would be a tautology — that IS its
    // definition. What matters is the relationship: one CPM, and a pilot week
    // that buys strictly less inventory than a quarter week, so "week" never
    // quietly means two different things.
    expect(impressionsForBudget(PILOT_WEEKLY_BUDGET)).toBeLessThan(
      impressionsForBudget(WEEKLY_BUDGET),
    )
    expect(PILOT_WEEKLY_BUDGET).toBeLessThan(WEEKLY_BUDGET)
  })

  it('records the pilot budget on the played week, not the quarter budget', () => {
    // The week's own record used to be stamped $500 by oneHotAllocation while
    // sampling only 300 impressions — invisible only because weekAria renders
    // allocation dollars in Act III alone.
    const result = playTrialWeek(1, 1, [0.02, 0.07, 0.12], 42)
    expect(result.allocation).toEqual({ 1: PILOT_WEEKLY_BUDGET })
  })
})

describe('playTrialWeek', () => {
  const rates = [0.02, 0.07, 0.12]

  it('puts the full pilot volume on the picked campaign and zero elsewhere', () => {
    const result = playTrialWeek(1, 1, rates, 42)
    expect(result.impressions).toEqual({ 0: 0, 1: TRIAL_WEEK_IMPRESSIONS, 2: 0 })
    expect(result.installs[0]).toBe(0)
    expect(result.installs[2]).toBe(0)
    expect(result.totalInstalls).toBe(result.installs[1])
  })

  it("draws from Act I's TRIAL_REWARD stream, keyed on (seed, week, arm)", () => {
    for (const seed of [1, 7, 42]) {
      for (let week = 1; week <= TRIAL_WEEKS; week++) {
        const result = playTrialWeek(week, 2, rates, seed)
        expect(result.installs[2]).toBe(
          sampleInstalls(TRIAL_WEEK_IMPRESSIONS, rates[2], seed, week, 2, STREAM.TRIAL_REWARD),
        )
      }
    }
  })

  it("does not replay Act III's WEEKLY_REWARD draws (pilot week w ≠ quarter week w)", () => {
    // Same (seed, week, arm) key, different stream tag: at least one of
    // the five weeks must realize a different install count per seed —
    // identical across ALL weeks would mean the streams are not separated.
    for (const seed of [1, 7, 42, 99]) {
      const anyDiffers = Array.from({ length: TRIAL_WEEKS }, (_, i) => i + 1).some((week) => {
        const trial = playTrialWeek(week, 2, rates, seed).installs[2]
        const weekly = sampleInstalls(TRIAL_WEEK_IMPRESSIONS, rates[2], seed, week, 2, STREAM.WEEKLY_REWARD)
        return trial !== weekly
      })
      expect(anyDiffers).toBe(true)
    }
  })
})

describe('installsLeftOnTable', () => {
  const rates = [0.02, 0.07, 0.12]
  const seed = 42

  it('is 0 before any week is played', () => {
    expect(installsLeftOnTable(0, 0, rates, seed)).toBe(0)
  })

  it('is 0 for an empty rates array (no outcome guessing rate)', () => {
    expect(installsLeftOnTable(0, 3, [], seed)).toBe(0)
  })

  it('is EXACTLY 0 under perfect play, across seeds (realized-vs-realized CRN)', () => {
    // A reader who picks the truly best arm every week lands on exactly the
    // oracle's own draws — the comparison is noise-free by construction,
    // not just clamped to zero.
    for (let s = 1; s <= 50; s++) {
      let total = 0
      for (let week = 1; week <= TRIAL_WEEKS; week++) {
        total += playTrialWeek(week, 2, rates, s).totalInstalls
      }
      expect(total).toBe(realizedOracleInstalls(rates, s, TRIAL_WEEKS, TRIAL_WEEK_IMPRESSIONS, STREAM.TRIAL_REWARD))
      expect(installsLeftOnTable(total, TRIAL_WEEKS, rates, s)).toBe(0)
    }
  })

  it('reports the gap versus the REALIZED oracle when actual installs fall short', () => {
    const oracle = realizedOracleInstalls(rates, seed, 3, TRIAL_WEEK_IMPRESSIONS, STREAM.TRIAL_REWARD)
    expect(installsLeftOnTable(oracle - 50, 3, rates, seed)).toBe(50)
  })

  it('clamps at 0 when a lucky run beats the realized oracle', () => {
    const oracle = realizedOracleInstalls(rates, seed, 2, TRIAL_WEEK_IMPRESSIONS, STREAM.TRIAL_REWARD)
    expect(installsLeftOnTable(oracle + 40, 2, rates, seed)).toBe(0)
  })

  it('uses the argmax arm as the oracle, not the first entry', () => {
    const shuffled = [0.02, 0.12, 0.05]
    const oracle = realizedOracleInstalls(shuffled, seed, 1, TRIAL_WEEK_IMPRESSIONS, STREAM.TRIAL_REWARD)
    expect(oracle).toBe(sampleInstalls(TRIAL_WEEK_IMPRESSIONS, 0.12, seed, 1, 1, STREAM.TRIAL_REWARD))
    expect(installsLeftOnTable(0, 1, shuffled, seed)).toBe(oracle)
  })
})
