import { Fragment, memo } from 'react'
import type { StrategyId } from '../lib/bandit/types'
import './playground.css'

export interface ArmCardRow {
  id: StrategyId
  label: string
  colorVar: string
  pulls: number
  /** This strategy's share of its own pulls that went to this arm, 0–1. */
  share: number
  /** Observed conversion-rate estimate, or null before the first pull. */
  estimate: number | null
}

export interface ArmCardProps {
  index: number
  label: string
  trueRate: number
  revealed: boolean
  best: boolean
  rows: ArmCardRow[]
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`

/**
 * One offer variant: the (reveal-able) true rate up top, then one row per
 * strategy showing how much of that strategy's traffic this arm gets and
 * what the strategy currently believes the rate is.
 *
 * Memoized: the rows array keeps its identity between throttled stats
 * updates, so cards skip the per-playhead-frame re-render entirely.
 */
export const ArmCard = memo(function ArmCard({
  index,
  label,
  trueRate,
  revealed,
  best,
  rows,
}: ArmCardProps) {
  return (
    <section className="ac-card" aria-label={`Arm ${index + 1}: ${label}`}>
      <header className="ac-header">
        <span className="ac-label">{label}</span>
        {revealed && best && <span className="ac-badge">best</span>}
        <span
          className={`ac-rate${revealed ? '' : ' ac-rate--hidden'}`}
          role="img"
          aria-label={revealed ? `True conversion rate ${pct(trueRate)}` : 'True rate hidden'}
          title={revealed ? 'True conversion rate' : 'True rate hidden'}
        >
          {revealed ? pct(trueRate) : '?'}
        </span>
      </header>
      <div className="ac-rows">
        {rows.map((row) => (
          <Fragment key={row.id}>
            <span className="ac-chip" style={{ background: row.colorVar }} aria-hidden="true" />
            <span className="ac-strategy">{row.label}</span>
            <span
              className="ac-bar"
              role="img"
              aria-label={`${row.label} sends ${pct(row.share)} of its pulls here`}
            >
              {/* Nonzero shares keep a 4px visual floor so tiny allocations
                  stay visible; zero share intentionally renders an empty
                  track, distinguishing "no traffic" from "a sliver". */}
              <span
                className="ac-bar-fill"
                style={{
                  width:
                    row.share > 0
                      ? `max(4px, ${Math.min(100, row.share * 100)}%)`
                      : '0%',
                  background: row.colorVar,
                }}
              />
            </span>
            <span className="ac-meta" title="Pulls">
              <span className="sr-only">pulls </span>
              {row.pulls.toLocaleString()}
            </span>
            <span className="ac-meta" title="Estimated conversion rate">
              <span className="sr-only">estimate </span>
              {row.estimate === null ? 'N/A' : pct(row.estimate)}
            </span>
          </Fragment>
        ))}
      </div>
    </section>
  )
})
