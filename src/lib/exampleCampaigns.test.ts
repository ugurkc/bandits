import { describe, expect, it } from 'vitest'
import { buildExampleCampaigns } from './exampleCampaigns'
import { RATE_FLOOR, RATE_SPAN, TIE_GAP } from './similarity/mapping'
import { SCENARIOS } from './similarity/scenarios'

/**
 * The truth-aligned example pitch sits in a documented slot per scenario
 * (see the content rules in scenarios.ts): slots 2, 3, 1 — indices 1, 2, 0.
 * The lexical engine scoring the curated examples must agree, or Act II's
 * self-seeded quarter would quietly teach that a distractor converts best.
 */
const ALIGNED_INDEX = [1, 2, 0]

function argmax(values: number[]): number {
  let best = 0
  for (let i = 1; i < values.length; i++) if (values[i] > values[best]) best = i
  return best
}

describe('buildExampleCampaigns', () => {
  it('is deterministic for a given (scenarioIndex, seed)', () => {
    expect(buildExampleCampaigns(0, 42)).toEqual(buildExampleCampaigns(0, 42))
  })

  it('builds three campaigns with labels and pitches from the scenario', () => {
    for (let i = 0; i < SCENARIOS.length; i++) {
      const ex = buildExampleCampaigns(i, 42)
      expect(ex.pitches).toHaveLength(3)
      expect(ex.labels).toHaveLength(3)
      expect(ex.rates).toHaveLength(3)
      expect(ex.scenarioTitle).toBe(SCENARIOS[i].title)
      for (const label of ex.labels) expect(label.trim().length).toBeGreaterThan(0)
    }
  })

  it('rates stay in the mapping band with the tie-gap headroom', () => {
    for (let i = 0; i < SCENARIOS.length; i++) {
      for (const seed of [1, 7, 42, 99]) {
        for (const rate of buildExampleCampaigns(i, seed).rates) {
          expect(rate).toBeGreaterThanOrEqual(RATE_FLOOR)
          expect(rate).toBeLessThanOrEqual(RATE_FLOOR + RATE_SPAN + 2 * TIE_GAP)
        }
      }
    }
  })

  it('every pair of rates is separated by at least the tie gap', () => {
    for (let i = 0; i < SCENARIOS.length; i++) {
      const { rates } = buildExampleCampaigns(i, 42)
      const sorted = [...rates].sort((a, b) => a - b)
      for (let j = 1; j < sorted.length; j++) {
        expect(sorted[j] - sorted[j - 1]).toBeGreaterThanOrEqual(TIE_GAP - 1e-12)
      }
    }
  })

  it("the truth-aligned example gets the top rate in every scenario (the content rule holds under lexical scoring)", () => {
    for (let i = 0; i < SCENARIOS.length; i++) {
      const { rates } = buildExampleCampaigns(i, 42)
      expect(argmax(rates), `scenario ${SCENARIOS[i].id}`).toBe(ALIGNED_INDEX[i])
    }
  })
})
