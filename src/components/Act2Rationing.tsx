import { useEffect, useMemo, useRef, useState } from 'react'
import { STRATEGY_COLOR_VARS, STRATEGY_IDS, STRATEGY_LABELS } from '../lib/bandit/types'
import {
  quarterLeftOnTable,
  realizedOracleQuarter,
  runBudgetQuarter,
} from '../lib/campaign/budgetStrategies'
import { WEEKS_PER_QUARTER } from '../lib/campaign/types'
import type { CampaignQuarter } from '../state/useCampaignQuarter'
import { sumInstalls } from '../state/useCampaignQuarter'
import { BudgetSplitPanel } from './BudgetSplitPanel'
import { CampaignCalendar } from './CampaignCalendar'
import { HandoffCard } from './HandoffCard'
import { QuarterResults } from './QuarterResults'
import type { StrategyComparison } from './QuarterResults'

/**
 * Act II's handoff gate (the design doc's `HANDOFF_MIN_WEEKS`): the reader
 * must split at least this many weeks by hand — feeling the tension —
 * before the card offering to hand the rest to a strategy appears.
 */
const HANDOFF_MIN_WEEKS = 2

export interface Act2RationingProps {
  quarter: CampaignQuarter
  campaignLabels: string[]
  /** The 3 campaigns' true install rates (pitched or example-seeded). */
  campaignRates: number[]
  seed: number
  /** The reader's race-screen ε — threaded into the budgeted ε-greedy. */
  epsilon: number
  /**
   * True when the reader landed here without scoring pitches in Act I —
   * the quarter runs on the example campaigns instead, and a banner says so.
   */
  usingExample: boolean
  exampleScenarioTitle: string
  onGoToAct1: () => void
  onGoToAct3: () => void
  announce: (message: string) => void
}

/**
 * Act II — Rationing: the budgeted quarter. Every week the reader splits
 * $500 across all three campaigns; after feeling the hedge-vs-learn tension
 * for a couple of weeks, they can hand the remainder to one of the
 * strategies from Act I, seeded with their own accumulated data.
 */
