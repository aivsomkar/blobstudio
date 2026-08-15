import { BUILTIN_SHAPES, type BuiltinShape } from '../shapes/builtin'
import { Slider } from './Slider'

/**
 * The starting shape and its own knobs.
 *
 * Which knobs appear depends on the shape, because the meaningful ones do — a cone has a tip
 * and a base to round, a circle has neither. The alternative is showing every shape the same
 * six controls with most of them inert, which teaches people the panel is lying.
 */
interface Props {
  /** Null once an uploaded file is in play — parameters only exist for generated shapes. */
  shapeId: string | null
  params: Record<string, number>
  onPick: (shape: BuiltinShape) => void
  onParam: (key: string, value: number) => void
  busy: boolean
}

export function ShapePanel({ shapeId, params, onPick, onParam, busy }: Props) {
  const active = BUILTIN_SHAPES.find(s => s.id === shapeId) ?? null

  return (
    <div className="panel">
      <h2>Shape</h2>
      <p className="hint">
        The surface changes; every expression and state stays compatible.
      </p>

      <div className="shape-grid">
        {BUILTIN_SHAPES.map(shape => (
          <button
            key={shape.id}
            className={'shape-tile' + (shape.id === shapeId ? ' on' : '')}
            onClick={() => onPick(shape)}
            disabled={busy}
            title={shape.name}
          >
            <svg viewBox={shape.viewBox} aria-hidden="true">
              <g
                dangerouslySetInnerHTML={{
                  __html: shape.build(shape.defaults).replace('{{GRADIENT}}', 'currentColor'),
                }}
              />
            </svg>
            <span>{shape.name}</span>
          </button>
        ))}
      </div>

      {active ? (
        <div className="sliders">
          {active.params.map(param => (
            <Slider
              key={param.key}
              label={param.label}
              value={params[param.key] ?? active.defaults[param.key]}
              onChange={v => onParam(param.key, v)}
              min={param.min}
              max={param.max}
              step={param.step}
            />
          ))}
        </div>
      ) : (
        <p className="hint">
          Uploaded artwork has no parameters — it is used exactly as drawn. Pick a shape above
          to go back to a generated one.
        </p>
      )}
    </div>
  )
}
