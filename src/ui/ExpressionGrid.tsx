import { useMemo } from 'react'
import { EXPRESSION_COUNT, type MascotShape } from '../engine/faceEngine'
import { faceMarkup, type FrameOptions } from '../export/frames'
import { Scrub } from './Scrub'

/**
 * Every expression as the face it actually is.
 *
 * The picker used to be numbered chips, which asked people to remember that 17 is the smug
 * one. Rendering each is nearly free — the export already builds exactly this markup for the
 * SVG frames — and it turns choosing a face back into looking at faces.
 *
 * The thumbnails are drawn from the live shape and colours, so they stay honest when either
 * changes; a grid of stale circles beside a green blob is worse than numbers.
 */
interface Props {
  shape: MascotShape
  gradient: [string, string, string]
  eyeColor: string
  showMouth: boolean
  lookAround: number
  mouthStroke: number
  /** Undefined means the state picks, which is the default. */
  expression: number | undefined
  onExpression: (index: number | undefined) => void
  /** Expressions that clip out of the silhouette at the current fit. */
  clipping: number[]
  spring: number
  onSpring: (value: number) => void
  onBlink: () => void
  onRandom: () => void
}

const MARGIN = 15
const FACE_BOX = 228.541
const VIEW_BOX = `${-MARGIN} ${-MARGIN} ${FACE_BOX + MARGIN * 2} ${FACE_BOX + MARGIN * 2}`

export function ExpressionGrid({
  shape,
  gradient,
  eyeColor,
  showMouth,
  lookAround,
  mouthStroke,
  expression,
  onExpression,
  clipping,
  spring,
  onSpring,
  onBlink,
  onRandom,
}: Props) {
  const options: FrameOptions = useMemo(
    () => ({ shape, gradient, eyeColor, lookAround, showMouth, mouthStroke }),
    [shape, gradient, eyeColor, lookAround, showMouth, mouthStroke]
  )

  // One body for the whole grid: the silhouette is identical in every tile, so drawing it
  // 25 times is 25 copies of the same path. Only the face differs.
  const body = useMemo(
    () => shape.body.replace(/\{\{GRADIENT\}\}/g, 'url(#thumb-grad)'),
    [shape.body]
  )

  const faces = useMemo(
    () => Array.from({ length: EXPRESSION_COUNT }, (_, i) => faceMarkup(i, options)),
    [options]
  )

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Expressions</h2>
        <span className="count">{EXPRESSION_COUNT} presets</span>
      </div>

      {/* The gradient and clip are defined once and referenced by every tile. */}
      <svg className="thumb-defs" aria-hidden="true">
        <defs>
          <linearGradient id="thumb-grad" x1="1" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={gradient[0]} />
            <stop offset="55%" stopColor={gradient[1]} />
            <stop offset="100%" stopColor={gradient[2]} />
          </linearGradient>
          <clipPath
            id="thumb-clip"
            transform={shape.fit || undefined}
            dangerouslySetInnerHTML={{ __html: shape.clip }}
          />
        </defs>
      </svg>

      <div className="thumbs">
        <button
          className={'thumb auto' + (expression === undefined ? ' on' : '')}
          onClick={() => onExpression(undefined)}
          title="Let the state choose, and drift on its own cadence"
        >
          auto
        </button>
        {faces.map((face, i) => (
          <button
            key={i}
            className={
              'thumb' +
              (expression === i ? ' on' : '') +
              (clipping.includes(i) ? ' clips' : '')
            }
            onClick={() => onExpression(i)}
            title={clipping.includes(i) ? `Expression ${i} clips at this size` : `Expression ${i}`}
          >
            <svg viewBox={VIEW_BOX} aria-hidden="true">
              <g transform={shape.fit || undefined} dangerouslySetInnerHTML={{ __html: body }} />
              <g clipPath="url(#thumb-clip)" dangerouslySetInnerHTML={{ __html: face }} />
            </svg>
            <em>{String(i).padStart(2, '0')}</em>
          </button>
        ))}
      </div>

      <div className="panel-head spaced">
        <h3>Motion</h3>
      </div>
      <p className="hint">
        Expressions are interpolated by a spring, so the face eases between poses rather than
        cutting. Higher is snappier.
      </p>
      <div className="scrubs">
        <Scrub
          label="Spring"
          value={spring}
          onChange={onSpring}
          min={1}
          max={20}
          step={0.2}
          precision={1}
        />
      </div>
      <div className="row">
        <button onClick={onBlink}>Blink</button>
        <button onClick={onRandom}>Random expression</button>
      </div>
    </div>
  )
}
