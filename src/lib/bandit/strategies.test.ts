import { describe, expect, it } from 'vitest'
import { STRATEGY_IDS } from './types'
import { hash01, makeRng, STREAM } from './rng'
import { epsilonGreedy, fixedSplit, STRATEGIES, thompson, ucb, uniformRandom } from './strategies'
import type { StrategyImpl } from './strategies'

const zeros = (k: number) => new Array<number>(k).fill(0)

describe('STRATEGIES', () => {
  it('is in STRATEGY_IDS order', () => {
    expect(STRATEGIES.map((s) => s.id)).toEqual([...STRATEGY_IDS])
  })
})

describe('fixed-split', () => {
  it('round-robins t % k regardless of history', () => {
    const rand = makeRng(1, STREAM.STRATEGY, 0)
    for (const k of [2, 3, 5]) {
      for (let t = 0; t < 4 * k; t++) {
        expect(fixedSplit.select(zeros(k), zeros(k), t, rand, 0.1)).toBe(t % k)
      }
    }
  })
})

describe('epsilon-greedy', () => {
  it('plays each arm once during the first k rounds', () => {
    const rand = makeRng(1, STREAM.STRATEGY, 1)
    const k = 4
    for (let t = 0; t < k; t++) {
      expect(epsilonGreedy.select(zeros(k), zeros(k), t, rand, 1)).toBe(t)
    }
  })

  it('epsilon=0 is pure greedy on empirical means after init', () => {
    const rand = makeRng(1, STREAM.STRATEGY, 1)
    const pulls = [10, 10, 10, 10]
    const successes = [1, 5, 3, 5] // arms 1 and 3 tie at 0.5
    for (let i = 0; i < 50; i++) {
      expect(epsilonGreedy.select(pulls, successes, 100, rand, 0)).toBe(1)
    }
    // Unequal pulls: means, not raw successes, decide (2/4 beats 3/10).
    expect(epsilonGreedy.select([4, 10], [2, 3], 100, rand, 0)).toBe(0)
  })

  it('breaks ties to the lowest index', () => {
    const rand = makeRng(1, STREAM.STRATEGY, 1)
    expect(epsilonGreedy.select([5, 5, 5], [2, 2, 2], 30, rand, 0)).toBe(0)
    expect(epsilonGreedy.select([5, 5, 5], [1, 2, 2], 30, rand, 0)).toBe(1)
  })

  it('epsilon=1 explores approximately uniformly', () => {
    const rand = makeRng(9, STREAM.STRATEGY, 1)
    const k = 4
    const pulls = [10, 10, 10, 10]
    const successes = [9, 0, 0, 0] // greedy would always pick arm 0
    const counts = zeros(k)
    const n = 20000
    for (let i = 0; i < n; i++) {
      counts[epsilonGreedy.select(pulls, successes, 100, rand, 1)]++
    }
    for (const c of counts) {
      expect(c / n).toBeGreaterThan(0.22)
      expect(c / n).toBeLessThan(0.28)
    }
  })

  it('intermediate epsilon splits between exploring and exploiting', () => {
    const rand = makeRng(3, STREAM.STRATEGY, 1)
    const pulls = [10, 10]
    const successes = [10, 0]
    let arm1 = 0
    const n = 20000
    for (let i = 0; i < n; i++) {
      arm1 += epsilonGreedy.select(pulls, successes, 100, rand, 0.2)
    }
    // Arm 1 only via exploration: ε/k = 0.1 of the time.
    expect(arm1 / n).toBeGreaterThan(0.08)
    expect(arm1 / n).toBeLessThan(0.12)
  })
})

describe('thompson', () => {
  it('plays each arm once during the first k rounds', () => {
    const rand = makeRng(1, STREAM.STRATEGY, 2)
    const k = 5
    for (let t = 0; t < k; t++) {
      expect(thompson.select(zeros(k), zeros(k), t, rand, 0)).toBe(t)
    }
  })

  it('is deterministic given the same rand stream', () => {
    const a = makeRng(4, STREAM.STRATEGY, 2)
    const b = makeRng(4, STREAM.STRATEGY, 2)
    const pulls = [20, 20, 20]
    const successes = [5, 10, 2]
    for (let i = 0; i < 50; i++) {
      expect(thompson.select(pulls, successes, 60, a, 0)).toBe(
        thompson.select(pulls, successes, 60, b, 0),
      )
    }
  })

  it('overwhelmingly prefers a clearly better posterior', () => {
    const rand = makeRng(8, STREAM.STRATEGY, 2)
    const pulls = [500, 500]
    const successes = [250, 50]
    let picksArm0 = 0
    for (let i = 0; i < 500; i++) {
      if (thompson.select(pulls, successes, 1000, rand, 0) === 0) picksArm0++
    }
    expect(picksArm0).toBeGreaterThan(495)
  })
})

