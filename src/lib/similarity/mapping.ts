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
 * Map all similarities to rates, then deterministically nudge near-ties
 * apart (seeded, order-stable) so identical pitches don't produce a race
 * that can never resolve. Nudged rates stay inside the band.
 */
export function similaritiesToRates(similarities: number[], seed: number): number[] {
  const rates = similarities.map(similarityToRate)
  for (let i = 0; i < rates.length; i++) {
    for (let j = i + 1; j < rates.length; j++) {
      if (Math.abs(rates[i] - rates[j]) < TIE_GAP) {
        const sign = hash01(seed, STREAM.TIE, i, j) < 0.5 ? -1 : 1
        rates[j] = rates[j] + sign * TIE_GAP
      }
    }
  }
  return rates.map((r) =>
    Math.max(RATE_FLOOR, Math.min(RATE_FLOOR + RATE_SPAN + TIE_GAP, r)),
  )
}
