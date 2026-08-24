import { STRATEGY_COLOR_VARS } from '../lib/bandit/types'
import type { Simulation } from '../state/useSimulation'
import { SimulatorPanel } from './SimulatorPanel'
import './lab.css'

interface StrategyCard {
  id: 'fixed-split' | 'epsilon-greedy' | 'thompson' | 'ucb' | 'random'
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
      'It doesn\'t. Every arm gets an equal share, forever: the classic A/B test run to the ' +
      'end of the calendar, no matter what the numbers already say.',
    winsAndLoses:
      'It wins on trust: every arm gets the same volume, so its estimates are clean, unbiased ' +
      'and easy to defend in a meeting. It loses on cost: it keeps paying full price for ' +
      'every bad arm all the way to the horizon, which is why its regret line climbs in a ' +
      'straight line and never bends.',
    takeaway:
      'This is what a calendar-driven test plan is, whether or not anyone calls it a strategy. ' +
      'Use it when a clean read matters more than the spend, then notice how much that read ' +
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
      'It wins on simplicity: ten lines of code on top of counters you already log, and with ' +
      'a sane ε it finds the best arm fast and mostly sticks to it. At short horizons a ' +
      'well-guessed ε can even beat Thompson. Drop the horizon to 1,000 rounds and watch it ' +
      'happen; the tax only catches up over longer runs. It ' +
      'loses at the edges: it explores at the same fixed rate forever (a permanent tax, even ' +
      'long after the answer is obvious), it wastes explores on arms it already knows are bad, ' +
      'and ε itself is a guess you have to get right.',
    takeaway:
      'The gateway drug. If your team runs A/B tests and ships the winner, ε-greedy is the ' +
      'smallest possible step toward adaptive allocation. Try ε around 0.1, and revisit any ' +
      'test that\'s still splitting 50/50 three weeks after the answer was clear.',
    pseudocode:
      'every round:\n  with probability ε:\n    try a random arm\n  otherwise:\n    back the arm with the best\n    observed rate so far',
  },
  {
    id: 'thompson',
    name: 'Thompson sampling',
    thinks:
      'It keeps an honest account of its own uncertainty: each arm gets a Beta(1 + wins, ' +
      '1 + misses) distribution: wide when the arm is barely tried, narrow as evidence piles ' +
      'up. Each round it samples one plausible rate from every arm\'s distribution and backs ' +
      'the highest draw.',
    winsAndLoses:
      'It wins because exploration scales itself down: an uncertain arm sometimes samples ' +
      'high and gets tried; a well-measured loser almost never does. No knob to tune, and ' +
      'near-optimal regret as the horizon grows: the lowest bending curve in the chart ' +
      '(over a short run, a lucky ε can still edge it out). It loses when the world moves: like ' +
      'everything on this page it never forgets old data, so a posterior built on last ' +
      'month\'s world stays confidently stale, and it\'s harder to explain to a ' +
      'stakeholder than "we test 10% of the time".',
    takeaway:
      'The idea that transfers even without the math: bet on each option in proportion to the ' +
      'probability it\'s the best one, given what you\'ve seen. A Beta sampler is ~15 lines; ' +
      'most experimentation platforms already offer this under "auto-allocate" or "dynamic ' +
      'traffic".',
    pseudocode:
      'every round:\n  for each arm:\n    draw a plausible rate from\n    Beta(1 + wins, 1 + misses)\n  back the arm with the highest draw',
  },
  {
    id: 'ucb',
    name: 'UCB (Upper Confidence Bound)',
    thinks:
      'Optimism under uncertainty. Each arm gets a score: its average so far, plus a bonus ' +
      'for how uncertain that average still is. Play the highest score. A barely-tried arm ' +
      'carries a big bonus (its best case could be anything); a well-tried arm is judged ' +
      'almost purely on its record. This lab runs UCB1-Tuned, the variant whose bonus also ' +
      'shrinks with the arm\'s observed variance, which matters at install-rate-scale odds.',
    winsAndLoses:
      'It wins on principle: no knob to tune, fully deterministic (same data in, same pick ' +
      'out, which auditors and on-call engineers love), and its line bends like Thompson\'s. ' +
      'Stretch the horizon to 20,000 rounds and watch it cross below ε-greedy\'s fixed tax. ' +
      'One honest asterisk: the proven log(T) regret theorem belongs to plain UCB1; the ' +
      'Tuned variant here is its empirically better sibling, presented in the same paper ' +
      'without a proof. It loses on temperament: built for the worst case, it typically ' +
      'pays a little more than Thompson to reach the same answer.',
    takeaway:
      'When you need a defensible, reproducible decision rule (no sampling, no seed, every ' +
      'pick explainable as "highest average plus uncertainty bonus"), UCB is the one to ' +
      'reach for. It is also the standard baseline in the research literature.',
    pseudocode:
      'every round:\n  for each arm:\n    bonus = sqrt(ln t / tries),\n    scaled by observed variance\n    score = average + bonus\n  back the arm with the top score',
  },
  {
    id: 'random',
    name: 'Uniform random',
    thinks:
      'It doesn\'t, on purpose. Every round it picks any arm with equal odds and never looks ' +
      'at a single result. Pure exploration, zero exploitation.',
    winsAndLoses:
      'It never wins; it exists to be beaten. Its regret climbs in a straight line at the ' +
      'same steep slope as the fixed split (both pay the average gap to the best arm, every ' +
      'round, forever; one spreads it evenly, one spreads it noisily). If any strategy you ' +
      'build cannot clearly beat this line, the strategy is broken, the metric is broken, ' +
      'or there is nothing to learn.',
    takeaway:
      'This is the null hypothesis of allocation, and running it deliberately on a small ' +
      'slice of traffic is genuinely useful: it produces the one clean, unbiased dataset in ' +
      'the whole system, which is exactly what you retrain your models on later.',
    pseudocode: 'every round:\n  pick any arm,\n  all equally likely',
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
    blurb: 'ε = 0.4: ε-greedy keeps paying the explore tax long after the answer is obvious.',
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
    blurb: 'ε = 0.02: sometimes brilliant, sometimes stuck on the wrong arm all run. Reshuffle a few times.',
    apply: (sim) => {
      sim.setDrift(false)
      sim.setEpsilon(0.02)
    },
  },
  {
    id: 'drift',
    label: 'Turn the menu over',
    blurb:
      'Three times mid-run, the offer nobody was buying becomes the top seller. None of these strategies ever forgets, so they all keep betting on a world that moved on. Give Thompson a 1,000-round memory instead and 40% of its regret disappears.',
    apply: (sim) => sim.setDrift(true),
  },
  {
    id: 'crowded',
    label: 'Crowd the menu',
    blurb:
      'k = 6 arms: every wrong one you are still sampling costs you, and ε-greedy\'s random explores now spread six ways instead of three. Watch the early rounds get pricier.',
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
      'The "Turn the menu over" button shows the problem and none of these five solve it: they weight a result from round 1 exactly like a result from round 4,999. The fixes are a sliding window, exponential discounting, or change-point detection. Discounted Thompson sampling is the usual first reach, and in this lab a 1,000-round memory is worth about 40% of Thompson\'s regret.',
  },
  {
    term: 'Inference vs. optimization',
    body:
      'Adaptive allocation biases the naive per-arm average: arms get sampled more precisely when they look good, so the numbers a bandit leaves behind are not a clean effect estimate. When you need a defensible measurement (pricing, a regulatory claim, anything you will re-litigate in six months), run the fixed split on purpose. That is the real reason the boring baseline still exists, and it is the most common senior-level objection to bandits.',
  },
  {
    term: 'Peeking and statistical power',
    body:
      'This whole page is continuous monitoring of a running experiment, which is exactly what invalidates a fixed-horizon significance test. If you are going to watch, use methods built for watching: always-valid inference, sequential tests, or simply committing to the allocation rule instead of to a p-value.',
  },
  {
    term: 'Context (who, not just what)',
    body:
      'Every arm here has one true rate shared by everybody. In reality the best creative differs by country, platform, and acquisition source. The moment you let the choice depend on features of the person you are serving, you have a contextual bandit: a genuinely harder problem, and the one most production systems actually run.',
  },
  {
    term: 'How good is "near-optimal"?',
    body:
      'There is real theory under the hand-waving: the best achievable regret grows like log(T) for a fixed problem, and a constant ε can never reach it: its tax is linear forever, which is why ε-greedy\'s line here stays straight while Thompson\'s and UCB\'s bend. A decaying ε fixes that. Watch the race above: the two bending lines are the two built to chase that log(T) shape (Thompson provably; UCB1-Tuned empirically, with the theorem held by its plainer sibling).',
  },
  {
    term: 'The parts we skipped entirely',
    body:
      'Delayed rewards (an install today, a purchase in three weeks), interference between campaigns competing in one auction, creative fatigue, minimum-spend commitments, and the fact that three campaigns is a stylised number. A bandit only ever optimizes among the options you gave it.',
  },
]

