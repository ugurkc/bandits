import type { Simulation } from '../state/useSimulation'
import type { PitchOutcome } from './PitchPhase'
import { SimulatorPanel } from './SimulatorPanel'
import { TruthReveal } from './TruthReveal'
import './playground.css'

export interface Act2RegretProps {
  sim: Simulation
  /** Null when the reader landed here without scoring pitches in Act I. */
  pitchOutcome: PitchOutcome | null
  /** Resets the pitch arc and navigates back to Act I's pitch phase. */
  onBackToPitches: () => void
  /** The closing CTA — Act III's budgeted quarter. */
  onGoToRationing: () => void
}

/**
 * Act II — Regret: the automated race. Three strategies replay the reader's
 * pitched campaigns impression by impression while the chart totals what
 * each one gave up against the hidden best arm — the essay's one formal
 * concept, taught right where it's plotted. Reached from Act I's bridge.
 *
 * Unlike Act III, this act can't self-seed with example campaigns: its whole
 * framing is "YOUR campaigns, re-run", so without a scored pitch it gates
 * with a pointer back to Act I instead.
 */
export function Act2Regret({ sim, pitchOutcome, onBackToPitches, onGoToRationing }: Act2RegretProps) {
  if (!pitchOutcome) {
    return (
      <div className="pg">
        <section className="pg-example-note" aria-label="No pitched campaigns yet">
          <p className="pg-example-note-copy">
            This act replays <strong>your</strong> campaigns — and you haven't pitched any yet.
            Score three pitches in Act I; the race here picks up the same campaigns against
            the same hidden truth.
          </p>
          <button type="button" className="pp-skip" onClick={onBackToPitches}>
            ← Pitch campaigns in Act I
          </button>
        </section>
      </div>
    )
  }

  return (
    <div className="pg">
      <div className="pg-topline">
        <span className="pg-context">
          No calendar time passes here — this is a replay, not the next chapter. Your three
          campaigns are the arms, and the chart below races three ways of choosing between
          them against the {pitchOutcome.scenario.title.toLowerCase()} playerbase — decision by
          decision at the level of a single impression, sped up. Reveal true rates to see the
          hidden truth.
        </span>
        <button type="button" className="pp-skip" onClick={onBackToPitches}>
          ← Pitch campaigns instead
        </button>
      </div>

      <section className="pg-regret-intro" aria-label="What regret measures">
        <p>
          One of your three campaigns is secretly the best — it converts better than the other
          two; you just don't know which one yet. Every impression spent on a different campaign
          pays a quiet price: the installs the best one would have earned, minus the installs
          you actually got.
        </p>
        <p>
          Add that price up, decision after decision, and you get <strong>regret</strong> — not
          the feeling, a number: a running tally of installs left on the table because you
          didn't know the answer up front. It can only climb or hold flat; a perfect pick just
          adds zero. That makes the shape of each line below the whole story. A line still
          climbing is a strategy still paying to learn. A line gone flat has found the winner
          and is riding it. Bending flat as early as possible is the entire game.
        </p>
        <p>
          Watch what happens to the line that just <strong>keeps exploring</strong> — splitting
          its attention evenly forever, the way "try a little of everything" behaves if nobody
          ever calls it and commits. The other two lines show what changes once a strategy
          starts favoring what the evidence already tells it.
        </p>
        <p>
          One footnote before you hit play: this chart plots <em>expected</em> regret — the
          average gap over many re-runs of the same race — while the gap your pilot named (the
          extra installs you'd have earned knowing the winner from week 1) was the{' '}
          <em>realized</em> kind, the gap in the one run that actually happened to you. Same
          idea; one is the theory, the other was your Tuesday.
        </p>
      </section>

      <SimulatorPanel
        sim={sim}
        pitchMode
        armLabel={(i) => pitchOutcome.labels[i]}
        revealExtra={<TruthReveal outcome={pitchOutcome} />}
      />

      <section className="pg-next-cta" aria-label="Act III — Rationing">
        <h3 className="pg-next-title">Act III — now add the budget</h3>
        <p className="pg-next-copy">
          Back to the calendar, still parked at the end of your pilot: the 13-week quarter
          starts now. In real life you never run one campaign at a time: every week you split
          a shared budget across all three. Same campaigns, same hidden truth.
        </p>
        <button type="button" className="ct-button pg-next-button" onClick={onGoToRationing}>
          Start the budgeted quarter →
        </button>
      </section>
    </div>
  )
}
