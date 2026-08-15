/**
 * Records the mascot cycling through every state, in the browser.
 *
 * Same rule as the rest of the exporter: nothing is uploaded and nothing is added to the
 * dependency list. A canvas capture stream feeding `MediaRecorder` is the only way to get a
 * video out of a browser without either, so that is what this is — the live component is
 * rasterised frame by frame and recorded as it plays.
 *
 * Recording therefore happens in real time. A forty-state reel takes forty seconds to make
 * because it takes forty seconds to watch; there is no way to run it faster without a
 * frame-accurate encoder, which would mean a muxer dependency.
 */
import type { MascotState } from '../engine/faceEngine'

/** One held pose: a state, optionally with a specific face pinned on it. */
export interface Step {
  state: MascotState
  expression?: number
  /** How long this pose is held, ms. */
  hold: number
}

export interface RecordOptions {
  /** Puts a pose on screen. The caller re-renders; the recorder waits a frame for it. */
  show: (step: Step) => void
  /** Called as each pose begins, so the caller can punctuate — a blink, say. */
  onStep?: (index: number, step: Step) => void
  /** The live SVG being recorded. Read fresh each frame, since React replaces attributes. */
  getSvg: () => SVGSVGElement | null
  steps: Step[]
  /** Square edge, in pixels. */
  size: number
  fps: number
  background: string
  onProgress: (fraction: number) => void
  signal: AbortSignal
}

export interface Recording {
  blob: Blob
  extension: string
}

/**
 * The best container this browser will record.
 *
 * MP4 first where it exists, because it is the one that plays everywhere a person is likely
 * to drop it. WebM is the fallback and the only option in most browsers today.
 */
function pickFormat(): { mimeType: string; extension: string } | null {
  if (typeof MediaRecorder === 'undefined') return null
  const candidates: [string, string][] = [
    ['video/mp4;codecs=avc1.42E01E', 'mp4'],
    ['video/mp4', 'mp4'],
    ['video/webm;codecs=vp9', 'webm'],
    ['video/webm;codecs=vp8', 'webm'],
    ['video/webm', 'webm'],
  ]
  for (const [mimeType, extension] of candidates) {
    if (MediaRecorder.isTypeSupported(mimeType)) return { mimeType, extension }
  }
  return null
}

export const videoSupported = () => pickFormat() !== null

const nextFrame = () => new Promise<number>(resolve => requestAnimationFrame(resolve))

/**
 * Paints the current SVG onto the canvas.
 *
 * Serialising and decoding per frame is the expensive part, and it is why this records at
 * whatever rate the machine manages rather than a guaranteed 30. That degrades the right
 * way: `MediaRecorder` timestamps the frames it actually receives, so a slow machine gets a
 * lower frame rate rather than a video that plays at the wrong speed.
 */
async function paint(
  ctx: CanvasRenderingContext2D,
  svg: SVGSVGElement,
  size: number,
  background: string
) {
  const markup = new XMLSerializer().serializeToString(svg)
  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    ctx.fillStyle = background
    ctx.fillRect(0, 0, size, size)
    ctx.drawImage(image, 0, 0, size, size)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function recordStates(options: RecordOptions): Promise<Recording> {
  const format = pickFormat()
  if (!format) throw new Error('This browser cannot record video.')

  const { show, onStep, getSvg, steps, size, fps, background, onProgress, signal } = options

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get a canvas to draw on.')

  // A first frame before recording starts, so the video never opens on an empty canvas.
  ctx.fillStyle = background
  ctx.fillRect(0, 0, size, size)

  const stream = canvas.captureStream(fps)
  const recorder = new MediaRecorder(stream, {
    mimeType: format.mimeType,
    videoBitsPerSecond: 8_000_000,
  })
  const chunks: BlobPart[] = []
  recorder.ondataavailable = event => {
    if (event.data.size) chunks.push(event.data)
  }
  const finished = new Promise<void>((resolve, reject) => {
    recorder.onstop = () => resolve()
    recorder.onerror = () => reject(new Error('Recording failed.'))
  })

  recorder.start()
  try {
    // Poses can be held for different lengths, so the running total is what maps a moment
    // to a pose rather than a single division.
    const ends: number[] = []
    let running = 0
    for (const step of steps) {
      running += step.hold
      ends.push(running)
    }
    const total = running
    const started = performance.now()
    let showing = -1

    for (;;) {
      if (signal.aborted) break
      const elapsed = performance.now() - started
      if (elapsed >= total) break

      let index = ends.findIndex(end => elapsed < end)
      if (index < 0) index = steps.length - 1
      if (index !== showing) {
        showing = index
        show(steps[index])
        onStep?.(index, steps[index])
        // One frame for React to commit the new pose before it is rasterised.
        await nextFrame()
      }

      const svg = getSvg()
      if (svg) await paint(ctx, svg, size, background)
      onProgress(Math.min(elapsed / total, 1))
      await nextFrame()
    }
  } finally {
    recorder.stop()
    stream.getTracks().forEach(track => track.stop())
  }

  await finished
  return { blob: new Blob(chunks, { type: format.mimeType }), extension: format.extension }
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
