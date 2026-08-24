/**
 * The essay's five acts, navigable left/right from the acts bar. Order is
 * the narrative order; free navigation is allowed and every act self-seeds
 * (Act III falls back to example campaigns when the reader hasn't pitched —
 * see `buildExampleCampaigns` — and Act II gates instead: a race framed as
 * "YOUR campaigns, re-run" has nothing honest to show before a pitch).
 */

export interface ActDef {
  /** URL hash fragment (without '#') — the act deep-link. */
  hash: string
  /** "Act 0" … "Act IV". */
  num: string
  title: string
}

export const ACTS: ActDef[] = [
  { hash: 'act-0', num: 'Act 0', title: 'The Introduction' },
  { hash: 'act-1', num: 'Act I', title: 'Trial & Error' },
  { hash: 'act-2', num: 'Act II', title: 'Regret' },
  { hash: 'act-3', num: 'Act III', title: 'Rationing' },
  { hash: 'act-4', num: 'Act IV', title: 'Learning from the Best' },
]

/** Index for a location.hash value ('#act-2' → 2); 0 for anything else. */
export function actIndexFromHash(hash: string): number {
  const i = ACTS.findIndex((a) => `#${a.hash}` === hash)
  return i === -1 ? 0 : i
}
