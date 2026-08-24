import { useEffect, useId, useRef, useState } from 'react'
import { CAMPAIGN_COLOR_VARS, WEEKLY_BUDGET } from '../lib/campaign/types'
import type { CampaignId, WeekAllocation } from '../lib/campaign/types'
import './campaign.css'

export interface BudgetSplitPanelProps {
  week: number
  /** Length 3, from PitchOutcome.labels. */
  campaignLabels: string[]
  onCommit: (allocation: WeekAllocation) => void
}

const CAMPAIGN_IDS: CampaignId[] = [0, 1, 2]

/**
 * Spinner step for the dollar inputs. Coarse on purpose: at $5 a step,
 * moving $200 between campaigns took 40 clicks per field; at $50 the whole
 * budget is 10 steps end to end. Typed amounts are still free-form (the
 * step only drives the arrows), and the exact-sum gate is unchanged.
 */
const BUDGET_STEP = 50

function fmt(dollars: number): string {
  return `$${dollars.toLocaleString()}`
}

/**
 * A uniformly random split of the budget in `BUDGET_STEP` chunks: each $50
 * chunk lands on any campaign with equal odds. Math.random is fine here:
 * this is a UI convenience for the reader's own hand, not part of the
 * deterministic simulation (the committed allocation is what matters, and
 * it goes through the same playWeek draws whatever produced it).
 */
function randomSplit(): [number, number, number] {
  const counts: [number, number, number] = [0, 0, 0]
  for (let chunk = 0; chunk < WEEKLY_BUDGET / BUDGET_STEP; chunk++) {
    counts[Math.floor(Math.random() * 3) as CampaignId] += 1
  }
  return [counts[0] * BUDGET_STEP, counts[1] * BUDGET_STEP, counts[2] * BUDGET_STEP]
}

/**
 * Phase 2's per-week allocation UI: three dollar amounts that must sum to
 * exactly `WEEKLY_BUDGET`. Plain number inputs (not sliders) — a slider
 * alone can't reliably land on an exact dollar figure, and the spec asks for
 * precision, not just a rough feel.
 */
