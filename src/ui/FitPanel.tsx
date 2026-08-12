import { FACE_BOX } from '../engine/faceEngine'

interface Props {
  anchor: { x: number; y: number; scale: number }
  onChange: (next: Partial<{ x: number; y: number; scale: number }>) => void
  onAuto: () => void
  lookAround: number
  onLookAround: (v: number) => void
  clipping: number[]
  clearance: number
  total: number
}

export function FitPanel({
  anchor,
  onChange,
  onAuto,
  lookAround,
  onLookAround,
  clipping,
  clearance,
  total,
}: Props) {
  const ok = clipping.length === 0
  return (
    <div className="panel">
      <h2>Fit</h2>

      <div className={'verdict ' + (ok ? 'ok' : 'bad')}>
        {ok ? (
          <>
            All {total} expressions fit
            <em>{clearance.toFixed(1)} units of clearance</em>
          </>
        ) : (
          <>
            {clipping.length} of {total} expressions clip
            <em>{clipping.map(i => String(i).padStart(2, '0')).join(', ')}</em>
          </>
        )}
      </div>

      <label className="control">
        <span>
          size <output>{anchor.scale.toFixed(2)}×</output>
        </span>
        <input
          type="range"
          min={0.1}
          max={1.6}
          step={0.01}
          value={anchor.scale}
          onChange={e => onChange({ scale: +e.target.value })}
        />
      </label>

      <label className="control">
        <span>
          across <output>{anchor.x.toFixed(0)}</output>
        </span>
        <input
          type="range"
          min={0}
          max={FACE_BOX}
          step={1}
          value={anchor.x}
          onChange={e => onChange({ x: +e.target.value })}
        />
      </label>

      <label className="control">
        <span>
          down <output>{anchor.y.toFixed(0)}</output>
        </span>
        <input
          type="range"
          min={0}
          max={FACE_BOX}
          step={1}
          value={anchor.y}
          onChange={e => onChange({ y: +e.target.value })}
        />
      </label>

      <label className="control">
        <span>
          look around <output>{Math.round(lookAround * 100)}%</output>
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={lookAround}
          onChange={e => onLookAround(+e.target.value)}
        />
      </label>
      <p className="hint">
        How far the eyes drift from centre for expressive poses. At 0 the mascot always looks
        straight at you; higher values need a smaller face to stay inside the shape.
      </p>

      <button className="wide" onClick={onAuto}>
        Auto-fit
      </button>
    </div>
  )
}
