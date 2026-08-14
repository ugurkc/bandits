import { describe, expect, it } from 'vitest'
import { STREAM } from '../lib/bandit/rng'
import { realizedOracleInstalls } from '../lib/campaign/budgetStrategies'
import { sampleInstalls } from '../lib/campaign/simulate'
import {
  installsLeftOnTable,
  isTrialComplete,
  oracleInstalls,
  playTrialDay,
  TRIAL_DAY_IMPRESSIONS,
  TRIAL_DAYS,
} from './useTrialDays'

describe('isTrialComplete', () => {
  it('is false for every day within the trial', () => {
    for (let day = 1; day <= TRIAL_DAYS; day++) {
      expect(isTrialComplete(day)).toBe(false)
    }
  })

  it('flips true exactly one past the last trial day', () => {
    expect(isTrialComplete(TRIAL_DAYS)).toBe(false)
    expect(isTrialComplete(TRIAL_DAYS + 1)).toBe(true)
  })

  it('stays true for anything further out', () => {
    expect(isTrialComplete(TRIAL_DAYS + 5)).toBe(true)
  })
})

describe('oracleInstalls (expectation)', () => {
  it('scales linearly with played days and the best rate', () => {
    expect(oracleInstalls(0, 0.1)).toBe(0)
    expect(oracleInstalls(1, 0.1)).toBeCloseTo(TRIAL_DAY_IMPRESSIONS * 0.1)
    expect(oracleInstalls(5, 0.1)).toBeCloseTo(5 * TRIAL_DAY_IMPRESSIONS * 0.1)
  })
})

describe('playTrialDay', () => {
  const rates = [0.02, 0.07, 0.12]

  it('puts the full trial volume on the picked campaign and zero elsewhere', () => {
    const result = playTrialDay(1, 1, rates, 42)
    expect(result.impressions).toEqual({ 0: 0, 1: TRIAL_DAY_IMPRESSIONS, 2: 0 })
    expect(result.installs[0]).toBe(0)
    expect(result.installs[2]).toBe(0)
    expect(result.totalInstalls).toBe(result.installs[1])
  })

  it("draws from Act 1's TRIAL_REWARD stream, keyed on (seed, day, arm)", () => {
    for (const seed of [1, 7, 42]) {
      for (let day = 1; day <= TRIAL_DAYS; day++) {
        const result = playTrialDay(day, 2, rates, seed)
        expect(result.installs[2]).toBe(
          sampleInstalls(TRIAL_DAY_IMPRESSIONS, rates[2], seed, day, 2, STREAM.TRIAL_REWARD),
        )
      }
    }
  })

  it("does not replay Act 2's WEEKLY_REWARD draws (trial day d ≠ quarter week d)", () => {
    // Same (seed, day/week, arm) key, different stream tag: at least one of
    // the five days must realize a different install count per seed —
    // identical across ALL days would mean the streams are not separated.
    for (const seed of [1, 7, 42, 99]) {
      const anyDiffers = Array.from({ length: TRIAL_DAYS }, (_, i) => i + 1).some((day) => {
        const trial = playTrialDay(day, 2, rates, seed).installs[2]
        const weekly = sampleInstalls(TRIAL_DAY_IMPRESSIONS, rates[2], seed, day, 2, STREAM.WEEKLY_REWARD)
        return trial !== weekly
      })
      expect(anyDiffers).toBe(true)
    }
  })
})

describe('installsLeftOnTable', () => {
  const rates = [0.02, 0.07, 0.12]
  const seed = 42

  it('is 0 before any day is played', () => {
    expect(installsLeftOnTable(0, 0, rates, seed)).toBe(0)
  })

  it('is 0 for an empty rates array (no outcome guessing rate)', () => {
    expect(installsLeftOnTable(0, 3, [], seed)).toBe(0)
  })

  it('is EXACTLY 0 under perfect play, across seeds (realized-vs-realized CRN)', () => {
    // A reader who picks the truly best arm every day lands on exactly the
    // oracle's own draws — the comparison is noise-free by construction,
    // not just clamped to zero.
    for (let s = 1; s <= 50; s++) {
      let total = 0
      for (let day = 1; day <= TRIAL_DAYS; day++) {
        total += playTrialDay(day, 2, rates, s).totalInstalls
      }
      expect(total).toBe(realizedOracleInstalls(rates, s, TRIAL_DAYS, TRIAL_DAY_IMPRESSIONS, STREAM.TRIAL_REWARD))
      expect(installsLeftOnTable(total, TRIAL_DAYS, rates, s)).toBe(0)
    }
  })

  it('reports the gap versus the REALIZED oracle when actual installs fall short', () => {
    const oracle = realizedOracleInstalls(rates, seed, 3, TRIAL_DAY_IMPRESSIONS, STREAM.TRIAL_REWARD)
    expect(installsLeftOnTable(oracle - 50, 3, rates, seed)).toBe(50)
  })

  it('clamps at 0 when a lucky run beats the realized oracle', () => {
    const oracle = realizedOracleInstalls(rates, seed, 2, TRIAL_DAY_IMPRESSIONS, STREAM.TRIAL_REWARD)
    expect(installsLeftOnTable(oracle + 40, 2, rates, seed)).toBe(0)
  })

  it('uses the argmax arm as the oracle, not the first entry', () => {
    const shuffled = [0.02, 0.12, 0.05]
    const oracle = realizedOracleInstalls(shuffled, seed, 1, TRIAL_DAY_IMPRESSIONS, STREAM.TRIAL_REWARD)
    expect(oracle).toBe(sampleInstalls(TRIAL_DAY_IMPRESSIONS, 0.12, seed, 1, 1, STREAM.TRIAL_REWARD))
    expect(installsLeftOnTable(0, 1, shuffled, seed)).toBe(oracle)
  })
})
