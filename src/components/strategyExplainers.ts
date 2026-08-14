import type { StrategyId } from '../lib/bandit/types'

/**
 * One-line plain-English explainer per strategy — what handing over to it
 * actually does with the weekly budget. Shown on the HandoffCard's buttons
 * and reused as title/aria enrichment on the race chart's legend, so the
 * two surfaces tell the same story. Its own module (not HandoffCard) so
 * component files export only components (react-refresh rule).
 */
export const STRATEGY_EXPLAINERS: Record<StrategyId, string> = {
  'fixed-split': 'keeps splitting the budget evenly, forever',
  'epsilon-greedy':
    'puts most of the budget on the current leader, keeps testing the rest with the remainder',
  thompson:
    'splits in proportion to how likely each campaign is to be the true best, so it concentrates as evidence builds',
}
