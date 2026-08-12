import { describe, expect, it } from 'vitest'
import { derivePhase, sumInstalls } from './useCampaignQuarter'
import type { CampaignWeekResult } from '../lib/campaign/types'

// `@testing-library/react` is not a devDependency in this repo (checked
// package.json), and the vitest environment is `node` (no DOM) — so the
// stateful hook body itself isn't exercised here. These tests cover the
// pure logic factored out of it: phase derivation and the installs total.

describe('derivePhase', () => {
  it('is pick during weeks 1-4', () => {
    expect(derivePhase(1)).toBe('pick')
    expect(derivePhase(4)).toBe('pick')
  })

  it('is budget during weeks 5-13', () => {
    expect(derivePhase(5)).toBe('budget')
    expect(derivePhase(13)).toBe('budget')
  })

  it('is complete once past week 13', () => {
    expect(derivePhase(14)).toBe('complete')
    expect(derivePhase(20)).toBe('complete')
  })

  it('with pickWeeks = 0 every week is budget (Act 2)', () => {
    expect(derivePhase(1, 0)).toBe('budget')
    expect(derivePhase(7, 0)).toBe('budget')
    expect(derivePhase(13, 0)).toBe('budget')
  })

  it('with pickWeeks = 0 completion is unchanged', () => {
    expect(derivePhase(14, 0)).toBe('complete')
  })

  it('an explicit pickWeeks moves the pick/budget boundary', () => {
    expect(derivePhase(2, 2)).toBe('pick')
    expect(derivePhase(3, 2)).toBe('budget')
  })
})

function week(totalInstalls: number): CampaignWeekResult {
  return { week: 1, allocation: { 0: 500 }, impressions: { 0: 20000 }, installs: { 0: totalInstalls }, totalInstalls }
}

describe('sumInstalls', () => {
  it('is 0 for no played weeks', () => {
    expect(sumInstalls([])).toBe(0)
  })

  it('sums totalInstalls across played weeks', () => {
    expect(sumInstalls([week(100), week(250), week(40)])).toBe(390)
  })
})
