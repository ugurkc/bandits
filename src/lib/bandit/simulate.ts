/**
 * The simulator: precompute every strategy's full run over an identical
 * world, so the UI only ever moves a playhead through the result.
 */

import type {
  ArmStats,
  SimulationConfig,
  SimulationResult,
  StrategyRun,
} from './types'
import { hash01, makeRng, STREAM } from './rng'
import { computeRates } from './arms'
import { STRATEGIES } from './strategies'

/**
 * Run the whole horizon for all strategies. Deterministic in the config.
 *
 * Common random numbers: the conversion outcome of (t, arm) is the single
 * draw `hash01(seed, CONVERSION, t, arm) < rates[t][arm]`, shared by every
 * strategy — they differ only in which arm they choose. Each strategy's own
 * randomness comes from its private `makeRng(seed, STRATEGY, index)` stream,
 * so one strategy's draws can never perturb another's.
 */
export function simulate(config: SimulationConfig): SimulationResult {
  const { seed, k, horizon, epsilon, whales } = config
  const rates = computeRates(config)
  const bestRate = new Array<number>(horizon)
  for (let t = 0; t < horizon; t++) {
    let best = rates[t][0]
    for (let arm = 1; arm < k; arm++) {
      if (rates[t][arm] > best) best = rates[t][arm]
    }
    bestRate[t] = best
  }

  const strategies: StrategyRun[] = STRATEGIES.map((impl, index) => {
    const rand = makeRng(seed, STREAM.STRATEGY, index)
    const pulls = new Array<number>(k).fill(0)
    const successes = new Array<number>(k).fill(0)
    const chosen = new Array<number>(horizon)
    const converted = new Array<0 | 1>(horizon)
    const reward = new Array<number>(horizon)
    const regret = new Array<number>(horizon)
    const revenue = new Array<number>(horizon)
    for (let t = 0; t < horizon; t++) {
      const arm = impl.select(pulls, successes, t, rand, epsilon)
      const conv: 0 | 1 = hash01(seed, STREAM.CONVERSION, t, arm) < rates[t][arm] ? 1 : 0
      let rew: number = conv
      if (conv === 1 && whales.enabled) {
        rew = hash01(seed, STREAM.WHALE, t, arm) < whales.share ? whales.multiplier : 1
      }
      pulls[arm] += 1
      successes[arm] += conv
      chosen[t] = arm
      converted[t] = conv
      reward[t] = rew
      regret[t] = (t > 0 ? regret[t - 1] : 0) + (bestRate[t] - rates[t][arm])
      revenue[t] = (t > 0 ? revenue[t - 1] : 0) + rew
    }
    return { id: impl.id, chosen, converted, reward, regret, revenue }
  })

  return { config, rates, bestRate, strategies }
}

/** Per-arm pull/conversion tallies for one strategy over rounds [0, t). */
export function statsAt(run: StrategyRun, t: number, k: number): ArmStats {
  const pulls = new Array<number>(k).fill(0)
  const successes = new Array<number>(k).fill(0)
  const end = Math.min(t, run.chosen.length)
  for (let i = 0; i < end; i++) {
    const arm = run.chosen[i]
    pulls[arm] += 1
    successes[arm] += run.converted[i]
  }
  return { pulls, successes }
}
