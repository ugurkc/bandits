import { STRATEGY_COLOR_VARS } from '../lib/bandit/types'
import type { Simulation } from '../state/useSimulation'
import { SimulatorPanel } from './SimulatorPanel'
import './act3.css'

interface StrategyCard {
  id: 'fixed-split' | 'epsilon-greedy' | 'thompson'
  name: string
  thinks: string
  winsAndLoses: string
  takeaway: string
  pseudocode: string
}

/**
 * The teaching content: how each strategy thinks, where it wins and loses,
 * and what to take back to your own A/B stack. Kept next to the lab so a
 * claim can be tested the moment it's read.
 */
const STRATEGY_CARDS: StrategyCard[] = [
  {
    id: 'fixed-split',
    name: 'Fixed A/B split',
    thinks:
      'It doesn\'t. Every arm gets an equal share, forever — the classic A/B test run to the ' +
      'end of the calendar, no matter what the numbers already say.',
    winsAndLoses:
      'It wins on trust: every arm gets the same volume, so its estimates are clean, unbiased ' +
      'and easy to defend in a meeting. It loses on cost — it keeps paying full price for ' +
      'every bad arm all the way to the horizon, which is why its regret line climbs in a ' +
      'straight line and never bends.',
    takeaway:
      'This is what a calendar-driven test plan is, whether or not anyone calls it a strategy. ' +
      'Use it when a clean read matters more than the spend — then notice how much that read ' +
      'costs you.',
    pseudocode: 'every round:\n  give each arm an equal share',
  },
  {
    id: 'epsilon-greedy',
    name: 'ε-greedy',
    thinks:
      'One knob: with probability ε it tries a random arm ("explore"), otherwise it backs ' +
      'whichever arm looks best so far ("exploit"). Everything it knows is two counters per ' +
      'arm: tries and wins.',
    winsAndLoses:
      'It wins on simplicity — ten lines of code on top of counters you already log, and with ' +
      'a sane ε it finds the best arm fast and mostly sticks to it. At short horizons a ' +
      'well-guessed ε can even beat Thompson; the tax only catches up over longer runs. It ' +
      'loses at the edges: it explores at the same fixed rate forever (a permanent tax, even ' +
      'long after the answer is obvious), it wastes explores on arms it already knows are bad, ' +
      'and ε itself is a guess you have to get right.',
    takeaway:
      'The gateway drug. If your team runs A/B tests and ships the winner, ε-greedy is the ' +
      'smallest possible step toward adaptive allocation — try ε around 0.1, and revisit any ' +
      'test that\'s still splitting 50/50 three weeks after the answer was clear.',
    pseudocode:
      'every round:\n  with probability ε:\n    try a random arm\n  otherwise:\n    back the arm with the best\n    observed rate so far',
  },
  {
    id: 'thompson',
    name: 'Thompson sampling',
    thinks:
      'It keeps an honest account of its own uncertainty: each arm gets a Beta(1 + wins, ' +
      '1 + misses) distribution — wide when the arm is barely tried, narrow as evidence piles ' +
      'up. Each round it samples one plausible rate from every arm\'s distribution and backs ' +
      'the highest draw.',
    winsAndLoses:
      'It wins because exploration scales itself down: an uncertain arm sometimes samples ' +
      'high and gets tried; a well-measured loser almost never does. No knob to tune, and ' +
      'near-optimal regret as the horizon grows — the bending curve in the chart (over a ' +
      'short run, a lucky ε can still edge it out). It loses when the world moves: like ' +
      'everything on this page it never forgets old data, so a posterior built on last ' +
      'month\'s world stays confidently stale — and it\'s harder to explain to a ' +
      'stakeholder than "we test 10% of the time".',
    takeaway:
      'The idea that transfers even without the math: bet on each option in proportion to the ' +
      'probability it\'s the best one, given what you\'ve seen. A Beta sampler is ~15 lines; ' +
      'most experimentation platforms already offer this under "auto-allocate" or "dynamic ' +
      'traffic".',
    pseudocode:
      'every round:\n  for each arm:\n    draw a plausible rate from\n    Beta(1 + wins, 1 + misses)\n  back the arm with the highest draw',
  },
]

