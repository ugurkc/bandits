/**
 * Pitch-phase scenarios. Each ships a brief (what the reader is told) and a
 * hidden truth (what players actually want) that similarity is scored
 * against. Truth texts are deliberately synonym-dense — several phrasings of
 * the same desire — so both the semantic and the lexical engine have a fair
 * surface to match against.
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
      'You run live-ops for a hardcore extraction shooter. Retention is slipping and ' +
      'reviews turned sour this season, but the complaints are vague — "the game just ' +
      'feels bad now". You have three feature slots on next month\'s roadmap. What do ' +
      'you build?',
    truth:
      'Solo players are tired of getting stomped by full squads and premade teams. They ' +
      'want a solo queue and fairer matchmaking that considers skill and squad size. ' +
      'Losing all their gear in one death feels brutal — gear fear keeps them from ' +
      'playing at all. They want insurance for loadouts, a lower-stakes casual mode, ' +
      'and a way to practice without risking everything they own.',
    placeholders: [
      'A ranked mode with seasonal rewards and exclusive skins for the top ladder',
      'A solo queue with skill-based matchmaking so lone players stop facing squads',
      'A new desert map with dynamic weather and destructible cover',
    ],
  },
  {
    id: 'cozy-farming',
    title: 'Cozy farming sim',
    brief:
      'You run live-ops for a cozy farming sim. Daily active users look healthy, but ' +
      'session length is falling and the subreddit tone shifted from screenshots to ' +
      'sighs. Three feature slots. What do you build?',
    truth:
      'Players are exhausted by FOMO — limited-time events, daily login streaks and ' +
      'timers make the game feel like a chore and a second job instead of a hobby. ' +
      'They want evergreen content they can finish at their own pace, richer ' +
      'decoration and building tools for creative expression, and progression that ' +
      'respects offline time so taking a week off never means falling behind.',
    placeholders: [
      'A competitive weekly harvest leaderboard with bonus currency for streaks',
      'An expanded furniture and decoration system with free building placement',
      'A neighboring village with new NPCs, quests and a romance storyline',
    ],
  },
  {
    id: 'team-brawler',
    title: 'Competitive team brawler',
    brief:
      'You run live-ops for a competitive 5v5 brawler. Veterans are loyal, but new ' +
      'players evaporate within a week and "uninstalled" posts keep trending. Three ' +
      'feature slots. What do you build?',
    truth:
      'New players quit because the learning curve is a cliff and their first matches ' +
      'are miserable — they get flamed by veterans, feed, and never learn why they ' +
      'lost. They want a real onboarding: practice modes against bots, a coaching or ' +
      'mentor system, replays that explain mistakes, matchmaking that keeps beginners ' +
      'with beginners, and moderation that actually punishes toxic chat.',
    placeholders: [
      'A hero mastery system with skill trees and prestige levels for veterans',
      'A guided training mode with bot matches and post-game tips for new players',
      'A spectator esports mode with tournament brackets and drop rewards',
    ],
  },
]

/** Deterministic pick used by the UI ("try another scenario" cycles). */
export function scenarioAt(index: number): Scenario {
  return SCENARIOS[((index % SCENARIOS.length) + SCENARIOS.length) % SCENARIOS.length]
}
