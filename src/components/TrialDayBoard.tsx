import { useCallback, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import type { TrialDays } from '../state/useTrialDays'
import { TRIAL_DAYS } from '../state/useTrialDays'
import { CAMPAIGN_COLOR_VARS } from '../lib/campaign/types'
import type { CampaignId } from '../lib/campaign/types'
import './trial.css'

export interface TrialDayBoardProps {
  trial: TrialDays
  /** Length 3, from PitchOutcome.labels. */
  campaignLabels: string[]
  onPick: (campaignId: CampaignId) => void
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
 * (select) rather than a drag — same threshold as Act 2's calendar. */
const DRAG_THRESHOLD = 6

/**
 * Act 1's 5-day trial board: single-campaign picks only, no budget branch.
 * Days unlock sequentially — played days lock in and show their result, the
 * current day is the only interactive one, future days stay greyed. Same
 * pointer-drag-with-click-fallback interaction as Act 2's CampaignCalendar,
 * deliberately not shared code — see "Two acts — do not merge them".
 */
export function TrialDayBoard({ trial, campaignLabels, onPick }: TrialDayBoardProps) {
  const { days, currentDay, complete } = trial
  const [selected, setSelected] = useState<CampaignId | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const dropRef = useRef<HTMLLIElement>(null)
  // Set true by a pointerup that already handled a tap-as-select so the
  // browser's trailing synthetic click doesn't toggle the selection twice.
  const suppressClickRef = useRef(false)

  const confirmPick = useCallback(
    (campaignId: CampaignId) => {
      onPick(campaignId)
      setSelected(null)
      setDrag(null)
    },
    [onPick],
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
    if (complete) return
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

  const dayCells = []
  for (let day = 1; day <= TRIAL_DAYS; day++) {
    const played = days[day - 1]
    const isCurrent = day === currentDay && !complete
    const isFuture = !played && !isCurrent

    if (played) {
      const armId = CAMPAIGN_IDS.find((id) => (played.allocation[id] ?? 0) > 0) ?? 0
      dayCells.push(
        <li
          key={day}
          className="td-cell td-cell--played"
          aria-label={`Day ${day}: ran ${campaignLabels[armId]}, ${played.totalInstalls.toLocaleString()} installs`}
        >
          <span className="td-cell-day">Day {day}</span>
          <span
            className="td-cell-chip"
            style={{ background: CAMPAIGN_COLOR_VARS[armId] }}
            aria-hidden="true"
          />
          <span className="td-cell-installs">
            {played.totalInstalls.toLocaleString()} <span className="td-cell-unit">installs</span>
          </span>
        </li>,
      )
      continue
    }

    if (isCurrent) {
      dayCells.push(
        <li
          key={day}
          ref={dropRef}
          className="td-cell td-cell--current"
          role="button"
          tabIndex={0}
          aria-label={
            selected !== null
              ? `Run ${campaignLabels[selected]} on day ${day}`
              : `Day ${day}: current day. Select a campaign above, then activate this cell to run it here, or drag a campaign card here.`
          }
          onClick={onDropZoneActivate}
          onKeyDown={onDropZoneKeyDown}
        >
          <span className="td-cell-day">Day {day}</span>
          <span className="td-cell-current-hint">
            {selected !== null ? `Drop ${campaignLabels[selected]} here` : 'Current day'}
          </span>
        </li>,
      )
      continue
    }

    if (isFuture) {
      dayCells.push(
        <li key={day} className="td-cell td-cell--future" aria-disabled="true" aria-label={`Day ${day}: locked`}>
          <span className="td-cell-day">Day {day}</span>
        </li>,
      )
    }
  }

  return (
    <section className="td-wrap">
      {!complete && (
        <div className="td-picker" role="group" aria-label="Campaigns you can run today">
          <p className="td-picker-hint">
            Drag a campaign onto day {currentDay}, or select one below, then choose the day.
          </p>
          <div className="td-cards">
            {CAMPAIGN_IDS.map((id) => (
              <button
                key={id}
                type="button"
                className={`td-card${selected === id ? ' td-card--selected' : ''}`}
                style={{ borderColor: selected === id ? CAMPAIGN_COLOR_VARS[id] : undefined }}
                aria-pressed={selected === id}
                aria-label={`${campaignLabels[id]} — select, then choose day ${currentDay}; or drag onto day ${currentDay}`}
                onPointerDown={onCardPointerDown(id)}
                onPointerMove={onCardPointerMove}
                onPointerUp={onCardPointerUp}
                onClick={() => onCardClick(id)}
                onKeyDown={onCardKeyDown(id)}
              >
                <span className="td-card-chip" style={{ background: CAMPAIGN_COLOR_VARS[id] }} aria-hidden="true" />
                <span className="td-card-label">{campaignLabels[id]}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="td-grid-wrap">
        <ol className="td-grid" aria-label="5-day trial board">
          {dayCells}
        </ol>
      </div>

      {drag && (
        <div className="td-drag-ghost" style={{ left: drag.x, top: drag.y }} aria-hidden="true">
          <span className="td-card-chip" style={{ background: CAMPAIGN_COLOR_VARS[drag.campaignId] }} />
          {campaignLabels[drag.campaignId]}
        </div>
      )}
    </section>
  )
}
