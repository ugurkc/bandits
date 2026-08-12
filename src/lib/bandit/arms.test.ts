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

  it.each(ks)('k=%i: best-vs-second gap lands in [0.005, 0.03]', (k) => {
    for (const seed of seeds) {
      const sorted = [...defaultBaseRates(k, seed)].sort((a, b) => b - a)
      const gap = sorted[0] - sorted[1]
      expect(gap).toBeGreaterThanOrEqual(0.005)
      expect(gap).toBeLessThanOrEqual(0.03)
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

  it('drift stays clamped to [0.005, 0.6] even at high volatility', () => {
    const c = config({
      horizon: 2000,
      drift: { enabled: true, volatility: 0.15 },
    })
    const rates = computeRates(c)
    let hitLow = false
    let hitHigh = false
    for (const row of rates) {
      for (const r of row) {
        expect(r).toBeGreaterThanOrEqual(RATE_MIN)
        expect(r).toBeLessThanOrEqual(RATE_MAX)
        if (r < RATE_MIN + 0.05) hitLow = true
        if (r > RATE_MAX - 0.05) hitHigh = true
      }
    }
    // With sigma 0.15 over 2000 rounds the walk must have visited both walls.
    expect(hitLow).toBe(true)
    expect(hitHigh).toBe(true)
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
