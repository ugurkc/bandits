/**
 * Act 1's manual trial board: five single-campaign picks, one per day, no
 * budget concept surfaced at all — Act 1 never shows a split.
 *
 * Deliberately its own hook, not `useCampaignQuarter` — see "Two acts — do
 * not merge them" in docs/plans/2026-08-12-simulator-design.md.
 */

import { useCallback, useState } from 'react'
import { STREAM } from '../lib/bandit/rng'
import { realizedOracleInstalls } from '../lib/campaign/budgetStrategies'
import { oneHotAllocation, sampleInstalls } from '../lib/campaign/simulate'
import type { CampaignId, CampaignWeekResult } from '../lib/campaign/types'
import { sumInstalls } from './useCampaignQuarter'

export const TRIAL_DAYS = 5

/**
 * Impressions sampled per trial day. At 300 impressions the standard error
 * of a single day's rate read is ~0.8–1.9pp across the 2–12% rate band
 * (sqrt(p(1-p)/300): 0.81pp at p = 0.02 up to 1.88pp at p = 0.12), which
 * sits close to the ~2pp gap between two merely-different campaigns — so
 * telling them apart from a handful of noisy days is genuinely hard, while
 * a clearly-better campaign is still usually (not certainly) findable by
 * day 5. That gap between "findable" and "certain" is the whole point of
 * Act 1. (Act 2's weekly volume got the same calibration treatment via its
 * CPM: $500/week at the $1000 CPM buys 500 impressions — noisy on purpose
 * too, just at week scale.)
 */
export const TRIAL_DAY_IMPRESSIONS = 300

/** True once every trial day has been played. Pure, so trivially testable. */
export function isTrialComplete(currentDay: number): boolean {
  return currentDay > TRIAL_DAYS
}

/**
 * EXPECTED installs from always playing the single best true arm. Kept for
 * copy that wants the expectation; the left-on-the-table math uses the
 * oracle's REALIZED run instead (see `installsLeftOnTable`). Pure.
 */
export function oracleInstalls(playedDays: number, bestRate: number): number {
  return playedDays * TRIAL_DAY_IMPRESSIONS * bestRate
}

/**
 * Installs given up versus a perfect-foresight oracle's REALIZED run of the
 * same trial days: the best arm's own `sampleInstalls` draws, day by day,
 * under the same seed and Act 1's `STREAM.TRIAL_REWARD` stream
 * (`realizedOracleInstalls`). Common random numbers make the comparison
 * noise-free by construction — a reader who picks the truly best campaign
 * every day lands on exactly the oracle's draws and sees exactly 0, so
 * every positive gap is attributable to picks, not luck. (An earlier
 * version compared against the oracle's *expectation*, which charged a
 * perfect-play reader a positive "cost" ~half the time — an expectation
 * minus a realization blames sampling noise on the reader.) Clamped to
 * >= 0: a lucky pick of a worse arm can still beat the best arm's own
 * unlucky draw on the same day, and that's luck, not something "left on
 * the table". Pure.
 */
export function installsLeftOnTable(
  actualInstalls: number,
  playedDays: number,
  rates: number[],
  seed: number,
): number {
  if (rates.length === 0 || playedDays === 0) return 0
  const oracle = realizedOracleInstalls(rates, seed, playedDays, TRIAL_DAY_IMPRESSIONS, STREAM.TRIAL_REWARD)
  return Math.max(0, oracle - actualInstalls)
}

/**
 * Plays one trial day: the full TRIAL_DAY_IMPRESSIONS on the picked
 * campaign, zero on the others. Reuses `sampleInstalls` directly rather than
 * Act 2's `playWeek` (which is gated on summing to the $500 weekly budget) —
 * Act 1's volume is calibrated for noise, not a literal ad spend, so it
 * doesn't go through the $/CPM translation at all. Draws live in Act 1's
 * own `STREAM.TRIAL_REWARD` stream, so trial day d never replays quarter
 * week d's luck arm-for-arm. Exported for tests (pure).
 */
export function playTrialDay(day: number, campaignId: CampaignId, rates: number[], seed: number): CampaignWeekResult {
  const impressions: Record<number, number> = {}
  const installs: Record<number, number> = {}
  for (let arm = 0; arm < rates.length; arm++) {
    const armImpressions = arm === campaignId ? TRIAL_DAY_IMPRESSIONS : 0
    impressions[arm] = armImpressions
    installs[arm] =
      armImpressions > 0 ? sampleInstalls(armImpressions, rates[arm], seed, day, arm, STREAM.TRIAL_REWARD) : 0
  }
  return {
    week: day,
    allocation: oneHotAllocation(campaignId),
    impressions,
    installs,
    totalInstalls: installs[campaignId] ?? 0,
  }
}

export interface TrialDays {
  /** Played days, index 0 = day 1. */
  days: CampaignWeekResult[]
  /** 1-indexed; the next UNPLAYED day (1..6; 6 = complete). */
  currentDay: number
  complete: boolean
  totalInstalls: number
  /**
   * Installs given up vs. a perfect-foresight oracle's REALIZED run of the
   * same days (exactly 0 under perfect play — see `installsLeftOnTable`).
   */
  installsLeftOnTable: number
  /** Plays `currentDay` on one campaign. No-op once complete. */
  playPick: (campaignId: CampaignId) => void
  /** Back to day 1, days=[]. */
  reset: () => void
}

/**
 * `rates` is the 3 campaigns' true install rates. Changing `rates` or `seed`
 * (e.g. a new scenario) rewinds the trial — mirrors `useCampaignQuarter`'s
 * rewind, since a half-played trial of a world that no longer exists would
 * be misleading.
 */
export function useTrialDays(rates: number[], seed: number): TrialDays {
  const [days, setDays] = useState<CampaignWeekResult[]>([])

  const ratesKey = rates.join(',')
  const [playedFor, setPlayedFor] = useState({ ratesKey, seed })
  if (playedFor.ratesKey !== ratesKey || playedFor.seed !== seed) {
    setPlayedFor({ ratesKey, seed })
    setDays([])
  }

  const currentDay = days.length + 1
  const complete = isTrialComplete(currentDay)
  const totalInstalls = sumInstalls(days)
  const leftOnTable = installsLeftOnTable(totalInstalls, days.length, rates, seed)

  const playPick = useCallback(
    (campaignId: CampaignId) => {
      setDays((prev) => {
        const day = prev.length + 1
        if (isTrialComplete(day)) return prev
        const result = playTrialDay(day, campaignId, rates, seed)
        return [...prev, result]
      })
    },
    [rates, seed],
  )

  const reset = useCallback(() => {
    setDays([])
  }, [])

  return {
    days,
    currentDay,
    complete,
    totalInstalls,
    installsLeftOnTable: leftOnTable,
    playPick,
    reset,
  }
}