export function Act2Rationing({
  quarter,
  campaignLabels,
  campaignRates,
  seed,
  epsilon,
  usingExample,
  exampleScenarioTitle,
  onGoToAct1,
  onGoToAct3,
  announce,
}: Act2RationingProps) {
  const toplineRef = useRef<HTMLDivElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)

  // The ε the reader's handoff was actually played at. Recorded at handoff
  // time so the results comparison can't silently desync from their own run
  // when the race-screen slider moves afterwards; cleared when the quarter's
  // rewind clears the handoff.
  const [handoffEpsilon, setHandoffEpsilon] = useState<number | null>(null)
  useEffect(() => {
    if (quarter.handoff === null && handoffEpsilon !== null) setHandoffEpsilon(null)
  }, [quarter.handoff, handoffEpsilon])
  const comparisonEpsilon = handoffEpsilon ?? epsilon

  // Quarter completion — fires whether the animated handoff drained the last
  // week or the reader played week 13 by hand. When a handoff drained the
  // final weeks, its confirmation is folded into this message: both go
  // through the shell's single polite region, and a completion arriving
  // HANDOFF_WEEK_MS later would otherwise replace the handoff announcement
  // before it could be voiced.
  const prevPhaseRef = useRef(quarter.phase)
  useEffect(() => {
    const prevPhase = prevPhaseRef.current
    prevPhaseRef.current = quarter.phase
    if (quarter.phase === 'complete' && prevPhase !== 'complete') {
      const total = quarter.totalInstalls.toLocaleString()
      announce(
        quarter.handoff
          ? `${STRATEGY_LABELS[quarter.handoff.strategyId]} played the remaining weeks — quarter complete, ${total} installs.`
          : `Quarter complete — ${total} installs.`,
      )
      resultsRef.current?.focus()
    }
  }, [quarter.phase, quarter.totalInstalls, quarter.handoff, announce])

  // The full-quarter comparison: each budgeted strategy re-run over all 13
  // weeks from scratch, in the same deterministic world the reader played.
  // The budgeted ε-greedy gets the ε the reader's own handoff ran at (their
  // race-screen ε at handoff time) — so "ε-greedy" names one strategy
  // everywhere, even if the slider moves later.
  const comparisons = useMemo<StrategyComparison[]>(
    () =>
      STRATEGY_IDS.map((id) => ({
        id,
        label: STRATEGY_LABELS[id],
        colorVar: STRATEGY_COLOR_VARS[id],
        totalInstalls: sumInstalls(runBudgetQuarter(id, campaignRates, seed, 1, [], comparisonEpsilon)),
      })),
    [campaignRates, seed, comparisonEpsilon],
  )

  const handoffMarker = quarter.handoff
    ? {
        fromWeek: quarter.handoff.fromWeek,
        colorVar: STRATEGY_COLOR_VARS[quarter.handoff.strategyId],
        label: STRATEGY_LABELS[quarter.handoff.strategyId],
      }
    : null

  return (
    <div className="pg">
      <div className="pg-topline" ref={toplineRef} tabIndex={-1}>
        <span className="pg-context">
          The quarter starts now. Split $500 across your three campaigns each week. Hedge and
          you learn slowly; concentrate and you might be feeding the wrong ad.
        </span>
      </div>

      {usingExample && (
        <section className="pg-example-note" aria-label="Example campaigns in play">
          <p className="pg-example-note-copy">
            You're rationing with three <strong>example campaigns</strong> for the{' '}
            {exampleScenarioTitle.toLowerCase()} scenario — score your own pitches in Act I and
            a fresh quarter starts with them.
          </p>
          <button type="button" className="pp-skip" onClick={onGoToAct1}>
            ← Pitch your own in Act I
          </button>
        </section>
      )}

      <CampaignCalendar quarter={quarter} campaignLabels={campaignLabels} handoff={handoffMarker}>
        {quarter.phase === 'budget' && (
          <BudgetSplitPanel
            week={quarter.currentWeek}
            campaignLabels={campaignLabels}
            onCommit={quarter.playWeek}
          />
        )}
      </CampaignCalendar>

      {/* Only while the reader is splitting by hand: during 'auto' the
          handoff animation is draining (a second hand-off would no-op but
          the offer would be misleading), and at 'complete' it's moot. */}
      {quarter.weeks.length >= HANDOFF_MIN_WEEKS && quarter.phase === 'budget' && (
        <HandoffCard
          remainingWeeks={WEEKS_PER_QUARTER - quarter.weeks.length}
          onHandOff={(id) => {
            // The reader's race-screen ε rides along, so the budgeted
            // ε-greedy is the strategy they tuned, not a silent 0.1.
            quarter.handOff(id, epsilon)
            setHandoffEpsilon(epsilon)
            announce(`Handed off to ${STRATEGY_LABELS[id]} — playing the remaining weeks.`)
            // The activation unmounts this card (phase leaves 'budget') —
            // park focus on the topline while the animation drains rather
            // than letting it fall to <body>.
            toplineRef.current?.focus()
          }}
        />
      )}

      {quarter.phase === 'complete' && (
        <>
          <div ref={resultsRef} tabIndex={-1} className="pg-view-focus">
            <QuarterResults
              weeks={quarter.weeks}
              handoff={quarter.handoff}
              campaignLabels={campaignLabels}
              totalInstalls={quarter.totalInstalls}
              leftOnTable={quarterLeftOnTable(
                quarter.totalInstalls,
                WEEKS_PER_QUARTER,
                campaignRates,
                seed,
              )}
              comparisons={comparisons}
              oracleInstalls={realizedOracleQuarter(campaignRates, seed)}
            />
          </div>
          <div className="pg-act2-actions">
            <button
              type="button"
              className="ct-button"
              onClick={() => {
                quarter.reset()
                announce('Quarter restarted — back to week 1.')
                toplineRef.current?.focus()
              }}
            >
              Restart the quarter
            </button>
            <button type="button" className="ct-button" onClick={onGoToAct3}>
              Act III — Learning from the Best →
            </button>
          </div>
        </>
      )}
    </div>
  )
}
