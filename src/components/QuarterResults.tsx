import type { ReactNode } from 'react'
import { CAMPAIGN_COLOR_VARS, WEEKLY_BUDGET } from '../lib/campaign/types'
import type { CampaignId, CampaignWeekResult } from '../lib/campaign/types'
import { STRATEGY_COLOR_VARS, STRATEGY_LABELS } from '../lib/bandit/types'
import type { StrategyId } from '../lib/bandit/types'
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
  /** Vs. the perfect-foresight oracle; computed by the integration layer. */
  leftOnTable: number
  /** Each strategy re-run over the full quarter; computed by the integration layer. */
  comparisons: StrategyComparison[]
  /** The oracle's expectation: $500 all-in on the truly best arm every week. */
  oracleInstalls: number
}

const CAMPAIGN_IDS: CampaignId[] = [0, 1, 2]

/**
 * Room reserved at the end of every comparison bar for its ink value label.
 * Fills scale against (100% − reserve), so widths stay exactly proportional
 * and even the max bar never pushes its number out of the row.
 */
const VALUE_RESERVE = '5em'

function fmtDollars(v: number): string {
  return `$${v.toLocaleString()}`
}

/** "Week 5: Alpha $250, Beta $150, Gamma $100, 312 installs" */
function weekAria(w: CampaignWeekResult, campaignLabels: string[]): string {
  const split = CAMPAIGN_IDS.filter((id) => (w.allocation[id] ?? 0) > 0)
    .map((id) => `${campaignLabels[id]} ${fmtDollars(w.allocation[id] ?? 0)}`)
    .join(', ')
  return `Week ${w.week}: ${split}, ${w.totalInstalls.toLocaleString()} installs`
}

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
  const timelineRows: ReactNode[] = []
  for (const w of weeks) {
    if (handoff !== null && w.week === handoff.fromWeek) {
      timelineRows.push(
        <li key="handoff" className="qr-divider">
          <span
            className="qr-divider-chip"
            style={{ background: STRATEGY_COLOR_VARS[handoff.strategyId] }}
            aria-hidden="true"
          />
          handed off to {STRATEGY_LABELS[handoff.strategyId]}
        </li>,
      )
    }
    const isAuto = handoff !== null && w.week >= handoff.fromWeek
    const aria = weekAria(w, campaignLabels)
    timelineRows.push(
      <li
        key={w.week}
        className={`qr-row${isAuto ? ' qr-row--auto' : ''}`}
        style={isAuto ? { borderLeftColor: STRATEGY_COLOR_VARS[handoff.strategyId] } : undefined}
        aria-label={aria}
        title={aria}
      >
        <span className="qr-week">W{w.week}</span>
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
      </li>,
    )
  }

  const bars: BarSpec[] = [
    {
      key: 'you',
      name: 'You',
      colorVar: 'var(--accent)',
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
      aria: `Perfect foresight: ${oracleInstalls.toLocaleString()} installs`,
    },
  ]
  // The oracle is the intended max, but it is an *expectation* — a lucky
  // realized run can beat it, so guard the scale with the true max and no
  // bar ever overflows its track.
  const maxInstalls = Math.max(1, ...bars.map((b) => b.value))

  return (
    <section className="qr-wrap" aria-label="Quarter results">
      <header className="qr-head">
        <h3 className="qr-headline">
          Your quarter: <strong>{totalInstalls.toLocaleString()} installs</strong>
        </h3>
        {leftOnTable > 0 && (
          <p className="qr-left">
            A perfect-foresight planner — {fmtDollars(WEEKLY_BUDGET)} on the truly best campaign
            every week — would have expected about{' '}
            <strong>{leftOnTable.toLocaleString()} more</strong>. That's what this quarter left on
            the table.
          </p>
        )}
      </header>

      <div className="qr-section">
        <h4 className="qr-subhead">Where the money went, week by week</h4>
        <ol className="qr-timeline">{timelineRows}</ol>
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
          Each strategy given all 13 weeks from scratch, in the same world you played.
        </p>
        <ul className="qr-compare">
          {bars.map((b) => (
            <li key={b.key} className="qr-bar-row" aria-label={b.aria} title={b.aria}>
              <span className={`qr-bar-name${b.muted ? ' qr-bar-name--muted' : ''}`}>{b.name}</span>
              <span className="qr-bar-area" aria-hidden="true">
                <span
                  className="qr-bar-fill"
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
