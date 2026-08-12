import type { PitchOutcome } from './PitchPhase'
import './playground.css'

export interface TruthRevealProps {
  outcome: PitchOutcome
}

const pct = (v: number) => `${(v * 100).toFixed(0)}%`

/**
 * Shown alongside "Reveal true rates" after a pitch-derived race: the hidden
 * truth text, each pitch's similarity and preference share, and (when the
 * lexical engine scored) the matched terms that explain the score.
 */
export function TruthReveal({ outcome }: TruthRevealProps) {
  const { scenario, labels, result, preference } = outcome
  return (
    <aside className="rv" aria-label="The hidden truth">
      <h3 className="rv-title">What these players actually wanted</h3>
      <p className="rv-truth">{scenario.truth}</p>

      <ul className="rv-rows">
        {result.scores.map((score, i) => (
          <li key={i} className="rv-row">
            <span className="rv-label">{labels[i]}</span>
            <span
              className="rv-meter"
              role="img"
              aria-label={`Similarity to the truth: ${pct(score.similarity)}`}
            >
              <span className="rv-meter-fill" style={{ width: pct(score.similarity) }} />
            </span>
            <span className="rv-nums">
              <span className="rv-sim">{pct(score.similarity)} match</span>
              <span className="rv-pref">{pct(preference[i])} of player preference</span>
            </span>
            {score.matchedTerms.length > 0 && (
              <span className="rv-terms">
                matched: {score.matchedTerms.map((t) => (
                  <span key={t} className="rv-term">
                    {t}
                  </span>
                ))}
              </span>
            )}
          </li>
        ))}
      </ul>

      <p className="rv-note">
        Scored by {result.engine === 'semantic'
          ? 'the sentence-embedding model, in your browser'
          : 'the lexical fallback scorer (the semantic model wasn’t ready in time)'}
        . And yes — the truth ships in the page source; view-source is the fourth strategy.
      </p>
    </aside>
  )
}
