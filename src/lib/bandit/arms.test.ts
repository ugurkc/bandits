import { describe, expect, it } from 'vitest'
import type { SimulationConfig } from './types'
import { computeRates, defaultBaseRates, RATE_MAX, RATE_MIN } from './arms'

const config = (over: Partial<SimulationConfig> = {}): SimulationConfig => ({
  seed: 42,
  k: 4,
  horizon: 500,
  baseRates: defaultBaseRates(4, 42),
  epsilon: 0.1,
  drift: { enabled: false, volatility: 0.002 },
  whales: { enabled: false, share: 0.02, multiplier: 25 },
  ...over,
})

describe('defaultBaseRates', () => {
  const seeds = [0, 1, 7, 42, 123, 9999, 2 ** 31 - 1]
  const ks = [2, 3, 4, 5, 6]

  it('is deterministic', () => {
    expect(defaultBaseRates(4, 42)).toEqual(defaultBaseRates(4, 42))
  })

  it('varies with the seed', () => {
    expect(defaultBaseRates(4, 42)).not.toEqual(defaultBaseRates(4, 43))
  })

  it.each(ks)('k=%i: right shape and band for many seeds', (k) => {
    for (const seed of seeds) {
      const rates = defaultBaseRates(k, seed)
      expect(rates).toHaveLength(k)
      for (const r of rates) {
        expect(r).toBeGreaterThanOrEqual(0.02)
        expect(r).toBeLessThanOrEqual(0.12)
      }
    }
  })

  it.each(ks)('k=%i: all distinct with a unique max', (k) => {
    for (const seed of seeds) {
      const rates = defaultBaseRates(k, seed)
      expect(new Set(rates).size).toBe(k)
      const sorted = [...rates].sort((a, b) => b - a)
      expect(sorted[0]).toBeGreaterThan(sorted[1])
    }
  })

  it.each(ks)('k=%i: best-vs-second gap lands in [0.05, 0.065]', (k) => {
    // Widened 2026-08-18. At the old sub-2pp gap the lab's own 5000-round
    // default was too short for Thompson's advantage to appear, so the lab's (now
    // Act IV's) central card was false on screen at every selectable horizon.
    for (const seed of seeds) {
      const sorted = [...defaultBaseRates(k, seed)].sort((a, b) => b - a)
      const gap = sorted[0] - sorted[1]
      expect(gap).toBeGreaterThanOrEqual(0.05)
      expect(gap).toBeLessThanOrEqual(0.065)
    }
  })

  it('the best arm index depends on the seed', () => {
    const bestIndex = (seed: number) => {
      const rates = defaultBaseRates(4, seed)
      return rates.indexOf(Math.max(...rates))
    }
    const indices = new Set(seeds.map(bestIndex))
    expect(indices.size).toBeGreaterThan(1)
  })
})

describe('computeRates', () => {
  it('has horizon rows of k columns', () => {
    const c = config()
    const rates = computeRates(c)
    expect(rates).toHaveLength(c.horizon)
    for (const row of rates) expect(row).toHaveLength(c.k)
  })

  it('stationary: every row equals the base rates', () => {
    const c = config()
    const rates = computeRates(c)
    for (const row of rates) expect(row).toEqual(c.baseRates)
  })

  it('is deterministic under drift', () => {
    const c = config({ drift: { enabled: true, volatility: 0.002 } })
    expect(computeRates(c)).toEqual(computeRates(c))
  })

  it('drift starts from the base rates and actually moves', () => {
    const c = config({ drift: { enabled: true, volatility: 0.002 } })
    const rates = computeRates(c)
    expect(rates[0]).toEqual(c.baseRates)
    const last = rates[c.horizon - 1]
    const moved = last.some((r, i) => Math.abs(r - c.baseRates[i]) > 1e-6)
    expect(moved).toBe(true)
  })

  it('drift keeps every rate inside the live-ops band, even at high volatility', () => {
    // The old reflected random walk was unbounded within [0.005, 0.6] and
    // routinely left the 2-12% band the whole simulator is calibrated to
    // (38% of rates, max 40%) while FANNING THE ARMS APART — making the
    // drifting world easier to solve, the opposite of the lesson. Rank
    // rotation only ever reassigns which arm holds which base rate.
    const c = config({ horizon: 2000, drift: { enabled: true, volatility: 0.15 } })
    for (const row of computeRates(c)) {
      for (const r of row) {
        expect(r).toBeGreaterThanOrEqual(RATE_MIN)
        expect(r).toBeLessThanOrEqual(RATE_MAX)
        expect(r).toBeGreaterThanOrEqual(0.02 - 1e-9)
        expect(r).toBeLessThanOrEqual(0.12 + 1e-9)
      }
    }
  })

  it('drift actually changes which arm is best, several times per run', () => {
    // This is the property the whole "none of these ever forgets" lesson
    // rests on: if the leader never changes, stale beliefs cost nothing.
    const c = config({ k: 3, horizon: 5000, drift: { enabled: true, volatility: 0.002 } })
    const rates = computeRates(c)
    const argmax = (row: number[]) => row.reduce((b, v, i) => (v > row[b] ? i : b), 0)
    let changes = 0
    let prev = argmax(rates[0])
    let run = 0
    for (let t = 1; t < rates.length; t++) {
      const b = argmax(rates[t])
      if (b === prev) run++
      else {
        // Only count settled changes, not flicker during a crossfade.
        if (run >= 100) changes++
        prev = b
        run = 1
      }
    }
    expect(changes).toBeGreaterThanOrEqual(2)
  })

  it('drift noise is per-(t, arm): arms walk independently', () => {
    const c = config({
      k: 2,
      baseRates: [0.06, 0.055],
      drift: { enabled: true, volatility: 0.01 },
    })
    const rates = computeRates(c)
    const deltas0: number[] = []
    const deltas1: number[] = []
    for (let t = 1; t < c.horizon; t++) {
      deltas0.push(rates[t][0] - rates[t - 1][0])
      deltas1.push(rates[t][1] - rates[t - 1][1])
    }
    // If both arms shared one noise stream the step sequences would match.
    expect(deltas0).not.toEqual(deltas1)
  })
})
