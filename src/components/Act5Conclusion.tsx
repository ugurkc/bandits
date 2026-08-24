import './conclusion.css'

/**
 * Act V — The Conclusion: prose only, the bookend to Act 0. What the
 * playground deliberately simplified, and what the same problem looks like
 * in production: contextual bandits, fed observable state, adapting
 * iteratively to a moving world. No simulator here; the essay ends on the
 * reader's own next move.
 */
export function Act5Conclusion() {
  return (
    <div className="concl">
      <h2 className="concl-title">Leaving the playground</h2>
      <p>
        Everything you just played was a story with the physics simplified. Three campaigns,
        one hidden number each, an audience that behaves like one person, and a world that
        mostly stands still. That simplification is what made the lesson visible: exploration
        has a price, exploitation has a risk, and <strong>regret</strong> is the meter that
        shows what your way of choosing actually cost.
      </p>
      <p>
        Real life refuses to be three numbers. The best ad depends on who is watching: their
        country, their platform, where they came from, what they have already seen, what day
        of the week it is. There is no single best campaign; there is a best campaign for
        this impression, right now. And every one of those rates moves as seasons change,
        competitors ship, and creatives wear out.
      </p>
      <p>
        The tool built for that world is the <strong>contextual bandit</strong> (a
        conditional bandit, if you like: every choice is conditioned on the state you can
        observe). Instead of learning one number per arm, it
        learns a function: given the state of things it can observe, which choice has the
        best odds right now? Every decision still explores and exploits, still minimizes
        regret, but the regret is measured against the best choice for each context, not the
        best choice on average. That is the version of this problem most production systems
        actually run.
      </p>
      <p>
        Getting there is mostly plumbing, not mathematics. You have to decide which metric
        you are willing to optimize. You have to log the context you saw, the choice you
        made, and what happened next, and close that loop fast enough for the system to act
        on it. You have to handle rewards that arrive late (an install today, a purchase in
        three weeks). And you have to keep a slice of honest exploration running forever,
        because the moment you stop exploring, you stop noticing that the world has moved.
      </p>
      <p>
        That is the real conclusion of this essay: minimizing regret is not a formula you
        install, it is a practice you operate. Feed the system the truest state you can
        observe, let it adapt iteratively as the dynamics shift, and treat every campaign,
        every quarter, and every dashboard as one more pull on an arm you are still learning.
        The playground told the story. The sequel is yours to run.
      </p>
    </div>
  )
}
