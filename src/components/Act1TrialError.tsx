import { useEffect, useRef } from 'react'
import { STRATEGY_LABELS } from '../lib/bandit/types'
import type { CampaignId } from '../lib/campaign/types'
import { scenarioAt } from '../lib/similarity/scenarios'
import type { Simulation } from '../state/useSimulation'
import type { TrialWeeks } from '../state/useTrialWeeks'
import { PitchPhase } from './PitchPhase'
import type { PitchOutcome } from './PitchPhase'
import { SimulatorPanel } from './SimulatorPanel'
import { TrialWeekBoard } from './TrialWeekBoard'
import { BanditBridge } from './BanditBridge'
import { TruthReveal } from './TruthReveal'

/**
 * Act I's internal flow. The pitch phase is the opening state; scoring
 * hands off to the five-week manual pilot — the scenario brief's pilot run —
 * then a bridge that names the k-armed bandit problem before the automated
 * race. From the race, a CTA points on to Act II. Skipping the pitch jumps
 * to Act III's free-play lab instead (the sandbox lives there now).
 */
export type Act1Mode = 'pitch' | 'trial' | 'race'

const CAMPAIGN_IDS: CampaignId[] = [0, 1, 2]

export interface Act1TrialErrorProps {
  sim: Simulation
  mode: Act1Mode
  scenarioIndex: number
  pitchOutcome: PitchOutcome | null
  trial: TrialWeeks
  /** Controlled pitch drafts, owned by the shell (survive act navigation). */
  pitches: string[]
  onPitchesChange: (pitches: string[]) => void
  onScored: (outcome: PitchOutcome) => void
  onNextScenario: () => void
  onBackToPitches: () => void
  onEnterRace: () => void
  /** "Skip to the strategy lab" — Act III. */
  onSkipToLab: () => void
  /** The race screen's "start the budgeted quarter" CTA — Act II. */
  onGoToAct2: () => void
  announce: (message: string) => void
}

/**
 * Act I — Trial & Error: pitch three campaigns, feel five noisy pilot weeks
 * by hand, then watch three strategies race the same problem at full speed.
 */