describe('ucb', () => {
  const forbiddenRand = () => {
    throw new Error('UCB must never consume randomness')
  }

  it('plays each arm once during the first k rounds', () => {
    const k = 5
    for (let t = 0; t < k; t++) {
      expect(ucb.select(zeros(k), zeros(k), t, forbiddenRand, 0)).toBe(t)
    }
  })

  it('is deterministic and never consumes rand', () => {
    const pulls = [20, 20, 20]
    const successes = [5, 10, 2]
    expect(ucb.select(pulls, successes, 60, forbiddenRand, 0.5)).toBe(1)
  })

  it('prefers the higher mean at equal pulls, and the barely-tried arm over a marginal leader', () => {
    // Equal pulls: the bonus terms cancel, mean decides.
    expect(ucb.select([50, 50], [10, 25], 100, forbiddenRand, 0)).toBe(1)
    // Arm 1 leads on mean (0.30 vs 0.25) but arm 0's 4-pull bonus
    // (variance term capped at 1/4: sqrt(ln 104 / 4 * 0.25) ≈ 0.54)
    // dwarfs arm 1's ≈ 0.11 bonus plus the 0.05 mean gap.
    expect(ucb.select([4, 100], [1, 30], 104, forbiddenRand, 0)).toBe(0)
  })

  it('breaks ties to the lowest index', () => {
    expect(ucb.select([10, 10, 10], [3, 3, 3], 30, forbiddenRand, 0)).toBe(0)
  })

  it('is the Tuned index, not plain UCB1: the variance cap curbs a small-sample bonus', () => {
    // pulls [25, 2500], means 0.12 vs 0.50 at t=5000. Plain UCB1's
    // sqrt(2 ln t / n) bonus (0.83 vs 0.08) would flip the pick to the
    // barely-tried arm 0 (index 0.95 vs 0.58); the Tuned cap shrinks arm 0's
    // bonus to ~0.29, so the well-measured arm 1 wins (0.41 vs 0.53). This
    // pins the calibrated variant: reverting to plain UCB1 breaks it.
    expect(ucb.select([25, 2500], [3, 1250], 5000, forbiddenRand, 0)).toBe(1)
  })
})

describe('uniform random', () => {
  it('explores approximately uniformly regardless of evidence', () => {
    const rand = makeRng(11, STREAM.STRATEGY, 4)
    const k = 4
    const pulls = [1000, 1, 1, 1]
    const successes = [1000, 0, 0, 0] // any learner would lock onto arm 0
    const counts = zeros(k)
    const n = 20000
    for (let i = 0; i < n; i++) {
      counts[uniformRandom.select(pulls, successes, 100, rand, 0)]++
    }
    for (const c of counts) {
      expect(c / n).toBeGreaterThan(0.22)
      expect(c / n).toBeLessThan(0.28)
    }
  })
})

/**
 * Play a strategy against a fixed stationary world using the same shared
 * outcome draws the simulator uses, and return the picks.
 */
function playout(impl: StrategyImpl, rates: number[], horizon: number, seed: number) {
  const k = rates.length
  const rand = makeRng(seed, STREAM.STRATEGY, 7)
  const pulls = zeros(k)
  const successes = zeros(k)
  const chosen: number[] = []
  for (let t = 0; t < horizon; t++) {
    const arm = impl.select(pulls, successes, t, rand, 0.1)
    const converted = hash01(seed, STREAM.CONVERSION, t, arm) < rates[arm] ? 1 : 0
    pulls[arm]++
    successes[arm] += converted
    chosen.push(arm)
  }
  return chosen
}

describe('thompson end-to-end concentration', () => {
  it('concentrates on the true best arm late in a long stationary run', () => {
    const rates = [0.05, 0.11, 0.08, 0.03] // arm 1 is best
    const chosen = playout(thompson, rates, 8000, 42)
    const late = chosen.slice(-1000)
    const bestShare = late.filter((a) => a === 1).length / late.length
    expect(bestShare).toBeGreaterThan(0.8)
  })
})

describe('ucb end-to-end concentration', () => {
  it('concentrates on the true best arm late in a long stationary run', () => {
    const rates = [0.05, 0.11, 0.08, 0.03] // arm 1 is best
    const chosen = playout(ucb, rates, 8000, 42)
    const late = chosen.slice(-1000)
    const bestShare = late.filter((a) => a === 1).length / late.length
    expect(bestShare).toBeGreaterThan(0.6)
  })
})
