/**
 * Shared contracts for the manual campaign calendar (the pitch phase's
 * "run the quarter by hand" step before the automated race).
 *
 * See "The manual campaign calendar" in
 * docs/plans/2026-08-12-simulator-design.md — change these together with
 * that doc.
 */

/** One 13-week grid used throughout: weeks unlock sequentially. */
export const WEEKS_PER_QUARTER = 13

/** Weeks 1-4 are single-campaign-pick; weeks 5-13 are budget-split. */
export const PICK_PHASE_WEEKS = 4

/** Every week spends exactly this many dollars, split across campaigns. */
export const WEEKLY_BUDGET = 500

/** Dollars per 1000 impressions. */
export const CPM = 25

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
 * A one-hot allocation like `{0: 500}` is Phase 1's "pick one" case — the
 * engine never special-cases Phase 1, it's just a `WeekAllocation` whose
 * values happen to be one-hot.
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
