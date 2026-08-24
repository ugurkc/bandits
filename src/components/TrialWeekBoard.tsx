import { useCallback, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import type { TrialWeeks } from '../state/useTrialWeeks'
import { TRIAL_WEEKS } from '../state/useTrialWeeks'
import { CAMPAIGN_COLOR_VARS } from '../lib/campaign/types'
import type { CampaignId } from '../lib/campaign/types'
import './trial.css'

export interface TrialWeekBoardProps {
  trial: TrialWeeks
  /** Length 3, from PitchOutcome.labels — short, used on cards and week cells. */
  campaignLabels: string[]
  /** Length 3, from PitchOutcome.pitches — the reader's full text, shown in the confirm bar. */
  campaignPitches: string[]
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
 * (select) rather than a drag — same threshold as Act III's calendar. */
const DRAG_THRESHOLD = 6

/**
 * Act I's 5-week pilot board: single-campaign picks only, no budget branch.
 * Weeks unlock sequentially — played weeks lock in and show their result,
 * the current week is the only interactive one, future weeks stay greyed.
 *
 * Two ways to lock in a pick: drag a card onto the current week, or select a
 * card and use the explicit "Lock it in" button that appears next to the
 * cards. The week cell itself is never a click target — it's only a drag
 * drop-zone and a status readout — so the confirming action always has a
 * real, labeled button, not an implicit "click the calendar" gesture.
 */
export function TrialWeekBoard({ trial, campaignLabels, campaignPitches, onPick }: TrialWeekBoardProps) {
  const { weeks, currentWeek, complete } = trial
  const [selected, setSelected] = useState<CampaignId | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const dropRef = useRef<HTMLLIElement>(null)
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([])
  // Set true by a pointerup that already handled a tap-as-select so the
  // browser's trailing synthetic click doesn't toggle the selection twice.
  const suppressClickRef = useRef(false)

  const confirmPick = useCallback(
    (campaignId: CampaignId) => {
      onPick(campaignId)
      setSelected(null)
      setDrag(null)
      // Confirming unmounts the "Lock it in" bar (and the focused button
      // with it) — park focus on the picked campaign's card so keyboard
      // users aren't dropped back to <body>. On the final pick the whole
      // picker unmounts too; Act1's completion effect focuses the bridge.
      cardRefs.current[campaignId]?.focus()
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
    // Belt-and-braces: if a previous interaction set the suppress flag but
    // its trailing click never arrived (e.g. the stream was cancelled), a
    // fresh pointerdown starts a fresh interaction — never eat its click.
    suppressClickRef.current = false
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
      // Because pointerdown captured the pointer, the browser retargets the
      // interaction's trailing synthetic click to this button no matter how
      // far the pointer moved — suppress it on BOTH drag outcomes, or a
      // drag-drop re-selects the just-dropped card and a missed drag toggles
      // a selection the reader never asked for.
      suppressClickRef.current = true
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

  // A cancelled pointer stream (system gesture, notification, window blur)
  // never fires pointerup: without this, the drag ghost stays painted at its
  // last coordinates until some later interaction. lostpointercapture also
  // fires after every normal release — clearing an already-null drag then is
  // harmless. Neither touches suppressClickRef: a click can still trail the
  // capture release (tap path), and pointerdown resets the flag anyway.
  const onCardPointerCancel = () => {
    setDrag(null)
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

  const weekCells = []
  for (let week = 1; week <= TRIAL_WEEKS; week++) {
    const played = weeks[week - 1]
    const isCurrent = week === currentWeek && !complete
    const isFuture = !played && !isCurrent

    if (played) {
      const armId = CAMPAIGN_IDS.find((id) => (played.allocation[id] ?? 0) > 0) ?? 0
      weekCells.push(
        <li
          key={week}
          className="td-cell td-cell--played"
          aria-label={`Week ${week}: ran ${campaignLabels[armId]}, ${played.totalInstalls.toLocaleString()} installs`}
        >
          <span className="td-cell-week">Week {week}</span>
          {/* The chip is colour-alone, and browse mode reads a
              non-interactive listitem's contents rather than its aria-label,
              so which campaign ran needs a text carrier of its own. */}
          <span className="sr-only">{campaignLabels[armId]}</span>
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
      weekCells.push(
        <li
          key={week}
          ref={dropRef}
          className="td-cell td-cell--current"
          aria-label={
            selected !== null
              ? `Week ${week}: drop zone for ${campaignLabels[selected]}`
              : `Week ${week}: current week, not yet decided`
          }
        >
          <span className="td-cell-week">Week {week}</span>
          <span className="td-cell-current-hint">
            {selected !== null ? `Drop ${campaignLabels[selected]} here` : 'Current week'}
          </span>
        </li>,
      )
      continue
    }

    if (isFuture) {
      weekCells.push(
        <li key={week} className="td-cell td-cell--future" aria-disabled="true" aria-label={`Week ${week}: locked`}>
          <span className="td-cell-week">Week {week}</span>
        </li>,
      )
    }
  }

  return (
    <section className="td-wrap">
      {!complete && (
        <div className="td-picker" role="group" aria-label="Campaigns you can run this week">
          <p className="td-picker-hint">
            Drag a campaign onto week {currentWeek}, or select one below and lock it in.
          </p>
          <div className="td-cards">
            {CAMPAIGN_IDS.map((id) => (
              <button
                key={id}
                ref={(el) => {
                  cardRefs.current[id] = el
                }}
                type="button"
                className={`td-card${selected === id ? ' td-card--selected' : ''}`}
                style={{ borderColor: selected === id ? CAMPAIGN_COLOR_VARS[id] : undefined }}
                aria-pressed={selected === id}
                aria-label={`${campaignLabels[id]}: select, then use the Lock it in button; or drag onto week ${currentWeek}`}
                onPointerDown={onCardPointerDown(id)}
                onPointerMove={onCardPointerMove}
                onPointerUp={onCardPointerUp}
                onPointerCancel={onCardPointerCancel}
                onLostPointerCapture={onCardPointerCancel}
                onClick={() => onCardClick(id)}
                onKeyDown={onCardKeyDown(id)}
              >
                <span className="td-card-chip" style={{ background: CAMPAIGN_COLOR_VARS[id] }} aria-hidden="true" />
                <span className="td-card-label">{campaignLabels[id]}</span>
              </button>
            ))}
          </div>

          {selected !== null && (
            <div className="td-confirm" role="status">
              <span className="td-confirm-chip" style={{ background: CAMPAIGN_COLOR_VARS[selected] }} aria-hidden="true" />
              <span className="td-confirm-text">
                Run in week {currentWeek}: <strong>{campaignPitches[selected]}</strong>
              </span>
              <button type="button" className="ct-button td-confirm-cta" onClick={() => confirmPick(selected)}>
                Lock it in →
              </button>
            </div>
          )}
        </div>
      )}

      {/* Once the pilot is complete the picker above unmounts — and it was
          the only key mapping a colour to a campaign. Without this the
          finished board is five cells encoded by colour alone, which is the
          state the reader spends the longest looking at. Same chips and the
          same labels, minus the interactivity. */}
      {complete && (
        <ul className="td-legend" aria-label="Campaign colours">
          {CAMPAIGN_IDS.map((id) => (
            <li key={id} className="td-legend-item">
              <span
                className="td-card-chip"
                style={{ background: CAMPAIGN_COLOR_VARS[id] }}
                aria-hidden="true"
              />
              <span className="td-card-label">{campaignLabels[id]}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="td-grid-wrap">
        <ol className="td-grid" aria-label="5-week pilot board">
          {weekCells}
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
