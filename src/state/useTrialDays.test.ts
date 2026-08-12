import { describe, expect, it } from 'vitest'
import { isTrialComplete, TRIAL_DAYS } from './useTrialDays'

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