export function Act1TrialError({
  sim,
  mode,
  scenarioIndex,
  pitchOutcome,
  trial,
  pitches,
  onPitchesChange,
  onScored,
  onNextScenario,
  onBackToPitches,
  onEnterRace,
  onSkipToLab,
  onGoToAct2,
  announce,
}: Act1TrialErrorProps) {
  // --- Focus + announcements at view seams -------------------------------
  // Every mode swap unmounts the element that held focus, so focus is moved
  // to the incoming view's topline (tabIndex={-1}); the shell's polite live
  // region announces the transition. Without this, a keyboard user's next
  // Tab restarts from the top of the page and a screen-reader user hears
  // nothing at all in response to their own activation.
  const toplineRef = useRef<HTMLDivElement>(null)
  const bridgeRef = useRef<HTMLDivElement>(null)

  const prevModeRef = useRef<Act1Mode>(mode)
  useEffect(() => {
    if (prevModeRef.current === mode) return
    prevModeRef.current = mode
    toplineRef.current?.focus()
    announce(
      mode === 'pitch'
        ? 'Pitch phase — write three campaign pitches and score them.'
        : mode === 'trial'
          ? 'Pilot — five weeks to try your campaigns, one pick per week.'
          : 'Automated race — three strategies play thousands of rounds at full speed.',
    )
  }, [mode, announce])

  // Every locked-in pilot pick announces its own result — the played cell's
  // aria-label alone is a static label, not a response to the activation.
  // The fifth pick also unmounts the whole picker (the just-pressed button
  // with it) and mounts the bridge, so completion moves focus there.
  const prevWeeksRef = useRef(trial.weeks.length)
  useEffect(() => {
    const prevWeeks = prevWeeksRef.current
    prevWeeksRef.current = trial.weeks.length
    if (mode !== 'trial' || trial.weeks.length <= prevWeeks) return
    const played = trial.weeks[trial.weeks.length - 1]
    const armId = pitchOutcome
      ? (CAMPAIGN_IDS.find((id) => (played.allocation[id] ?? 0) > 0) ?? 0)
      : 0
    const label = pitchOutcome ? pitchOutcome.labels[armId] : `Campaign ${armId + 1}`
    if (trial.complete) {
      announce(
        `Week ${played.week}: ran ${label}, ${played.totalInstalls.toLocaleString()} installs. ` +
          `Pilot complete — ${trial.totalInstalls.toLocaleString()} installs total.`,
      )
      bridgeRef.current?.focus()
    } else {
      announce(`Week ${played.week}: ran ${label}, ${played.totalInstalls.toLocaleString()} installs.`)
    }
  }, [mode, trial.weeks, trial.complete, trial.totalInstalls, pitchOutcome, announce])

  if (mode === 'trial' && pitchOutcome) {
    return (
      <div className="pg">
        <div className="pg-topline" ref={toplineRef} tabIndex={-1}>
          <span className="pg-context">
            Your pilot: five weeks at $300 a week — a test run on a fraction of the quarter’s
            $500-a-week budget — to find which campaign works. Each week, pick the one campaign
            to run — try it, see what happens, switch if it’s not working.
          </span>
          <button type="button" className="pp-skip" onClick={onBackToPitches}>
            ← Pitch campaigns instead
          </button>
        </div>

        <TrialWeekBoard
          trial={trial}
          campaignLabels={pitchOutcome.labels}
          campaignPitches={pitchOutcome.pitches}
          onPick={trial.playPick}
        />

        {trial.complete && (
          <div ref={bridgeRef} tabIndex={-1} className="pg-view-focus">
            <BanditBridge
              totalInstalls={trial.totalInstalls}
              installsLeftOnTable={trial.installsLeftOnTable}
              onContinue={onEnterRace}
            />
          </div>
        )}
      </div>
    )
  }

  if (mode === 'race' && pitchOutcome) {
    return (
      <div className="pg">
        <div className="pg-topline" ref={toplineRef} tabIndex={-1}>
          <span className="pg-context">
            No calendar time passes here — this is a replay, not the next chapter. Your three
            campaigns are the arms, and {STRATEGY_LABELS['fixed-split']}, ε-greedy and Thompson
            are re-running the same three against the{' '}
            {pitchOutcome.scenario.title.toLowerCase()} playerbase, decision by decision at the
            level of a single impression, sped up. Reveal true rates to see the hidden truth.
          </span>
          <button type="button" className="pp-skip" onClick={onBackToPitches}>
            ← Pitch campaigns instead
          </button>
        </div>

        <SimulatorPanel
          sim={sim}
          pitchMode
          armLabel={(i) => pitchOutcome.labels[i]}
          revealExtra={<TruthReveal outcome={pitchOutcome} />}
        />

        <section className="pg-act2-cta" aria-label="Act II — Rationing">
          <h3 className="pg-act2-title">Act II — now add the budget</h3>
          <p className="pg-act2-copy">
            Back to the calendar, still parked at the end of your pilot: the 13-week quarter
            starts now, at $500 a week instead of the pilot’s $300. In real life you never run
            one campaign at a time: every week you split a shared budget across all three. Same
            campaigns, same hidden truth.
          </p>
          <button type="button" className="ct-button pg-act2-button" onClick={onGoToAct2}>
            Start the budgeted quarter →
          </button>
        </section>
      </div>
    )
  }

  // 'pitch' — and the fallback for 'trial'/'race' reached without a scored
  // pitch (e.g. a deep link before any scoring).
  return (
    <div ref={toplineRef} tabIndex={-1} className="pg-view-focus">
      <PitchPhase
        scenario={scenarioAt(scenarioIndex)}
        seed={sim.config.seed}
        pitches={pitches}
        onPitchesChange={onPitchesChange}
        onScored={onScored}
        onNextScenario={onNextScenario}
        onSkip={onSkipToLab}
      />
    </div>
  )
}
