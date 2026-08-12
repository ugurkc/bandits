/**
 * Pitch-phase scenarios. Each ships a brief (what the reader is told) and a
 * hidden truth (what messaging actually resonates with this playerbase) that
 * similarity is scored against. Truth texts are deliberately synonym-dense —
 * several phrasings of the same desire — so both the semantic and the
 * lexical engine have a fair surface to match against.
 *
 * These are simulator content, not essay prose; wording is a working draft
 * and freely editable.
 */

export interface Scenario {
  id: string
  title: string
  /** What the reader is told before pitching. Hints at sentiment, never the answer. */
  brief: string
  /** The hidden truth similarity is scored against. Revealed after the race. */
  truth: string
  /** Editable starter pitches, one per box, so nobody faces a blank page. */
  placeholders: [string, string, string]
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'extraction-shooter',
    title: 'Extraction shooter',
    brief:
      'You run install-marketing for a hardcore extraction shooter. Retention is ' +
      'slipping and reviews turned sour this season, but the complaints are vague — ' +
      '"the game just feels bad now". You have a quarter (13 weeks) to find which ad ' +
      'campaign actually gets people installing. You can run three campaign concepts. ' +
      'What do you pitch?',
    truth:
      'Solo players are tired of getting stomped by full squads and premade teams, so ' +
      'they respond to messaging that promises a fair fight — a solo queue and skill-based ' +
      'matchmaking that accounts for squad size. Losing all their gear in one death feels ' +
      'brutal, and players want to see an ad that acknowledges that gear fear directly: ' +
      'loadout insurance, a lower-stakes casual mode, and a way to practice without risking ' +
      'everything they own. Campaigns that lead with fairness and forgiveness outperform ' +
      'ones that just show flashy kills.',
    placeholders: [
      'Chase the ladder: seasonal ranked rewards and exclusive skins for the top of the leaderboard.',
      'Finally, a fair fight: solo queue with skill-based matchmaking, so lone players stop getting steamrolled by squads.',
      'New biome, new blood: a desert map with dynamic weather and destructible cover.',
    ],
  },
  {
    id: 'cozy-farming',
    title: 'Cozy farming sim',
    brief:
      'You run install-marketing for a cozy farming sim. Daily active users look ' +
      'healthy, but session length is falling and the subreddit tone shifted from ' +
      'screenshots to sighs. You have a quarter (13 weeks) to find which ad campaign ' +
      'actually gets people installing. You can run three campaign concepts. What do ' +
      'you pitch?',
    truth:
      'Players are exhausted by FOMO — limited-time events, daily login streaks and ' +
      'timers make the game feel like a chore and a second job instead of a hobby — so ' +
      'they respond to messaging that promises the opposite of pressure. Players want to ' +
      'see an ad that leads with no-rush, play-at-your-own-pace content they can pick up ' +
      'and put down freely, richer decoration and building tools for creative expression, ' +
      'and progression that respects offline time so taking a week off never means falling ' +
      'behind. Campaigns that acknowledge burnout and sell relaxation outperform ones that ' +
      'sell urgency or competition.',
    placeholders: [
      'Climb the harvest board: a competitive weekly leaderboard with bonus currency for streaks.',
      'Build at your own pace: expanded furniture and decoration tools with free placement, no timers attached.',
      'New neighbors, new stories: a village expansion with NPCs, quests and a romance storyline.',
    ],
  },
  {
    id: 'team-brawler',
    title: 'Competitive team brawler',
    brief:
      'You run install-marketing for a competitive 5v5 brawler. Veterans are loyal, ' +
      'but new players evaporate within a week and "uninstalled" posts keep trending. ' +
      'You have a quarter (13 weeks) to find which ad campaign actually gets people ' +
      'installing. You can run three campaign concepts. What do you pitch?',
    truth:
      'New players quit because the learning curve is a cliff and their first matches ' +
      'are miserable — they get flamed by veterans, feed, and never learn why they lost — ' +
      'so they respond to messaging that promises a real onboarding, not a trial by fire. ' +
      'Players want to see an ad that leads with practice modes against bots, a coaching ' +
      'or mentor system, replays that explain mistakes, matchmaking that keeps beginners ' +
      'with beginners, and moderation that actually punishes toxic chat. Campaigns that ' +
      'promise a welcoming, guided first week outperform ones that sell skill ceiling or ' +
      'esports spectacle.',
    placeholders: [
      'Earn your legend: a hero mastery system with skill trees and prestige levels for veterans.',
      'Never get thrown in the deep end: a guided training mode with bot matches and post-game tips built for new players.',
      'Watch the pros, chase the drops: a spectator esports mode with tournament brackets and viewer rewards.',
    ],
  },
]

/** Deterministic pick used by the UI ("try another scenario" cycles). */
export function scenarioAt(index: number): Scenario {
  return SCENARIOS[((index % SCENARIOS.length) + SCENARIOS.length) % SCENARIOS.length]
}
