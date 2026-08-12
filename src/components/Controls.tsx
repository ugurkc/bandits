import './playground.css'

export interface ControlsProps {
  playing: boolean
  onPlayPause: () => void
  onStep: () => void
  onReset: () => void
  onReshuffle: () => void
  t: number
  horizon: number
  speed: number
  onSpeed: (v: number) => void
  speeds: number[]
  epsilon: number
  onEpsilon: (v: number) => void
  k: number
  onK: (v: number) => void
  horizonChoices: number[]
  onHorizon: (v: number) => void
  driftEnabled: boolean
  onDrift: (v: boolean) => void
  revealed: boolean
  onReveal: (v: boolean) => void
}

const K_CHOICES = [2, 3, 4, 5, 6]

export function Controls({
  playing,
  onPlayPause,
  onStep,
  onReset,
  onReshuffle,
  t,
  horizon,
  speed,
  onSpeed,
  speeds,
  epsilon,
  onEpsilon,
  k,
  onK,
  horizonChoices,
  onHorizon,
  driftEnabled,
  onDrift,
  revealed,
  onReveal,
}: ControlsProps) {
  const atEnd = t >= horizon
  return (
    <div className="ct-controls">
      <div className="ct-group" role="group" aria-label="Playback">
        <button
          type="button"
          className="ct-button"
          onClick={onPlayPause}
          disabled={atEnd && !playing}
        >
          {playing ? 'Pause' : 'Play'}
        </button>
        <button type="button" className="ct-button" onClick={onStep} disabled={atEnd}>
          Step
        </button>
        <button type="button" className="ct-button" onClick={onReset}>
          Reset
        </button>
        <button type="button" className="ct-button" onClick={onReshuffle}>
          Reshuffle rates
        </button>
        <span className="ct-readout" aria-label="Current round of horizon">
          {t.toLocaleString()} / {horizon.toLocaleString()}
        </span>
      </div>

      <div className="ct-group" role="group" aria-label="Parameters">
        <label className="ct-field">
          <span className="ct-field-label">ε</span>
          <input
            type="range"
            className="ct-range"
            min={0}
            max={0.5}
            step={0.01}
            value={epsilon}
            onChange={(e) => onEpsilon(Number(e.target.value))}
          />
          <span className="ct-value">{epsilon.toFixed(2)}</span>
        </label>
        <label className="ct-field">
          <span className="ct-field-label">Arms</span>
          <select
            className="ct-select"
            value={k}
            onChange={(e) => onK(Number(e.target.value))}
          >
            {K_CHOICES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="ct-field">
          <span className="ct-field-label">Horizon</span>
          <select
            className="ct-select"
            value={horizon}
            onChange={(e) => onHorizon(Number(e.target.value))}
          >
            {horizonChoices.map((v) => (
              <option key={v} value={v}>
                {v.toLocaleString()} rounds
              </option>
            ))}
          </select>
        </label>
        <label className="ct-field">
          <span className="ct-field-label">Speed</span>
          <select
            className="ct-select"
            value={speed}
            onChange={(e) => onSpeed(Number(e.target.value))}
          >
            {speeds.map((v) => (
              <option key={v} value={v}>
                {v.toLocaleString()} rounds/sec
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="ct-group" role="group" aria-label="World">
        <label className="ct-switch">
          <input
            type="checkbox"
            className="ct-switch-input"
            checked={driftEnabled}
            onChange={(e) => onDrift(e.target.checked)}
          />
          <span>Drift</span>
        </label>
        <label className="ct-switch">
          <input
            type="checkbox"
            className="ct-switch-input"
            checked={revealed}
            onChange={(e) => onReveal(e.target.checked)}
          />
          <span>Reveal true rates</span>
        </label>
      </div>
    </div>
  )
}
