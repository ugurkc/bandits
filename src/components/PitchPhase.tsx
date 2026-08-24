import { useEffect, useRef, useState } from 'react'
import { pitchRequestKey } from '../lib/pitchRequestKey'
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
  /**
   * Controlled: the drafts live in the acts shell, so navigating away and
   * back — or returning via "Pitch campaigns instead" — never wipes what
   * the reader wrote. The shell clears them when the scenario cycles.
   */
  pitches: string[]
  onPitchesChange: (pitches: string[]) => void
  onScored: (outcome: PitchOutcome) => void
  onNextScenario: () => void
  /** Skips the pitch→pilot→race arc entirely — jumps to Act IV's lab. */
  onSkip: () => void
}

const MIN_PITCH_CHARS = 12

/**
 * One worked example, deliberately from a game none of the scenarios cover
 * (a co-op heist game) — it shows the *shape* of a good pitch (a concrete
 * hook plus who it's for) without leaking any scenario's answer or biasing
 * the reader toward one of its curated examples.
 */
const WORKED_EXAMPLE =
  '"Plan the perfect job: a split-screen spot where four friends pull off a flawless heist — ' +
  'one distraction, one safecrack, one getaway — selling the fantasy of a crew that clicks."'

/**
 * Act I's opening state: the reader pitches three ad campaigns against a
 * scenario, and similarity to its hidden truth becomes the campaigns' hidden
 * install rates. The boxes start blank — a worked example above them shows
 * the shape, and a generate button fills in the scenario's curated examples
 * for readers who'd rather edit than start from nothing. The ~23MB semantic
 * model prefetches under the reader's typing time; the lexical fallback
 * means nobody ever waits on it.
 */
export function PitchPhase({ scenario, seed, pitches, onPitchesChange, onScored, onNextScenario, onSkip }: PitchPhaseProps) {
  const [scoring, setScoring] = useState(false)
  const [semanticReady, setSemanticReady] = useState(isSemanticReady)

  // Belt-and-braces re-prefetch (the shell already warms the model at page
  // load); the poll keeps the engine status line honest either way.
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

  const setPitch = (i: number, text: string) =>
    onPitchesChange(pitches.map((p, j) => (j === i ? text : p)))

  // Fills only the EMPTY boxes — the button offers examples, it never
  // destroys something the reader typed. Disabled once every box has text.
  const generateExamples = () => {
    onPitchesChange(pitches.map((p, i) => (p.trim().length > 0 ? p : scenario.examplePitches[i])))
  }
  const allBoxesFilled = pitches.every((p) => p.trim().length > 0)

  const tooShort = pitches.some((p) => p.trim().length < MIN_PITCH_CHARS)

  // Scoring awaits up to SCORE_TIMEOUT_MS (4s) for the semantic model, and
  // the world can move inside that window: "Try another scenario" stays live,
  // and so does the whole acts nav. Committing a result computed against a
  // brief the reader has since left would drop them into a pilot for a
  // scenario they are no longer looking at — and if they stepped into Act III
  // meanwhile, swap that quarter's campaigns out mid-week. A round resolving
  // into a changed world is therefore discarded. This ref holds the key that
  // is CURRENT at resolve time; the closure's own values are the stale ones.
  // Built via `pitchRequestKey`, the SAME function score() calls below —
  // two independently-written `.join(' ')` calls once diverged (one
  // silently became `.join('\0')`) and made this guard discard every result
  // forever with no error and no test able to see it.
  const latest = useRef(pitchRequestKey(scenario.id, pitches))
  useEffect(() => {
    latest.current = pitchRequestKey(scenario.id, pitches)
  })

  const mounted = useRef(true)
  useEffect(() => {
    // Re-assert on mount rather than only clearing on unmount: StrictMode's
    // double invoke would otherwise leave this false forever in development.
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const score = async () => {
    const requestKey = pitchRequestKey(scenario.id, pitches)
    setScoring(true)
    try {
      const result = await scoreWithBestEngine(pitches, scenario.truth)
      if (!mounted.current || latest.current !== requestKey) {
        return
      }
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
      <div className="pp-intro">
        <p>
          Welcome to our playground! I have created a bunch of scenarios about games of
          different genres, and what you need to do, is describe campaign ads that will target
          the audience. For each scenario, I've described in a text hidden what people are
          looking for and thus will react well to, and hidden it from you, the reader.
        </p>
        <p>
          After you've described your campaign ideas, a tiny semantic model will score how well
          your idea resonates with the hidden expectation, and your goal is to find out the
          winning strategy by running the campaigns week over week.
        </p>
        <p>
          Alternatively, you can auto-generate campaigns to advance but I highly urge you to get
          your hands dirty, lets play!
        </p>
      </div>

      <div className="pp-scenario">
        <div className="pp-scenario-head">
          <span className="pp-scenario-title">{scenario.title}</span>
          <button type="button" className="ct-button pp-cycle" onClick={onNextScenario}>
            Try another scenario
          </button>
        </div>
        <p className="pp-brief">{scenario.brief}</p>
      </div>

      <div className="pp-example">
        <span className="pp-example-label">What a pitch looks like</span>
        <p className="pp-example-text">{WORKED_EXAMPLE}</p>
        <p className="pp-example-note">
          A concrete hook plus who it's for. Write three of your own below — or generate examples
          into the empty boxes and edit from there.
        </p>
      </div>

      <div className="pp-boxes-head">
        <button
          type="button"
          className="ct-button pp-generate"
          onClick={generateExamples}
          disabled={allBoxesFilled}
        >
          Generate example pitches
        </button>
      </div>

      <div className="pp-boxes">
        {pitches.map((pitch, i) => (
          <label key={i} className="pp-box">
            <span className="pp-box-label">Campaign {i + 1}</span>
            <textarea
              className="pp-textarea"
              value={pitch}
              rows={3}
              placeholder="What's the hook, and who is it for?"
              onChange={(e) => setPitch(i, e.target.value)}
              aria-label={`Campaign ${i + 1} pitch`}
            />
          </label>
        ))}
      </div>

      {/* Skip on the left, score on the right: advancement lives on the
          right-hand side everywhere in the essay, and the escape hatch
          shouldn't sit where the "onward" button is expected. */}
      <div className="pp-actions">
        <button type="button" className="pp-skip" onClick={onSkip}>
          Skip to the strategy lab →
        </button>
        {/* One flex item, so a narrow viewport wraps status + button to the
            next line TOGETHER, still right-aligned — not the score button
            alone falling to the left edge. */}
        <span className="pp-actions-go">
          <span className="pp-engine" role="status">
            {semanticReady
              ? 'semantic model ready — scoring runs in your browser'
              : 'semantic model loading in the background — a lexical scorer stands in if it isn’t ready'}
          </span>
          <button
            type="button"
            className="ct-button pp-score"
            onClick={() => void score()}
            disabled={scoring || tooShort}
          >
            {scoring ? 'Scoring…' : 'Score my pitches'}
          </button>
        </span>
      </div>

      {tooShort && (
        <p className="pp-hint">
          Write all three pitches (at least {MIN_PITCH_CHARS} characters each) to score them.
        </p>
      )}

      <p className="pp-privacy">
        Everything here runs in your browser. Your pitches are never stored and never sent
        anywhere — the only network request is downloading the scoring model itself.
      </p>
    </section>
  )
}
