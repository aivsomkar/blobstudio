/**
 * Photo Mode — the frame you are actually looking at, as a file.
 *
 * The library export renders stills from geometry, which is right for a catalogue: no turn,
 * no gaze, no blink, so an expression collapses to two eye rings and a mouth. It is the
 * wrong tool for "grab this exact instant", because everything that makes the mascot worth
 * looking at mid-animation — a comet halfway round its ring, a landing squash, confetti in
 * flight — lives in attributes the frame loop writes imperatively and no geometry pass
 * reproduces.
 *
 * So this serializes the live <svg> out of the DOM instead. Whatever is on screen is what
 * lands in the file, which is the only definition of "photo" that survives contact with an
 * animation.
 */

const SVG_NS = 'http://www.w3.org/2000/svg'

export type SnapshotBackground = 'transparent' | 'solid' | 'linear' | 'radial'

export interface SnapshotOptions {
  background: SnapshotBackground
  /** Solid fill, or the first stop of a gradient. */
  colorFrom: string
  /** Second stop. Ignored for transparent and solid. */
  colorTo: string
  size: number
  title: string
}

export class SnapshotError extends Error {}

const BACKDROP_ID = 'photo-backdrop'

/**
 * Copies the live node and makes the copy stand on its own.
 *
 * The on-screen svg is sized in CSS with width="100%", inherits its font and colour from the
 * page, and carries React's bookkeeping. A file has none of that context, so the copy gets
 * explicit pixel dimensions and the viewBox does the rest.
 */
export const snapshotSvg = (live: SVGSVGElement, options: SnapshotOptions): string => {
  const copy = live.cloneNode(true) as SVGSVGElement

  copy.setAttribute('xmlns', SVG_NS)
  copy.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink')
  copy.setAttribute('width', String(options.size))
  copy.setAttribute('height', String(options.size))
  if (!copy.getAttribute('viewBox')) {
    throw new SnapshotError('That preview has no viewBox, so it cannot be exported at a size.')
  }

  // Inline styles on the root are the page's business, not the file's.
  copy.removeAttribute('style')
  copy.removeAttribute('class')

  copy.setAttribute('role', 'img')
  copy.setAttribute('aria-label', options.title)
  copy.removeAttribute('aria-hidden')

  const title = document.createElementNS(SVG_NS, 'title')
  title.textContent = options.title
  copy.insertBefore(title, copy.firstChild)

  if (options.background !== 'transparent') {
    paintBackdrop(copy, options)
  }

  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(copy)}`
}

/**
 * The backdrop is inserted as the first drawn element and sized from the viewBox rather
 * than a fixed box, so it covers exactly the visible area — including the 15 units of
 * margin the engine leaves for confetti to fly into.
 */
function paintBackdrop(copy: SVGSVGElement, options: SnapshotOptions) {
  const [x, y, width, height] = (copy.getAttribute('viewBox') || '')
    .trim()
    .split(/[\s,]+/)
    .map(Number)
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    throw new SnapshotError('That preview has an unreadable viewBox.')
  }

  let fill = options.colorFrom
  if (options.background === 'linear' || options.background === 'radial') {
    const gradient = document.createElementNS(
      SVG_NS,
      options.background === 'linear' ? 'linearGradient' : 'radialGradient'
    )
    gradient.setAttribute('id', BACKDROP_ID)
    if (options.background === 'linear') {
      gradient.setAttribute('x1', '0')
      gradient.setAttribute('y1', '0')
      gradient.setAttribute('x2', '1')
      gradient.setAttribute('y2', '1')
    } else {
      gradient.setAttribute('cx', '50%')
      gradient.setAttribute('cy', '42%')
      gradient.setAttribute('r', '75%')
    }
    for (const [offset, color] of [
      ['0%', options.colorFrom],
      ['100%', options.colorTo],
    ]) {
      const stop = document.createElementNS(SVG_NS, 'stop')
      stop.setAttribute('offset', offset)
      stop.setAttribute('stop-color', color)
      gradient.appendChild(stop)
    }
    // Its own defs block: the engine's defs carry namespaced ids we must not disturb.
    const defs = document.createElementNS(SVG_NS, 'defs')
    defs.appendChild(gradient)
    copy.insertBefore(defs, copy.firstChild)
    fill = `url(#${BACKDROP_ID})`
  }

  const rect = document.createElementNS(SVG_NS, 'rect')
  rect.setAttribute('x', String(x))
  rect.setAttribute('y', String(y))
  rect.setAttribute('width', String(width))
  rect.setAttribute('height', String(height))
  rect.setAttribute('fill', fill)

  // After any defs, before the artwork.
  const firstDrawn = Array.from(copy.children).find(
    child => child.localName !== 'defs' && child.localName !== 'title'
  )
  copy.insertBefore(rect, firstDrawn ?? null)
}

/**
 * Rasterises a snapshot. Kept separate from `svgToPng` in frames.ts because a transparent
 * photo must stay transparent — that one draws onto a fresh canvas too, but this is the
 * path where the choice is load-bearing rather than incidental.
 */
export const snapshotPng = async (svg: string, size: number): Promise<Blob> => {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new SnapshotError('The browser could not render that frame.'))
      element.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const context = canvas.getContext('2d')
    if (!context) throw new SnapshotError('Could not get a 2D canvas context.')
    context.clearRect(0, 0, size, size)
    context.drawImage(image, 0, 0, size, size)
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new SnapshotError('Could not encode a PNG.')
    return blob
  } finally {
    URL.revokeObjectURL(url)
  }
}

export const snapshotFileName = (
  name: string,
  state: string,
  extension: 'svg' | 'png'
): string => {
  const slug = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  const base = slug(name) || 'mascot'
  const suffix = slug(state)
  return `${base}${suffix ? `-${suffix}` : ''}.${extension}`
}
