/**
 * Act I's manual pilot board: five single-campaign picks, one per week, no
 * budget concept surfaced at all — Act I never shows a split.
 *
 * Deliberately its own hook, not `useCampaignQuarter` — see "Two acts — do
 * not merge them" in docs/plans/2026-08-12-simulator-design.md. The pilot's
 * five weeks precede Act II's 13-week quarter in the fiction; the two live
 * in separate RNG streams so pilot week w never replays quarter week w's
 * luck (see `STREAM.TRIAL_REWARD` below).
 */

import { useCallback, useState } from 'react'
import { STREAM } from '../lib/bandit/rng'
import { realizedOracleInstalls } from '../lib/campaign/budgetStrategies'
import { oneHotAllocation, sampleInstalls } from '../lib/campaign/simulate'
import type { CampaignId, CampaignWeekResult } from '../lib/campaign/types'
import { sumInstalls } from './useCampaignQuarter'

export const TRIAL_WEEKS = 5

/**
 * Impressions sampled per pilot week. At 300 impressions the standard error
 * of a single week's rate read is ~0.8–1.9pp across the 2–12% rate band
 * (sqrt(p(1-p)/300): 0.81pp at p = 0.02 up to 1.88pp at p = 0.12), which
 * sits close to the ~2pp gap between two merely-different campaigns — so
 * telling them apart from a handful of noisy weeks is genuinely hard, while
 * a clearly-better campaign is still usually (not certainly) findable by
 * week 5. That gap between "findable" and "certain" is the whole point of
 * Act I. (Act II's weekly volume got the same calibration treatment via its
 * CPM: $500/week at the $1000 CPM buys 500 impressions — noisy on purpose
 * too, just with a budget attached.)
 */
export const TRIAL_WEEK_IMPRESSIONS = 300

/** True once every pilot week has been played. Pure, so trivially testable. */
export function isTrialComplete(currentWeek: number): boolean {
  return currentWeek > TRIAL_WEEKS
}

/**
 * EXPECTED installs from always playing the single best true arm. Kept for
 * copy that wants the expectation; the left-on-the-table math uses the
 * oracle's REALIZED run instead (see `installsLeftOnTable`). Pure.
 */
export function oracleInstalls(playedWeeks: number, bestRate: number): number {
  return playedWeeks * TRIAL_WEEK_IMPRESSIONS * bestRate
}

/**
 * Installs given up versus a perfect-foresight oracle's REALIZED run of the
 * same pilot weeks: the best arm's own `sampleInstalls` draws, week by week,
 * under the same seed and Act I's `STREAM.TRIAL_REWARD` stream
 * (`realizedOracleInstalls`). Common random numbers make the comparison
 * noise-free by construction — a reader who picks the truly best campaign
 * every week lands on exactly the oracle's draws and sees exactly 0, so
 * every positive gap is attributable to picks, not luck. (An earlier
 * version compared against the oracle's *expectation*, which charged a
 * perfect-play reader a positive "cost" ~half the time — an expectation
 * minus a realization blames sampling noise on the reader.) Clamped to
 * >= 0: a lucky pick of a worse arm can still beat the best arm's own
 * unlucky draw in the same week, and that's luck, not something "left on
 * the table". Pure.
 */
export function installsLeftOnTable(
  actualInstalls: number,
  playedWeeks: number,
  rates: number[],
  seed: number,
): number {
  if (rates.length === 0 || playedWeeks === 0) return 0
  const oracle = realizedOracleInstalls(rates, seed, playedWeeks, TRIAL_WEEK_IMPRESSIONS, STREAM.TRIAL_REWARD)
  return Math.max(0, oracle - actualInstalls)
}

/**
 * Plays one pilot week: the full TRIAL_WEEK_IMPRESSIONS on the picked
 * campaign, zero on the others. Reuses `sampleInstalls` directly rather than
 * Act II's `playWeek` (which is gated on summing to the $500 weekly budget) —
 * the pilot's volume is calibrated for noise, not a literal ad spend, so it
 * doesn't go through the $/CPM translation at all. Draws live in Act I's
 * own `STREAM.TRIAL_REWARD` stream, so pilot week w never replays quarter
 * week w's luck arm-for-arm. Exported for tests (pure).
 */
export function playTrialWeek(week: number, campaignId: CampaignId, rates: number[], seed: number): CampaignWeekResult {
  const impressions: Record<number, number> = {}
  const installs: Record<number, number> = {}
  for (let arm = 0; arm < rates.length; arm++) {
    const armImpressions = arm === campaignId ? TRIAL_WEEK_IMPRESSIONS : 0
    impressions[arm] = armImpressions
    installs[arm] =
      armImpressions > 0 ? sampleInstalls(armImpressions, rates[arm], seed, week, arm, STREAM.TRIAL_REWARD) : 0
  }
  return {
    week,
    allocation: oneHotAllocation(campaignId),
    impressions,
    installs,
    totalInstalls: installs[campaignId] ?? 0,
  }
}

export interface TrialWeeks {
  /** Played weeks, index 0 = week 1. */
  weeks: CampaignWeekResult[]
  /** 1-indexed; the next UNPLAYED week (1..6; 6 = complete). */
  currentWeek: number
  complete: boolean
  totalInstalls: number
  /**
   * Installs given up vs. a perfect-foresight oracle's REALIZED run of the
   * same weeks (exactly 0 under perfect play — see `installsLeftOnTable`).
   */
  installsLeftOnTable: number
  /** Plays `currentWeek` on one campaign. No-op once complete. */
  playPick: (campaignId: CampaignId) => void
  /** Back to week 1, weeks=[]. */
  reset: () => void
}

/**
 * `rates` is the 3 campaigns' true install rates. Changing `rates` or `seed`
 * (e.g. a new scenario) rewinds the pilot — mirrors `useCampaignQuarter`'s
 * rewind, since a half-played pilot of a world that no longer exists would
 * be misleading.
 */
export function useTrialWeeks(rates: number[], seed: number): TrialWeeks {
  const [weeks, setWeeks] = useState<CampaignWeekResult[]>([])

  const ratesKey = rates.join(',')
  const [playedFor, setPlayedFor] = useState({ ratesKey, seed })
  if (playedFor.ratesKey !== ratesKey || playedFor.seed !== seed) {
    setPlayedFor({ ratesKey, seed })
    setWeeks([])
  }

  const currentWeek = weeks.length + 1
  const complete = isTrialComplete(currentWeek)
  const totalInstalls = sumInstalls(weeks)
  const leftOnTable = installsLeftOnTable(totalInstalls, weeks.length, rates, seed)

  const playPick = useCallback(
    (campaignId: CampaignId) => {
      setWeeks((prev) => {
        const week = prev.length + 1
        if (isTrialComplete(week)) return prev
        const result = playTrialWeek(week, campaignId, rates, seed)
        return [...prev, result]
      })
    },
    [rates, seed],
  )

  const reset = useCallback(() => {
    setWeeks([])
  }, [])

  return {
    weeks,
    currentWeek,
    complete,
    totalInstalls,
    installsLeftOnTable: leftOnTable,
    playPick,
    reset,
  }
}
