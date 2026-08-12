import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * The real model is ~23MB and network-fetched — never in unit tests. The
 * transformers.js module is mocked; these tests cover the math and the
 * fallback state machine around it.
 */

const pipelineMock = vi.fn()
vi.mock('@huggingface/transformers', () => ({ pipeline: pipelineMock }))

// Fresh module state (embedder cache, ready flag) per test.
async function loadModule() {
  vi.resetModules()
  return import('./semantic')
}

function mockEmbedder(vectors: Record<string, number[]>, delayMs = 0) {
  pipelineMock.mockImplementation(async () => {
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs))
    return async (texts: string[]) => ({
      tolist: () => texts.map((t) => vectors[t] ?? [0, 0, 1]),
    })
  })
}

afterEach(() => {
  pipelineMock.mockReset()
  vi.useRealTimers()
})

describe('cosine', () => {
  it('computes cosine for normalized and unnormalized vectors', async () => {
    const { cosine } = await loadModule()
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1)
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0)
    expect(cosine([2, 0], [5, 0])).toBeCloseTo(1)
    expect(cosine([0, 0], [1, 0])).toBe(0)
  })
})

describe('calibrateCosine', () => {
  it('maps the MiniLM band onto [0, 1], clamped and monotone', async () => {
    const { calibrateCosine } = await loadModule()
    expect(calibrateCosine(0.15)).toBe(0)
    expect(calibrateCosine(0.75)).toBe(1)
    expect(calibrateCosine(0.05)).toBe(0)
    expect(calibrateCosine(0.9)).toBe(1)
    expect(calibrateCosine(0.6)).toBeGreaterThan(calibrateCosine(0.4))
  })
})

describe('semanticEngine', () => {
  it('scores pitches by calibrated cosine to the truth embedding', async () => {
    const { semanticEngine } = await loadModule()
    mockEmbedder({
      truth: [1, 0, 0],
      'on-target': [0.9, Math.sqrt(1 - 0.81), 0],
      'off-target': [0, 1, 0],
    })
    const result = await semanticEngine.score(['on-target', 'off-target'], 'truth')
    expect(result.engine).toBe('semantic')
    expect(result.scores[0].similarity).toBeGreaterThan(result.scores[1].similarity)
    expect(result.scores[1].similarity).toBe(0)
    expect(result.scores[0].matchedTerms).toEqual([])
  })
})

describe('isSemanticReady / prefetchSemantic', () => {
  it('flips ready only after the model loads', async () => {
    const mod = await loadModule()
    mockEmbedder({}, 5)
    expect(mod.isSemanticReady()).toBe(false)
    mod.prefetchSemantic()
    expect(mod.isSemanticReady()).toBe(false)
    await new Promise((r) => setTimeout(r, 20))
    expect(mod.isSemanticReady()).toBe(true)
  })

  it('a failed load resets so a later prefetch can retry', async () => {
    const mod = await loadModule()
    pipelineMock.mockRejectedValueOnce(new Error('offline'))
    mod.prefetchSemantic()
    await new Promise((r) => setTimeout(r, 10))
    expect(mod.isSemanticReady()).toBe(false)
    mockEmbedder({})
    mod.prefetchSemantic()
    await new Promise((r) => setTimeout(r, 10))
    expect(mod.isSemanticReady()).toBe(true)
  })
})

describe('scoreWithBestEngine', () => {
  it('uses the semantic engine when the model is ready in time', async () => {
    const { scoreWithBestEngine } = await loadModule()
    mockEmbedder({ truth: [1, 0, 0], pitch: [1, 0, 0] })
    const result = await scoreWithBestEngine(['pitch'], 'truth', 1000)
    expect(result.engine).toBe('semantic')
    expect(result.scores[0].similarity).toBe(1)
  })

  it('falls back to lexical when the model is slower than the timeout', async () => {
    const { scoreWithBestEngine } = await loadModule()
    mockEmbedder({}, 60_000)
    const result = await scoreWithBestEngine(
      ['players want a solo queue'],
      'players want a solo queue',
      20,
    )
    expect(result.engine).toBe('lexical')
    expect(result.scores[0].similarity).toBeGreaterThan(0.9)
  })

  it('falls back to lexical when the model load rejects', async () => {
    const { scoreWithBestEngine } = await loadModule()
    pipelineMock.mockRejectedValue(new Error('cdn blocked'))
    const result = await scoreWithBestEngine(['any pitch text here'], 'any truth', 1000)
    expect(result.engine).toBe('lexical')
  })
})
