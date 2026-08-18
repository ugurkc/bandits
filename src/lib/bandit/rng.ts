/**
 * Deterministic randomness for the bandit simulator.
 *
 * Everything is counter-based: a value is a pure function of (seed, stream
 * tag, counters), never of call order across streams. That is what makes
 * common-random-number races fair and every run replayable.
 */

/**
 * Stream tags namespacing the independent random streams drawn from one
 * seed. Numeric so they feed straight into `hash01`.
 */
export const STREAM = {
  /** Shared conversion outcome of (t, arm) — identical for every strategy. */
  CONVERSION: 1,
  /** Whale-or-not draw for a conversion at (t, arm). */
  WHALE: 2,
  /** Per-strategy internal randomness (exploration, posterior samples). */
  STRATEGY: 3,
  /** Per-(t, arm) drift noise for the random-walk rates. */
  DRIFT: 4,
  /** Default base-rate generation. */
  BASE_RATES: 5,
  /** Tie-nudging for pitch-derived rates (similarity mapping). */
  TIE: 6,
  /** Weekly install draw for the manual campaign calendar, keyed on (week, arm). */
  WEEKLY_REWARD: 7,
  /** Budgeted-strategy internal randomness (Act 2 posterior sampling). */
  BUDGET_STRATEGY: 8,
  /**
   * Act I pilot-week install draw, keyed on (week, arm). Separate from
   * WEEKLY_REWARD so pilot week w and quarter week w don't replay the same
   * luck arm-for-arm.
   */
  TRIAL_REWARD: 9,
} as const

/** splitmix32-style avalanche finalizer over a 32-bit word. */
function mix(h: number): number {
  h ^= h >>> 16
  h = Math.imul(h, 0x21f0aaad)
  h ^= h >>> 15
  h = Math.imul(h, 0x735a2d97)
  h ^= h >>> 15
  return h >>> 0
}

/**
 * Hash (seed, ...ints) to a uniform-looking number in [0, 1).
 *
 * Counter-based integer mixer: each argument is absorbed with a golden-ratio
 * increment and re-avalanched, so nearby inputs (t, t+1) land far apart.
 */
export function hash01(seed: number, ...ints: number[]): number {
  let h = mix((seed >>> 0) ^ 0x9e3779b9)
  for (const n of ints) {
    h = mix((h + 0x9e3779b9 + (n | 0)) >>> 0)
  }
  return h / 4294967296
}

/**
 * A sequential uniform stream: successive calls return
 * `hash01(seed, ...stream, 0)`, `hash01(seed, ...stream, 1)`, …
 *
 * Different stream tags give statistically independent streams from the
 * same seed.
 */
export function makeRng(seed: number, ...stream: number[]): () => number {
  let counter = 0
  return () => hash01(seed, ...stream, counter++)
}

/** Standard normal via Box–Muller, consuming two uniforms from `rand`. */
export function sampleNormal(rand: () => number): number {
  let u1 = rand()
  while (u1 <= 0) u1 = rand() // hash01 can return exactly 0; log needs > 0
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * rand())
}

/**
 * Gamma(alpha, 1) via Marsaglia–Tsang (2000). For alpha < 1 uses the
 * Gamma(alpha + 1) boost: X ~ Gamma(a+1) implies X·U^(1/a) ~ Gamma(a).
 */
function sampleGamma(alpha: number, rand: () => number): number {
  if (alpha < 1) {
    let u = rand()
    while (u <= 0) u = rand()
    return sampleGamma(alpha + 1, rand) * Math.pow(u, 1 / alpha)
  }
  const d = alpha - 1 / 3
  const c = 1 / Math.sqrt(9 * d)
  for (;;) {
    let x: number
    let v: number
    do {
      x = sampleNormal(rand)
      v = 1 + c * x
    } while (v <= 0)
    v = v * v * v
    const u = rand()
    if (u < 1 - 0.0331 * x * x * x * x) return d * v
    if (u > 0 && Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v
  }
}

/**
 * Beta(a, b) as X/(X+Y) of two Marsaglia–Tsang gamma draws. All randomness
 * comes from `rand`, so a strategy's posterior samples stay inside its own
 * stream.
 */
export function sampleBeta(a: number, b: number, rand: () => number): number {
  const x = sampleGamma(a, rand)
  const y = sampleGamma(b, rand)
  return x / (x + y)
}
