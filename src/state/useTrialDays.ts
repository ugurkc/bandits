/**
 * Act 1's manual trial board: five single-campaign picks, one per day, no
 * budget concept surfaced at all — Act 1 never shows a split. Reuses the
 * Act-2-shaped reward engine unchanged (a "day" is just `playWeek` with a
 * one-hot allocation; the `week` parameter is only an RNG stream index).
 *
 * Deliberately its own hook, not `useCampaignQuarter` — see "Two acts — do
 * not merge them" in docs/plans/2026-08-12-simulator-design.md.
 */

import { useCallback, useState } from 'react'
import { oneHotAllocation, playWeek } from '../lib/campaign/simulate'
import type { CampaignId, CampaignWeekResult } from '../lib/campaign/types'
import { sumInstalls } from './useCampaignQuarter'

export const TRIAL_DAYS = 5

/** True once every trial day has been played. Pure, so trivially testable. */
export function isTrialComplete(currentDay: number): boolean {
  return currentDay > TRIAL_DAYS
}

export interface TrialDays {
  /** Played days, index 0 = day 1. */
  days: CampaignWeekResult[]
  /** 1-indexed; the next UNPLAYED day (1..6; 6 = complete). */
  currentDay: number
  complete: boolean
  totalInstalls: number
  /** Plays `currentDay` with the full "budget" on one campaign. No-op once complete. */
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

  const playPick = useCallback(
    (campaignId: CampaignId) => {
      setDays((prev) => {
        const day = prev.length + 1
        if (isTrialComplete(day)) return prev
        const result = playWeek(day, oneHotAllocation(campaignId), rates, seed)
        return [...prev, result]
      })
    },
    [rates, seed],
  )

  const reset = useCallback(() => {
    setDays([])
  }, [])

  return { days, currentDay, complete, totalInstalls, playPick, reset }
}
