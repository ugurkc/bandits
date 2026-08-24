import type { StrategyId } from '../lib/bandit/types'

/**
 * One-line plain-English explainer per strategy. Shown on the HandoffCard's
 * buttons (Act III) and reused as title/aria enrichment on the race chart's
 * legend (Act II's race AND Act IV's lab), so every surface tells one story
 * about each strategy — which is why the wording is deliberately
 * surface-neutral ("share"/"effort", not "budget": the race and the lab
 * have no budget in their fiction). Its own module (not HandoffCard) so
 * component files export only components (react-refresh rule).
 */
export const STRATEGY_EXPLAINERS: Record<StrategyId, string> = {
  'fixed-split': 'gives every option an equal share, forever',
  'epsilon-greedy':
    'backs the current leader with most of its effort, keeps testing the rest with the remainder',
  thompson:
    'draws a random guess from what it knows about each option so far, then bets on whichever guess wins — a coin flip early on, a near-certainty once the evidence is in',
}
