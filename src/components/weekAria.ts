/**
 * The one accessible-name builder for a played week, shared by
 * `CampaignCalendar` (during play) and `QuarterResults` (the debrief) so the
 * two surfaces can never drift apart. The dollar split and the installs
 * total are text here precisely because the visual encoding (proportional
 * color chips) is width/color-alone — this label IS the text alternative.
 */

import type { CampaignId, CampaignWeekResult } from '../lib/campaign/types'

const CAMPAIGN_IDS: CampaignId[] = [0, 1, 2]

export function fmtDollars(v: number): string {
  return `$${v.toLocaleString()}`
}

/**
 * "Week 5: Alpha $250, Beta $150, Gamma $100, 312 installs" — plus
 * ", run by Thompson Sampling" when a handed-off strategy played the week.
 */
export function weekAria(w: CampaignWeekResult, campaignLabels: string[], runBy?: string): string {
  const split = CAMPAIGN_IDS.filter((id) => (w.allocation[id] ?? 0) > 0)
    .map((id) => `${campaignLabels[id]} ${fmtDollars(w.allocation[id] ?? 0)}`)
    .join(', ')
  const base = `Week ${w.week}: ${split}, ${w.totalInstalls.toLocaleString()} installs`
  return runBy ? `${base}, run by ${runBy}` : base
}
