import type { ReactNode } from 'react'
import { CAMPAIGN_COLOR_VARS, WEEKLY_BUDGET } from '../lib/campaign/types'
import type { CampaignId, CampaignWeekResult } from '../lib/campaign/types'
import { STRATEGY_COLOR_VARS, STRATEGY_LABELS } from '../lib/bandit/types'
import type { StrategyId } from '../lib/bandit/types'
import { fmtDollars, weekAria, weekSplit } from './weekAria'
import './campaign.css'

export interface StrategyComparison {
  id: StrategyId
  label: string
  colorVar: string
  totalInstalls: number
}

export interface QuarterResultsProps {
  /** All 13 weeks, played (by hand, by handoff, or both). */
  weeks: CampaignWeekResult[]
  handoff: { strategyId: StrategyId; fromWeek: number } | null
  /** Length 3, from PitchOutcome.labels. */
  campaignLabels: string[]
  totalInstalls: number
  /**
   * Vs. the perfect-foresight oracle's REALIZED run of the same quarter
   * (`quarterLeftOnTable` with the seed); computed by the integration layer.
   */
  leftOnTable: number
  /** Each strategy re-run over the full quarter; computed by the integration layer. */
  comparisons: StrategyComparison[]
  /**
   * The oracle's REALIZED total: $500 all-in on the truly best arm every
   * week, through the same draws the reader's weeks used
   * (`realizedOracleQuarter`) — an in-world ceiling, not an expectation.
   */
  oracleInstalls: number
}

const CAMPAIGN_IDS: CampaignId[] = [0, 1, 2]

/**
 * Room reserved at the end of every comparison bar for its ink value label.
 * Fills scale against (100% − reserve), so widths stay exactly proportional
 * and even the max bar never pushes its number out of the row.
 */
const VALUE_RESERVE = '5em'

interface BarSpec {
  key: string
  name: string
  colorVar: string
  value: number
  muted?: boolean
  aria: string
}

/**
 * The quarter's debrief, once week 13 is played: the headline total and the
 * left-on-the-table gap, a per-week allocation timeline (the reader's hedging
 * vs. a strategy's concentration, handoff point marked), and the full-quarter
 * comparison bars. All numbers arrive as props — this component computes
 * nothing but layout.
 */
