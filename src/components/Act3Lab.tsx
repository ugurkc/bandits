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
      'well-guessed ε can even beat Thompson — drop the horizon to 1,000 rounds and watch it ' +
      'happen; the tax only catches up over longer runs. It ' +
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
    label: 'Turn the menu over',
    blurb:
      'Three times mid-run, the offer nobody was buying becomes the top seller. None of these three ever forgets, so all three keep betting on a world that moved on — give Thompson a 1,000-round memory instead and 40% of its regret disappears.',
    apply: (sim) => sim.setDrift(true),
  },
  {
    id: 'crowded',
    label: 'Crowd the menu',
    blurb:
      'k = 6 arms — every wrong one you are still sampling costs you, and ε-greedy\'s random explores now spread six ways instead of three. Watch the early rounds get pricier.',
    apply: (sim) => {
      sim.setDrift(false)
      sim.setK(6)
    },
  },
]

/**
 * The honest closing beat. An earlier draft of this essay carried a "what
 * this leaves out" section and the acts restructure deleted it, which left
 * every simplification reading as something the author hadn't thought of
 * rather than something they chose. Each entry names the real term, so a
 * reader who wants the next thing to learn has the search query.
 */
const LIMITS: { term: string; body: string }[] = [
  {
    term: 'Forgetting (non-stationarity)',
    body:
      'The "Turn the menu over" button shows the problem and none of these three solve it — they weight a result from round 1 exactly like a result from round 4,999. The fixes are a sliding window, exponential discounting, or change-point detection. Discounted Thompson sampling is the usual first reach, and in this lab a 1,000-round memory is worth about 40% of Thompson\'s regret.',
  },
  {
    term: 'Inference vs. optimization',
    body:
      'Adaptive allocation biases the naive per-arm average: arms get sampled more precisely when they look good, so the numbers a bandit leaves behind are not a clean effect estimate. When you need a defensible measurement — pricing, a regulatory claim, anything you will re-litigate in six months — run the fixed split on purpose. That is the real reason the boring baseline still exists, and it is the most common senior-level objection to bandits.',
  },
  {
    term: 'Peeking and statistical power',
    body:
      'This whole page is continuous monitoring of a running experiment, which is exactly what invalidates a fixed-horizon significance test. If you are going to watch, use methods built for watching — always-valid inference, sequential tests, or simply committing to the allocation rule instead of to a p-value.',
  },
  {
    term: 'Context (who, not just what)',
    body:
      'Every arm here has one true rate shared by everybody. In reality the best creative differs by country, platform, and acquisition source. The moment you let the choice depend on features of the person you are serving, you have a contextual bandit — a genuinely harder problem, and the one most production systems actually run.',
  },
  {
    term: 'How good is "near-optimal"?',
    body:
      'There is real theory under the hand-waving: the best achievable regret grows like log(T) for a fixed problem, and a constant ε can never reach it — its tax is linear forever, which is why ε-greedy\'s line here stays straight while Thompson\'s bends. A decaying ε fixes that. UCB gets there by a different route, adding a confidence bonus instead of sampling.',
  },
  {
    term: 'The parts we skipped entirely',
    body:
      'Delayed rewards (an install today, a purchase in three weeks), interference between campaigns competing in one auction, creative fatigue, minimum-spend commitments, and the fact that three campaigns is a stylised number. A bandit only ever optimizes among the options you gave it.',
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

      <section className="a3-limits" aria-label="What this leaves out">
        <h3 className="a3-limits-title">What this leaves out</h3>
        <p className="a3-limits-lede">
          Everything above is the easy version of the problem: three fixed options, one metric,
          an audience that behaves the same for everyone. Here is what the simulator quietly
          assumes away — and what each of those assumptions is actually called.
        </p>
        <dl className="a3-limits-list">
          {LIMITS.map((limit) => (
            <div key={limit.term} className="a3-limit">
              <dt className="a3-limit-term">{limit.term}</dt>
              <dd className="a3-limit-body">{limit.body}</dd>
            </div>
          ))}
        </dl>
        <p className="a3-limits-close">
          The one worth carrying furthest: a bandit does not decide whether your metric is the
          right metric. Point it at the wrong one and it will find, quickly and efficiently, the
          most effective way to make that mistake.
        </p>
      </section>
    </div>
  )
}
