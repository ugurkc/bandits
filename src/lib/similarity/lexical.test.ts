import { describe, expect, it } from 'vitest'
import { calibrate, jaccard, lexicalEngine, scorePitch, stem, tfCosine, tokenize } from './lexical'

describe('stem', () => {
  it('maps common inflections onto a shared stem', () => {
    expect(stem('rewards')).toBe(stem('reward'))
    expect(stem('grinding')).toBe(stem('grind'))
    expect(stem('matches')).toBe(stem('match'))
  })

  it('leaves short words alone', () => {
    expect(stem('less')).toBe('less')
    expect(stem('solo')).toBe('solo')
  })

  it('never strips a suffix down to fewer than 3 characters', () => {
    for (const w of ['using', 'apes', 'goes', 'bated']) {
      expect(stem(w).length).toBeGreaterThanOrEqual(3)
    }
  })

  it('stems -tion singular and plural to the same stem', () => {
    expect(stem('promotions')).toBe(stem('promotion'))
    expect(stem('creations')).toBe(stem('creation'))
    expect(stem('decorations')).toBe(stem('decoration'))
    expect(stem('celebrations')).toBe(stem('celebration'))
  })

  it('strips -tion/-tions before the bare -s can shadow them', () => {
    expect(stem('promotion')).toBe('promo')
    expect(stem('promotions')).toBe('promo')
  })
})

describe('tokenize', () => {
  it('lowercases, strips punctuation, drops stopwords and single letters', () => {
    expect(tokenize('The players want a Solo-Queue, obviously!')).toEqual([
      'solo',
      'queue',
      'obvious',
    ])
  })

  it('returns empty for pure-stopword text', () => {
    expect(tokenize('the and of to')).toEqual([])
  })
})

describe('tfCosine and jaccard', () => {
  const tf = (tokens: string[]) => {
    const m = new Map<string, number>()
    for (const t of tokens) m.set(t, (m.get(t) ?? 0) + 1)
    return m
  }

  it('identical texts score 1', () => {
    expect(tfCosine(tf(['a', 'b']), tf(['a', 'b']))).toBeCloseTo(1)
    expect(jaccard(new Set(['a', 'b']), new Set(['a', 'b']))).toBe(1)
  })

  it('disjoint texts score 0', () => {
    expect(tfCosine(tf(['a']), tf(['b']))).toBe(0)
    expect(jaccard(new Set(['a']), new Set(['b']))).toBe(0)
  })

  it('empty input scores 0 rather than NaN', () => {
    expect(tfCosine(tf([]), tf(['a']))).toBe(0)
    expect(jaccard(new Set(), new Set(['a']))).toBe(0)
  })
})

describe('calibrate', () => {
  it('is monotone and clamped to [0, 1]', () => {
    expect(calibrate(0)).toBe(0)
    expect(calibrate(0.3)).toBeGreaterThan(calibrate(0.2))
    expect(calibrate(0.55)).toBe(1)
    expect(calibrate(0.9)).toBe(1)
    expect(calibrate(-0.1)).toBe(0)
  })
})

describe('scorePitch', () => {
  const truth =
    'Solo players are tired of getting stomped by full squads. They want a solo queue, ' +
    'fairer matchmaking, and lower-stakes modes where losing gear does not hurt so much.'

  it('an on-target pitch outscores an off-target pitch', () => {
    const onTarget = scorePitch('Add a solo queue with fairer matchmaking for solo players', truth)
    const offTarget = scorePitch('Sell a premium cosmetic battle pass with exclusive skins', truth)
    expect(onTarget.similarity).toBeGreaterThan(offTarget.similarity)
    expect(offTarget.similarity).toBeLessThan(0.15)
  })

  it('reports matched terms from the pitch, heaviest first, capped at 8', () => {
    const { matchedTerms } = scorePitch(
      'Solo queue and matchmaking for solo players who keep losing gear',
      truth,
    )
    expect(matchedTerms.length).toBeLessThanOrEqual(8)
    expect(matchedTerms).toContain('solo')
    expect(matchedTerms).toContain(stem('matchmaking'))
  })

  it('an empty pitch scores 0 with no matches', () => {
    expect(scorePitch('', truth)).toEqual({ similarity: 0, matchedTerms: [] })
  })

  it('a pitch identical to the truth scores 1', () => {
    expect(scorePitch(truth, truth).similarity).toBe(1)
  })
})

describe('lexicalEngine', () => {
  it('scores each pitch in input order and identifies itself', async () => {
    const result = await lexicalEngine.score(
      ['solo queue for solo players', 'cosmetic skins shop'],
      'players want a solo queue',
    )
    expect(result.engine).toBe('lexical')
    expect(result.scores).toHaveLength(2)
    expect(result.scores[0].similarity).toBeGreaterThan(result.scores[1].similarity)
  })
})
