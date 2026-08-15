import { FACE_BOX } from '../engine/faceEngine'
import { Slider } from './Slider'

interface Props {
  anchor: { x: number; y: number; scale: number }
  onChange: (next: Partial<{ x: number; y: number; scale: number }>) => void
  onAuto: () => void
  lookAround: number
  onLookAround: (v: number) => void
  motion: number
  onMotion: (v: number) => void
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
  motion,
  onMotion,
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

      <div className="sliders">
        <Slider
          label="Size"
          value={anchor.scale}
          onChange={scale => onChange({ scale })}
          min={0.1}
          max={1.6}
          step={0.01}
        />
        <Slider
          label="Across"
          value={anchor.x}
          onChange={x => onChange({ x })}
          min={0}
          max={FACE_BOX}
          step={1}
        />
        <Slider
          label="Down"
          value={anchor.y}
          onChange={y => onChange({ y })}
          min={0}
          max={FACE_BOX}
          step={1}
        />
        <Slider
          label="Look around"
          value={lookAround}
          onChange={onLookAround}
          min={0}
          max={1}
          step={0.01}
        />
      </div>
      <p className="hint">
        How far the eyes drift from centre for expressive poses. At 0 the mascot always looks
        straight at you; higher values need a smaller face to stay inside the shape.
      </p>

      <div className="sliders">
        <Slider
          label="Body motion"
          value={motion}
          onChange={onMotion}
          min={0}
          max={1.5}
          step={0.01}
        />
      </div>
      <p className="hint">
        How much the silhouette itself bounces, breathes, tilts and squashes. Each state has
        its own motion; 0 holds the body perfectly still. It starts at 0 if your system asks
        for reduced motion.
      </p>

      <button className="wide" onClick={onAuto}>
        Auto-fit
      </button>
    </div>
  )
}