interface Experiment {
  id: string
  label: string
  blurb: string
  apply: (sim: Simulation) => void
}

/**
 * One-click lab setups, each demonstrating a claim from the cards above.
 * Every apply() rewinds the run (the setters do that by contract) and makes
 * sure playback is running so the effect is visible immediately.
 */
const EXPERIMENTS: Experiment[] = [
  {
    id: 'explore-tax',
    label: 'Crank exploration',
    blurb: 'ε = 0.4 — ε-greedy keeps paying the explore tax long after the answer is obvious.',
    apply: (sim) => {
      // Clear drift first: "long after the answer is obvious" needs a
      // stable answer to be obvious about.
      sim.setDrift(false)
      sim.setEpsilon(0.4)
    },
  },
  {
    id: 'barely-explore',
    label: 'Barely explore',
    blurb: 'ε = 0.02 — sometimes brilliant, sometimes stuck on the wrong arm all run. Reshuffle a few times.',
    apply: (sim) => {
      sim.setDrift(false)
      sim.setEpsilon(0.02)
    },
  },
  {
    id: 'drift',
    label: 'Let the world drift',
    blurb:
      'Rates wander mid-run — and none of these three ever forgets old data. The fixed split pays most; even the winners are coasting on stale beliefs.',
    apply: (sim) => sim.setDrift(true),
  },
  {
    id: 'crowded',
    label: 'Crowd the menu',
    blurb:
      'k = 6 arms — every arm must be tried before anyone can commit, and ε-greedy\'s random explores now spread six ways. Watch the early rounds get pricier.',
    apply: (sim) => {
      sim.setDrift(false)
      sim.setK(6)
    },
  },
]

export interface Act3LabProps {
  sim: Simulation
}

/**
 * Act III — Learning from the Best: what each strategy actually does, where
 * it wins and loses, what to take home — next to a free-play lab (the
 * sandbox: hidden random rates, every control exposed) where each claim can
 * be tested immediately.
 */
export function Act3Lab({ sim }: Act3LabProps) {
  const runExperiment = (experiment: Experiment) => {
    experiment.apply(sim)
    if (!sim.playing) sim.playPause()
  }

  return (
    <div className="pg">
      <p className="a3-intro">
        Three strategies, one question: <strong>which arm do you pull next?</strong> Whether or
        not you've watched them race in Act I, this act is about why their regret lines bend the
        way they do, and what each strategy is worth outside this essay. Everything below runs
        on hidden, randomly drawn rates — reshuffle, tune, and reveal as much as you like.
      </p>

      <div className="a3-cards">
        {STRATEGY_CARDS.map((card) => (
          <article key={card.id} className="a3-card" aria-label={card.name}>
            <h3 className="a3-card-name">
              <span
                className="a3-card-chip"
                style={{ background: STRATEGY_COLOR_VARS[card.id] }}
                aria-hidden="true"
              />
              {card.name}
            </h3>
            <p className="a3-card-section">
              <strong>How it thinks.</strong> {card.thinks}
            </p>
            <p className="a3-card-section">
              <strong>Where it wins — and loses.</strong> {card.winsAndLoses}
            </p>
            <p className="a3-card-section">
              <strong>Take it home.</strong> {card.takeaway}
            </p>
            <pre className="a3-card-code" aria-label={`${card.name} pseudocode`}>
              {card.pseudocode}
            </pre>
          </article>
        ))}
      </div>

      <section className="a3-experiments" aria-label="Lab experiments">
        <h3 className="a3-experiments-title">Put the claims to the test</h3>
        <div className="a3-experiment-row">
          {EXPERIMENTS.map((experiment) => (
            <button
              key={experiment.id}
              type="button"
              className="a3-experiment"
              onClick={() => runExperiment(experiment)}
            >
              <span className="a3-experiment-label">{experiment.label}</span>
              <span className="a3-experiment-blurb">{experiment.blurb}</span>
            </button>
          ))}
        </div>
      </section>

      <SimulatorPanel
        sim={sim}
        pitchMode={false}
        chartTitle="expected conversions given up"
        chartCaption="The higher a line climbs, the more conversions that strategy is giving up, on average, by picking worse offers instead of the best one."
        chartUnit="conversions"
      />
    </div>
  )
}
