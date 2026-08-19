import { useState } from 'react'
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

function fmt(dollars: number): string {
  return `$${dollars.toLocaleString()}`
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
  }

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
                step={5}
                value={amounts[id]}
                aria-label={`${campaignLabels[id]} budget, dollars`}
                aria-invalid={fields[id] === null || undefined}
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

      <div className="bs-status" aria-live="polite">
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

      <button type="button" className="bs-run" onClick={run} disabled={!canRun}>
        Run week {week}
      </button>
    </div>
  )
}
