import './trial.css'

export interface BanditBridgeProps {
  totalInstalls: number
  installsLeftOnTable: number
  onContinue: () => void
}

/**
 * The beat between Act 1's pilot week and the automated race: recap the
 * reader's own noisy results, name the concrete cost of guessing (the
 * installs a perfect-foresight oracle's REALIZED run of the same five days
 * would have earned — same seed, same draws, so the gap is attributable to
 * picks, not luck), ask the question the algorithms answer, then name what
 * they just did — the k-armed bandit problem — before handing off. Also
 * sets up Act 2: names the simplification (one campaign at a time, no
 * budget to split) as deliberate scaffolding, not the finished picture —
 * strategies first, at a simple scale, then the budgeting constraint that
 * makes it look like the reader's actual day-to-day problem.
 */
export function BanditBridge({ totalInstalls, installsLeftOnTable, onContinue }: BanditBridgeProps) {
  return (
    <section className="bb-wrap" aria-label="From the pilot week to the bandit problem">
      <p className="bb-recap">
        Five days of pilot week, five picks, <strong>{totalInstalls.toLocaleString()} installs</strong>{' '}
        total — and probably a different campaign in your gut than the one you started with.
      </p>
      {installsLeftOnTable > 0 && (
        <p className="bb-recap">
          Here's the catch: if you'd put every day on the campaign that truly converts best — in
          this exact world, same days, same luck — you'd have earned about{' '}
          <strong>{installsLeftOnTable.toLocaleString()} more installs</strong>. That gap is what
          guessing costs — and this was the easy version, just three campaigns and five days to
          learn from.
        </p>
      )}
      <p className="bb-question">How do we plan the quarter ahead of us?</p>
      <p className="bb-explainer">
        What you just did has a name: the <strong>k-armed bandit problem</strong> — k = 3
        campaigns here, each one an "arm" you can pull, and each of your five days was really
        hundreds of individual bets happening at once. The question is how to decide which arm
        to pull next, given only noisy results so far.
      </p>
      <p className="bb-explainer">
        One honest caveat: picking a single campaign to run each day, with no way to split
        spend, doesn't look much like real ad budgets — normally you'd run several campaigns
        side by side, dividing a shared budget across them. We'll start with this simpler
        version to build intuition for how these strategies actually think, then bring back
        the budgeting constraint so the problem starts looking like the one you'd actually face
        day to day. Below, three different strategies play the simple version — thousands of
        tiny yes-or-no decisions, compressed: watch how each one would spend a long campaign,
        sped up.
      </p>
      <button type="button" className="ct-button bb-cta" onClick={onContinue}>
        See the strategies race →
      </button>
    </section>
  )
}
