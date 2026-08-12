import { describe, expect, it } from 'vitest'
import { installsLeftOnTable, isTrialComplete, oracleInstalls, TRIAL_DAY_IMPRESSIONS, TRIAL_DAYS } from './useTrialDays'

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

describe('oracleInstalls', () => {
  it('scales linearly with played days and the best rate', () => {
    expect(oracleInstalls(0, 0.1)).toBe(0)
    expect(oracleInstalls(1, 0.1)).toBeCloseTo(TRIAL_DAY_IMPRESSIONS * 0.1)
    expect(oracleInstalls(5, 0.1)).toBeCloseTo(5 * TRIAL_DAY_IMPRESSIONS * 0.1)
  })
})

describe('installsLeftOnTable', () => {
  it('is 0 before any day is played', () => {
    expect(installsLeftOnTable(0, 0, [0.1, 0.05, 0.02])).toBe(0)
  })

  it('is 0 for an empty rates array (no outcome guessing rate) or matches the oracle exactly', () => {
    expect(installsLeftOnTable(0, 3, [])).toBe(0)
    const exact = oracleInstalls(3, 0.1)
    expect(installsLeftOnTable(exact, 3, [0.1, 0.05, 0.02])).toBe(0)
  })

  it('reports the gap when actual installs fall short of the oracle', () => {
    const oracle = oracleInstalls(3, 0.1)
    const shortfall = oracle - 50
    expect(installsLeftOnTable(shortfall, 3, [0.1, 0.05, 0.02])).toBe(50)
  })

  it('never goes negative when a lucky run beats the oracle expectation', () => {
    const oracle = oracleInstalls(2, 0.1)
    expect(installsLeftOnTable(oracle + 40, 2, [0.1, 0.05])).toBe(0)
  })

  it('uses the maximum rate as the oracle target, not the first entry', () => {
    const oracle = oracleInstalls(1, 0.12)
    expect(installsLeftOnTable(0, 1, [0.02, 0.12, 0.05])).toBe(Math.round(oracle))
  })
})
