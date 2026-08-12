import { describe, expect, it } from 'vitest'
import type { SimulationConfig } from './types'
import { STRATEGY_IDS } from './types'
import { defaultBaseRates } from './arms'
import { simulate, statsAt } from './simulate'

const config = (over: Partial<SimulationConfig> = {}): SimulationConfig => ({
  seed: 42,
  k: 4,
  horizon: 5000,
  baseRates: defaultBaseRates(4, 42),
  epsilon: 0.1,
  drift: { enabled: false, volatility: 0.002 },
  whales: { enabled: false, share: 0.02, multiplier: 25 },
  ...over,
})

describe('simulate', () => {
  it('identical config gives a deep-equal result', () => {
    const c = config()
    expect(simulate(c)).toEqual(simulate(c))
  })

  it('returns runs for every strategy in STRATEGY_IDS order, arrays of length horizon', () => {
    const c = config({ horizon: 300 })
    const result = simulate(c)
    expect(result.strategies.map((s) => s.id)).toEqual([...STRATEGY_IDS])
    expect(result.rates).toHaveLength(c.horizon)
    expect(result.bestRate).toHaveLength(c.horizon)
    for (const run of result.strategies) {
      expect(run.chosen).toHaveLength(c.horizon)
      expect(run.converted).toHaveLength(c.horizon)
      expect(run.reward).toHaveLength(c.horizon)
      expect(run.regret).toHaveLength(c.horizon)
      expect(run.revenue).toHaveLength(c.horizon)
    }
  })

  it('bestRate is the row max of rates', () => {
    const result = simulate(config({ horizon: 200, drift: { enabled: true, volatility: 0.01 } }))
    result.bestRate.forEach((best, t) => {
      expect(best).toBe(Math.max(...result.rates[t]))
    })
  })

  it('regret is monotone non-decreasing for every strategy', () => {
    const result = simulate(config())
    for (const run of result.strategies) {
      for (let t = 1; t < run.regret.length; t++) {
        expect(run.regret[t]).toBeGreaterThanOrEqual(run.regret[t - 1])
      }
    }
  })

  it('regret increments by bestRate − chosen rate each round', () => {
    const result = simulate(config({ horizon: 500 }))
    for (const run of result.strategies) {
      let acc = 0
      run.chosen.forEach((arm, t) => {
        acc += result.bestRate[t] - result.rates[t][arm]
        expect(run.regret[t]).toBeCloseTo(acc, 10)
      })
    }
  })

  it('thompson beats fixed-split on final regret with the default config', () => {
    const result = simulate(config())
    const byId = new Map(result.strategies.map((s) => [s.id, s]))
    const last = result.config.horizon - 1
    const thompson = byId.get('thompson')!
    const fixed = byId.get('fixed-split')!
    expect(thompson.regret[last]).toBeLessThan(fixed.regret[last])
  })

  it('CRN: when strategies choose the same arm at a round, outcomes coincide', () => {
    const result = simulate(config({ whales: { enabled: true, share: 0.05, multiplier: 20 } }))
    const runs = result.strategies
    let coincidences = 0
    for (let a = 0; a < runs.length; a++) {
      for (let b = a + 1; b < runs.length; b++) {
        for (let t = 0; t < result.config.horizon; t++) {
          if (runs[a].chosen[t] === runs[b].chosen[t]) {
            coincidences++
            expect(runs[a].converted[t]).toBe(runs[b].converted[t])
            expect(runs[a].reward[t]).toBe(runs[b].reward[t])
          }
        }
      }
    }
    // The property must actually get exercised, not pass vacuously.
    expect(coincidences).toBeGreaterThan(100)
  })

  it('rewards without whales are exactly the conversions', () => {
    const result = simulate(config({ horizon: 1000 }))
    for (const run of result.strategies) {
      run.reward.forEach((r, t) => expect(r).toBe(run.converted[t]))
    }
  })

  it('whale rewards are only the multiplier or 1 on conversions, 0 otherwise', () => {
    const c = config({ horizon: 4000, whales: { enabled: true, share: 0.1, multiplier: 25 } })
    const result = simulate(c)
    let whaleHits = 0
    for (const run of result.strategies) {
      run.reward.forEach((r, t) => {
        if (run.converted[t] === 0) {
          expect(r).toBe(0)
        } else {
          expect([1, 25]).toContain(r)
          if (r === 25) whaleHits++
        }
      })
    }
    expect(whaleHits).toBeGreaterThan(0)
  })

  it('revenue is the running sum of rewards', () => {
    const result = simulate(config({ horizon: 500, whales: { enabled: true, share: 0.05, multiplier: 20 } }))
    for (const run of result.strategies) {
      let acc = 0
      run.reward.forEach((r, t) => {
        acc += r
        expect(run.revenue[t]).toBeCloseTo(acc, 10)
      })
    }
  })

  it('under drift, adaptive strategies still accrue less regret than fixed-split', () => {
    const result = simulate(config({ drift: { enabled: true, volatility: 0.002 } }))
    const byId = new Map(result.strategies.map((s) => [s.id, s]))
    const last = result.config.horizon - 1
    expect(byId.get('thompson')!.regret[last]).toBeLessThan(byId.get('fixed-split')!.regret[last])
  })
})

describe('statsAt', () => {
  it('matches a brute-force recount at several playhead positions', () => {
    const c = config({ horizon: 2000 })
    const result = simulate(c)
    for (const run of result.strategies) {
      for (const t of [0, 1, 7, 500, 1999, 2000]) {
        const pulls = new Array<number>(c.k).fill(0)
        const successes = new Array<number>(c.k).fill(0)
        for (let i = 0; i < t; i++) {
          pulls[run.chosen[i]] += 1
          successes[run.chosen[i]] += run.converted[i]
        }
        expect(statsAt(run, t, c.k)).toEqual({ pulls, successes })
      }
    }
  })

  it('t=0 is all zeros; full-horizon pulls sum to the horizon', () => {
    const c = config({ horizon: 800 })
    const result = simulate(c)
    for (const run of result.strategies) {
      const empty = statsAt(run, 0, c.k)
      expect(empty.pulls).toEqual([0, 0, 0, 0])
      expect(empty.successes).toEqual([0, 0, 0, 0])
      const full = statsAt(run, c.horizon, c.k)
      expect(full.pulls.reduce((s, v) => s + v, 0)).toBe(c.horizon)
      full.successes.forEach((s, i) => {
        expect(s).toBeLessThanOrEqual(full.pulls[i])
      })
    }
  })

  it('fixed-split full-horizon pulls are an even split', () => {
    const c = config({ horizon: 4000 })
    const result = simulate(c)
    const fixed = result.strategies.find((s) => s.id === 'fixed-split')!
    expect(statsAt(fixed, c.horizon, c.k).pulls).toEqual([1000, 1000, 1000, 1000])
  })
})
