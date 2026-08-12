import { useEffect, useRef, useState } from 'react'
import { pitchLabel } from '../lib/similarity/labels'
import { preferenceDistribution, similaritiesToRates } from '../lib/similarity/mapping'
import type { Scenario } from '../lib/similarity/scenarios'
import { isSemanticReady, prefetchSemantic, scoreWithBestEngine } from '../lib/similarity/semantic'
import type { ScoreResult } from '../lib/similarity/types'
import './playground.css'

export interface PitchOutcome {
  scenario: Scenario
  pitches: string[]
  labels: string[]
  result: ScoreResult
  /** Softmax preference share per pitch, sums to 1. */
  preference: number[]
  /** Arm conversion rates handed to the simulation. */
  rates: number[]
}

export interface PitchPhaseProps {
  scenario: Scenario
  /** Seed forwarded to the deterministic tie-nudge in the rate mapping. */
  seed: number
  onScored: (outcome: PitchOutcome) => void
  onNextScenario: () => void
  onSkip: () => void
}

const MIN_PITCH_CHARS = 12

/**
 * The playground's opening state: the reader pitches three ad campaigns
 * against a scenario, and similarity to its hidden truth becomes the
 * campaigns' hidden install rates. The ~23MB semantic model prefetches under
 * the reader's typing time; the lexical fallback means nobody ever waits on
 * it.
 */
export function PitchPhase({ scenario, seed, onScored, onNextScenario, onSkip }: PitchPhaseProps) {
  const [pitches, setPitches] = useState<string[]>(() => [...scenario.placeholders])
  const [scoring, setScoring] = useState(false)
  const [semanticReady, setSemanticReady] = useState(isSemanticReady)

  // Start the model download the moment the pitch phase is on screen — it
  // rides under the time the reader spends reading and typing.
  useEffect(() => {
    prefetchSemantic()
    if (isSemanticReady()) return
    const poll = setInterval(() => {
      if (isSemanticReady()) {
        setSemanticReady(true)
        clearInterval(poll)
      }
    }, 500)
    return () => clearInterval(poll)
  }, [])

  // Swap in the new scenario's starter pitches when the reader cycles.
  const scenarioIdRef = useRef(scenario.id)
  if (scenarioIdRef.current !== scenario.id) {
    scenarioIdRef.current = scenario.id
    setPitches([...scenario.placeholders])
  }

  const setPitch = (i: number, text: string) =>
    setPitches((prev) => prev.map((p, j) => (j === i ? text : p)))

  const tooShort = pitches.some((p) => p.trim().length < MIN_PITCH_CHARS)

  const score = async () => {
    setScoring(true)
    try {
      const result = await scoreWithBestEngine(pitches, scenario.truth)
      const similarities = result.scores.map((s) => s.similarity)
      onScored({
        scenario,
        pitches,
        labels: pitches.map(pitchLabel),
        result,
        preference: preferenceDistribution(similarities),
        rates: similaritiesToRates(similarities, seed),
      })
    } finally {
      setScoring(false)
    }
  }

  return (
    <section className="pp" aria-label="Pitch your ad campaigns">
      <p className="pp-intro">
        Every ad campaign is a bet on what players actually want to hear. Pitch three campaign
        concepts for the scenario below — a hidden truth about this playerbase decides how well
        each one converts to installs, and you'll get to run your quarter by hand before three
        strategies race to find your best bet automatically.
      </p>

      <div className="pp-scenario">
        <div className="pp-scenario-head">
          <span className="pp-scenario-title">{scenario.title}</span>
          <button type="button" className="ct-button pp-cycle" onClick={onNextScenario}>
            Try another scenario
          </button>
        </div>
        <p className="pp-brief">{scenario.brief}</p>
      </div>

      <div className="pp-boxes">
        {pitches.map((pitch, i) => (
          <label key={i} className="pp-box">
            <span className="pp-box-label">Campaign {i + 1}</span>
            <textarea
              className="pp-textarea"
              value={pitch}
              rows={3}
              onChange={(e) => setPitch(i, e.target.value)}
              aria-label={`Campaign ${i + 1} pitch`}
            />
          </label>
        ))}
      </div>

      <div className="pp-actions">
        <button
          type="button"
          className="ct-button pp-score"
          onClick={() => void score()}
          disabled={scoring || tooShort}
        >
          {scoring ? 'Scoring…' : 'Score my pitches'}
        </button>
        <span className="pp-engine" role="status">
          {semanticReady
            ? 'semantic model ready — scoring runs in your browser'
            : 'semantic model loading in the background — a lexical scorer stands in if it isn’t ready'}
        </span>
        <button type="button" className="pp-skip" onClick={onSkip}>
          Skip to the sandbox →
        </button>
      </div>

      {tooShort && (
        <p className="pp-hint">Each pitch needs at least {MIN_PITCH_CHARS} characters.</p>
      )}

      <p className="pp-privacy">
        Everything here runs in your browser. Your pitches are never stored and never sent
        anywhere — the only network request is downloading the scoring model itself.
      </p>
    </section>
  )
}
