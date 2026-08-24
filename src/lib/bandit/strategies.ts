/**
 * The allocation strategies, behind one interface so the simulator can race
 * them over identical worlds.
 */

import type { StrategyId } from './types'
import { STRATEGY_IDS } from './types'
import { sampleBeta } from './rng'

export interface StrategyImpl {
  id: StrategyId
  /**
   * Pick the arm to play at round t.
   *
   * @param pulls     times each arm has been played so far (length k)
   * @param successes conversions observed on each arm so far (length k)
   * @param t         current round, 0-based
   * @param rand      the strategy's own sequential uniform stream
   * @param epsilon   exploration probability (ε-greedy only)
   */
  select(
    pulls: number[],
    successes: number[],
    t: number,
    rand: () => number,
    epsilon: number,
  ): number
}

/** Index of the largest value; ties break to the lowest index. */
function argmax(values: number[]): number {
  let best = 0
  for (let i = 1; i < values.length; i++) {
    if (values[i] > values[best]) best = i
  }
  return best
}

/** Equal allocation forever: round-robin over the arms. */
export const fixedSplit: StrategyImpl = {
  id: 'fixed-split',
  select: (pulls, _successes, t) => t % pulls.length,
}

/**
 * ε-greedy: one forced pull per arm first, then explore uniformly with
 * probability ε, else exploit the best empirical conversion rate.
 *
 * The explore draw is uniform over ALL k arms — the current leader included —
 * which is Sutton & Barto's convention, so the leader's steady-state share is
 * (1−ε)+ε/k rather than (1−ε). This is the definition for the whole essay:
 * `campaign/budgetStrategies.ts` allocates weekly dollars to exactly these
 * probabilities so Act III's handoff is the same strategy the reader tuned on
 * the race screen, not a second policy wearing the same name.
 */
export const epsilonGreedy: StrategyImpl = {
  id: 'epsilon-greedy',
  select(pulls, successes, t, rand, epsilon) {
    const k = pulls.length
    if (t < k) return t
    if (rand() < epsilon) return Math.floor(rand() * k)
    return argmax(pulls.map((p, i) => successes[i] / p))
  },
}

/**
 * Thompson sampling: one forced pull per arm first, then sample each arm's
 * Beta(1 + successes, 1 + failures) posterior and play the max.
 */
export const thompson: StrategyImpl = {
  id: 'thompson',
  select(pulls, successes, t, rand) {
    if (t < pulls.length) return t
    return argmax(
      pulls.map((p, i) => sampleBeta(1 + successes[i], 1 + (p - successes[i]), rand)),
    )
  },
}

/**
 * UCB1-Tuned (Auer, Cesa-Bianchi & Fischer 2002, §4): one forced pull per
 * arm first, then play the arm with the highest optimistic index — the
 * empirical mean plus a confidence bonus scaled by the arm's observed
 * variance, sqrt((ln t / n) · min(1/4, V)) with V = p̂(1−p̂) + sqrt(2 ln t / n).
 *
 * The Tuned variant, not plain UCB1, is a MEASURED choice: at this essay's
 * install-rate-scale rewards (roughly 2–16%) plain UCB1's sqrt(2 ln t / n)
 * bonus dwarfs the arm gaps at every horizon the UI offers, leaving its
 * regret line barely below the fixed split's (avg final regret 116 vs 231
 * at H=5000 over 8 seeds) — which would put the lab's "bending line"
 * teaching on screen as false. Tuned's variance scaling fixes exactly this
 * low-variance case (42 at H=5000, 58 vs ε-greedy's 119 at H=20000).
 *
 * Fully deterministic: never consumes `rand` (ties break to the lowest
 * index via argmax), so its run is a pure function of the shared
 * conversion draws.
 */
export const ucb: StrategyImpl = {
  id: 'ucb',
  select(pulls, successes, t) {
    if (t < pulls.length) return t
    const logT = Math.log(t)
    return argmax(
      pulls.map((p, i) => {
        const mean = successes[i] / p
        const variance = mean * (1 - mean) + Math.sqrt((2 * logT) / p)
        return mean + Math.sqrt((logT / p) * Math.min(0.25, variance))
      }),
    )
  },
}

/**
 * Uniform random: pick any arm with equal probability, every round, forever.
 * No learning at all — the floor every real strategy has to beat, and (in
 * expectation) the same allocation as the fixed split, realized noisily.
 */
export const uniformRandom: StrategyImpl = {
  id: 'random',
  select: (pulls, _successes, _t, rand) => Math.floor(rand() * pulls.length),
}

/** All strategies, in STRATEGY_IDS order — the order of the result arrays. */
export const STRATEGIES: readonly StrategyImpl[] = STRATEGY_IDS.map((id) => {
  switch (id) {
    case 'fixed-split':
      return fixedSplit
    case 'epsilon-greedy':
      return epsilonGreedy
    case 'thompson':
      return thompson
    case 'ucb':
      return ucb
    case 'random':
      return uniformRandom
  }
})
