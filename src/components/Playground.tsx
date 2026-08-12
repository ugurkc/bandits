import { useEffect, useMemo, useRef, useState } from 'react'
import { STRATEGY_COLOR_VARS, STRATEGY_LABELS, STRATEGY_SHORT_LABELS } from '../lib/bandit/types'
import { statsAt } from '../lib/bandit/simulate'
import { scenarioAt } from '../lib/similarity/scenarios'
import { estimateOf, shareOf, useSimulation } from '../state/useSimulation'
import { useTrialDays } from '../state/useTrialDays'
import { RegretChart } from './RegretChart'
import type { RegretChartSeries } from './RegretChart'
import { ArmCard } from './ArmCard'
import type { ArmCardRow } from './ArmCard'
import { Controls } from './Controls'
import { PitchPhase } from './PitchPhase'
import type { PitchOutcome } from './PitchPhase'
import { TrialDayBoard } from './TrialDayBoard'
import { BanditBridge } from './BanditBridge'
import { TruthReveal } from './TruthReveal'

/** Minimum wall-time between statsAt recomputes while playing (it's O(t)). */
const STATS_INTERVAL_MS = 250

const armLabel = (i: number) => `Offer ${String.fromCharCode(65 + i)}`

/**
 * useTrialDays must be called unconditionally (rules of hooks), but it only
 * means anything once a pitch has been scored — this stable placeholder
 * keeps it harmless before that, and its rewind-on-rates-change logic swaps
 * it out for the real rates the moment scoring happens.
 */
const NO_OUTCOME_RATES = [0.05, 0.05, 0.05]

/** Index of the largest value; ties break to the lowest index. */
function argmax(values: number[]): number {
  let best = 0
  for (let i = 1; i < values.length; i++) {
    if (values[i] > values[best]) best = i
  }
  return best
}

/**
 * The simulator: controls, the regret race, and one card per offer variant.
 * All simulation state lives in useSimulation; this component only derives
 * view data from the precomputed result at the playhead.
 */
