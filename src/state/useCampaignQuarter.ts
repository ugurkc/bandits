/**
 * Owns Act 2's budgeted-quarter play-through state: which weeks have been
 * played, the derived phase, and the actions that advance the quarter.
 * Analogous in spirit to `useSimulation.ts` — pure helpers factored out for
 * testability, actions wrapped in `useCallback`.
 *
 * See "Act 2: the budgeted quarter" in
 * docs/plans/2026-08-12-simulator-design.md.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { StrategyId } from '../lib/bandit/types'
import { runBudgetQuarter } from '../lib/campaign/budgetStrategies'
import { playWeek } from '../lib/campaign/simulate'
import type { CampaignWeekResult, WeekAllocation } from '../lib/campaign/types'
import { WEEKS_PER_QUARTER } from '../lib/campaign/types'

/**
 * Act 2 has no pick concept — picking single campaigns is Act 1's trial
 * board (`useTrialDays`). Every unplayed week is a budget split ('budget'),
 * 'auto' while a handoff is appending the strategy's weeks (see `handOff`),
 * and 'complete' once all `WEEKS_PER_QUARTER` weeks are played.
 */
export type CampaignPhase = 'budget' | 'auto' | 'complete'

/**
 * Milliseconds between auto-played handoff weeks appearing on the calendar.
 * The whole remainder of the quarter is computed synchronously on hand-off
 * (pure, testable); this delay only paces the reveal so the reader watches
 * the strategy's allocation concentrate week by week instead of the debrief
 * teleporting in.
 */
export const HANDOFF_WEEK_MS = 180

/**
 * Phase for the next unplayed week: 'budget' through `WEEKS_PER_QUARTER`,
 * 'complete' past it. (The hook substitutes 'auto' while a handoff queue is
 * draining — presentation state, not derivable from the week number.)
 */
export function derivePhase(currentWeek: number): CampaignPhase {
  return currentWeek > WEEKS_PER_QUARTER ? 'complete' : 'budget'
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
  /**
   * Plays `currentWeek`, appends the result, advances. No-op once complete
   * or while a handoff is animating.
   */
  playWeek: (allocation: WeekAllocation) => void
  /**
   * Hands the remaining weeks to a budgeted strategy: computes every
   * remaining week synchronously via `runBudgetQuarter` (seeded with the
   * played weeks' tallies — the strategy finishes *this* quarter), then
   * appends them one per `HANDOFF_WEEK_MS` so the reader watches the
   * strategy play out. `phase` is 'auto' while the queue drains, then
   * 'complete'. `epsilon` reaches the budgeted ε-greedy (defaults to
   * `HANDOFF_EPSILON`); the other strategies ignore it. No-op once complete
   * or while a previous handoff is still animating.
   */
  handOff: (strategyId: StrategyId, epsilon?: number) => void
  /** Back to week 1, weeks=[], handoff cleared, any animation cancelled. */
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
  const [handoff, setHandoff] = useState<{ strategyId: StrategyId; fromWeek: number } | null>(null)
  // Handoff weeks already computed but not yet shown on the calendar;
  // drained one entry per HANDOFF_WEEK_MS by the pacing effect below.
  const [pending, setPending] = useState<CampaignWeekResult[]>([])

  // Rewind whenever the world changes underneath us: track the (rates, seed)
  // identity we last played against, and reset synchronously during render
  // if it moved — the same "derive state from props" rewind pattern
  // useSimulation achieves via effects tied to config identity, without
  // needing an effect here since there's no rAF loop to coordinate.
  // Clearing `pending` also cancels any in-flight handoff animation (the
  // pacing effect's cleanup clears its timeout).
  const ratesKey = rates.join(',')
  const [playedFor, setPlayedFor] = useState({ ratesKey, seed })
  if (playedFor.ratesKey !== ratesKey || playedFor.seed !== seed) {
    setPlayedFor({ ratesKey, seed })
    setWeeks([])
    setHandoff(null)
    setPending([])
  }

  const currentWeek = weeks.length + 1
  const phase: CampaignPhase = pending.length > 0 ? 'auto' : derivePhase(currentWeek)
  const totalInstalls = useMemo(() => sumInstalls(weeks), [weeks])

  // Pacing: while handoff weeks are queued, move the head of the queue onto
  // the calendar every HANDOFF_WEEK_MS. One timeout per step — the effect
  // re-arms each time `pending` shrinks — and the cleanup cancels it, so
  // reset() and the (rates, seed) rewind stop the animation simply by
  // clearing `pending`.
  useEffect(() => {
    if (pending.length === 0) return
    const id = setTimeout(() => {
      setWeeks((prev) => [...prev, pending[0]])
      setPending((prev) => prev.slice(1))
    }, HANDOFF_WEEK_MS)
    return () => clearTimeout(id)
  }, [pending])

  const play = useCallback(
    (allocation: WeekAllocation) => {
      if (pending.length > 0) return
      setWeeks((prev) => {
        const week = prev.length + 1
        if (derivePhase(week) === 'complete') return prev
        const result = playWeek(week, allocation, rates, seed)
        return [...prev, result]
      })
    },
    [rates, seed, pending],
  )

  const handOff = useCallback(
    (strategyId: StrategyId, epsilon?: number) => {
      if (pending.length > 0) return
      const fromWeek = weeks.length + 1
      if (derivePhase(fromWeek) === 'complete') return
      setPending(runBudgetQuarter(strategyId, rates, seed, fromWeek, weeks, epsilon))
      setHandoff({ strategyId, fromWeek })
    },
    [weeks, rates, seed, pending],
  )

  const reset = useCallback(() => {
    setWeeks([])
    setHandoff(null)
    setPending([])
  }, [])

  return {
    weeks,
    currentWeek,
    phase,
    totalInstalls,
    handoff,
    playWeek: play,
    handOff,
    reset,
  }
}
