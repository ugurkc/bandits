import { describe, expect, it } from 'vitest'
import {
  preferenceDistribution,
  RATE_FLOOR,
  RATE_SPAN,
  similaritiesToRates,
  similarityToRate,
  TIE_GAP,
} from './mapping'

describe('preferenceDistribution', () => {
  it('sums to 1 and preserves order', () => {
    const p = preferenceDistribution([0.8, 0.4, 0.1])
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1)
    expect(p[0]).toBeGreaterThan(p[1])
    expect(p[1]).toBeGreaterThan(p[2])
  })

  it('equal similarities give a uniform distribution', () => {
    const p = preferenceDistribution([0.5, 0.5, 0.5])
    for (const x of p) expect(x).toBeCloseTo(1 / 3)
  })

  it('lower temperature sharpens the winner', () => {
    const soft = preferenceDistribution([0.7, 0.3], 0.5)
    const sharp = preferenceDistribution([0.7, 0.3], 0.1)
    expect(sharp[0]).toBeGreaterThan(soft[0])
  })
})

describe('similarityToRate', () => {
  it('maps 0 to the floor and 1 to the top of the band', () => {
    expect(similarityToRate(0)).toBeCloseTo(RATE_FLOOR)
    expect(similarityToRate(1)).toBeCloseTo(RATE_FLOOR + RATE_SPAN)
  })

  it('is absolute, not relative: uniformly bad pitches all get low rates', () => {
    for (const r of [0.1, 0.12, 0.08].map(similarityToRate)) {
      expect(r).toBeLessThan(0.04)
    }
  })

  it('clamps out-of-range similarities into the band', () => {
    expect(similarityToRate(-0.5)).toBeCloseTo(RATE_FLOOR)
    expect(similarityToRate(1.5)).toBeCloseTo(RATE_FLOOR + RATE_SPAN)
  })
})

describe('similaritiesToRates', () => {
  it('nudges exact ties apart so a best arm exists', () => {
    const rates = similaritiesToRates([0.5, 0.5, 0.5], 42)
    const distinct = new Set(rates.map((r) => r.toFixed(6)))
    expect(distinct.size).toBeGreaterThan(1)
  })

  it('is deterministic for the same seed', () => {
    expect(similaritiesToRates([0.5, 0.5], 7)).toEqual(similaritiesToRates([0.5, 0.5], 7))
  })

  it('keeps every rate inside the band (with tie headroom)', () => {
    for (const sims of [[0, 0, 0], [1, 1, 1], [0.5, 0.501, 0.499]]) {
      for (const r of similaritiesToRates(sims, 3)) {
        expect(r).toBeGreaterThanOrEqual(RATE_FLOOR)
        expect(r).toBeLessThanOrEqual(RATE_FLOOR + RATE_SPAN + TIE_GAP)
      }
    }
  })

  it('leaves clearly-separated rates untouched', () => {
    const rates = similaritiesToRates([0.9, 0.5, 0.1], 11)
    expect(rates[0]).toBeCloseTo(similarityToRate(0.9))
    expect(rates[1]).toBeCloseTo(similarityToRate(0.5))
    expect(rates[2]).toBeCloseTo(similarityToRate(0.1))
  })
})
