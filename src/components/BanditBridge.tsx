import './trial.css'

export interface BanditBridgeProps {
  totalInstalls: number
  onContinue: () => void
}

/**
 * The beat between Act 1's five trial days and the automated race: recap
 * the reader's own noisy results, ask the question the algorithms answer,
 * then name what they just did — the k-armed bandit problem with Bernoulli
 * rewards — before handing off.
 */
export function BanditBridge({ totalInstalls, onContinue }: BanditBridgeProps) {
  return (
    <section className="bb-wrap" aria-label="From five trial days to the bandit problem">
      <p className="bb-recap">
        Five days, five picks, <strong>{totalInstalls.toLocaleString()} installs</strong> total — and
        probably a different campaign in your gut than the one you started with.
      </p>
      <p className="bb-question">How do we plan the weeks ahead of us?</p>
      <p className="bb-explainer">
        What you just did has a name: the <strong>k-armed bandit problem</strong> — k = 3 campaigns
        here, each one an "arm" you can pull. Every pull returns a <strong>Bernoulli reward</strong>{' '}
        — a single yes-or-no outcome, did this impression convert or not — drawn from a fixed but
        unknown probability. Each of your five days was really thousands of those pulls happening
        at once. The question is how to decide which arm to pull next, given only noisy results
        so far. Below, three different strategies answer that question — automatically, and much
        faster than you can by hand.
      </p>
      <button type="button" className="ct-button bb-cta" onClick={onContinue}>
        See the strategies race →
      </button>
    </section>
  )
}
