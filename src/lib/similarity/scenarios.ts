/**
 * Pitch-phase scenarios. Each ships a brief (what the reader is told) and a
 * hidden truth (what messaging actually resonates with this playerbase) that
 * similarity is scored against. Truth texts are deliberately synonym-dense —
 * several phrasings of the same desire — so both the semantic and the
 * lexical engine have a fair surface to match against.
 *
 * Two content rules, both load-bearing for scoring:
 *
 * - Truths are WANT-FORWARD: they describe what players respond to in
 *   positive vocabulary. The disliked thing appears at most once, phrased
 *   with words the distractor pitches don't use — both engines score topic,
 *   not stance, so a truth that names the hated mechanic would reward the
 *   pitch that sells it.
 * - The truth-aligned example pitch sits in a different slot per scenario
 *   (2, 3, 1) and paraphrases the truth rather than quoting it, so scoring
 *   the untouched examples demonstrates semantic matching, not a pre-cooked
 *   slot or copied keywords.
 *
 * These are simulator content, not essay prose; wording is a working draft
 * and freely editable (re-verify the two rules above after edits).
 */

export interface Scenario {
  id: string
  title: string
  /** What the reader is told before pitching. Hints at sentiment, never the answer. */
  brief: string
  /** The hidden truth similarity is scored against. Revealed after the race. */
  truth: string
  /**
   * Curated example pitches, one per box. NOT prefilled — the boxes start
   * blank; these fill in on demand via the pitch phase's generate button
   * (and seed Act II's example campaigns when the reader lands there
   * without pitching).
   */
  examplePitches: [string, string, string]
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'extraction-shooter',
    title: 'Extraction shooter',
    brief:
      'You run install-marketing for a hardcore extraction shooter. Retention is ' +
      'slipping and reviews turned sour this season, but the complaints are vague — ' +
      '"the game just feels bad now". You have a quarter (13 weeks at $500 a week) to ' +
      'find which ad campaign actually gets people installing — and before it starts, ' +
      'five pilot weeks on a trimmed $300 a week to test-fire your ideas. You can run ' +
      'three campaign concepts. What do you pitch?',
    truth:
      'Solo players respond to the promise of a fair fight: a dedicated solo queue, ' +
      'matchmaking that weighs team size, an even fight where individual skill decides ' +
      'who wins. Forgiveness resonates just as strongly — insured loadouts, a relaxed ' +
      'casual mode, and practice runs where one bad death never wipes out everything ' +
      'they own. After a season of feeling outmatched, campaigns built on fairness, ' +
      'protection and safety nets are the ones that convert.',
    examplePitches: [
      "Prove you're #1: a highlight-reel trailer following a top squad's leaderboard climb, selling raw skill and ranked glory.",
      'Queue in alone, fight fair: a testimonial spot where a solo player finally gets an even match against a team twice their size — and one death does not wipe the loadout they spent weeks building.',
      "A world worth exploring: a moody environment-reveal ad showcasing the new desert biome's weather and destructible terrain.",
    ],
  },
  {
    id: 'cozy-farming',
    title: 'Cozy farming sim',
    brief:
      'You run install-marketing for a cozy farming sim. Daily active users look ' +
      'healthy, but session length is falling and the subreddit tone shifted from ' +
      'screenshots to sighs. You have a quarter (13 weeks at $500 a week) to find ' +
      'which ad campaign actually gets people installing — and before it starts, ' +
      'five gentle pilot weeks on a trimmed $300 a week to try things out. You can ' +
      'run three campaign concepts. What do you pitch?',
    truth:
      'Players respond to calm: messaging that promises an unhurried hobby they can ' +
      'pick up and set aside freely, sessions that end when the player decides, and ' +
      'progress that waits patiently while life happens. Creative freedom resonates ' +
      'too — richer decorating and building tools, a farm that grows at whatever ' +
      'pace feels right, the quiet satisfaction of tending something at their own ' +
      'speed. After months of feeling hurried, campaigns that promise rest, ease ' +
      'and gentle progress are the ones that convert.',
    examplePitches: [
      'Climb the harvest board: an energetic ad selling weekly streak bonuses and farm leaderboard bragging rights.',
      'New neighbors, new stories: a narrative trailer introducing new villagers, village life and a romance storyline.',
      'Your farm can wait: a slow, ASMR-style spot of a player quietly decorating at a gentle, unhurried pace — pick it up tonight, put it down for a month, come back to find everything just as calm.',
    ],
  },
  {
    id: 'team-brawler',
    title: 'Competitive team brawler',
    brief:
      'You run install-marketing for a competitive 5v5 brawler. Veterans are loyal, ' +
      'but new players evaporate within a week and "uninstalled" posts keep trending. ' +
      'You have a quarter (13 weeks at $500 a week) to find which ad campaign actually ' +
      'gets people installing — and before it kicks off, five pilot weeks on a trimmed ' +
      '$300 a week to scout what works. You can run three campaign concepts. What do ' +
      'you pitch?',
    truth:
      'New players respond to a warm welcome: messaging that promises guidance from ' +
      'day one — practice modes full of bots, a coach or mentor in their corner, ' +
      'replays that explain each loss, and matchmaking that keeps beginners learning ' +
      'alongside other beginners. Kind, friendly lobbies matter as much as any ' +
      'tutorial. After bouncing off a punishing start, campaigns that promise ' +
      'patient teaching and a gentle first season are the ones that convert.',
    examplePitches: [
      'Everyone starts somewhere: a warm, friendly spot where a first-week beginner learns the ropes sparring with bots, gets a patient coach at their side, and wins a match without being yelled at.',
      'Earn your legend: a highlight-reel montage of veteran plays, prestige ranks and top-500 season finishes, selling the fantasy of mastery.',
      'Watch the pros: a high-energy broadcast-style ad cutting between tournament highlights and hype-caster commentary.',
    ],
  },
]

/** Deterministic pick used by the UI ("try another scenario" cycles). */
export function scenarioAt(index: number): Scenario {
  return SCENARIOS[((index % SCENARIOS.length) + SCENARIOS.length) % SCENARIOS.length]
}
