import { describe, expect, it } from 'vitest'
import { derivePhase, HANDOFF_WEEK_MS, sumInstalls } from './useCampaignQuarter'
import type { CampaignWeekResult } from '../lib/campaign/types'
import { WEEKS_PER_QUARTER } from '../lib/campaign/types'

// `@testing-library/react` is not a devDependency in this repo (checked
// package.json), and the vitest environment is `node` (no DOM) — so the
// stateful hook body itself isn't exercised here. These tests cover the
// pure logic factored out of it: phase derivation and the installs total.
// (The handoff's week results come from `runBudgetQuarter`, tested in
// budgetStrategies.test.ts; the hook only paces their reveal.)

describe('derivePhase', () => {
  it('is budget for every week of the quarter (Act III is all budget splits)', () => {
    for (let week = 1; week <= WEEKS_PER_QUARTER; week++) {
      expect(derivePhase(week)).toBe('budget')
    }
  })

  it('is complete once past the last week', () => {
    expect(derivePhase(WEEKS_PER_QUARTER + 1)).toBe('complete')
    expect(derivePhase(20)).toBe('complete')
  })

  it("never returns the dead 'pick' member (removed with the pick phase)", () => {
    for (let week = 1; week <= 20; week++) {
      expect(derivePhase(week)).not.toBe('pick')
    }
  })
})

describe('HANDOFF_WEEK_MS', () => {
  it('is a short positive pace — visible, but the quarter drains in a couple of seconds', () => {
    expect(HANDOFF_WEEK_MS).toBeGreaterThan(0)
    expect(HANDOFF_WEEK_MS * WEEKS_PER_QUARTER).toBeLessThanOrEqual(5000)
  })
})

function week(totalInstalls: number): CampaignWeekResult {
  return { week: 1, allocation: { 0: 500 }, impressions: { 0: 500 }, installs: { 0: totalInstalls }, totalInstalls }
}

describe('sumInstalls', () => {
  it('is 0 for no played weeks', () => {
    expect(sumInstalls([])).toBe(0)
  })

  it('sums totalInstalls across played weeks', () => {
    expect(sumInstalls([week(55), week(18), week(40)])).toBe(113)
  })
})