export function BudgetSplitPanel({ week, campaignLabels, onCommit }: BudgetSplitPanelProps) {
  // Raw input strings, not numbers: a controlled number state snaps an
  // emptied field straight back to "0", forcing select-all-replace editing.
  // Strings let a field sit empty mid-edit; parsing happens where the
  // numbers are consumed (total + commit), with '' counting as 0.
  const [amounts, setAmounts] = useState<[string, string, string]>(['0', '0', '0'])

  // Reset the split when the integration layer moves us onto a new week
  // (this component instance may be reused rather than remounted) — same
  // "adjust state during render" rewind used by useCampaignQuarter for the
  // (rates, seed) identity.
  const [trackedWeek, setTrackedWeek] = useState(week)
  if (trackedWeek !== week) {
    setTrackedWeek(week)
    setAmounts(['0', '0', '0'])
  }

  // An empty field means 0 (fields sit empty mid-edit by design). Anything
  // else that isn't a usable dollar amount — negative, Infinity, unparsable —
  // returns null so the UI can SAY it's invalid. It used to clamp silently to
  // 0 while the input still displayed the bad value, so "-100 / 500 / 0" read
  // as a $500 total: three fields visibly summing to $400 under a banner
  // saying "budget fully allocated", committing a week with nothing on
  // campaign A.
  const parseAmount = (raw: string): number | null => {
    const trimmed = raw.trim()
    if (trimmed === '') return 0
    const n = Number(trimmed)
    if (!Number.isFinite(n) || n < 0) return null
    return n
  }

  const fields = [parseAmount(amounts[0]), parseAmount(amounts[1]), parseAmount(amounts[2])] as const
  const invalidIds = CAMPAIGN_IDS.filter((id) => fields[id] === null)
  const parsed = [fields[0] ?? 0, fields[1] ?? 0, fields[2] ?? 0] as const
  const total = parsed[0] + parsed[1] + parsed[2]
  const diff = Math.round((WEEKLY_BUDGET - total) * 100) / 100
  const canRun = invalidIds.length === 0 && diff === 0

  const setAmount = (id: CampaignId, value: string) => {
    const next: [string, string, string] = [...amounts]
    next[id] = value
    setAmounts(next)
    // Typed edits always announce through the debounced mirror, even right
    // after a randomize armed the skip below.
    skipMirrorRef.current = false
  }

  // The status text changes on EVERY keystroke, so it cannot itself be the
  // live region — a reader typing "250" would hear three separate totals.
  // The visible copy updates immediately; a debounced mirror does the
  // announcing, the same pattern the regret chart uses for its crosshair.
  const statusId = useId()
  const statusText =
    invalidIds.length > 0
      ? `${invalidIds.map((id) => campaignLabels[id]).join(' and ')} need a dollar amount of $0 or more.`
      : diff > 0
        ? `Total ${fmt(total)} of ${fmt(WEEKLY_BUDGET)}, ${fmt(diff)} left to allocate`
        : diff < 0
          ? `Total ${fmt(total)} of ${fmt(WEEKLY_BUDGET)}, ${fmt(Math.abs(diff))} over budget`
          : `Total ${fmt(total)} of ${fmt(WEEKLY_BUDGET)}, budget fully allocated`

  const [liveStatus, setLiveStatus] = useState('')
  const firstStatusRef = useRef(true)
  // Armed by the Randomize button, which announces its own dealt split
  // immediately: without this, the first randomize's statusText change would
  // schedule the generic "budget fully allocated" mirror 600ms later, which
  // re-announces over (and adds nothing to) the split announcement.
  const skipMirrorRef = useRef(false)
  useEffect(() => {
    // Skip the announcement for the panel's initial $0/$0/$0 state: it is not
    // a response to anything the reader did.
    if (firstStatusRef.current) {
      firstStatusRef.current = false
      return
    }
    if (skipMirrorRef.current) {
      skipMirrorRef.current = false
      return
    }
    const id = setTimeout(() => setLiveStatus(statusText), 600)
    return () => clearTimeout(id)
  }, [statusText])

  const run = () => {
    if (!canRun) return
    onCommit({ 0: parsed[0], 1: parsed[1], 2: parsed[2] })
  }

  return (
    <div className="bs-panel" role="group" aria-label={`Split week ${week}'s budget across campaigns`}>
      <div className="bs-rows">
        {CAMPAIGN_IDS.map((id) => (
          <label key={id} className="bs-row">
            <span className="bs-chip" style={{ background: CAMPAIGN_COLOR_VARS[id] }} aria-hidden="true" />
            <span className="bs-label">{campaignLabels[id]}</span>
            <span className="bs-input-wrap">
              <span className="bs-dollar" aria-hidden="true">
                $
              </span>
              <input
                type="number"
                className="bs-input"
                min={0}
                max={WEEKLY_BUDGET}
                step={BUDGET_STEP}
                value={amounts[id]}
                aria-label={`${campaignLabels[id]} budget, dollars`}
                aria-invalid={fields[id] === null || undefined}
                aria-describedby={fields[id] === null ? statusId : undefined}
                onChange={(e) => setAmount(id, e.target.value)}
                // A focused number input swallows wheel events and silently
                // re-allocates the week when the reader scrolls the page —
                // and this panel lives inside a scrollable calendar cell.
                onWheel={(e) => e.currentTarget.blur()}
              />
            </span>
          </label>
        ))}
      </div>

      <div className="bs-status" id={statusId}>
        {invalidIds.length > 0 ? (
          // Never show a total while a field is unusable: the total would be
          // computed from values the reader can still see on screen but that
          // are not what would be spent.
          <span className="bs-hint bs-hint--over">
            {invalidIds.map((id) => campaignLabels[id]).join(' and ')} need a dollar amount of $0
            or more.
          </span>
        ) : (
          <>
            <span className="bs-total">
              Total: {fmt(total)} / {fmt(WEEKLY_BUDGET)}
            </span>
            {diff > 0 && <span className="bs-hint">you have {fmt(diff)} left to allocate</span>}
            {diff < 0 && <span className="bs-hint bs-hint--over">{fmt(Math.abs(diff))} over budget</span>}
            {diff === 0 && <span className="bs-hint bs-hint--ok">budget fully allocated</span>}
          </>
        )}
      </div>

      <div className="sr-only" role="status" aria-live="polite">
        {liveStatus}
      </div>

      {/* Escape hatch on the left, commit on the right: the same
          advancement-flows-right convention as the pitch phase's action row. */}
      <div className="bs-actions">
        <button
          type="button"
          className="bs-random"
          onClick={() => {
            const [a, b, c] = randomSplit()
            setAmounts([String(a), String(b), String(c)])
            // Announce the dealt split directly: every random split totals
            // exactly $500, so the debounced statusText mirror would land on
            // the identical "budget fully allocated" string every time and
            // the [statusText] effect never refires. A click is one
            // deliberate action, so this speaks immediately, like the
            // chart's keyboard crosshair; skipMirrorRef keeps the first
            // click's statusText change from re-announcing over it.
            skipMirrorRef.current = true
            setLiveStatus(
              `Random split: ${campaignLabels[0]} ${fmt(a)}, ${campaignLabels[1]} ${fmt(b)}, ` +
                `${campaignLabels[2]} ${fmt(c)}. Budget fully allocated.`,
            )
          }}
        >
          Randomize split
        </button>
        <button type="button" className="bs-run" onClick={run} disabled={!canRun}>
          Run week {week}
        </button>
      </div>
    </div>
  )
}
