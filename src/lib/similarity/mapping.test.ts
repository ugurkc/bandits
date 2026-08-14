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
  /** Asserts every pair of rates is at least TIE_GAP apart (within 1e-9). */
  function expectPairwiseSeparated(rates: number[]): void {
    for (let i = 0; i < rates.length; i++) {
      for (let j = i + 1; j < rates.length; j++) {
        expect(Math.abs(rates[i] - rates[j])).toBeGreaterThanOrEqual(TIE_GAP - 1e-9)
      }
    }
  }

  it('separates identical triples pairwise by >= TIE_GAP across 500 seeds', () => {
    for (let seed = 0; seed < 500; seed++) {
      expectPairwiseSeparated(similaritiesToRates([0.5, 0.5, 0.5], seed))
    }
  })

  it('separates all-floor pairs (both pitches miss entirely) across 500 seeds', () => {
    for (let seed = 0; seed < 500; seed++) {
      const rates = similaritiesToRates([0, 0], seed)
      expectPairwiseSeparated(rates)
      for (const r of rates) expect(r).toBeGreaterThanOrEqual(RATE_FLOOR)
    }
  })

  it('separates all-floor triples across 500 seeds without dipping below the floor', () => {
    for (let seed = 0; seed < 500; seed++) {
      const rates = similaritiesToRates([0, 0, 0], seed)
      expectPairwiseSeparated(rates)
      for (const r of rates) expect(r).toBeGreaterThanOrEqual(RATE_FLOOR)
    }
  })

  it('preserves order: a strictly higher similarity never maps below a lower one', () => {
    for (let seed = 0; seed < 200; seed++) {
      // Deterministic pseudo-random similarity triples, including near-ties.
      const sims = [0, 1, 2].map((i) => ((seed * 7919 + i * 104729) % 1000) / 1000)
      const rates = similaritiesToRates(sims, seed)
      for (let i = 0; i < sims.length; i++) {
        for (let j = 0; j < sims.length; j++) {
          if (sims[i] > sims[j]) expect(rates[i]).toBeGreaterThan(rates[j])
        }
      }
    }
  })

  it('is deterministic for the same seed', () => {
    expect(similaritiesToRates([0.5, 0.5], 7)).toEqual(similaritiesToRates([0.5, 0.5], 7))
    expect(similaritiesToRates([0.5, 0.5, 0.5], 42)).toEqual(similaritiesToRates([0.5, 0.5, 0.5], 42))
  })

  it('keeps every rate inside the band plus (k-1) tie gaps of headroom', () => {
    for (const sims of [[0, 0, 0], [1, 1, 1], [0.5, 0.501, 0.499]]) {
      for (let seed = 0; seed < 100; seed++) {
        for (const r of similaritiesToRates(sims, seed)) {
          expect(r).toBeGreaterThanOrEqual(RATE_FLOOR)
          expect(r).toBeLessThanOrEqual(RATE_FLOOR + RATE_SPAN + (sims.length - 1) * TIE_GAP)
        }
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
