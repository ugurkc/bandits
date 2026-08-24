import './conclusion.css'

/**
 * Act V — The Conclusion: prose only, the bookend to Act 0. What the
 * playground deliberately simplified, what the same problem looks like in
 * production (contextual bandits, fed observable state, adapting
 * iteratively), and what the lessons are worth when the reader's ad
 * network runs the bandit for them. No simulator here; the essay ends on
 * the reader's own next move.
 *
 * Structure over blob: short sections under h3 headings (the shell's
 * sr-only h1 and this component's visible h2 sit above them) with lists
 * where the content is genuinely enumerable.
 */
export function Act5Conclusion() {
  return (
    <div className="concl">
      <h2 className="concl-title">Leaving the playground</h2>
      <p>
        Everything you just played was a story with the physics simplified. That
        simplification is what made the lesson visible: exploration has a price, exploitation
        has a risk, and <strong>regret</strong> is the meter that shows what your way of
        choosing actually cost.
      </p>

      <h3 className="concl-heading">What the playground simplified</h3>
      <ul className="concl-list">
        <li>Three campaigns, where a real quarter juggles dozens of creatives, formats and placements.</li>
        <li>One hidden rate per campaign, as if every player reacted the same way.</li>
        <li>An audience that behaves like one person: no countries, no platforms, no moods.</li>
        <li>
          A world that stands still, while real rates move as seasons change, competitors
          ship, and creatives wear out.
        </li>
      </ul>
      <p>
        Real life refuses to be three numbers. There is no single best campaign; there is a
        best campaign for <em>this</em> impression, right now.
      </p>

      <h3 className="concl-heading">The real tool: contextual bandits</h3>
      <p>
        The version of this problem production systems actually run is the{' '}
        <strong>contextual bandit</strong> (a conditional bandit, if you like: every choice is
        conditioned on the state you can observe). Instead of learning one number per arm, it
        learns a function: given what I can see about this moment and this player, which
        choice has the best odds right now? Every decision still explores and exploits, still
        minimizes regret, but the regret is measured against the best choice for each
        context, not the best choice on average.
      </p>

      <h3 className="concl-heading">What it takes to run one</h3>
      <p>Getting there is mostly plumbing, not mathematics. You have to:</p>
      <ul className="concl-list">
        <li>
          Decide which metric you are willing to optimize, and mean it: the system will find
          the fastest route to exactly what you measure.
        </li>
        <li>Log the context you saw, the choice you made, and what happened next.</li>
        <li>Close that loop fast enough for the system to act on it.</li>
        <li>Handle rewards that arrive late (an install today, a purchase in three weeks).</li>
        <li>
          Keep a slice of honest exploration running forever, because the moment you stop
          exploring, you stop noticing that the world has moved.
        </li>
      </ul>

      <h3 className="concl-heading">And if the algorithm is not yours</h3>
      <p>
        Most teams never build any of this. The ad network runs the bandit for them, tuned by
        people who do it full time. The lessons still travel; they just move one level up.
      </p>
      <ul className="concl-list">
        <li>
          <strong>Give it arms worth learning about.</strong> No optimizer can find a winner
          among three variations of the same hook; there is no signal there to find. Making
          the options genuinely different is the one lever nobody automates away.
        </li>
        <li>
          <strong>Do not kill a creative on a three-day gut read.</strong> That is the pilot
          strategy from Act I (try everything briefly, then commit to the early leader), and
          you watched what small samples do to it. Noise looks exactly like an answer.
        </li>
        <li>
          <strong>Early volatility is the cost of learning.</strong> A regret line climbs
          before it bends: a new campaign's rough first week is the platform deliberately
          spending on options it does not yet believe in. That gap is also a number you can
          plan with: this quarter's installs left on the table buy next quarter's winner.
        </li>
        <li>
          <strong>Your job is the metric and the menu.</strong> You choose the optimization
          event, the arms and the budget; the platform pulls the levers. Point it at the
          wrong metric and it will find, quickly and efficiently, the most effective way to
          make that mistake.
        </li>
      </ul>

      <h3 className="concl-heading">The practice</h3>
      <p>
        Minimizing regret is not a formula you install, it is a practice you operate. Feed
        the system the truest state you can observe, adapt as the dynamics shift, and treat
        every campaign, every quarter and every dashboard as one more pull on an arm you are
        still learning. The playground told the story. The sequel is yours to run.
      </p>
    </div>
  )
}
