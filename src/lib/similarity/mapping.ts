import { hash01, STREAM } from '../bandit/rng'

/**
 * Turns calibrated similarities into (a) a preference distribution for
 * display and (b) absolute arm conversion rates for the simulation.
 *
 * The two deliberately answer different questions: softmax says "which of
 * the three would players pick", while the rate map is absolute — three bad
 * pitches all get low rates, and the bandit finds the best of a bad lot.
 * Normalizing rates across pitches would guarantee someone a great arm no
 * matter what they wrote, which quietly lies.
 */

/** Softmax temperature: 0.2 keeps a 0.2-similarity lead ≈ a 2.7x preference. */
export const PREFERENCE_TEMPERATURE = 0.2

/** Rate band matches the sandbox's live-ops-plausible conversion rates. */
export const RATE_FLOOR = 0.02
export const RATE_SPAN = 0.1

/** Two arms closer than this get nudged apart so the race can resolve. */
export const TIE_GAP = 0.003

export function preferenceDistribution(
  similarities: number[],
  temperature: number = PREFERENCE_TEMPERATURE,
): number[] {
  const exps = similarities.map((s) => Math.exp(s / temperature))
  const sum = exps.reduce((a, b) => a + b, 0)
  return exps.map((e) => e / sum)
}

/** Absolute affine map into the sandbox's [2%, 12%] conversion band. */
export function similarityToRate(similarity: number): number {
  const s = Math.max(0, Math.min(1, similarity))
  return RATE_FLOOR + RATE_SPAN * s
}

/**
 * Map all similarities to rates, then enforce pairwise separation so
 * identical pitches don't produce a race that can never resolve:
 * sort-walk-enforce-gap-unsort. Rates are sorted (with original indices),
 * walked upward enforcing >= TIE_GAP spacing, then unsorted — nudges only go
 * UP, so no floor clamp can ever undo a separation (the old pairwise ±nudge
 * left exact ties behind in ~25-50% of seeds; verified 2026-08-13).
 *
 * Guarantees, for k rates:
 * - every pair is >= TIE_GAP apart;
 * - a strictly higher similarity never maps below a strictly lower one;
 * - rates stay in [RATE_FLOOR, RATE_FLOOR + RATE_SPAN + (k-1) * TIE_GAP]
 *   (the headroom above the band is the worst case of k exact ties at the
 *   top, spaced upward).
 *
 * The seed only breaks EXACT-tie ordering (which identical pitch ends up on
 * top), via `hash01(seed, STREAM.TIE, index)` — deterministic per seed, and
 * identical pitches don't get a winner predetermined by box order.
 */
export function similaritiesToRates(similarities: number[], seed: number): number[] {
  const order = similarities
    .map((similarity, index) => ({ rate: similarityToRate(similarity), index }))
    .sort(
      (a, b) =>
        a.rate - b.rate ||
        hash01(seed, STREAM.TIE, a.index) - hash01(seed, STREAM.TIE, b.index) ||
        a.index - b.index,
    )
  const rates = new Array<number>(similarities.length).fill(0)
  let previous = -Infinity
  for (const { rate, index } of order) {
    const separated = Math.max(rate, RATE_FLOOR, previous + TIE_GAP)
    rates[index] = separated
    previous = separated
  }
  return rates
}
