/**
 * Act 1's manual trial board: five single-campaign picks, one per day, no
 * budget concept surfaced at all — Act 1 never shows a split.
 *
 * Deliberately its own hook, not `useCampaignQuarter` — see "Two acts — do
 * not merge them" in docs/plans/2026-08-12-simulator-design.md.
 */

import { useCallback, useState } from 'react'
import { oneHotAllocation, sampleInstalls } from '../lib/campaign/simulate'
import type { CampaignId, CampaignWeekResult } from '../lib/campaign/types'
import { sumInstalls } from './useCampaignQuarter'

export const TRIAL_DAYS = 5

/**
 * Impressions sampled per trial day — deliberately much smaller than Act 2's
 * full daily budget (~20,000 impressions), which reads a rate cleanly enough
 * that even a single day already gives away the winner. At 300 impressions,
 * the standard error of a day's read (~1.5-2pp at the rates this simulator
 * uses) sits close to the gap between two merely-different campaigns, so
 * telling them apart from a handful of noisy days is genuinely hard — a
 * clearly-better campaign is still usually findable, just not with
 * certainty on day one. That gap between "findable" and "certain" is the
 * whole point of Act 1.
 */
export const TRIAL_DAY_IMPRESSIONS = 300

/** True once every trial day has been played. Pure, so trivially testable. */
export function isTrialComplete(currentDay: number): boolean {
  return currentDay > TRIAL_DAYS
}

/** Expected installs from always playing the single best true arm. Pure. */
export function oracleInstalls(playedDays: number, bestRate: number): number {
  return playedDays * TRIAL_DAY_IMPRESSIONS * bestRate
}

/**
 * Installs given up versus an oracle that already knew the best campaign on
 * day one. Never negative — a lucky noisy run can beat the oracle's
 * *expectation*, and that's luck, not something "left on the table". Pure.
 */
export function installsLeftOnTable(actualInstalls: number, playedDays: number, rates: number[]): number {
  if (rates.length === 0 || playedDays === 0) return 0
  const best = Math.max(...rates)
  return Math.max(0, Math.round(oracleInstalls(playedDays, best) - actualInstalls))
}

/**
 * Plays one trial day: the full TRIAL_DAY_IMPRESSIONS on the picked
 * campaign, zero on the others. Reuses `sampleInstalls` directly rather than
 * Act 2's `playWeek` (which is gated on summing to the $500 weekly budget) —
 * Act 1's volume is calibrated for noise, not a literal ad spend, so it
 * doesn't go through the $/CPM translation at all.
 */
function playTrialDay(day: number, campaignId: CampaignId, rates: number[], seed: number): CampaignWeekResult {
  const impressions: Record<number, number> = {}
  const installs: Record<number, number> = {}
  for (let arm = 0; arm < rates.length; arm++) {
    const armImpressions = arm === campaignId ? TRIAL_DAY_IMPRESSIONS : 0
    impressions[arm] = armImpressions
    installs[arm] = armImpressions > 0 ? sampleInstalls(armImpressions, rates[arm], seed, day, arm) : 0
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
  /** Installs given up vs. an oracle that already knew the best campaign. */
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
  const leftOnTable = installsLeftOnTable(totalInstalls, days.length, rates)

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
