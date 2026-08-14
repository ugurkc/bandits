import { useEffect, useMemo, useRef, useState } from 'react'
import { STRATEGY_COLOR_VARS, STRATEGY_IDS, STRATEGY_LABELS, STRATEGY_SHORT_LABELS } from '../lib/bandit/types'
import { statsAt } from '../lib/bandit/simulate'
import {
  quarterLeftOnTable,
  realizedOracleQuarter,
  runBudgetQuarter,
} from '../lib/campaign/budgetStrategies'
import { WEEKS_PER_QUARTER } from '../lib/campaign/types'
import { scenarioAt } from '../lib/similarity/scenarios'
import { estimateOf, shareOf, useSimulation } from '../state/useSimulation'
import { sumInstalls, useCampaignQuarter } from '../state/useCampaignQuarter'
import { useTrialDays } from '../state/useTrialDays'
import { RegretChart } from './RegretChart'
import type { RegretChartSeries } from './RegretChart'
import { ArmCard } from './ArmCard'
import type { ArmCardRow } from './ArmCard'
import { BudgetSplitPanel } from './BudgetSplitPanel'
import { CampaignCalendar } from './CampaignCalendar'
import { Controls } from './Controls'
import { HandoffCard } from './HandoffCard'
import { PitchPhase } from './PitchPhase'
import type { PitchOutcome } from './PitchPhase'
import { QuarterResults } from './QuarterResults'
import type { StrategyComparison } from './QuarterResults'
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

/**
 * Act 2's handoff gate (the design doc's `HANDOFF_MIN_WEEKS`): the reader
 * must split at least this many weeks by hand — feeling the tension —
 * before the card offering to hand the rest to a strategy appears.
 */
const HANDOFF_MIN_WEEKS = 2

/** Index of the largest value; ties break to the lowest index. */
function argmax(values: number[]): number {
  let best = 0
  for (let i = 1; i < values.length; i++) {
    if (values[i] > values[best]) best = i
  }
  return best
}

