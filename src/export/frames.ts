/**
 * Static renders of the mascot — one frozen frame per expression or state.
 *
 * The engine animates by writing attributes every frame, but a still frame is simpler than
 * that sounds: with no turn, no gaze and no blink, the eye transform collapses to identity,
 * so an expression is just its two eye rings plus a mouth derived from them. That means
 * these files are generated from exactly the same geometry the live component uses, rather
 * than from a screenshot of it.
 */

import {
  EXPRESSIONS,
  EXPRESSION_COUNT,
  FACE_BOX,
  GAZE,
  MASCOT_STATES,
  MOUTHS,
  POOLS,
  anchorTransform,
  mouthFrame,
  mouthPath,
  type MascotShape,
  type MascotState,
} from '../engine/faceEngine'

export interface FrameOptions {
  shape: MascotShape
  gradient: [string, string, string]
  eyeColor: string
  lookAround: number
  showMouth: boolean
  mouthStroke: number
}

const MARGIN = 15
const VIEW_BOX = `${-MARGIN} ${-MARGIN} ${FACE_BOX + MARGIN * 2} ${FACE_BOX + MARGIN * 2}`

const ringPath = (ring: [number, number][]) =>
  'M' + ring.map(p => p[0].toFixed(2) + ' ' + p[1].toFixed(2)).join('L') + 'Z'

/** Eye rings with this expression's look-direction applied, matching the live engine. */
function ringsFor(expression: number, lookAround: number) {
  const [gx, gy] = GAZE[expression]
  return EXPRESSIONS[expression].map(
    ring => ring.map(p => [p[0] + gx * lookAround, p[1] + gy * lookAround] as [number, number])
  )
}

/** The face — eyes and mouth — already positioned inside the silhouette. */
export function faceMarkup(expression: number, o: FrameOptions): string {
  const rings = ringsFor(expression, o.lookAround)
  const eyes = rings.map(ring => `<path d="${ringPath(ring)}" fill="${o.eyeColor}"/>`).join('')
  let mouth = ''
  if (o.showMouth) {
    const spec = MOUTHS[expression]
    const d = mouthPath(mouthFrame(rings, spec), spec)
    mouth =
      `<path d="${d}" fill="none" stroke="${o.eyeColor}" ` +
      `stroke-width="${o.mouthStroke}" stroke-linecap="round"/>`
  }
  return `<g transform="${anchorTransform(o.shape.anchor)}">${eyes}${mouth}</g>`
}

function defs(id: string, o: FrameOptions): string {
  const [light, mid, dark] = o.gradient
  return (
    `<defs>` +
    `<linearGradient id="${id}-grad" x1="1" y1="0" x2="0" y2="1">` +
    `<stop offset="0%" stop-color="${light}"/>` +
    `<stop offset="55%" stop-color="${mid}"/>` +
    `<stop offset="100%" stop-color="${dark}"/>` +
    `</linearGradient>` +
    `<clipPath id="${id}-clip"${o.shape.fit ? ` transform="${o.shape.fit}"` : ''}>` +
    `${o.shape.clip}</clipPath>` +
    `</defs>`
  )
}

const bodyMarkup = (id: string, o: FrameOptions) =>
  `<g${o.shape.fit ? ` transform="${o.shape.fit}"` : ''}>` +
  o.shape.body.replace(/\{\{GRADIENT\}\}/g, `url(#${id}-grad)`) +
  `</g>`

/** A standalone SVG file for one expression. */
export function frameSvg(expression: number, o: FrameOptions, title: string): string {
  const id = 'm'
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEW_BOX}" width="512" height="512" ` +
    `role="img" aria-label="${escapeXml(title)}">` +
    `<title>${escapeXml(title)}</title>` +
    defs(id, o) +
    bodyMarkup(id, o) +
    `<g clip-path="url(#${id}-clip)">${faceMarkup(expression, o)}</g>` +
    `</svg>`
  )
}

/**
 * Every state as a <symbol> in one file, so a non-React app can do
 * `<svg><use href="sprite.svg#thinking"/></svg>` without shipping 39 requests.
 */
export function spriteSvg(o: FrameOptions): string {
  const id = 'm'
  const symbols = MASCOT_STATES.map(state => {
    const expression = POOLS[state][0]
    return (
      `<symbol id="${state}" viewBox="${VIEW_BOX}">` +
      `<title>${escapeXml(state)}</title>` +
      bodyMarkup(id, o) +
      `<g clip-path="url(#${id}-clip)">${faceMarkup(expression, o)}</g>` +
      `</symbol>`
    )
  }).join('')
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" style="display:none">` + defs(id, o) + symbols + `</svg>`
  )
}

const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Rasterises an SVG string. Async because the browser only draws SVG through an Image. */
export async function svgToPng(svg: string, size: number): Promise<Uint8Array<ArrayBuffer>> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Could not rasterise a frame.'))
      img.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not get a 2D canvas context.')
    ctx.drawImage(image, 0, 0, size, size)
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('Could not encode a PNG.')
    return new Uint8Array(await blob.arrayBuffer())
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** State → resting expression, for the manifest. */
export function stateIndex(): Record<string, number> {
  const out: Record<string, number> = {}
  for (const state of MASCOT_STATES) out[state] = POOLS[state][0]
  return out
}

export { EXPRESSION_COUNT, MASCOT_STATES }
export type { MascotState }
