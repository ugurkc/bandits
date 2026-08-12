/**
 * Owns the manual campaign calendar's play-through state: which weeks have
 * been played, the derived phase, and the actions that advance the quarter.
 * Analogous in spirit to `useSimulation.ts` — pure helpers factored out for
 * testability, actions wrapped in `useCallback`.
 *
 * See "The manual campaign calendar" in
 * docs/plans/2026-08-12-simulator-design.md.
 */

import { useCallback, useMemo, useState } from 'react'
import { oneHotAllocation, playWeek } from '../lib/campaign/simulate'
import type { CampaignId, CampaignWeekResult, WeekAllocation } from '../lib/campaign/types'
import { PICK_PHASE_WEEKS, WEEKS_PER_QUARTER } from '../lib/campaign/types'

export type CampaignPhase = 'pick' | 'budget' | 'complete'

/**
 * Phase for the next unplayed week: weeks 1..PICK_PHASE_WEEKS are single-
 * campaign picks, weeks after that through WEEKS_PER_QUARTER are budget
 * splits, and once every week is played the quarter is complete.
 */
export function derivePhase(currentWeek: number): CampaignPhase {
  if (currentWeek > WEEKS_PER_QUARTER) return 'complete'
  if (currentWeek <= PICK_PHASE_WEEKS) return 'pick'
  return 'budget'
}

/** Sum of every played week's totalInstalls. Pure, so trivially testable. */
export function sumInstalls(weeks: CampaignWeekResult[]): number {
  return weeks.reduce((sum, w) => sum + w.totalInstalls, 0)
}

export interface CampaignQuarter {
  /** Played weeks, index 0 = week 1. */
  weeks: CampaignWeekResult[]
  /** 1-indexed; the next UNPLAYED week (1..14; 14 = quarter complete). */
  currentWeek: number
  phase: CampaignPhase
  totalInstalls: number
  /** Plays `currentWeek`, appends the result, advances. No-op once complete. */
  playWeek: (allocation: WeekAllocation) => void
  /** Convenience: playWeek(oneHotAllocation(campaignId)). */
  playPick: (campaignId: CampaignId) => void
  /** Back to week 1, weeks=[]. */
  reset: () => void
}

/**
 * `rates` is the 3 campaigns' true install rates. Changing `rates` or `seed`
 * (e.g. a new scenario) rewinds the quarter — mirrors how `useSimulation`
 * rewinds on config-relevant changes, since a half-played quarter of a world
 * that no longer exists would be misleading.
 */
export function useCampaignQuarter(rates: number[], seed: number): CampaignQuarter {
  const [weeks, setWeeks] = useState<CampaignWeekResult[]>([])

  // Rewind whenever the world changes underneath us: track the (rates, seed)
  // identity we last played against, and reset synchronously during render
  // if it moved — the same "derive state from props" rewind pattern
  // useSimulation achieves via effects tied to config identity, without
  // needing an effect here since there's no rAF loop to coordinate.
  const ratesKey = rates.join(',')
  const [playedFor, setPlayedFor] = useState({ ratesKey, seed })
  if (playedFor.ratesKey !== ratesKey || playedFor.seed !== seed) {
    setPlayedFor({ ratesKey, seed })
    setWeeks([])
  }

  const currentWeek = weeks.length + 1
  const phase = derivePhase(currentWeek)
  const totalInstalls = useMemo(() => sumInstalls(weeks), [weeks])

  const play = useCallback(
    (allocation: WeekAllocation) => {
      setWeeks((prev) => {
        const week = prev.length + 1
        if (derivePhase(week) === 'complete') return prev
        const result = playWeek(week, allocation, rates, seed)
        return [...prev, result]
      })
    },
    [rates, seed],
  )

  const playPick = useCallback(
    (campaignId: CampaignId) => {
      play(oneHotAllocation(campaignId))
    },
    [play],
  )

  const reset = useCallback(() => {
    setWeeks([])
  }, [])

  return {
    weeks,
    currentWeek,
    phase,
    totalInstalls,
    playWeek: play,
    playPick,
    reset,
  }
}
