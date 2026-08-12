/**
 * True conversion rates for the arms: deterministic default base rates and
 * the per-round rates matrix (constant, or a drifting random walk).
 */

import type { SimulationConfig } from './types'
import { hash01, makeRng, sampleNormal, STREAM } from './rng'

/** Rates live in a conversion-like band under drift. */
export const RATE_MIN = 0.005
export const RATE_MAX = 0.6

/** Default base rates stay in a live-ops-plausible band. */
const BASE_MIN = 0.02
const BASE_MAX = 0.12

/** The best-vs-second gap that keeps the race interesting. */
const GAP_MIN = 0.005
const GAP_MAX = 0.03

/**
 * Deterministic default base rates for k arms: conversion-like values in
 * [0.02, 0.12], all distinct with a unique best arm, and a best-vs-second
 * gap in [0.005, 0.03] so the bandits have something worth finding but not
 * a giveaway.
 *
 * Construction (not rejection) so it terminates for any seed: pick the best
 * rate high in the band, place the runner-up a bounded gap below it, spread
 * the rest over disjoint slots underneath, then shuffle arm positions.
 */
export function defaultBaseRates(k: number, seed: number): number[] {
  const rand = makeRng(seed, STREAM.BASE_RATES)
  const best = 0.08 + rand() * (BASE_MAX - 0.08)
  const gap = GAP_MIN + rand() * (GAP_MAX - GAP_MIN)
  const second = best - gap
  const rates = [best, second]
  // Remaining arms: one per slot in [BASE_MIN, second - GAP_MIN], each
  // sampled inside its own 90% of the slot so all values stay distinct.
  const rest = k - 2
  if (rest > 0) {
    const lo = BASE_MIN
    const hi = second - GAP_MIN
    const slot = (hi - lo) / rest
    for (let i = 0; i < rest; i++) {
      rates.push(lo + i * slot + rand() * slot * 0.9)
    }
  }
  // Fisher–Yates so the best arm's index depends on the seed.
  for (let i = rates.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    const tmp = rates[i]
    rates[i] = rates[j]
    rates[j] = tmp
  }
  return rates
}

/**
 * Reflect x back into [lo, hi], bouncing until it lands inside — a step
 * larger than the band width reflects off both walls instead of pinning a
 * point mass onto one. Each bounce strictly shrinks the excursion, so the
 * loop terminates for any finite x.
 */
function reflect(x: number, lo: number, hi: number): number {
  let v = x
  while (v < lo || v > hi) {
    if (v < lo) v = lo + (lo - v)
    if (v > hi) v = hi - (v - hi)
  }
  return v
}

/**
 * The horizon × k matrix of true rates.
 *
 * Stationary: every row is the base rates. With drift enabled, each arm
 * follows a reflected random walk: per-round Gaussian step with std-dev
 * `drift.volatility`, clamped to [0.005, 0.6]. The noise for (t, arm) comes
 * from its own deterministic stream, so the walk is a pure function of the
 * config — independent of anything the strategies do.
 */
export function computeRates(config: SimulationConfig): number[][] {
  const { seed, k, horizon, baseRates, drift } = config
  const rates: number[][] = new Array(horizon)
  if (!drift.enabled) {
    for (let t = 0; t < horizon; t++) rates[t] = baseRates.slice(0, k)
    return rates
  }
  let prev = baseRates.slice(0, k).map((r) => Math.min(RATE_MAX, Math.max(RATE_MIN, r)))
  rates[0] = prev
  for (let t = 1; t < horizon; t++) {
    const row = new Array<number>(k)
    for (let arm = 0; arm < k; arm++) {
      // The shared Box–Muller, fed by the per-(t, arm) counter stream:
      // draw c is hash01(seed, DRIFT, t, arm, c).
      let c = 0
      const gauss = sampleNormal(() => hash01(seed, STREAM.DRIFT, t, arm, c++))
      row[arm] = reflect(prev[arm] + gauss * drift.volatility, RATE_MIN, RATE_MAX)
    }
    rates[t] = row
    prev = row
  }
  return rates
}
