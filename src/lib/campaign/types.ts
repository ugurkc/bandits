/**
 * Shared contracts for the campaign-flavored reward engine: Act 2's
 * budgeted quarter (`useCampaignQuarter`) and Act 1's trial-day board
 * (`useTrialDays`, which reuses `CampaignWeekResult` with days in the
 * `week` slot).
 *
 * See "Act 2: the budgeted quarter" in
 * docs/plans/2026-08-12-simulator-design.md — change these together with
 * that doc.
 */

/** One 13-week grid used throughout: weeks unlock sequentially. */
export const WEEKS_PER_QUARTER = 13

/** Every week spends exactly this many dollars, split across campaigns. */
export const WEEKLY_BUDGET = 500

/**
 * Dollars per 1000 impressions. $500/week buys 500 impressions.
 *
 * Calibrated 2026-08-13 (Monte Carlo, 2500 seeds/config, rates from the real
 * mapping band; script archived in the review session's scratchpad) so a
 * week's evidence is genuinely partial — at the old $25 CPM ($500 = 20,000
 * impressions) one even-split week identified the best arm in ~100% of
 * seeds and Act 2's hedge-vs-learn tension didn't exist. Candidates
 * {250, 500, 1000}, measured on a 2pp best-vs-second gap:
 * - P(even-split week-1 argmax = true best): 0.887 / 0.783 / 0.702 —
 *   only $1000 sits below the ~0.75 target, so hedged learning takes
 *   multiple weeks.
 * - P(Thompson full-quarter total > fixed-split): 1.000 at all three;
 *   at $1000 the mean margin is ~160 installs (~682 vs ~521, +31%).
 * - Weekly installs stay readable: ~55 all-in on a 11% arm, ~18 per arm
 *   under an even split.
 */
export const CPM = 1000

/** Index into the 3 pitches. */
export type CampaignId = 0 | 1 | 2

/** CSS custom property carrying each campaign's validated series color. */
export const CAMPAIGN_COLOR_VARS: Record<CampaignId, string> = {
  0: 'var(--campaign-a)',
  1: 'var(--campaign-b)',
  2: 'var(--campaign-c)',
}

/**
 * Dollar amounts per campaign for one week; values sum to `WEEKLY_BUDGET`.
 * "Everything on one campaign" is not a special mode — a one-hot allocation
 * like `{0: 500}` is just a `WeekAllocation` whose values happen to be
 * one-hot, and the engine never special-cases it.
 */
export interface WeekAllocation {
  [campaignId: number]: number
}

export interface CampaignWeekResult {
  week: number
  allocation: WeekAllocation
  impressions: Record<number, number>
  installs: Record<number, number>
  totalInstalls: number
}

/** Append-only as weeks are played. */
export interface QuarterPlan {
  weeks: CampaignWeekResult[]
}
