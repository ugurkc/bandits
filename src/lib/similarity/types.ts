/**
 * Shared contracts for the pitch-phase similarity engines.
 *
 * Two engines implement scoring behind one interface: `semantic`
 * (transformers.js sentence embeddings, in-browser) and `lexical`
 * (zero-dependency token overlap, the automatic fallback). Each engine
 * returns CALIBRATED similarities in [0, 1] — raw cosine ranges differ per
 * engine, so calibration lives inside the engine, not in the mapping layer.
 */

export type SimilarityEngineId = 'semantic' | 'lexical'

export interface PitchScore {
  /** Calibrated similarity to the hidden truth, in [0, 1]. */
  similarity: number
  /**
   * Pitch terms that matched the truth text — the reveal's explainability.
   * Lexical only; the semantic engine returns an empty array.
   */
  matchedTerms: string[]
}

export interface ScoreResult {
  /** Which engine actually scored this round (semantic may fall back). */
  engine: SimilarityEngineId
  /** One score per pitch, same order as the input. */
  scores: PitchScore[]
}

export interface SimilarityEngine {
  id: SimilarityEngineId
  score(pitches: string[], truth: string): Promise<ScoreResult>
}
