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
  const [amounts, setAmounts] = useState<[number, number, number]>([0, 0, 0])

  // Reset the split when the integration layer moves us onto a new week
  // (this component instance may be reused rather than remounted) — same
  // "adjust state during render" rewind used by useCampaignQuarter for the
  // (rates, seed) identity.
  const [trackedWeek, setTrackedWeek] = useState(week)
  if (trackedWeek !== week) {
    setTrackedWeek(week)
    setAmounts([0, 0, 0])
  }

  const total = amounts[0] + amounts[1] + amounts[2]
  const diff = Math.round((WEEKLY_BUDGET - total) * 100) / 100
  const canRun = diff === 0

  const setAmount = (id: CampaignId, value: number) => {
    const next: [number, number, number] = [...amounts]
    next[id] = Number.isFinite(value) ? Math.max(0, value) : 0
    setAmounts(next)
  }

  const run = () => {
    if (!canRun) return
    onCommit({ 0: amounts[0], 1: amounts[1], 2: amounts[2] })
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
                onChange={(e) => setAmount(id, e.target.valueAsNumber)}
              />
            </span>
          </label>
        ))}
      </div>

      <div className="bs-status" aria-live="polite">
        <span className="bs-total">
          Total: {fmt(total)} / {fmt(WEEKLY_BUDGET)}
        </span>
        {diff > 0 && <span className="bs-hint">you have {fmt(diff)} left to allocate</span>}
        {diff < 0 && <span className="bs-hint bs-hint--over">{fmt(Math.abs(diff))} over budget</span>}
        {diff === 0 && <span className="bs-hint bs-hint--ok">budget fully allocated</span>}
      </div>

      <button type="button" className="bs-run" onClick={run} disabled={!canRun}>
        Run week {week}
      </button>
    </div>
  )
}
