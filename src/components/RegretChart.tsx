import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import type { StrategyId } from '../lib/bandit/types'
import { STRATEGY_EXPLAINERS } from './strategyExplainers'
import './playground.css'

export interface RegretChartSeries {
  id: StrategyId
  label: string
  /** Compact name for the direct end labels on narrow charts, where five
   *  full-sentence labels overrun the plot (the legend keeps the full name). */
  shortLabel: string
  colorVar: string
  values: number[]
}

export interface RegretChartProps {
  series: RegretChartSeries[]
  /** Playhead: rounds [0, t] are drawn. */
  t: number
  horizon: number
  height?: number
  /**
   * Reward-noun overrides for the sandbox path, where the arms are generic
   * offer variants and "installs" would borrow the pitch flow's metaphor.
   * Pitch-derived runs use the defaults.
   */
  /** Axis title; also opens the SVG's aria-label. */
  title?: string
  /** First sentence of the caption (the "regret" aside is always appended). */
  caption?: string
  /** Reward noun used in the tooltip/live-region sentence. */
  unit?: string
}

/** viewBox width before the first container measurement lands. */
const FALLBACK_WIDTH = 640
/** Narrower than this and the plot area would collapse into the padding. */
const MIN_WIDTH = 160
const PAD_LEFT = 48
const PAD_RIGHT = 14
const PAD_TOP = 12
const PAD_BOTTOM = 26
/** Minimum vertical separation between direct end labels, in viewBox px. */
const LABEL_GAP = 13
/** End labels flip to the left of their dot when this close to the right edge. */
const LABEL_FLIP_ZONE = 118
/** Half the tooltip's CSS min-width (160px) — the first-paint clamp margin. */
const TOOLTIP_HALF_WIDTH = 80
/** Below this chart width the end labels switch to the compact names. */
const SHORT_END_LABEL_WIDTH = 640
/** Quiet time after the last pointer sample before the crosshair announces. */
const POINTER_ANNOUNCE_MS = 400

/** Largest 1/2/2.5/5 × 10^n step that keeps the grid at three-to-five lines. */
function gridStep(max: number): number {
  const mag = 10 ** Math.floor(Math.log10(max / 5))
  for (const factor of [1, 2, 2.5, 5, 10]) {
    const step = factor * mag
    if (Math.floor(max / step) <= 5) return step
  }
  return max / 4
}

function fmtValue(v: number): string {
  if (v >= 100) return Math.round(v).toLocaleString()
  return String(parseFloat(v.toFixed(2)))
}

/**
 * Nudge overlapping end-label y-positions apart (every line starts at the
 * same origin) without detaching them far from their lines.
 */
function spreadLabels(ys: number[], min: number, max: number, gap: number): number[] {
  const order = ys.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v)
  const placed = order.map((o) => Math.max(min, Math.min(max, o.v)))
  for (let j = 1; j < placed.length; j++) {
    placed[j] = Math.max(placed[j], placed[j - 1] + gap)
  }
  if (placed.length > 0 && placed[placed.length - 1] > max) {
    placed[placed.length - 1] = max
    for (let j = placed.length - 2; j >= 0; j--) {
      placed[j] = Math.min(placed[j], placed[j + 1] - gap)
    }
  }
  const out: number[] = new Array<number>(ys.length).fill(min)
  order.forEach((o, j) => {
    out[o.i] = placed[j]
  })
  return out
}

/**
 * Cumulative-regret race. Domains are fixed for the whole run — x spans
 * [0, horizon] and y spans [0, max over the FULL precomputed arrays] — so the
 * axes never rescale while the playhead scrubs.
 *
 * The viewBox width tracks the measured container width (ResizeObserver), so
 * 1 viewBox unit = 1 CSS px: text renders at its declared size at every
 * container width, and the tooltip clamps in real pixels.
 */
