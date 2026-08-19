import { lexicalEngine } from './lexical'
import type { ScoreResult, SimilarityEngine } from './types'

/**
 * Semantic similarity via transformers.js sentence embeddings, fully
 * in-browser (no backend, nothing leaves the page — the model weights are a
 * static asset fetch from the Hugging Face CDN).
 *
 * The ~23MB quantized encoder is prefetched while the reader is still
 * reading the scenario and typing pitches. If it is not ready shortly after
 * they hit Score — slow network, blocked CDN, exotic device — scoring falls
 * back to the lexical engine automatically. Nobody waits on the model.
 */

export const MODEL_ID = 'Xenova/all-MiniLM-L6-v2'

/** How long Score waits for the model beyond the prefetch, before falling back. */
export const SCORE_TIMEOUT_MS = 4000

// MiniLM cosine between short product texts: related pairs typically land
// ~0.45–0.8, unrelated ~0.05–0.3. Calibrated to [0, 1] on that band.
const COSINE_LOW = 0.15
const COSINE_HIGH = 0.75

export function calibrateCosine(raw: number): number {
  return Math.max(0, Math.min(1, (raw - COSINE_LOW) / (COSINE_HIGH - COSINE_LOW)))
}

/** Cosine of two same-length vectors. Embeddings are L2-normalized, so this is a dot product — but stay robust to non-normalized input. */
export function cosine(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  return denom === 0 ? 0 : dot / denom
}

type Embedder = (texts: string[]) => Promise<number[][]>

let embedderPromise: Promise<Embedder> | null = null
let ready = false

async function loadEmbedder(): Promise<Embedder> {
  // Dynamic import keeps transformers.js out of the main bundle; Vite
  // code-splits it and the browser only pays for it when the pitch phase
  // actually starts loading the model.
  const { pipeline } = await import('@huggingface/transformers')
  const extractor = await pipeline('feature-extraction', MODEL_ID, { dtype: 'q8' })
  return async (texts: string[]) => {
    const output = await extractor(texts, { pooling: 'mean', normalize: true })
    return output.tolist() as number[][]
  }
}

/** Kick off the model download in the background. Safe to call repeatedly. */
export function prefetchSemantic(): void {
  embedderPromise ??= loadEmbedder().then(
    (e) => {
      ready = true
      return e
    },
    (err) => {
      // Reset so a later attempt (e.g. network back) can retry.
      embedderPromise = null
      throw err
    },
  )
  embedderPromise.catch(() => {})
}

/** True once the model is loaded and scoring will be semantic. */
export function isSemanticReady(): boolean {
  return ready
}

export const semanticEngine: SimilarityEngine = {
  id: 'semantic',
  async score(pitches, truth) {
    prefetchSemantic()
    const embed = await embedderPromise!
    const [truthVec, ...pitchVecs] = await embed([truth, ...pitches])
    return {
      engine: 'semantic',
      scores: pitchVecs.map((v) => ({
        similarity: calibrateCosine(cosine(v, truthVec)),
        matchedTerms: [],
      })),
    }
  },
}

/**
 * Score with the semantic engine if it is (or becomes) ready within
 * `timeoutMs`; otherwise fall back to the lexical engine. The reveal shows
 * which engine actually scored.
 */
export async function scoreWithBestEngine(
  pitches: string[],
  truth: string,
  timeoutMs: number = SCORE_TIMEOUT_MS,
): Promise<ScoreResult> {
  const fallback = () => lexicalEngine.score(pitches, truth)
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('semantic-timeout')), timeoutMs)
    })
    return await Promise.race([semanticEngine.score(pitches, truth), timeout])
  } catch {
    return fallback()
  } finally {
    // `finally`, not a line after the await: when the semantic path REJECTS
    // (CDN blocked, 404 — typically within ~50ms) control jumped straight to
    // `catch` and the timer stayed armed for the full timeout.
    clearTimeout(timer)
  }
}
