/**
 * Deterministic example campaigns for acts entered without playing Act I.
 *
 * Free act navigation means Act III can be the reader's first stop — but the
 * quarter needs three campaigns with hidden rates, which normally come from
 * the reader's own scored pitches. This builds the same shape from a
 * scenario's curated example pitches, scored with the synchronous lexical
 * engine (the semantic model is async and ~23MB — never worth blocking act
 * navigation on) and mapped through the exact same `similaritiesToRates`
 * pipeline a real scoring round uses. Same mapping, same tie-gap guarantee,
 * same band — the only difference is whose words got scored.
 */

import { pitchLabel } from './similarity/labels'
import { scorePitch } from './similarity/lexical'
import { similaritiesToRates } from './similarity/mapping'
import { scenarioAt } from './similarity/scenarios'

export interface ExampleCampaigns {
  scenarioTitle: string
  pitches: string[]
  labels: string[]
  /** Hidden install rates, from the real similarity→rate mapping. */
  rates: number[]
}

export function buildExampleCampaigns(scenarioIndex: number, seed: number): ExampleCampaigns {
  const scenario = scenarioAt(scenarioIndex)
  const similarities = scenario.examplePitches.map((p) => scorePitch(p, scenario.truth).similarity)
  return {
    scenarioTitle: scenario.title,
    pitches: [...scenario.examplePitches],
    labels: scenario.examplePitches.map(pitchLabel),
    rates: similaritiesToRates(similarities, seed),
  }
}
