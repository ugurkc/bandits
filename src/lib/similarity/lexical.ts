import type { PitchScore, SimilarityEngine } from './types'

/**
 * Zero-dependency lexical similarity: TF-weighted cosine blended with
 * Jaccard overlap on normalized, lightly-stemmed tokens. The automatic
 * fallback when the semantic model isn't available — and the only engine
 * that can explain itself (matched terms), so the reveal keeps it around
 * even as a fallback.
 */

// Function words that carry no feature-pitch meaning. Small on purpose:
// over-aggressive stopword lists start deleting signal ("new", "more").
const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'so', 'if', 'then', 'than', 'as',
  'of', 'in', 'on', 'at', 'to', 'for', 'from', 'with', 'without', 'by',
  'about', 'into', 'over', 'under', 'between', 'through', 'during',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am',
  'do', 'does', 'did', 'doing', 'have', 'has', 'had', 'having',
  'will', 'would', 'can', 'could', 'should', 'shall', 'may', 'might', 'must',
  'i', 'we', 'you', 'they', 'he', 'she', 'it', 'this', 'that', 'these',
  'those', 'my', 'our', 'your', 'their', 'its', 'them', 'us', 'me',
  'there', 'here', 'what', 'which', 'who', 'when', 'where', 'how', 'why',
  'not', 'no', 'nor', 'too', 'very', 'just', 'also', 'own', 'same',
  'want', 'wants', 'wanted', 'players', 'player', 'game', 'games', 'feature',
])

/**
 * Light suffix stripper — deliberately not a full Porter stemmer. Maps
 * common inflections onto a shared stem ("rewards"/"rewarding" → "reward")
 * while leaving short words alone so "less" never becomes "le".
 */
export function stem(word: string): string {
  if (word.length <= 4) return word
  for (const suffix of ['ings', 'ing', 'edly', 'ed', 'ely', 'ly', 'ies', 'es', 's', 'tion', 'tions']) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 3) {
      return word.slice(0, word.length - suffix.length)
    }
  }
  return word
}

/** Lowercase, strip punctuation, drop stopwords, stem. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
    .map(stem)
}

function termFrequencies(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>()
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1)
  return tf
}

/** Cosine similarity between two TF vectors. 0 when either is empty. */
export function tfCosine(a: Map<string, number>, b: Map<string, number>): number {
  if (a.size === 0 || b.size === 0) return 0
  let dot = 0
  for (const [term, wa] of a) {
    const wb = b.get(term)
    if (wb) dot += wa * wb
  }
  const norm = (v: Map<string, number>) =>
    Math.sqrt([...v.values()].reduce((s, w) => s + w * w, 0))
  return dot / (norm(a) * norm(b))
}

/** Jaccard overlap of the distinct-token sets. 0 when either is empty. */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const t of a) if (b.has(t)) inter++
  return inter / (a.size + b.size - inter)
}

const COSINE_WEIGHT = 0.6
const JACCARD_WEIGHT = 0.4

// Raw lexical blends top out well below 1 for genuinely related texts of
// different lengths (a two-sentence pitch vs. a paragraph of truth), so an
// on-target pitch typically lands around ~0.4–0.6 raw. The calibration
// divisor stretches that band to [0, 1]; anything at or above RAW_CEILING
// counts as a full match.
const RAW_CEILING = 0.55

export function calibrate(raw: number): number {
  return Math.max(0, Math.min(1, raw / RAW_CEILING))
}

/** Score one pitch against the truth. Exported for direct unit testing. */
export function scorePitch(pitch: string, truth: string): PitchScore {
  const pitchTokens = tokenize(pitch)
  const truthTokens = tokenize(truth)
  const pitchTf = termFrequencies(pitchTokens)
  const truthTf = termFrequencies(truthTokens)

  const raw =
    COSINE_WEIGHT * tfCosine(pitchTf, truthTf) +
    JACCARD_WEIGHT * jaccard(new Set(pitchTokens), new Set(truthTokens))

  // Matched terms, heaviest first (by combined frequency), capped for the UI.
  const matched = [...pitchTf.keys()]
    .filter((t) => truthTf.has(t))
    .sort((a, b) => (pitchTf.get(b)! + truthTf.get(b)!) - (pitchTf.get(a)! + truthTf.get(a)!))
    .slice(0, 8)

  return { similarity: calibrate(raw), matchedTerms: matched }
}

export const lexicalEngine: SimilarityEngine = {
  id: 'lexical',
  score: (pitches, truth) =>
    Promise.resolve({
      engine: 'lexical',
      scores: pitches.map((p) => scorePitch(p, truth)),
    }),
}
