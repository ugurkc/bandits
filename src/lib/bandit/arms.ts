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

/**
 * The best-vs-second gap that keeps the race interesting. Widened from
 * [0.005, 0.03] on 2026-08-18: at a sub-2pp gap on a ~10% base, separating
 * the top two arms needs ~1000+ pulls each, so the lab's 5,000-round default
 * was a SHORT horizon for its own world and ε-greedy beat Thompson at every
 * horizon the UI offers — contradicting Act III's central card. Measured
 * over 1000 reshuffle-style seeds at the new range: P(Thompson < ε-greedy)
 * = 0.92 (was ~0.50), and the crossover is visible with the horizon
 * selector (ε-greedy still wins at H=1000). These rates feed ONLY Act III's
 * lab — Act I and Act II derive theirs from the reader's pitches via
 * similaritiesToRates.
 */
const GAP_MIN = 0.05
const GAP_MAX = 0.065

/** The best arm sits high in the band so the runner-up still clears BASE_MIN. */
const BEST_MIN = 0.1

/**
 * Floor spacing for the also-ran arms, kept independent of the best-vs-second
 * gap. Coupling them (the old `second - GAP_MIN`) would push every remaining
 * arm to or below the 2% floor once GAP_MIN grew, breaking the band, the
 * distinctness invariant and the unique-max invariant at once.
 */
const REST_GAP = 0.005

/**
 * Deterministic default base rates for k arms: conversion-like values in
 * [0.02, 0.12], all distinct with a unique best arm, and a best-vs-second
 * gap in [0.05, 0.065] — big enough that Thompson's advantage arrives inside
 * a 5,000-round run, small enough to stay a real question.
 *
 * Construction (not rejection) so it terminates for any seed: pick the best
 * rate high in the band, place the runner-up a bounded gap below it, spread
 * the rest over disjoint slots underneath, then shuffle arm positions.
 */
export function defaultBaseRates(k: number, seed: number): number[] {
  const rand = makeRng(seed, STREAM.BASE_RATES)
  const best = BEST_MIN + rand() * (BASE_MAX - BEST_MIN)
  const gap = GAP_MIN + rand() * (GAP_MAX - GAP_MIN)
  const second = best - gap
  const rates = [best, second]
  // Remaining arms: one per slot in [BASE_MIN, second - REST_GAP], each
  // sampled inside its own 90% of the slot so all values stay distinct.
  const rest = k - 2
  if (rest > 0) {
    const lo = BASE_MIN
    const hi = second - REST_GAP
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

/** Drifting rates stay inside the live-ops band the base rates come from. */
const DRIFT_BAND_MIN = 0.02
const DRIFT_BAND_MAX = 0.12
/** Per-round pull toward the arm's current target level (~35-round half-life). */
const DRIFT_REVERSION = 0.02
/** Regime switches per run: the menu turns over this many times. */
const DRIFT_TURNOVERS = 3

/**
 * The horizon × k matrix of true rates.
 *
 * Stationary: every row is the base rates. With drift enabled the k base
 * rates are the only levels that ever exist — drift only reassigns WHICH ARM
 * sits on which. Every `horizon / (DRIFT_TURNOVERS + 1)` rounds the menu
 * turns over: each arm slides down one rank and the bottom arm jumps to the
 * top. Rates ease toward their new level at DRIFT_REVERSION per round with a
 * Gaussian wobble whose standing amplitude is `drift.volatility`, so they
 * never leave the band the base rates came from.
 *
 * This replaced an unconstrained reflected random walk on 2026-08-18. That
 * walk made the problem EASIER, not harder: measured over 5,000 rounds the
 * best-vs-second gap grew from 1.96pp to 10.93pp as arms fanned apart, 38%
 * of rates escaped the 2–12% band (max 40%), and Thompson's share of rounds
 * on the current best arm ROSE — so the drift toggle contradicted the very
 * lesson it was there to teach. Under rank rotation a sliding-window
 * Thompson beats the shipped infinite-memory one by ~34% (120 seeds, winning
 * on 98% of them), which is what makes "none of these ever forgets" a claim
 * the lab actually demonstrates. Pure mean-reversion was measured too and is
 * a trap — it makes forgetting HURT by up to 57%, because reverting to a
 * fixed level keeps old data permanently valid.
 *
 * The turnover schedule needs no random draw at all, so the only randomness
 * remains the per-(t, arm) noise stream and the matrix stays a pure function
 * of the config — independent of anything the strategies do.
 */
export function computeRates(config: SimulationConfig): number[][] {
  const { seed, k, horizon, baseRates, drift } = config
  const rates: number[][] = new Array(horizon)
  const base = baseRates.slice(0, k)
  // Every caller derives baseRates and k together, so a short array is a
  // programming error rather than a reader-reachable state — but it used to
  // fail in two different unhelpful ways: silently emitting rows narrower
  // than k without drift (NaN regret downstream), and a bare "Cannot read
  // properties of undefined" from the rank lookup with it. Name the invariant
  // instead.
  if (base.length !== k) {
    throw new Error(`computeRates needs ${k} base rates, got ${base.length}`)
  }
  if (!drift.enabled) {
    for (let t = 0; t < horizon; t++) rates[t] = base.slice()
    return rates
  }
  const lo = Math.max(RATE_MIN, Math.min(DRIFT_BAND_MIN, ...base))
  const hi = Math.min(RATE_MAX, Math.max(DRIFT_BAND_MAX, ...base))
  // Levels best-first; the arm index breaks ties so `rank` stays a bijection
  // even if two arms were handed the same base rate.
  const levels = base
    .map((rate, arm) => ({ rate, arm }))
    .sort((a, b) => b.rate - a.rate || a.arm - b.arm)
  const rank = new Array<number>(k)
  for (let i = 0; i < k; i++) rank[levels[i].arm] = i
  const period = Math.max(1, Math.floor(horizon / (DRIFT_TURNOVERS + 1)))
  // Scale the step so `volatility` reads as the standing amplitude of the
  // wobble (the OU stationary std-dev), not the raw per-round step.
  const sigma =
    drift.volatility * Math.sqrt(2 * DRIFT_REVERSION - DRIFT_REVERSION * DRIFT_REVERSION)
  let prev = base.map((r) => Math.min(hi, Math.max(lo, r)))
  rates[0] = prev
  for (let t = 1; t < horizon; t++) {
    const epoch = Math.floor(t / period)
    const row = new Array<number>(k)
    for (let arm = 0; arm < k; arm++) {
      const target = levels[(rank[arm] + epoch) % k].rate
      // The shared Box–Muller, fed by the per-(t, arm) counter stream:
      // draw c is hash01(seed, DRIFT, t, arm, c).
      let c = 0
      const gauss = sampleNormal(() => hash01(seed, STREAM.DRIFT, t, arm, c++))
      row[arm] = reflect(
        prev[arm] + DRIFT_REVERSION * (target - prev[arm]) + gauss * sigma,
        lo,
        hi,
      )
    }
    rates[t] = row
    prev = row
  }
  return rates
}
