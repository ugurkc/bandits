/**
 * The manual campaign calendar's weekly reward engine.
 *
 * One underlying weekly simulation: a week is always a 3-way dollar split
 * across campaigns (`WeekAllocation`). Phase 1's "pick one campaign" is the
 * degenerate one-hot case — `playWeek` never special-cases it.
 *
 * See "The manual campaign calendar" in
 * docs/plans/2026-08-12-simulator-design.md.
 */

import { makeRng, sampleNormal, STREAM } from '../bandit/rng'
import type { CampaignId, CampaignWeekResult, WeekAllocation } from './types'
import { CPM, WEEKLY_BUDGET } from './types'

/** Dollars -> impressions at the fixed CPM. $500 all-in -> 20,000 impressions. */
export function impressionsForBudget(dollars: number): number {
  return Math.round((dollars / CPM) * 1000)
}

/**
 * Normal approximation to Binomial(impressions, rate): mean `impressions *
 * rate`, sd `sqrt(impressions * rate * (1 - rate))`. Rounded to an integer,
 * clamped to [0, impressions]. Pure and deterministic in
 * (impressions, rate, seed, week, arm) via the counter-based `hash01`/
 * `makeRng` streams (reuses `sampleNormal`, not a second Box-Muller).
 */
export function sampleInstalls(
  impressions: number,
  rate: number,
  seed: number,
  week: number,
  arm: number,
): number {
  const mean = impressions * rate
  const variance = impressions * rate * (1 - rate)
  // Zero (or degenerate) variance: no draw to make, and it guards
  // sampleNormal against a zero-width distribution producing NaN.
  if (variance <= 0) {
    return Math.round(Math.min(Math.max(mean, 0), impressions))
  }
  const sd = Math.sqrt(variance)
  const rand = makeRng(seed, STREAM.WEEKLY_REWARD, week, arm)
  const raw = mean + sd * sampleNormal(rand)
  return Math.round(Math.min(Math.max(raw, 0), impressions))
}

/**
 * Play one week: split the budget across campaigns per `allocation`, draw
 * each campaign's installs, and total them. `allocation` values must sum to
 * `WEEKLY_BUDGET` (±0.01 for float slop) — this is a real contract the UI
 * must uphold, so a mismatch throws.
 */
export function playWeek(
  week: number,
  allocation: WeekAllocation,
  rates: number[],
  seed: number,
): CampaignWeekResult {
  const sum = Object.values(allocation).reduce((s, v) => s + v, 0)
  if (Math.abs(sum - WEEKLY_BUDGET) > 0.01) {
    throw new Error(
      `Week ${week} allocation must sum to ${WEEKLY_BUDGET}, got ${sum}`,
    )
  }

  const impressions: Record<number, number> = {}
  const installs: Record<number, number> = {}
  let totalInstalls = 0

  for (let arm = 0; arm < rates.length; arm++) {
    const dollars = allocation[arm] ?? 0
    const armImpressions = dollars > 0 ? impressionsForBudget(dollars) : 0
    const armInstalls =
      armImpressions > 0
        ? sampleInstalls(armImpressions, rates[arm], seed, week, arm)
        : 0
    impressions[arm] = armImpressions
    installs[arm] = armInstalls
    totalInstalls += armInstalls
  }

  return { week, allocation, impressions, installs, totalInstalls }
}

/** Phase 1 helper: the full budget on a single campaign, one-hot. */
export function oneHotAllocation(campaignId: CampaignId): WeekAllocation {
  return { [campaignId]: WEEKLY_BUDGET }
}
