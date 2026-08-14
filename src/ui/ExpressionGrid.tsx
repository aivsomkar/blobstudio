import { useMemo } from 'react'
import { EXPRESSION_COUNT, type MascotShape } from '../engine/faceEngine'
import type { FrameOptions } from '../export/frames'
import { FaceThumb, useThumbBody } from './FaceThumb'
import { Scrub } from './Scrub'

/**
 * Every expression as the face it actually is.
 *
 * The picker used to be numbered chips, which asked people to remember that 17 is the smug
 * one. Rendering each is nearly free — the export already builds exactly this markup for the
 * SVG frames — and it turns choosing a face back into looking at faces.
 *
 * The thumbnails are drawn from the live shape and colours, so they stay honest when either
 * changes; a grid of stale circles beside a green blob is worse than numbers. The shared
 * gradient and clip live in ThumbDefs, which the page mounts — see FaceThumb.
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

  const body = useThumbBody(shape)

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Expressions</h2>
        <span className="count">{EXPRESSION_COUNT} presets</span>
      </div>

      <div className="thumbs">
        <button
          className={'thumb auto' + (expression === undefined ? ' on' : '')}
          onClick={() => onExpression(undefined)}
          title="Let the state choose, and drift on its own cadence"
        >
          auto
        </button>
        {Array.from({ length: EXPRESSION_COUNT }, (_, i) => (
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
            <FaceThumb body={body} shape={shape} options={options} expression={i} />
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