export function Playground() {
  const sim = useSimulation()
  const { config, result, t, playing } = sim
  const { k, horizon } = config

  // The pitch phase is the opening state. Scoring hands off to Act 1's five
  // manual trial days (run a handful of picks by hand first); finishing the
  // trial hands off to a bridge that names the k-armed bandit problem before
  // the automated race. Skipping the pitch bypasses all of it and goes
  // straight to the sandbox race. A pitch-derived race carries its outcome
  // for labels + the reveal.
  const [mode, setMode] = useState<'pitch' | 'trial' | 'race'>('pitch')
  const [scenarioIndex, setScenarioIndex] = useState(0)
  const [pitchOutcome, setPitchOutcome] = useState<PitchOutcome | null>(null)
  const trial = useTrialDays(pitchOutcome?.rates ?? NO_OUTCOME_RATES, config.seed)

  const handleScored = (outcome: PitchOutcome) => {
    setPitchOutcome(outcome)
    sim.applyPitchRates(outcome.rates)
    setMode('trial')
  }

  const handleSkip = () => {
    setPitchOutcome(null)
    setMode('race')
  }

  const backToPitches = () => {
    sim.reset()
    trial.reset()
    setMode('pitch')
  }

  const enterRace = () => setMode('race')

  // Series arrays are built once per result (they reference the full
  // precomputed regret arrays); the chart clips to the playhead itself.
  const series = useMemo<RegretChartSeries[]>(
    () =>
      result.strategies.map((run) => ({
        id: run.id,
        label: STRATEGY_LABELS[run.id],
        colorVar: STRATEGY_COLOR_VARS[run.id],
        values: run.regret,
      })),
    [result],
  )

  // statsAt is O(t) per strategy, too heavy for every frame at 3000
  // rounds/sec. `statsT` is the throttled playhead the cards are computed
  // at: it tracks `t` immediately when paused/stepping or when the playhead
  // rewinds, and at most every STATS_INTERVAL_MS of wall time while playing.
  const [statsT, setStatsT] = useState(0)
  const lastStatsClockRef = useRef(0)
  useEffect(() => {
    const now = performance.now()
    if (!playing || t < statsT || now - lastStatsClockRef.current >= STATS_INTERVAL_MS) {
      lastStatsClockRef.current = now
      setStatsT(t)
    }
  }, [playing, t, statsT])

  // Never past the playhead: when a config change swaps `result` and rewinds
  // `t` in the same commit, statsT still holds the old throttled value until
  // its effect fires — clamping here keeps the cards from painting one frame
  // of the new run at the old round.
  const statsRound = Math.min(statsT, t)

  const armStats = useMemo(
    () => result.strategies.map((run) => statsAt(run, statsRound, k)),
    [result, statsRound, k],
  )

  const cardRows = useMemo<ArmCardRow[][]>(
    () =>
      Array.from({ length: k }, (_, arm) =>
        result.strategies.map((run, s) => ({
          id: run.id,
          label: STRATEGY_SHORT_LABELS[run.id],
          colorVar: STRATEGY_COLOR_VARS[run.id],
          pulls: armStats[s].pulls[arm],
          share: shareOf(armStats[s].pulls[arm], statsRound),
          estimate: estimateOf(armStats[s].successes[arm], armStats[s].pulls[arm]),
        })),
      ),
    [result, armStats, statsRound, k],
  )

  // True rates at the playhead (they move under drift); cheap per frame.
  const rateRow = result.rates[Math.max(0, Math.min(t, horizon - 1))]
  const bestArm = argmax(rateRow)

  if (mode === 'pitch') {
    return (
      <PitchPhase
        scenario={scenarioAt(scenarioIndex)}
        seed={config.seed}
        onScored={handleScored}
        onNextScenario={() => setScenarioIndex((i) => i + 1)}
        onSkip={handleSkip}
      />
    )
  }

  if (mode === 'trial' && pitchOutcome) {
    return (
      <div className="pg">
        <div className="pg-topline">
          <span className="pg-context">
            You need to find which campaign works. Each day, you can decide to change the campaign
            you run — try one, see what happens, switch if it’s not working.
          </span>
          <button type="button" className="pp-skip" onClick={backToPitches}>
            ← Pitch campaigns instead
          </button>
        </div>

        <TrialDayBoard trial={trial} campaignLabels={pitchOutcome.labels} onPick={trial.playPick} />

        {trial.complete && (
          <BanditBridge
            totalInstalls={trial.totalInstalls}
            installsLeftOnTable={trial.installsLeftOnTable}
            onContinue={enterRace}
          />
        )}
      </div>
    )
  }

  return (
    <div className="pg">
      <div className="pg-topline">
        {pitchOutcome ? (
          <span className="pg-context">
            Your three campaigns are the arms — {STRATEGY_LABELS['fixed-split']}, ε-greedy and
            Thompson are running them on the {pitchOutcome.scenario.title.toLowerCase()}{' '}
            playerbase, at full speed. Reveal true rates to see the hidden truth.
          </span>
        ) : (
          <span className="pg-context">Sandbox mode — hidden rates are randomly drawn.</span>
        )}
        <button type="button" className="pp-skip" onClick={backToPitches}>
          ← Pitch campaigns instead
        </button>
      </div>
      <Controls
        playing={playing}
        onPlayPause={sim.playPause}
        onStep={sim.step}
        onReset={sim.reset}
        onReshuffle={sim.reshuffle}
        t={t}
        horizon={horizon}
        speed={sim.speed}
        onSpeed={sim.setSpeed}
        speeds={sim.speeds}
        epsilon={config.epsilon}
        onEpsilon={sim.setEpsilon}
        k={k}
        onK={sim.setK}
        horizonChoices={sim.horizonChoices}
        onHorizon={sim.setHorizon}
        driftEnabled={config.drift.enabled}
        onDrift={sim.setDrift}
        revealed={sim.revealed}
        onReveal={sim.setRevealed}
        pitchMode={pitchOutcome !== null}
      />
      <div className="pg-chart">
        <RegretChart series={series} t={t} horizon={horizon} />
      </div>
      {sim.revealed && pitchOutcome && <TruthReveal outcome={pitchOutcome} />}
      <div className="pg-arms">
        {cardRows.map((rows, arm) => (
          <ArmCard
            key={arm}
            index={arm}
            label={pitchOutcome ? pitchOutcome.labels[arm] : armLabel(arm)}
            trueRate={rateRow[arm]}
            revealed={sim.revealed}
            best={arm === bestArm}
            rows={rows}
          />
        ))}
      </div>
    </div>
  )
}
