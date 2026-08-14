import { useMemo } from 'react'
import { FACE_BOX, type MascotShape } from '../engine/faceEngine'
import { faceMarkup, type FrameOptions } from '../export/frames'

/**
 * One expression, drawn small.
 *
 * Two panels need this now — the expression picker and the state builder — and both want the
 * *live* shape and colours, because a grid of stale circles beside a green blob is worse
 * than numbers. Rendering is nearly free: the export already builds exactly this markup for
 * its SVG frames, so the thumbnails and the downloaded files cannot disagree.
 *
 * The gradient and the clip path are defined once, in `ThumbDefs`, and referenced by every
 * tile — 25 tiles would otherwise be 25 copies of the same silhouette path. That makes the
 * defs a real dependency rather than an implementation detail, which is why they are an
 * exported component the page mounts deliberately instead of a side effect of whichever
 * panel happened to render first.
 */

export const THUMB_GRADIENT_ID = 'thumb-grad'
export const THUMB_CLIP_ID = 'thumb-clip'

const MARGIN = 15
export const THUMB_VIEW_BOX = `${-MARGIN} ${-MARGIN} ${FACE_BOX + MARGIN * 2} ${
  FACE_BOX + MARGIN * 2
}`

export function ThumbDefs({
  shape,
  gradient,
}: {
  shape: MascotShape
  gradient: [string, string, string]
}) {
  return (
    <svg className="thumb-defs" aria-hidden="true">
      <defs>
        <linearGradient id={THUMB_GRADIENT_ID} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={gradient[0]} />
          <stop offset="55%" stopColor={gradient[1]} />
          <stop offset="100%" stopColor={gradient[2]} />
        </linearGradient>
        <clipPath
          id={THUMB_CLIP_ID}
          transform={shape.fit || undefined}
          dangerouslySetInnerHTML={{ __html: shape.clip }}
        />
      </defs>
    </svg>
  )
}

/**
 * The silhouette with the gradient wired up. Computed once per shape and handed to every
 * tile — doing it inside FaceThumb would repeat the same replace 25 times per render.
 * Accepts null so a caller can hold the hook above its own `shape &&` guard.
 */
export const useThumbBody = (shape: MascotShape | null) =>
  useMemo(
    () => (shape ? shape.body.replace(/\{\{GRADIENT\}\}/g, `url(#${THUMB_GRADIENT_ID})`) : ''),
    [shape]
  )

export function FaceThumb({
  body,
  shape,
  options,
  expression,
  size,
}: {
  body: string
  shape: MascotShape
  options: FrameOptions
  expression: number
  size?: number
}) {
  return (
    <svg
      viewBox={THUMB_VIEW_BOX}
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      <g transform={shape.fit || undefined} dangerouslySetInnerHTML={{ __html: body }} />
      <g
        clipPath={`url(#${THUMB_CLIP_ID})`}
        dangerouslySetInnerHTML={{ __html: faceMarkup(expression, options) }}
      />
    </svg>
  )
}