export function QuarterResults({
  weeks,
  handoff,
  campaignLabels,
  totalInstalls,
  leftOnTable,
  comparisons,
  oracleInstalls,
}: QuarterResultsProps) {
  // The timeline is a div[role=list] rather than an <ol> so the handoff
  // divider can sit between rows WITHOUT being a list item: as a 14th <li>
  // it made screen readers announce "14 items" for a 13-week quarter and
  // shifted every post-handoff week's announced position off its week
  // number. The divider is aria-hidden — its information (which weeks a
  // strategy ran) lives in each auto row's aria-label instead.
  const timelineRows: ReactNode[] = []
  for (const w of weeks) {
    if (handoff !== null && w.week === handoff.fromWeek) {
      timelineRows.push(
        <div key="handoff" className="qr-divider" aria-hidden="true">
          <span
            className="qr-divider-chip"
            style={{ background: STRATEGY_COLOR_VARS[handoff.strategyId] }}
          />
          handed off to {STRATEGY_LABELS[handoff.strategyId]}
        </div>,
      )
    }
    const isAuto = handoff !== null && w.week >= handoff.fromWeek
    const aria = weekAria(w, campaignLabels, isAuto ? STRATEGY_LABELS[handoff.strategyId] : undefined)
    timelineRows.push(
      <div
        key={w.week}
        role="listitem"
        className={`qr-row${isAuto ? ' qr-row--auto' : ''}`}
        style={isAuto ? { borderLeftColor: STRATEGY_COLOR_VARS[handoff.strategyId] } : undefined}
        aria-label={aria}
        title={aria}
      >
        <span className="qr-week">W{w.week}</span>
        {/* Same reason as `.qr-bar-value` below: the segments are width and
            colour only, and browse mode reads a non-interactive listitem's
            contents rather than its aria-label. Without this the timeline
            reads as 13 rows of "W1 312" with no allocation at all — which is
            the one thing this section exists to show. */}
        <span className="sr-only">
          {weekSplit(w, campaignLabels, isAuto ? STRATEGY_LABELS[handoff.strategyId] : undefined)}
        </span>
        <span className="qr-alloc" aria-hidden="true">
          {CAMPAIGN_IDS.filter((id) => (w.allocation[id] ?? 0) > 0).map((id) => (
            <span
              key={id}
              className="qr-seg"
              style={{ background: CAMPAIGN_COLOR_VARS[id], flexGrow: w.allocation[id] ?? 0 }}
            />
          ))}
        </span>
        <span className="qr-installs">{w.totalInstalls.toLocaleString()}</span>
      </div>,
    )
  }

  const bars: BarSpec[] = [
    {
      key: 'you',
      name: 'You',
      // The dedicated reader-series token — NOT var(--accent), which is
      // also Thompson's hue and made the two bars read as twins.
      colorVar: 'var(--you)',
      value: totalInstalls,
      aria: `You: ${totalInstalls.toLocaleString()} installs`,
    },
    ...comparisons.map((c) => ({
      key: c.id,
      name: c.label,
      colorVar: c.colorVar,
      value: c.totalInstalls,
      aria: `${c.label}, run over the full quarter: ${c.totalInstalls.toLocaleString()} installs`,
    })),
    {
      key: 'oracle',
      name: 'Perfect foresight',
      colorVar: 'var(--border-strong)',
      value: oracleInstalls,
      muted: true,
      aria: `Perfect foresight, all-in on the truly best campaign in the same world: ${oracleInstalls.toLocaleString()} installs`,
    },
  ]
  // The realized oracle is a true in-world ceiling for all-in play, but a
  // MIXED split can still (rarely) beat it — other arms' lucky draws that
  // the all-in oracle never touches — so guard the scale with the true max
  // and no bar ever overflows its track.
  const maxInstalls = Math.max(1, ...bars.map((b) => b.value))

  return (
    <section className="qr-wrap" aria-label="Quarter results">
      <header className="qr-head">
        <h3 className="qr-headline">
          Your quarter: <strong>{totalInstalls.toLocaleString()} installs</strong>
        </h3>
        {leftOnTable > 0 ? (
          <p className="qr-left">
            A perfect-foresight planner — {fmtDollars(WEEKLY_BUDGET)} on the truly best campaign
            every week, in this exact world — would have earned about{' '}
            <strong>{leftOnTable.toLocaleString()} more</strong>. That's what this quarter left on
            the table: same weeks, same luck, different splits.
          </p>
        ) : (
          <p className="qr-left">
            A perfect-foresight planner — {fmtDollars(WEEKLY_BUDGET)} on the truly best campaign
            every week, in this exact world — would have done no better. Nothing left on the
            table this quarter.
          </p>
        )}
      </header>

      <div className="qr-section">
        <h4 className="qr-subhead">Where the money went, week by week</h4>
        <div className="qr-timeline" role="list">
          {timelineRows}
        </div>
        <ul className="qr-legend" aria-label="Campaign colors">
          {CAMPAIGN_IDS.map((id) => (
            <li key={id} className="qr-legend-item">
              <span
                className="qr-legend-chip"
                style={{ background: CAMPAIGN_COLOR_VARS[id] }}
                aria-hidden="true"
              />
              {campaignLabels[id]}
            </li>
          ))}
        </ul>
      </div>

      <div className="qr-section">
        <h4 className="qr-subhead">Full-quarter comparison</h4>
        <p className="qr-note">
          Each strategy given all 13 weeks from scratch, in the same world you played. Perfect
          foresight is that world's own ceiling — all-in on the truly best campaign, same draws.
        </p>
        <ul className="qr-compare">
          {bars.map((b) => (
            <li key={b.key} className="qr-bar-row" aria-label={b.aria} title={b.aria}>
              <span className={`qr-bar-name${b.muted ? ' qr-bar-name--muted' : ''}`}>{b.name}</span>
              {/* aria-hidden covers the BAR only, never the number. Hiding
                  the whole area left the row's aria-label as the sole carrier
                  of every figure, and screen readers in browse mode read a
                  non-interactive list item's contents rather than its label —
                  so Act III's payoff screen announced four strategy names and
                  not one install count. */}
              <span className="qr-bar-area">
                <span
                  className="qr-bar-fill"
                  aria-hidden="true"
                  style={{
                    width:
                      b.value > 0
                        ? `max(4px, calc((100% - ${VALUE_RESERVE}) * ${b.value / maxInstalls}))`
                        : '0%',
                    background: b.colorVar,
                  }}
                />
                <span className="qr-bar-value">{b.value.toLocaleString()}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
