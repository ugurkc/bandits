import './trial.css'

export interface BanditBridgeProps {
  totalInstalls: number
  installsLeftOnTable: number
  onContinue: () => void
}

/**
 * The beat between Act I's five-week pilot and Act II's automated race:
 * recap the reader's own noisy results, name the concrete cost of guessing
 * (the installs a perfect-foresight oracle's REALIZED run of the same five
 * weeks would have earned — same seed, same draws, so the gap is
 * attributable to picks, not luck), then name what they just did — the
 * k-armed bandit problem and the exploration/exploitation balance — and
 * drop the word "regret" as the tease Act II picks up by name.
 */
export function BanditBridge({ totalInstalls, installsLeftOnTable, onContinue }: BanditBridgeProps) {
  return (
    <section className="bb-wrap" aria-label="From the pilot to the bandit problem">
      <p className="bb-recap">
        Five pilot weeks, five picks, <strong>{totalInstalls.toLocaleString()} installs</strong>{' '}
        total — and probably a different campaign in your gut than the one you started with.
      </p>
      {installsLeftOnTable > 0 && (
        <p className="bb-recap">
          Here's the catch: if you'd put every week on the campaign that truly converts best — in
          this exact world, same weeks, same luck — you'd have earned about{' '}
          <strong>{installsLeftOnTable.toLocaleString()} more installs</strong>. That gap is what
          guessing costs — and this was the easy version, just three campaigns and five weeks to
          learn from.
        </p>
      )}
      <p className="bb-explainer">
        What you just did has a name: the <strong>k-armed bandit problem</strong> — k = 3
        campaigns here, each one an "arm" you can pull, and each of your five weeks was really
        hundreds of individual bets happening at once. The question is how to decide which arm
        to pull next, given only noisy results so far.
      </p>
      <p className="bb-explainer">
        Most people, when facing this scenario, try all the options for the first three weeks,
        and then fill the remaining two weeks with the option that has worked the best. If this
        is what you did, you are not alone. A very human way to tackle the delicate balance
        between <strong>exploration &amp; exploitation</strong>.
      </p>
      <p className="bb-explainer">
        So, when do we stop exploring and start exploiting? How much do we explore a single
        option to increase our certainty of its performance? Customer acquisition is the
        lifeline for our game — we surely don't want to <strong>regret</strong> having selected
        bad options.
      </p>
      <button type="button" className="ct-button bb-cta" onClick={onContinue}>
        Act II — see the strategies race →
      </button>
    </section>
  )
}
