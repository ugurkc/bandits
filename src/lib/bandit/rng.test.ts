import { describe, expect, it } from 'vitest'
import { hash01, makeRng, sampleBeta, STREAM } from './rng'

describe('hash01', () => {
  it('always lands in [0, 1)', () => {
    for (let i = 0; i < 5000; i++) {
      const v = hash01(42, STREAM.CONVERSION, i, i % 7)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('is deterministic in its arguments', () => {
    expect(hash01(42, 1, 2, 3)).toBe(hash01(42, 1, 2, 3))
    expect(hash01(7, STREAM.WHALE, 999)).toBe(hash01(7, STREAM.WHALE, 999))
  })

  it('separates nearby inputs', () => {
    // Adjacent counters and adjacent seeds must not produce near-equal values.
    expect(hash01(42, 1, 2, 3)).not.toBe(hash01(42, 1, 2, 4))
    expect(hash01(42, 1, 2, 3)).not.toBe(hash01(43, 1, 2, 3))
    expect(hash01(42, 1, 2, 3)).not.toBe(hash01(42, 1, 3, 3))
  })

  it('handles negative and large integers', () => {
    const v = hash01(42, -5, 2 ** 31 - 1)
    expect(v).toBeGreaterThanOrEqual(0)
    expect(v).toBeLessThan(1)
  })

  it('has uniform mean and variance (sanity, ~20k samples)', () => {
    const n = 20000
    let sum = 0
    let sumSq = 0
    for (let i = 0; i < n; i++) {
      const v = hash01(1234, STREAM.CONVERSION, i)
      sum += v
      sumSq += v * v
    }
    const mean = sum / n
    const variance = sumSq / n - mean * mean
    expect(mean).toBeCloseTo(0.5, 2) // se ≈ 0.002
    expect(Math.abs(variance - 1 / 12)).toBeLessThan(0.005)
  })
})

describe('makeRng', () => {
  it('replays the same sequence for the same seed and stream', () => {
    const a = makeRng(42, STREAM.STRATEGY, 0)
    const b = makeRng(42, STREAM.STRATEGY, 0)
    for (let i = 0; i < 100; i++) expect(a()).toBe(b())
  })

  it('matches hash01 with an incrementing counter', () => {
    const rand = makeRng(42, STREAM.STRATEGY, 2)
    expect(rand()).toBe(hash01(42, STREAM.STRATEGY, 2, 0))
    expect(rand()).toBe(hash01(42, STREAM.STRATEGY, 2, 1))
    expect(rand()).toBe(hash01(42, STREAM.STRATEGY, 2, 2))
  })

  it('gives independent streams for different tags', () => {
    const a = makeRng(42, STREAM.STRATEGY, 0)
    const b = makeRng(42, STREAM.STRATEGY, 1)
    const c = makeRng(42, STREAM.DRIFT)
    const n = 2000
    const seqA: number[] = []
    const seqB: number[] = []
    const seqC: number[] = []
    for (let i = 0; i < n; i++) {
      seqA.push(a())
      seqB.push(b())
      seqC.push(c())
    }
    expect(seqA).not.toEqual(seqB)
    expect(seqA).not.toEqual(seqC)
    // Streams should be uncorrelated, not merely unequal.
    const corr = (x: number[], y: number[]) => {
      const mx = x.reduce((s, v) => s + v, 0) / x.length
      const my = y.reduce((s, v) => s + v, 0) / y.length
      let num = 0
      let dx = 0
      let dy = 0
      for (let i = 0; i < x.length; i++) {
        num += (x[i] - mx) * (y[i] - my)
        dx += (x[i] - mx) ** 2
        dy += (y[i] - my) ** 2
      }
      return num / Math.sqrt(dx * dy)
    }
    expect(Math.abs(corr(seqA, seqB))).toBeLessThan(0.05)
    expect(Math.abs(corr(seqA, seqC))).toBeLessThan(0.05)
  })

  it('every value stays in [0, 1)', () => {
    const rand = makeRng(7, STREAM.WHALE)
    for (let i = 0; i < 5000; i++) {
      const v = rand()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('sampleBeta', () => {
  const sampleMean = (a: number, b: number, n: number) => {
    const rand = makeRng(42, 99, a, b)
    let sum = 0
    for (let i = 0; i < n; i++) {
      const v = sampleBeta(a, b, rand)
      expect(v).toBeGreaterThan(0)
      expect(v).toBeLessThan(1)
      sum += v
    }
    return sum / n
  }

  it('Beta(2, 5) sample mean approaches 2/7', () => {
    expect(sampleMean(2, 5, 8000)).toBeCloseTo(2 / 7, 2)
  })

  it('Beta(30, 70) sample mean approaches 0.3', () => {
    expect(sampleMean(30, 70, 8000)).toBeCloseTo(0.3, 2)
  })

  it('handles the alpha < 1 boost branch', () => {
    // Beta(0.5, 0.5) has mean 0.5; also exercises the Gamma(a+1)·U^(1/a) path.
    expect(sampleMean(0.5, 0.5, 8000)).toBeCloseTo(0.5, 1)
  })

  it('is deterministic given the same rand stream', () => {
    const a = makeRng(1, 2)
    const b = makeRng(1, 2)
    for (let i = 0; i < 50; i++) {
      expect(sampleBeta(3, 4, a)).toBe(sampleBeta(3, 4, b))
    }
  })

  it('concentrates with strong evidence', () => {
    const rand = makeRng(5, 6)
    for (let i = 0; i < 200; i++) {
      const v = sampleBeta(1 + 900, 1 + 100, rand)
      expect(v).toBeGreaterThan(0.85)
      expect(v).toBeLessThan(0.95)
    }
  })

  // Everything above asserts only on MEANS and on each draw sitting inside a
  // range — all of which `() => a / (a + b)` satisfies. That constant would
  // reduce Thompson sampling to plain greedy and delete the exploration this
  // whole essay is about, with the suite still green. These pin the spread.
  const sampleVariance = (a: number, b: number, n: number) => {
    const rand = makeRng(7, 99, a, b)
    const vs: number[] = []
    for (let i = 0; i < n; i++) vs.push(sampleBeta(a, b, rand))
    const mean = vs.reduce((s, v) => s + v, 0) / n
    return vs.reduce((s, v) => s + (v - mean) ** 2, 0) / n
  }

  it('has the variance a Beta actually has, not just the mean', () => {
    // Var = ab / ((a+b)^2 (a+b+1)).
    for (const [a, b] of [
      [2, 5],
      [30, 70],
      [1, 1],
      [1, 20],
    ]) {
      const expected = (a * b) / ((a + b) ** 2 * (a + b + 1))
      expect(sampleVariance(a, b, 20000)).toBeCloseTo(expected, 3)
    }
  })

  it('consecutive draws differ — a fixed posterior mean would not', () => {
    const rand = makeRng(11, 12)
    const seen = new Set<number>()
    for (let i = 0; i < 200; i++) seen.add(sampleBeta(6, 45, rand))
    expect(seen.size).toBeGreaterThan(190)
  })

  it('uncertainty alone decides between two arms with the SAME posterior mean', () => {
    // Beta(2,10) and Beta(20,100) share a mean of exactly 1/6; only their
    // spread differs. This is the mechanism Thompson runs on — it is why a
    // barely-tried arm still gets pulled against an equally-rated but
    // well-measured one. A posterior-mean sampler returns the identical
    // value for both, so `>` is never true and the rate collapses to 0.
    const rand = makeRng(13, 14)
    let wins = 0
    const n = 8000
    for (let i = 0; i < n; i++) {
      if (sampleBeta(2, 10, rand) > sampleBeta(20, 100, rand)) wins++
    }
    expect(wins / n).toBeGreaterThan(0.35)
    expect(wins / n).toBeLessThan(0.65)
  })
})
