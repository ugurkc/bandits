import { STRATEGY_COLOR_VARS, STRATEGY_IDS, STRATEGY_LABELS } from '../lib/bandit/types'
import type { StrategyId } from '../lib/bandit/types'
import './campaign.css'

export interface HandoffCardProps {
  remainingWeeks: number
  onHandOff: (id: StrategyId) => void
}

/**
 * Act 2's payoff card: after the reader has split enough weeks by hand, offer
 * to hand the rest of the quarter to one of the strategies they met in Act 1
 * — in budgeted form, seeded with the tallies from their own manual weeks, so
 * it finishes *their* quarter rather than starting a fresh one.
 *
 * Pure presentational: the integration layer decides when this shows and what
 * the handoff actually runs; this card just names the offer and fires
 * `onHandOff` with the chosen strategy.
 */
export function HandoffCard({ remainingWeeks, onHandOff }: HandoffCardProps) {
  const weeksNoun = remainingWeeks === 1 ? 'week' : 'weeks'
  return (
    <section className="hc-card" aria-label="Hand the rest of the quarter to a strategy">
      <p className="hc-title">Tired of guessing the split?</p>
      <p className="hc-copy">
        Any of the strategies from the race can finish the remaining{' '}
        <strong>
          {remainingWeeks} {weeksNoun}
        </strong>{' '}
        for you — picking up from the weeks you already played, not starting over. Everything your
        splits have revealed so far becomes its starting evidence.
      </p>
      <div className="hc-buttons">
        {STRATEGY_IDS.map((id) => (
          <button
            key={id}
            type="button"
            className="hc-button"
            aria-label={`Hand the remaining ${remainingWeeks} ${weeksNoun} to ${STRATEGY_LABELS[id]}`}
            onClick={() => onHandOff(id)}
          >
            <span className="hc-chip" style={{ background: STRATEGY_COLOR_VARS[id] }} aria-hidden="true" />
            {STRATEGY_LABELS[id]}
          </button>
        ))}
      </div>
    </section>
  )
}
