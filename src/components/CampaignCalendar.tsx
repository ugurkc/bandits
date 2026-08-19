import type { ReactNode } from 'react'
import type { CampaignQuarter } from '../state/useCampaignQuarter'
import { CAMPAIGN_COLOR_VARS, WEEKS_PER_QUARTER } from '../lib/campaign/types'
import type { CampaignId } from '../lib/campaign/types'
import { weekAria, weekSplit } from './weekAria'
import './campaign.css'

export interface CampaignCalendarProps {
  quarter: CampaignQuarter
  /** Length 3, from PitchOutcome.labels. */
  campaignLabels: string[]
  /**
   * The per-week allocation UI (a `BudgetSplitPanel`) is composed by the
   * integration layer, not this component — it's handed in as children and
   * this component just renders it inside the current-week cell while
   * `phase === 'budget'`. A children slot beats a render-prop or a second
   * callback here: the integration layer already owns the panel's props
   * (week, labels, onCommit), so it can just build the element itself.
   */
  children?: ReactNode
  /**
   * Act 2 handoff marker: once set, played weeks at or after `fromWeek`
   * render as strategy-run — a subtle 2px left border in the strategy's
   * color and a ", run by {label}" suffix on the cell's aria-label. Purely
   * presentational; nothing else about the calendar changes.
   */
  handoff?: { fromWeek: number; colorVar: string; label: string } | null
}

const CAMPAIGN_IDS: CampaignId[] = [0, 1, 2]

/**
 * The 13-week grid. Weeks unlock sequentially: played weeks lock in and show
 * their result, the current week is the only interactive one, future weeks
 * stay greyed. Every week is a budget split — the current cell hosts
 * `children` (the BudgetSplitPanel) while `phase === 'budget'`; picking a
 * single campaign was Act 1's trial board, never this calendar. During a
 * handoff (`phase === 'auto'`) the panel is withheld by the integration
 * layer and played cells simply append as the strategy's queued weeks drain.
 */
export function CampaignCalendar({ quarter, campaignLabels, children, handoff }: CampaignCalendarProps) {
  const { weeks, currentWeek, phase } = quarter

  const weekCells = []
  for (let week = 1; week <= WEEKS_PER_QUARTER; week++) {
    const played = weeks[week - 1]
    const isCurrent = week === currentWeek && phase !== 'complete'
    const isFuture = !played && !isCurrent

    if (played) {
      const armIds = CAMPAIGN_IDS.filter((id) => (played.allocation[id] ?? 0) > 0)
      const isAuto = handoff != null && week >= handoff.fromWeek
      weekCells.push(
        <li
          key={week}
          className={`cc-cell cc-cell--played${isAuto ? ' cc-cell--auto' : ''}`}
          style={isAuto ? { borderLeftColor: handoff.colorVar } : undefined}
          aria-label={weekAria(played, campaignLabels, isAuto ? handoff.label : undefined)}
        >
          <span className="cc-cell-week">Week {week}</span>
          {/* The chips encode the split by width and colour alone, and the
              row's aria-label is skipped by browse mode on a non-interactive
              listitem — so the dollars need a real text carrier too. */}
          <span className="sr-only">
            {weekSplit(played, campaignLabels, isAuto ? handoff.label : undefined)}
          </span>
          <span className="cc-cell-chips" aria-hidden="true">
            {armIds.map((id) => (
              <span
                key={id}
                className="cc-cell-chip"
                style={{
                  background: CAMPAIGN_COLOR_VARS[id],
                  flexGrow: played.allocation[id] ?? 0,
                }}
              />
            ))}
          </span>
          <span className="cc-cell-installs">
            {played.totalInstalls.toLocaleString()} <span className="cc-cell-unit">installs</span>
          </span>
        </li>,
      )
      continue
    }

    if (isCurrent) {
      const isAuto = phase === 'auto' && handoff != null
      weekCells.push(
        <li
          key={week}
          className={`cc-cell cc-cell--current${phase === 'budget' ? ' cc-cell--budget' : ''}`}
          aria-label={
            phase === 'budget'
              ? `Week ${week}: current week — split the budget below`
              : isAuto
                ? `Week ${week}: being played by ${handoff.label}`
                : `Week ${week}: current week`
          }
        >
          <span className="cc-cell-week">Week {week}</span>
          {phase === 'budget' ? (
            <div className="cc-cell-budget-slot">{children}</div>
          ) : (
            <span className="cc-cell-current-hint">
              {isAuto ? `${handoff.label} is playing…` : 'Current week'}
            </span>
          )}
        </li>,
      )
      continue
    }

    if (isFuture) {
      weekCells.push(
        <li key={week} className="cc-cell cc-cell--future" aria-disabled="true" aria-label={`Week ${week}: locked`}>
          <span className="cc-cell-week">Week {week}</span>
        </li>,
      )
    }
  }

  return (
    <section className="cc-wrap">
      <div className="cc-grid-wrap">
        <ol className="cc-grid" aria-label="13-week campaign calendar">
          {weekCells}
        </ol>
      </div>
    </section>
  )
}
