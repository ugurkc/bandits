import { useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { StrategyId } from '../lib/bandit/types'
import './playground.css'

export interface RegretChartSeries {
  id: StrategyId
  label: string
  colorVar: string
  values: number[]
}

export interface RegretChartProps {
  series: RegretChartSeries[]
  /** Playhead: rounds [0, t] are drawn. */
  t: number
  horizon: number
  height?: number
}

const W = 640
const PAD_LEFT = 48
const PAD_RIGHT = 14
const PAD_TOP = 12
const PAD_BOTTOM = 26
/** Minimum vertical separation between direct end labels, in viewBox px. */
const LABEL_GAP = 13
/** End labels flip to the left of their dot when this close to the right edge. */
const LABEL_FLIP_ZONE = 118

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
 * Nudge overlapping end-label y-positions apart (all three lines start at the
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
 */
export function RegretChart({ series, t, horizon, height = 260 }: RegretChartProps) {
  const [hoverRound, setHoverRound] = useState<number | null>(null)

  const innerW = W - PAD_LEFT - PAD_RIGHT
  const innerH = height - PAD_TOP - PAD_BOTTOM
  const safeHorizon = Math.max(horizon, 1)

  let yMax = 0
  for (const s of series) {
    for (const v of s.values) {
      if (v > yMax) yMax = v
    }
  }
  if (yMax <= 0) yMax = 1

  const x = (round: number) => PAD_LEFT + (round / safeHorizon) * innerW
  const y = (v: number) => PAD_TOP + innerH - (v / yMax) * innerH

  const step = gridStep(yMax)
  const ticks: number[] = []
  for (let i = 1; i * step <= yMax * 1.000001; i++) ticks.push(i * step)

  // Downsample to roughly one point per viewBox pixel: at 20k rounds a full
  // path is invisible extra work on every playback frame. The last drawn
  // round (the playhead end) is always included exactly.
  const paths = series.map((s) => {
    const count = Math.max(0, Math.min(t + 1, s.values.length))
    if (count === 0) return { id: s.id, label: s.label, colorVar: s.colorVar, d: '', endX: 0, endY: 0, has: false }
    const stride = Math.max(1, Math.floor(count / innerW))
    let d = ''
    for (let r = 0; r < count; r += stride) {
      d += `${d === '' ? 'M' : 'L'}${x(r).toFixed(1)} ${y(s.values[r]).toFixed(1)}`
    }
    const last = count - 1
    if (last % stride !== 0) d += `L${x(last).toFixed(1)} ${y(s.values[last]).toFixed(1)}`
    return { id: s.id, label: s.label, colorVar: s.colorVar, d, endX: x(last), endY: y(s.values[last]), has: true }
  })

  const ends = paths.filter((p) => p.has)
  const labelYs = spreadLabels(
    ends.map((p) => p.endY),
    PAD_TOP + 8,
    PAD_TOP + innerH - 2,
    LABEL_GAP,
  )

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

  const trackPointer = (e: ReactPointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    // Zero width happens when the chart is mounted but not on screen.
    if (rect.width === 0) return
    // The SVG scales to its container, so map client px back through the viewBox.
    const vbX = ((e.clientX - rect.left) / rect.width) * W
    const round = Math.round(((vbX - PAD_LEFT) / innerW) * safeHorizon)
    setHoverRound(Math.max(0, Math.min(maxRound, round)))
  }

  return (
    <div className="rc-wrap">
      <div className="rc-legend">
        {series.map((s) => (
          <span key={s.id} className="rc-legend-item">
            <span className="rc-legend-chip" style={{ background: s.colorVar }} aria-hidden="true" />
            {s.label}
          </span>
        ))}
      </div>
      <div className="rc-chart-wrap">
        <svg
          className="rc-svg"
          viewBox={`0 0 ${W} ${height}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={`Cumulative expected regret over ${horizon.toLocaleString()} rounds for ${series
            .map((s) => s.label)
            .join(', ')}; playhead at round ${Math.min(t, horizon).toLocaleString()}`}
          onPointerMove={trackPointer}
          onPointerDown={trackPointer}
          onPointerLeave={() => setHoverRound(null)}
        >
          {ticks.map((v) => (
            <line
              key={v}
              className="rc-grid"
              x1={PAD_LEFT}
              y1={y(v)}
              x2={W - PAD_RIGHT}
              y2={y(v)}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <line
            className="rc-axis"
            x1={PAD_LEFT}
            y1={y(0)}
            x2={W - PAD_RIGHT}
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
          <text className="rc-tick" x={W - PAD_RIGHT} y={height - 8} textAnchor="end">
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

          {ends.map((p, i) => {
            const flip = p.endX > W - PAD_RIGHT - LABEL_FLIP_ZONE
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
        </svg>

        {hr !== null && hoverRows !== null && (
          <div
            className="rc-tooltip"
            style={{ left: `${Math.min(88, Math.max(12, (x(hr) / W) * 100))}%` }}
          >
            <span className="rc-tooltip-round">Round {hr.toLocaleString()}</span>
            {hoverRows.map((row) => (
              <span key={row.id} className="rc-tooltip-row">
                <span className="rc-tooltip-chip" style={{ background: row.colorVar }} aria-hidden="true" />
                <strong>{row.value === null ? '—' : fmtValue(row.value)}</strong>
                <span className="rc-tooltip-label">{row.label}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