export interface Act4LabProps {
  sim: Simulation
  /** The closing CTA — Act V, the essay's prose conclusion. */
  onGoToConclusion: () => void
}

/**
 * Act IV — Learning from the Best: what each strategy actually does, where
 * it wins and loses, what to take home — next to a free-play lab (the
 * sandbox: hidden random rates, every control exposed) where each claim can
 * be tested immediately.
 */
export function Act4Lab({ sim, onGoToConclusion }: Act4LabProps) {
  const runExperiment = (experiment: Experiment) => {
    experiment.apply(sim)
    if (!sim.playing) sim.playPause()
  }

  return (
    <div className="pg">
      <p className="lab-intro">
        Five strategies, one question: <strong>which arm do you pull next?</strong> Whether or
        not you've watched them race in Act II, this act is about why their regret lines bend the
        way they do, and what each strategy is worth outside this essay. Everything below runs
        on hidden, randomly drawn rates: reshuffle, tune, and reveal as much as you like.
      </p>

      <div className="lab-cards">
        {STRATEGY_CARDS.map((card) => (
          <article key={card.id} className="lab-card" aria-label={card.name}>
            <h3 className="lab-card-name">
              <span
                className="lab-card-chip"
                style={{ background: STRATEGY_COLOR_VARS[card.id] }}
                aria-hidden="true"
              />
              {card.name}
            </h3>
            <p className="lab-card-section">
              <strong>How it thinks.</strong> {card.thinks}
            </p>
            <p className="lab-card-section">
              <strong>Where it wins and loses.</strong> {card.winsAndLoses}
            </p>
            <p className="lab-card-section">
              <strong>Take it home.</strong> {card.takeaway}
            </p>
            <pre className="lab-card-code" aria-label={`${card.name} pseudocode`}>
              {card.pseudocode}
            </pre>
          </article>
        ))}
      </div>

      <section className="lab-experiments" aria-label="Lab experiments">
        <h3 className="lab-experiments-title">Put the claims to the test</h3>
        <div className="lab-experiment-row">
          {EXPERIMENTS.map((experiment) => (
            <button
              key={experiment.id}
              type="button"
              className="lab-experiment"
              onClick={() => runExperiment(experiment)}
            >
              <span className="lab-experiment-label">{experiment.label}</span>
              <span className="lab-experiment-blurb">{experiment.blurb}</span>
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

      <section className="lab-limits" aria-label="What this leaves out">
        <h3 className="lab-limits-title">What this leaves out</h3>
        <p className="lab-limits-lede">
          Everything above is the easy version of the problem: three fixed options, one metric,
          an audience that behaves the same for everyone. Here is what the simulator quietly
          assumes away, and what each of those assumptions is actually called.
        </p>
        <dl className="lab-limits-list">
          {LIMITS.map((limit) => (
            <div key={limit.term} className="lab-limit">
              <dt className="lab-limit-term">{limit.term}</dt>
              <dd className="lab-limit-body">{limit.body}</dd>
            </div>
          ))}
        </dl>
        <p className="lab-limits-close">
          The one worth carrying furthest: a bandit does not decide whether your metric is the
          right metric. Point it at the wrong one and it will find, quickly and efficiently, the
          most effective way to make that mistake.
        </p>
      </section>

      <section className="pg-next-cta" aria-label="Act V: The Conclusion">
        <h3 className="pg-next-title">Act V: leaving the playground</h3>
        <p className="pg-next-copy">
          One act left, and it is prose: what all of this looks like once the audience is not
          one person and the world will not stand still. Contextual bandits, the state you can
          feed them, and why minimizing regret is a practice, not a formula.
        </p>
        <button type="button" className="ct-button pg-next-button" onClick={onGoToConclusion}>
          Act V: The Conclusion →
        </button>
      </section>
    </div>
  )
}
