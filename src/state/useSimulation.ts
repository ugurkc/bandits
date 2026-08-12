import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SimulationConfig, SimulationResult } from '../lib/bandit/types'
import { defaultBaseRates } from '../lib/bandit/arms'
import { simulate } from '../lib/bandit/simulate'

/** Playback speeds, in simulated rounds per second of wall time. */
export const SPEEDS = [30, 120, 600, 3000]
export const DEFAULT_SPEED = 120

export const HORIZON_CHOICES = [1000, 2000, 5000, 10000, 20000]

const DEFAULT_SEED = 42
const DEFAULT_K = 4
const DEFAULT_HORIZON = 5000
const DEFAULT_EPSILON = 0.1
const DEFAULT_DRIFT_VOLATILITY = 0.002

/**
 * Longest frame delta the playback loop honors, in ms. A background-tab
 * resume or long main-thread stall counts as one slow frame, not a jump.
 */
const MAX_FRAME_DT_MS = 100

function defaultConfig(): SimulationConfig {
  return {
    seed: DEFAULT_SEED,
    k: DEFAULT_K,
    horizon: DEFAULT_HORIZON,
    baseRates: defaultBaseRates(DEFAULT_K, DEFAULT_SEED),
    epsilon: DEFAULT_EPSILON,
    drift: { enabled: false, volatility: DEFAULT_DRIFT_VOLATILITY },
    whales: { enabled: false, share: 0.05, multiplier: 25 },
  }
}

/**
 * One playback frame: advance the fractional playhead by `speed` rounds per
 * second of elapsed wall time (`dtMs`, clamped to MAX_FRAME_DT_MS), clamped
 * to the horizon. Wall-clock based, so playback speed is independent of the
 * display's refresh rate.
 */
export function advancePlayhead(pos: number, speed: number, dtMs: number, horizon: number): number {
  const dt = Math.min(MAX_FRAME_DT_MS, dtMs)
  return Math.min(horizon, pos + (speed * dt) / 1000)
}

/** Share of a strategy's first `t` pulls that went to one arm, 0–1. */
export function shareOf(pulls: number, t: number): number {
  return pulls / Math.max(1, t)
}

/** Observed conversion-rate estimate, or null before the first pull. */
export function estimateOf(successes: number, pulls: number): number | null {
  return pulls === 0 ? null : successes / pulls
}

export interface Simulation {
  config: SimulationConfig
  /** Full precomputed run — recomputed only when the config changes. */
  result: SimulationResult
  /** Playhead: rounds [0, t) have been played; t ranges 0..horizon. */
  t: number
  playing: boolean
  /** Current playback speed in rounds/sec. */
  speed: number
  speeds: number[]
  horizonChoices: number[]
  revealed: boolean
  playPause: () => void
  step: () => void
  reset: () => void
  /** New random seed: fresh hidden rates, playhead back to 0. */
  reshuffle: () => void
  /**
   * Enter a pitch-derived world: k = rates.length, the given rates as the
   * hidden truth, rates hidden again, playhead back to 0.
   */
  applyPitchRates: (rates: number[]) => void
  setSpeed: (v: number) => void
  setEpsilon: (v: number) => void
  setK: (v: number) => void
  setHorizon: (v: number) => void
  setDrift: (enabled: boolean) => void
  setRevealed: (v: boolean) => void
}

/**
 * Owns the simulator: config state, the memoized precomputed result, and the
 * playhead with its requestAnimationFrame playback loop. The simulation runs
 * only when the config changes — playback just scrubs `t` through the result.
 */
export function useSimulation(): Simulation {
  const [config, setConfig] = useState<SimulationConfig>(defaultConfig)
  const [t, setT] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(DEFAULT_SPEED)
  const [revealed, setRevealed] = useState(false)

  // NEVER per frame: the entire horizon is precomputed here once per config,
  // and playback only moves `t` through it.
  const result = useMemo(() => simulate(config), [config])

  // Fractional playhead accumulator; `t` is its floor. A ref, not state, so
  // sub-round advances at slow speeds don't schedule extra renders.
  const posRef = useRef(0)

  const rewind = useCallback(() => {
    posRef.current = 0
    setT(0)
  }, [])

  const horizon = config.horizon

  useEffect(() => {
    if (!playing) return
    let raf = 0
    let lastTs: number | null = null
    const tick = (ts: number) => {
      const dtMs = lastTs === null ? 0 : ts - lastTs
      lastTs = ts
      posRef.current = advancePlayhead(posRef.current, speed, dtMs, horizon)
      const next = Math.floor(posRef.current)
      setT(next)
      if (next >= horizon) {
        // Pause automatically at the horizon instead of spinning forever.
        setPlaying(false)
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, speed, horizon])

  const playPause = useCallback(() => {
    setPlaying((p) => !p)
  }, [])

  const step = useCallback(() => {
    setPlaying(false)
    setT((prev) => {
      const next = Math.min(horizon, prev + 1)
      posRef.current = next
      return next
    })
  }, [horizon])

  const reset = useCallback(() => {
    setPlaying(false)
    rewind()
  }, [rewind])

  // Math.random is fine here: replayability comes from the seed *in* the
  // config, not from how the UI picked it.
  const reshuffle = useCallback(() => {
    const seed = Math.floor(Math.random() * 2 ** 31)
    rewind()
    setConfig((c) => ({ ...c, seed, baseRates: defaultBaseRates(c.k, seed) }))
  }, [rewind])

  const applyPitchRates = useCallback(
    (rates: number[]) => {
      setPlaying(false)
      setRevealed(false)
      rewind()
      setConfig((c) => ({ ...c, k: rates.length, baseRates: rates }))
    },
    [rewind],
  )

  // Every config change rewinds: a half-played run of a world that no longer
  // exists would be misleading. Playback (if running) continues from 0.
  //
  // The slider fires continuously during a drag and every value reruns
  // simulate(), so the update goes through startTransition: intermediate
  // drag values stay interruptible instead of janking the main thread.
  const setEpsilon = useCallback(
    (epsilon: number) => {
      startTransition(() => {
        rewind()
        setConfig((c) => ({ ...c, epsilon }))
      })
    },
    [rewind],
  )

  const setK = useCallback(
    (k: number) => {
      rewind()
      setConfig((c) => ({ ...c, k, baseRates: defaultBaseRates(k, c.seed) }))
    },
    [rewind],
  )

  const setHorizon = useCallback(
    (h: number) => {
      rewind()
      setConfig((c) => ({ ...c, horizon: h }))
    },
    [rewind],
  )

  const setDrift = useCallback(
    (enabled: boolean) => {
      rewind()
      setConfig((c) => ({ ...c, drift: { ...c.drift, enabled } }))
    },
    [rewind],
  )

  return {
    config,
    result,
    t,
    playing,
    speed,
    speeds: SPEEDS,
    horizonChoices: HORIZON_CHOICES,
    revealed,
    playPause,
    step,
    reset,
    reshuffle,
    applyPitchRates,
    setSpeed,
    setEpsilon,
    setK,
    setHorizon,
    setDrift,
    setRevealed,
  }
}
