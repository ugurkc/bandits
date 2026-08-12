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
import type { StrategyId } from '../lib/bandit/types'
import { runBudgetQuarter } from '../lib/campaign/budgetStrategies'
import { oneHotAllocation, playWeek } from '../lib/campaign/simulate'
import type { CampaignId, CampaignWeekResult, WeekAllocation } from '../lib/campaign/types'
import { PICK_PHASE_WEEKS, WEEKS_PER_QUARTER } from '../lib/campaign/types'

export type CampaignPhase = 'pick' | 'budget' | 'complete'

/**
 * Phase for the next unplayed week: weeks 1..pickWeeks are single-campaign
 * picks, weeks after that through WEEKS_PER_QUARTER are budget splits, and
 * once every week is played the quarter is complete. Act 2 passes
 * `pickWeeks = 0` — every week is a budget split there, because the pick
 * phase is Act 1's job.
 */
export function derivePhase(currentWeek: number, pickWeeks: number = PICK_PHASE_WEEKS): CampaignPhase {
  if (currentWeek > WEEKS_PER_QUARTER) return 'complete'
  if (currentWeek <= pickWeeks) return 'pick'
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
  /** Set once the remaining weeks were handed to a budgeted strategy. */
  handoff: { strategyId: StrategyId; fromWeek: number } | null
  /** Plays `currentWeek`, appends the result, advances. No-op once complete. */
  playWeek: (allocation: WeekAllocation) => void
  /** Convenience: playWeek(oneHotAllocation(campaignId)). */
  playPick: (campaignId: CampaignId) => void
  /**
   * Hands the remaining weeks to a budgeted strategy: runs it from
   * `currentWeek` seeded with the played weeks' tallies and appends every
   * auto-played week (the quarter becomes complete). No-op once complete.
   */
  handOff: (strategyId: StrategyId) => void
  /** Back to week 1, weeks=[], handoff cleared. */
  reset: () => void
}

/**
 * `rates` is the 3 campaigns' true install rates. Changing `rates` or `seed`
 * (e.g. a new scenario) rewinds the quarter — mirrors how `useSimulation`
 * rewinds on config-relevant changes, since a half-played quarter of a world
 * that no longer exists would be misleading.
 */
export function useCampaignQuarter(
  rates: number[],
  seed: number,
  pickWeeks: number = PICK_PHASE_WEEKS,
): CampaignQuarter {
  const [weeks, setWeeks] = useState<CampaignWeekResult[]>([])
  const [handoff, setHandoff] = useState<{ strategyId: StrategyId; fromWeek: number } | null>(null)

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
    setHandoff(null)
  }

  const currentWeek = weeks.length + 1
  const phase = derivePhase(currentWeek, pickWeeks)
  const totalInstalls = useMemo(() => sumInstalls(weeks), [weeks])

  const play = useCallback(
    (allocation: WeekAllocation) => {
      setWeeks((prev) => {
        const week = prev.length + 1
        if (derivePhase(week, pickWeeks) === 'complete') return prev
        const result = playWeek(week, allocation, rates, seed)
        return [...prev, result]
      })
    },
    [rates, seed, pickWeeks],
  )

  const playPick = useCallback(
    (campaignId: CampaignId) => {
      play(oneHotAllocation(campaignId))
    },
    [play],
  )

  const handOff = useCallback(
    (strategyId: StrategyId) => {
      if (derivePhase(weeks.length + 1, pickWeeks) === 'complete') return
      const fromWeek = weeks.length + 1
      const autoWeeks = runBudgetQuarter(strategyId, rates, seed, fromWeek, weeks)
      setWeeks([...weeks, ...autoWeeks])
      setHandoff({ strategyId, fromWeek })
    },
    [weeks, rates, seed, pickWeeks],
  )

  const reset = useCallback(() => {
    setWeeks([])
    setHandoff(null)
  }, [])

  return {
    weeks,
    currentWeek,
    phase,
    totalInstalls,
    handoff,
    playWeek: play,
    playPick,
    handOff,
    reset,
  }
}