type Mode = 'pitch' | 'trial' | 'race' | 'act2'

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
  // manual trial days — the scenario brief's pilot week — then a bridge that
  // names the k-armed bandit problem before the automated race. From a
  // pitch-derived race, a CTA opens Act 2 — the budgeted quarter. Skipping
  // the pitch bypasses all of it and goes straight to the sandbox race. A
  // pitch-derived race carries its outcome for labels + the reveal.
  const [mode, setMode] = useState<Mode>('pitch')
  const [scenarioIndex, setScenarioIndex] = useState(0)
  const [pitchOutcome, setPitchOutcome] = useState<PitchOutcome | null>(null)
  const trial = useTrialDays(pitchOutcome?.rates ?? NO_OUTCOME_RATES, config.seed)

  // Act 2's quarter. Same NO_OUTCOME_RATES placeholder trick as useTrialDays
  // above (rules of hooks); every week is a budget split — the pick phase
  // was Act 1's job.
  const campaignRates = pitchOutcome?.rates ?? NO_OUTCOME_RATES
  const quarter = useCampaignQuarter(campaignRates, config.seed)

  // --- Focus + announcements at view seams -------------------------------
  // Every mode swap unmounts the element that held focus, so focus is moved
  // to the incoming view's topline (tabIndex={-1}); a single always-mounted
  // polite live region announces the transition, the handoff, and the
  // quarter's completion. Without this, a keyboard user's next Tab restarts
  // from the top of the page and a screen-reader user hears nothing at all
  // in response to their own activation.
  const [announcement, setAnnouncement] = useState('')
  const toplineRef = useRef<HTMLDivElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)

  const prevModeRef = useRef<Mode>(mode)
  useEffect(() => {
    if (prevModeRef.current === mode) return
    prevModeRef.current = mode
    toplineRef.current?.focus()
    setAnnouncement(
      mode === 'pitch'
        ? 'Pitch phase — write three campaign pitches and score them.'
        : mode === 'trial'
          ? 'Pilot week — five days to try your campaigns, one pick per day.'
          : mode === 'race'
            ? 'Automated race — three strategies play thousands of rounds at full speed.'
            : 'Act 2 — the budgeted quarter. Split the weekly budget across your campaigns.',
    )
  }, [mode])

  // Quarter completion — fires whether the animated handoff drained the last
  // week or the reader played week 13 by hand.
  const prevPhaseRef = useRef(quarter.phase)
  useEffect(() => {
    const prevPhase = prevPhaseRef.current
    prevPhaseRef.current = quarter.phase
    if (mode === 'act2' && quarter.phase === 'complete' && prevPhase !== 'complete') {
      setAnnouncement(`Quarter complete — ${quarter.totalInstalls.toLocaleString()} installs.`)
      resultsRef.current?.focus()
    }
  }, [mode, quarter.phase, quarter.totalInstalls])

  const handleScored = (outcome: PitchOutcome) => {
    setPitchOutcome(outcome)
    sim.applyPitchRates(outcome.rates)
    // Drift would random-walk the race's rates away from the pitch-derived
    // values while the reveal still presents fixed "% match" figures as
    // their source — the toggle is hidden in pitch mode (Controls), and any
    // sandbox-enabled drift is switched off here for the same reason.
    sim.setDrift(false)
    setMode('trial')
  }

  const handleSkip = () => {
    // A scored round left pitch-derived rates in the config, and sim.reset()
    // only rewinds the playhead — reshuffle so the sandbox copy's "hidden
    // rates are randomly drawn" is true from every path.
    if (pitchOutcome !== null) sim.reshuffle()
    setPitchOutcome(null)
    setMode('race')
  }

  const backToPitches = () => {
    sim.reset()
    trial.reset()
    quarter.reset()
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

  // Act 2's full-quarter comparison: each budgeted strategy re-run over all
  // 13 weeks from scratch, in the same deterministic world the reader
  // played. The budgeted ε-greedy gets the reader's race-screen ε — the same
  // value the handoff uses — so "ε-greedy" names one strategy everywhere.
  const comparisons = useMemo<StrategyComparison[]>(
    () =>
      STRATEGY_IDS.map((id) => ({
        id,
        label: STRATEGY_LABELS[id],
        colorVar: STRATEGY_COLOR_VARS[id],
        totalInstalls: sumInstalls(
          runBudgetQuarter(id, campaignRates, config.seed, 1, [], config.epsilon),
        ),
      })),
    [campaignRates, config.seed, config.epsilon],
  )

  let view = null

  if (mode === 'pitch') {
    view = (
      <div ref={toplineRef} tabIndex={-1} className="pg-view-focus">
        <PitchPhase
          scenario={scenarioAt(scenarioIndex)}
          seed={config.seed}
          onScored={handleScored}
          onNextScenario={() => setScenarioIndex((i) => i + 1)}
          onSkip={handleSkip}
        />
      </div>
    )
  } else if (mode === 'trial' && pitchOutcome) {
    view = (
      <div className="pg">
        <div className="pg-topline" ref={toplineRef} tabIndex={-1}>
          <span className="pg-context">
            Your pilot week: five days before the 13-week quarter starts, to find which campaign
            works. Each day, pick the one campaign to run — try it, see what happens, switch if
            it’s not working.
          </span>
          <button type="button" className="pp-skip" onClick={backToPitches}>
            ← Pitch campaigns instead
          </button>
        </div>

        <TrialDayBoard
          trial={trial}
          campaignLabels={pitchOutcome.labels}
          campaignPitches={pitchOutcome.pitches}
          onPick={trial.playPick}
        />

        {trial.complete && (
          <BanditBridge
            totalInstalls={trial.totalInstalls}
            installsLeftOnTable={trial.installsLeftOnTable}
            onContinue={enterRace}
          />
        )}
      </div>
    )
  } else if (mode === 'act2' && pitchOutcome) {
    const handoffMarker = quarter.handoff
      ? {
          fromWeek: quarter.handoff.fromWeek,
          colorVar: STRATEGY_COLOR_VARS[quarter.handoff.strategyId],
          label: STRATEGY_LABELS[quarter.handoff.strategyId],
        }
      : null
    view = (
      <div className="pg">
        <div className="pg-topline" ref={toplineRef} tabIndex={-1}>
          <span className="pg-context">
            Act 2 — the quarter starts now. Split $500 across your three campaigns each week.
            Hedge and you learn slowly; concentrate and you might be feeding the wrong ad.
          </span>
          <button type="button" className="pp-skip" onClick={() => setMode('race')}>
            ← Back to the race
          </button>
        </div>

        <CampaignCalendar
          quarter={quarter}
          campaignLabels={pitchOutcome.labels}
          handoff={handoffMarker}
        >
          {quarter.phase === 'budget' && (
            <BudgetSplitPanel
              week={quarter.currentWeek}
              campaignLabels={pitchOutcome.labels}
              onCommit={quarter.playWeek}
            />
          )}
        </CampaignCalendar>

        {/* Only while the reader is splitting by hand: during 'auto' the
            handoff animation is draining (a second hand-off would no-op but
            the offer would be misleading), and at 'complete' it's moot. */}
        {quarter.weeks.length >= HANDOFF_MIN_WEEKS && quarter.phase === 'budget' && (
          <HandoffCard
            remainingWeeks={WEEKS_PER_QUARTER - quarter.weeks.length}
            onHandOff={(id) => {
              // The reader's race-screen ε rides along, so the budgeted
              // ε-greedy is the strategy they tuned, not a silent 0.1.
              quarter.handOff(id, config.epsilon)
              setAnnouncement(
                `Handed off to ${STRATEGY_LABELS[id]} — playing the remaining weeks.`,
              )
            }}
          />
        )}

        {quarter.phase === 'complete' && (
          <>
            <div ref={resultsRef} tabIndex={-1} className="pg-view-focus">
              <QuarterResults
                weeks={quarter.weeks}
                handoff={quarter.handoff}
                campaignLabels={pitchOutcome.labels}
                totalInstalls={quarter.totalInstalls}
                leftOnTable={quarterLeftOnTable(
                  quarter.totalInstalls,
                  WEEKS_PER_QUARTER,
                  campaignRates,
                  config.seed,
                )}
                comparisons={comparisons}
                oracleInstalls={realizedOracleQuarter(campaignRates, config.seed)}
              />
            </div>
            <div className="pg-act2-actions">
              <button
                type="button"
                className="ct-button"
                onClick={() => {
                  quarter.reset()
                  setAnnouncement('Quarter restarted — back to week 1.')
                  toplineRef.current?.focus()
                }}
              >
                Restart the quarter
              </button>
              <button type="button" className="pp-skip" onClick={() => setMode('race')}>
                ← Back to the race
              </button>
            </div>
          </>
        )}
      </div>
    )
  } else {
    view = (
      <div className="pg">
        <div className="pg-topline" ref={toplineRef} tabIndex={-1}>
          {pitchOutcome ? (
            <span className="pg-context">
              Your three campaigns are the arms — {STRATEGY_LABELS['fixed-split']}, ε-greedy and
              Thompson are spending a long campaign on the{' '}
              {pitchOutcome.scenario.title.toLowerCase()} playerbase: thousands of tiny yes-or-no
              decisions, compressed and sped up. Reveal true rates to see the hidden truth.
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
          {pitchOutcome ? (
            <RegretChart series={series} t={t} horizon={horizon} />
          ) : (
            // The sandbox's arms are generic offer variants, not the pitch
            // flow's ad campaigns — the reward noun follows.
            <RegretChart
              series={series}
              t={t}
              horizon={horizon}
              title="conversions left on the table"
              caption="The higher a line climbs, the more conversions that strategy is giving up by picking worse offers instead of the best one."
              unit="conversions"
            />
          )}
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
        {pitchOutcome && (
          <section className="pg-act2-cta" aria-label="Act 2 — the budgeted quarter">
            <h3 className="pg-act2-title">Act 2 — now add the budget</h3>
            <p className="pg-act2-copy">
              The pilot week and the race were the warm-up — the 13-week quarter starts now. In
              real life you never run one campaign at a time: every week you split a shared
              budget across all three. Same campaigns, same hidden truth.
            </p>
            <button type="button" className="ct-button pg-act2-button" onClick={() => setMode('act2')}>
              Start the budgeted quarter →
            </button>
          </section>
        )}
      </div>
    )
  }

  return (
    <>
      {view}
      {/* Always mounted, so mode swaps can't tear the live region out from
          under the announcement it's supposed to make. */}
      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>
    </>
  )
}