export function RegretChart({
  series,
  t,
  horizon,
  height = 260,
  // "EXPECTED ... given up", not "left on the table": Act I's pilot recap and
  // Act III's quarter results use that second phrase for a realized head-to-head against the oracle's own draws
  // — a whole number of installs that is exactly 0 under perfect play. This
  // chart plots cumulative expected regret, an average over counterfactual
  // draws, which is why it can read 21.53. One phrase for two different
  // quantities is the kind of thing a careful reader catches and distrusts.
  title = 'expected installs given up',
  caption = 'The higher a line climbs, the more installs that strategy is giving up, on average, by picking worse campaigns instead of the best one.',
  unit = 'installs',
}: RegretChartProps) {
  const [hoverRound, setHoverRound] = useState<number | null>(null)
  // Ties the SVG to its own sr-only standings text; unique per instance
  // because Act II's race and Act IV's lab can both be mounted.
  const summaryId = useId()
  const [measuredWidth, setMeasuredWidth] = useState(FALLBACK_WIDTH)
  const wrapRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      const w = entries[entries.length - 1]?.contentRect.width ?? 0
      if (w > 0) setMeasuredWidth(Math.round(w))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const width = Math.max(MIN_WIDTH, measuredWidth)
  const innerW = width - PAD_LEFT - PAD_RIGHT
  const innerH = height - PAD_TOP - PAD_BOTTOM
  const safeHorizon = Math.max(horizon, 1)

  // The y domain scans every value of every series — once per run, not per
  // hover or playhead frame.
  const { yMax, ticks } = useMemo(() => {
    let max = 0
    for (const s of series) {
      for (const v of s.values) {
        if (v > max) max = v
      }
    }
    if (max <= 0) max = 1
    const step = gridStep(max)
    const tickList: number[] = []
    for (let i = 1; i * step <= max * 1.000001; i++) tickList.push(i * step)
    return { yMax: max, ticks: tickList }
  }, [series])

  const x = useCallback(
    (round: number) => PAD_LEFT + (round / safeHorizon) * innerW,
    [safeHorizon, innerW],
  )
  const y = useCallback((v: number) => PAD_TOP + innerH - (v / yMax) * innerH, [innerH, yMax])

  // Downsample to roughly one point per viewBox pixel: at 20k rounds a full
  // path is invisible extra work on every playback frame. The last drawn
  // round (the playhead end) is always included exactly. Rebuilt only when
  // the playhead or geometry moves — never on hover.
  const { paths, ends, labelYs } = useMemo(() => {
    const built = series.map((s) => {
      // Direct end labels compact on narrow charts; the legend and tooltip
      // keep the full names.
      const endLabel = width < SHORT_END_LABEL_WIDTH ? s.shortLabel : s.label
      const count = Math.max(0, Math.min(t + 1, s.values.length))
      if (count === 0) return { id: s.id, label: endLabel, colorVar: s.colorVar, d: '', endX: 0, endY: 0, has: false }
      const stride = Math.max(1, Math.floor(count / innerW))
      let d = ''
      for (let r = 0; r < count; r += stride) {
        d += `${d === '' ? 'M' : 'L'}${x(r).toFixed(1)} ${y(s.values[r]).toFixed(1)}`
      }
      const last = count - 1
      if (last % stride !== 0) d += `L${x(last).toFixed(1)} ${y(s.values[last]).toFixed(1)}`
      return { id: s.id, label: endLabel, colorVar: s.colorVar, d, endX: x(last), endY: y(s.values[last]), has: true }
    })
    const withEnds = built.filter((p) => p.has)
    return {
      paths: built,
      ends: withEnds,
      labelYs: spreadLabels(
        withEnds.map((p) => p.endY),
        PAD_TOP + 8,
        PAD_TOP + innerH - 2,
        LABEL_GAP,
      ),
    }
  }, [series, t, width, innerW, innerH, x, y])

  // Clamped where it's read, not where it was set: a reset rewinds t and a
  // stale hover would otherwise point past the new playhead.
  const maxRound = Math.min(t, safeHorizon - 1)
  const hr = hoverRound === null || maxRound < 0 ? null : Math.min(hoverRound, maxRound)
  const hoverRows =
    hr === null
      ? null
      : series.map((s) => ({
          id: s.id,
          label: s.label,
          colorVar: s.colorVar,
          value: hr < s.values.length ? s.values[hr] : null,
        }))

  // The single worst-off strategy at the hovered round, turned into one
  // concrete sentence — translates an abstract point on a line into a
  // number a non-technical reader can actually picture.
  const worstHoverRow =
    hoverRows?.reduce<(typeof hoverRows)[number] | null>((worst, row) => {
      if (row.value === null) return worst
      if (worst === null || worst.value === null || row.value > worst.value) return row
      return worst
    }, null) ?? null

  // --- Live-region pacing -------------------------------------------------
  // One sweep of the mouse across the chart changes `hr` on essentially every
  // pointer event; announcing each one buries a screen reader in hundreds of
  // polite messages (a real setup for low-vision users running a magnifier
  // alongside a mouse). Keyboard stepping is one deliberate action per press,
  // so it announces at once; pointer movement waits for the pointer to settle.
  const hoverSentence =
    hr !== null && hoverRows !== null
      ? `Round ${hr.toLocaleString()}.${
          worstHoverRow && worstHoverRow.value !== null && worstHoverRow.value > 0
            ? ` ${worstHoverRow.label} has given up about ${fmtValue(worstHoverRow.value)} ${unit} it could have earned by now.`
            : ''
        } ${hoverRows
          .map((row) => `${row.label} ${row.value === null ? 'no data' : fmtValue(row.value)}`)
          .join(', ')}`
      : ''

  const [liveText, setLiveText] = useState('')
  const announceDelayRef = useRef(0)
  useEffect(() => {
    if (hoverSentence === '') {
      setLiveText('')
      return
    }
    if (announceDelayRef.current === 0) {
      setLiveText(hoverSentence)
      return
    }
    // Each new sample cancels the previous pending announcement, so only the
    // position the pointer actually rests at is ever spoken.
    const id = setTimeout(() => setLiveText(hoverSentence), announceDelayRef.current)
    return () => clearTimeout(id)
  }, [hoverSentence])

  // Re-clamp the tooltip with its MEASURED width before paint: content can
  // run wider than the CSS min-width the first-paint estimate assumes, and
  // the tooltip must never overflow the wrapper. 1 viewBox unit = 1 CSS px,
  // so this is plain pixel math.
  // No dep array: every commit re-applies the estimated `left` style prop,
  // so the measured correction must follow every commit too.
  useLayoutEffect(() => {
    const tip = tooltipRef.current
    if (!tip || hr === null) return
    const half = tip.offsetWidth / 2
    const left = Math.max(half, Math.min(width - half, x(hr)))
    tip.style.left = `${left}px`
  })

  const trackPointer = (e: ReactPointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    // Zero width happens when the chart is mounted but not on screen.
    if (rect.width === 0) return
    // The SVG scales to its container, so map client px back through the viewBox.
    const vbX = ((e.clientX - rect.left) / rect.width) * width
    const round = Math.round(((vbX - PAD_LEFT) / innerW) * safeHorizon)
    announceDelayRef.current = POINTER_ANNOUNCE_MS
    setHoverRound(Math.max(0, Math.min(maxRound, round)))
  }

  // Keyboard crosshair: arrows walk the rounds (shift for coarse steps),
  // Escape clears. The first press lands on the playhead end.
  const onKeyDown = (e: ReactKeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'Escape') {
      setHoverRound(null)
      return
    }
    if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || maxRound < 0) return
    e.preventDefault()
    // One keypress is one deliberate request — speak it straight away.
    announceDelayRef.current = 0
    const dir = e.key === 'ArrowLeft' ? -1 : 1
    const stepBy = e.shiftKey ? Math.max(1, Math.round(safeHorizon / 100)) : 1
    setHoverRound((prev) => {
      const base = prev === null ? maxRound : Math.min(prev, maxRound)
      return Math.max(0, Math.min(maxRound, base + dir * stepBy))
    })
  }

  // Everything except the hover overlay: hover-state changes re-render only
  // the crosshair, dots, tooltip, and live region — never this subtree.
  const chartBody = useMemo(
    () => (
      <g>
        {ticks.map((v) => (
          <line
            key={v}
            className="rc-grid"
            x1={PAD_LEFT}
            y1={y(v)}
            x2={width - PAD_RIGHT}
            y2={y(v)}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <line
          className="rc-axis"
          x1={PAD_LEFT}
          y1={y(0)}
          x2={width - PAD_RIGHT}
          y2={y(0)}
          vectorEffect="non-scaling-stroke"
        />
        <line
          className="rc-axis"
          x1={PAD_LEFT}
          y1={PAD_TOP}
          x2={PAD_LEFT}
          y2={y(0)}
          vectorEffect="non-scaling-stroke"
        />
        <text className="rc-tick" x={PAD_LEFT - 7} y={y(0) + 4} textAnchor="end">
          0
        </text>
        {ticks.map((v) => (
          <text key={v} className="rc-tick" x={PAD_LEFT - 7} y={y(v) + 4} textAnchor="end">
            {fmtValue(v)}
          </text>
        ))}
        <text className="rc-tick" x={PAD_LEFT} y={height - 8} textAnchor="start">
          round 0
        </text>
        <text className="rc-tick" x={width - PAD_RIGHT} y={height - 8} textAnchor="end">
          {horizon.toLocaleString()}
        </text>

        {paths.map(
          (p) =>
            p.d !== '' && (
              <path
                key={p.id}
                className="rc-line"
                d={p.d}
                style={{ stroke: p.colorVar }}
                vectorEffect="non-scaling-stroke"
              />
            ),
        )}

        {ends.map((p, i) => {
          const flip = p.endX > width - PAD_RIGHT - LABEL_FLIP_ZONE
          return (
            <g key={p.id}>
              <circle
                className="rc-end-dot"
                cx={p.endX}
                cy={p.endY}
                r={4}
                style={{ fill: p.colorVar }}
              />
              <text
                className="rc-end-label"
                x={p.endX + (flip ? -8 : 8)}
                y={labelYs[i] + 4}
                textAnchor={flip ? 'end' : 'start'}
              >
                {p.label}
              </text>
            </g>
          )
        })}
      </g>
    ),
    [ticks, paths, ends, labelYs, y, width, height, horizon],
  )

  return (
    <div className="rc-wrap">
      <div className="rc-axis-title">{title}</div>
      <p className="rc-axis-caption">
        {caption}{' '}
        <span className="rc-axis-aside">(Statisticians call this <em>regret</em>.)</span>
      </p>
      <div className="rc-legend">
        {series.map((s) => (
          <span
            key={s.id}
            className="rc-legend-item"
            title={STRATEGY_EXPLAINERS[s.id]}
            aria-label={`${s.label}: ${STRATEGY_EXPLAINERS[s.id]}`}
          >
            <span className="rc-legend-chip" style={{ background: s.colorVar }} aria-hidden="true" />
            {s.label}
          </span>
        ))}
      </div>
      <div className="rc-chart-wrap" ref={wrapRef}>
        <svg
          className="rc-svg"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          tabIndex={0}
          // The playhead round is deliberately NOT in the name: it advances up
          // to 60x/sec during playback, and a focused element whose accessible
          // name keeps changing is re-announced every time. The live standings
          // live in the (non-live) description below instead, so they are
          // available on demand without narrating themselves.
          aria-label={`${title.charAt(0).toUpperCase()}${title.slice(1)} over ${horizon.toLocaleString()} rounds for ${series
            .map((s) => s.label)
            .join(', ')}. Use arrow keys to inspect individual rounds.`}
          aria-describedby={summaryId}
          onPointerMove={trackPointer}
          onPointerDown={trackPointer}
          onPointerLeave={() => setHoverRound(null)}
          onPointerCancel={() => setHoverRound(null)}
          // Tabbing away with a crosshair up used to strand the tooltip, the
          // crosshair and the last announcement on screen indefinitely.
          onBlur={() => setHoverRound(null)}
          onKeyDown={onKeyDown}
        >
          {chartBody}

          {hr !== null && (
            <g className="rc-hover">
              <line
                className="rc-crosshair"
                x1={x(hr)}
                y1={PAD_TOP}
                x2={x(hr)}
                y2={y(0)}
                vectorEffect="non-scaling-stroke"
              />
              {hoverRows?.map(
                (row) =>
                  row.value !== null && (
                    <circle
                      key={row.id}
                      className="rc-hover-dot"
                      cx={x(hr)}
                      cy={y(row.value)}
                      r={3.5}
                      style={{ fill: row.colorVar }}
                    />
                  ),
              )}
            </g>
          )}
        </svg>

        {hr !== null && hoverRows !== null && (
          <div
            className="rc-tooltip"
            ref={tooltipRef}
            style={{
              // First-paint estimate from the CSS min-width; the layout
              // effect above re-clamps with the measured width before paint.
              left: `${Math.max(TOOLTIP_HALF_WIDTH, Math.min(width - TOOLTIP_HALF_WIDTH, x(hr)))}px`,
            }}
          >
            <span className="rc-tooltip-round">Round {hr.toLocaleString()}</span>
            {worstHoverRow && worstHoverRow.value !== null && worstHoverRow.value > 0 && (
              <p className="rc-tooltip-sentence">
                <strong>{worstHoverRow.label}</strong> has given up about{' '}
                <strong>{fmtValue(worstHoverRow.value)}</strong> {unit} it could have earned by
                now.
              </p>
            )}
            {hoverRows.map((row) => (
              <span key={row.id} className="rc-tooltip-row">
                <span className="rc-tooltip-chip" style={{ background: row.colorVar }} aria-hidden="true" />
                <strong>{row.value === null ? 'N/A' : fmtValue(row.value)}</strong>
                <span className="rc-tooltip-label">{row.label}</span>
              </span>
            ))}
          </div>
        )}

        <div className="sr-only" aria-live="polite">
          {liveText}
        </div>

        {/* Not a live region: the standings change every frame during
            playback, so announcing them would be unusable. As a description
            they are there whenever a screen-reader user asks for them — which
            is the only way this chart's actual data was ever reachable
            without a mouse. */}
        <div id={summaryId} className="sr-only">
          {`At round ${Math.min(t, horizon).toLocaleString()} of ${horizon.toLocaleString()}: ${series
            .map(
              (s) =>
                `${s.label}, ${maxRound < 0 ? 'no data yet' : `${fmtValue(s.values[maxRound] ?? 0)} ${unit} given up`}`,
            )
            .join('. ')}.`}
        </div>
      </div>
    </div>
  )
}
