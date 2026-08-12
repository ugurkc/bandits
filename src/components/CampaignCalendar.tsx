import { useCallback, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import type { CampaignQuarter } from '../state/useCampaignQuarter'
import { CAMPAIGN_COLOR_VARS, WEEKS_PER_QUARTER } from '../lib/campaign/types'
import type { CampaignId } from '../lib/campaign/types'
import './campaign.css'

export interface CampaignCalendarProps {
  quarter: CampaignQuarter
  /** Length 3, from PitchOutcome.labels. */
  campaignLabels: string[]
  /** Phase 1: drop/select a campaign onto the current (unlocked) week. */
  onPickWeek: (campaignId: CampaignId) => void
  /**
   * Phase 2's per-week allocation UI (a `BudgetSplitPanel`) is composed by
   * the integration layer, not this component — it's handed in as children
   * and this component just renders it inside the current-week cell while
   * `phase === 'budget'`. A children slot beats a render-prop or a second
   * callback here: the integration layer already owns the panel's props
   * (week, labels, onCommit), so it can just build the element itself.
   */
  children?: ReactNode
}

const CAMPAIGN_IDS: CampaignId[] = [0, 1, 2]

interface DragState {
  campaignId: CampaignId
  x: number
  y: number
  startX: number
  startY: number
}

/** Movement, in CSS px, below which a pointerdown/up pair counts as a tap
 * (select) rather than a drag — mouse/touch users get both gestures from
 * the same pointer stream. */
const DRAG_THRESHOLD = 6

/**
 * The 13-week grid. Weeks unlock sequentially: played weeks lock in and show
 * their result, the current week is the only interactive one, future weeks
 * stay greyed. During the pick phase (weeks 1-4) three campaign cards sit
 * above the grid — drag one onto the current week, or select-then-confirm
 * as a full pointer-free fallback. During the budget phase the current cell
 * hosts `children` (the BudgetSplitPanel) instead.
 */
export function CampaignCalendar({ quarter, campaignLabels, onPickWeek, children }: CampaignCalendarProps) {
  const { weeks, currentWeek, phase } = quarter
  const [selected, setSelected] = useState<CampaignId | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const dropRef = useRef<HTMLLIElement>(null)
  // Set true by a pointerup that already handled a tap-as-select so the
  // browser's trailing synthetic click (fired for the same interaction)
  // doesn't toggle the selection a second time. Left false for clicks that
  // never went through a pointer event at all — e.g. switch access — so
  // that path keeps working as a true fallback.
  const suppressClickRef = useRef(false)

  // Clear any stale selection/drag once the pick phase ends (week advances
  // past PICK_PHASE_WEEKS, or the reader lands on 'complete').
  const inPickPhase = phase === 'pick'

  const confirmPick = useCallback(
    (campaignId: CampaignId) => {
      onPickWeek(campaignId)
      setSelected(null)
      setDrag(null)
    },
    [onPickWeek],
  )

  const isOverDropZone = (clientX: number, clientY: number) => {
    const rect = dropRef.current?.getBoundingClientRect()
    if (!rect) return false
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
  }

  const toggleSelected = useCallback((campaignId: CampaignId) => {
    setSelected((prev) => (prev === campaignId ? null : campaignId))
  }, [])

  const onCardPointerDown = (campaignId: CampaignId) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!inPickPhase) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ campaignId, x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY })
  }

  const onCardPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag) return
    setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY } : d))
  }

  const onCardPointerUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag) return
    const moved = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY)
    if (moved >= DRAG_THRESHOLD) {
      if (isOverDropZone(e.clientX, e.clientY)) {
        confirmPick(drag.campaignId)
      } else {
        setDrag(null)
      }
      return
    }
    // Too little movement to be a drag: treat it as a tap that selects the
    // card, and swallow the click event still to come for this interaction.
    suppressClickRef.current = true
    setDrag(null)
    toggleSelected(drag.campaignId)
  }

  const onCardClick = (campaignId: CampaignId) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
    toggleSelected(campaignId)
  }

  const onCardKeyDown = (campaignId: CampaignId) => (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      toggleSelected(campaignId)
    }
  }

  const onDropZoneActivate = () => {
    if (selected !== null) confirmPick(selected)
  }

  const onDropZoneKeyDown = (e: ReactKeyboardEvent<HTMLLIElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onDropZoneActivate()
    }
  }

  const weekCells = []
  for (let week = 1; week <= WEEKS_PER_QUARTER; week++) {
    const played = weeks[week - 1]
    const isCurrent = week === currentWeek && phase !== 'complete'
    const isFuture = !played && !isCurrent

    if (played) {
      const armIds = CAMPAIGN_IDS.filter((id) => (played.allocation[id] ?? 0) > 0)
      weekCells.push(
        <li key={week} className="cc-cell cc-cell--played" aria-label={`Week ${week}: played`}>
          <span className="cc-cell-week">Week {week}</span>
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
      weekCells.push(
        <li
          key={week}
          ref={dropRef}
          className={`cc-cell cc-cell--current${phase === 'budget' ? ' cc-cell--budget' : ''}`}
          role={inPickPhase ? 'button' : undefined}
          tabIndex={inPickPhase ? 0 : undefined}
          aria-label={
            inPickPhase
              ? selected !== null
                ? `Run ${campaignLabels[selected]} in week ${week}`
                : `Week ${week}: current week. Select a campaign above, then activate this cell to run it here, or drag a campaign card here.`
              : `Week ${week}: open budget panel`
          }
          onClick={inPickPhase ? onDropZoneActivate : undefined}
          onKeyDown={inPickPhase ? onDropZoneKeyDown : undefined}
        >
          <span className="cc-cell-week">Week {week}</span>
          {phase === 'budget' ? (
            <div className="cc-cell-budget-slot">{children}</div>
          ) : (
            <span className="cc-cell-current-hint">
              {selected !== null ? `Drop ${campaignLabels[selected]} here` : 'Current week'}
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
      {inPickPhase && (
        <div className="cc-picker" role="group" aria-label="Campaigns you can run this week">
          <p className="cc-picker-hint">
            Drag a campaign onto week {currentWeek}, or select one below, then choose the week.
          </p>
          <div className="cc-cards">
            {CAMPAIGN_IDS.map((id) => (
              <button
                key={id}
                type="button"
                className={`cc-card${selected === id ? ' cc-card--selected' : ''}`}
                style={{ borderColor: selected === id ? CAMPAIGN_COLOR_VARS[id] : undefined }}
                aria-pressed={selected === id}
                aria-label={`${campaignLabels[id]} — select, then choose week ${currentWeek}; or drag onto week ${currentWeek}`}
                onPointerDown={onCardPointerDown(id)}
                onPointerMove={onCardPointerMove}
                onPointerUp={onCardPointerUp}
                onClick={() => onCardClick(id)}
                onKeyDown={onCardKeyDown(id)}
              >
                <span className="cc-card-chip" style={{ background: CAMPAIGN_COLOR_VARS[id] }} aria-hidden="true" />
                <span className="cc-card-label">{campaignLabels[id]}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="cc-grid-wrap">
        <ol className="cc-grid" aria-label="13-week campaign calendar">
          {weekCells}
        </ol>
      </div>

      {drag && (
        <div className="cc-drag-ghost" style={{ left: drag.x, top: drag.y }} aria-hidden="true">
          <span className="cc-card-chip" style={{ background: CAMPAIGN_COLOR_VARS[drag.campaignId] }} />
          {campaignLabels[drag.campaignId]}
        </div>
      )}
    </section>
  )
}
