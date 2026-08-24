import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { STRATEGY_COLOR_VARS, STRATEGY_LABELS, STRATEGY_SHORT_LABELS } from '../lib/bandit/types'
import { statsAt } from '../lib/bandit/simulate'
import type { Simulation } from '../state/useSimulation'
import { estimateOf, shareOf } from '../state/useSimulation'
import { RegretChart } from './RegretChart'
import type { RegretChartSeries } from './RegretChart'
import { ArmCard } from './ArmCard'
import type { ArmCardRow } from './ArmCard'
import { Controls } from './Controls'

/** Minimum wall-time between statsAt recomputes while playing (it's O(t)). */
const STATS_INTERVAL_MS = 250

/** Index of the largest value; ties break to the lowest index. */
function argmax(values: number[]): number {
  let best = 0
  for (let i = 1; i < values.length; i++) {
    if (values[i] > values[best]) best = i
  }
  return best
}

export interface SimulatorPanelProps {
  sim: Simulation
  /**
   * True when the arms' rates came from the reader's pitches: hides the
   * reshuffle/k/drift controls (they'd silently break the pitch→rate
   * mapping — see ControlsProps.pitchMode) and keeps the chart's default
   * "installs" framing.
   */
  pitchMode: boolean
  /** Arm display label; defaults to "Offer A/B/…" for the sandbox lab. */
  armLabel?: (index: number) => string
  /** Reward-noun overrides forwarded to the chart (sandbox lab framing). */
  chartTitle?: string
  chartCaption?: string
  chartUnit?: string
  /** Rendered between the chart and the arm cards while "Reveal" is on. */
  revealExtra?: ReactNode
}

const defaultArmLabel = (i: number) => `Offer ${String.fromCharCode(65 + i)}`

/**
 * The automated-race surface shared by Act II (pitch-derived race) and
 * Act IV (the free-play lab): controls, the regret chart, and one card per arm.
 * All simulation state lives in the `Simulation` passed in; this component
 * only derives view data from the precomputed result at the playhead.
 */
export function SimulatorPanel({
  sim,
  pitchMode,
  armLabel = defaultArmLabel,
  chartTitle,
  chartCaption,
  chartUnit,
  revealExtra,
}: SimulatorPanelProps) {
  const { config, result, t, playing } = sim
  const { k, horizon } = config

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

  return (
    <>
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
        pitchMode={pitchMode}
      />
      <div className="pg-chart">
        <RegretChart
          series={series}
          t={t}
          horizon={horizon}
          title={chartTitle}
          caption={chartCaption}
          unit={chartUnit}
        />
      </div>
      {sim.revealed && revealExtra}
      <div className="pg-arms">
        {cardRows.map((rows, arm) => (
          <ArmCard
            key={arm}
            index={arm}
            label={armLabel(arm)}
            trueRate={rateRow[arm]}
            revealed={sim.revealed}
            best={arm === bestArm}
            rows={rows}
          />
        ))}
      </div>
    </>
  )
}
