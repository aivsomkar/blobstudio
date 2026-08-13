/**
 * Shapes to start from.
 *
 * These are generated from parameters rather than stored as fixed artwork, so a starting
 * shape is a family rather than one drawing: the same circle gives you an egg, a pill or a
 * squashed disc without anyone drawing three of them. Every one still goes through the same
 * import → distance field → solver path as an uploaded file, so nothing downstream knows
 * the difference.
 *
 * The parameter set differs per shape because the meaningful knobs do: a cone has a tip and
 * a base to round independently, a capsule has ends, a circle has neither. Showing every
 * shape the same six sliders would mean five of them doing nothing.
 *
 * The circle is the default: this is a tool for other people's mascots, so it should open on
 * something neutral rather than someone else's character.
 */

export interface ShapeParam {
  key: string
  label: string
  min: number
  max: number
  step: number
  /** Decimals shown in the field. */
  precision: number
  suffix?: string
}

export interface BuiltinShape {
  id: string
  name: string
  /** Knobs this shape exposes, in display order. */
  params: ShapeParam[]
  defaults: Record<string, number>
  /** Markup in its own coordinate space, sized to fit `viewBox`. */
  build: (p: Record<string, number>) => string
  viewBox: string
}

/* ------------------------------------------------------------------ params */

const SIZE = (max = 260): ShapeParam[] => [
  { key: 'width', label: 'Width', min: 40, max, step: 1, precision: 0, suffix: 'u' },
  { key: 'height', label: 'Height', min: 40, max, step: 1, precision: 0, suffix: 'u' },
]

const ROUND = (label = 'Roundness'): ShapeParam => ({
  key: 'round',
  label,
  min: 0,
  max: 1,
  step: 0.01,
  precision: 2,
})

/* ------------------------------------------------------------------ builders */

const fill = (d: string) => `<path fill="{{GRADIENT}}" d="${d}"/>`

/** Rectangle with independently rounded corners, as one path. */
function roundedBox(w: number, h: number, r: number): string {
  const x = 100 - w / 2
  const y = 100 - h / 2
  const k = Math.min(r, w / 2, h / 2)
  return fill(
    `M${x + k} ${y}H${x + w - k}Q${x + w} ${y} ${x + w} ${y + k}` +
      `V${y + h - k}Q${x + w} ${y + h} ${x + w - k} ${y + h}` +
      `H${x + k}Q${x} ${y + h} ${x} ${y + h - k}` +
      `V${y + k}Q${x} ${y} ${x + k} ${y}Z`
  )
}

/** Ellipse, as a path so every builtin returns the same kind of markup. */
function ellipse(w: number, h: number): string {
  const rx = w / 2
  const ry = h / 2
  return fill(`M${100 - rx} 100A${rx} ${ry} 0 0 1 ${100 + rx} 100A${rx} ${ry} 0 0 1 ${100 - rx} 100Z`)
}

export const BUILTIN_SHAPES: BuiltinShape[] = [
  {
    id: 'circle',
    name: 'Circle',
    params: SIZE(),
    defaults: { width: 200, height: 200 },
    build: p => ellipse(p.width, p.height),
    viewBox: '0 0 200 200',
  },
  {
    id: 'squircle',
    name: 'Squircle',
    params: [...SIZE(), ROUND()],
    defaults: { width: 200, height: 200, round: 0.5 },
    // The roundness runs from a square to a full circle, so one shape covers the range
    // people actually reach for between the two.
    build: p => roundedBox(p.width, p.height, (Math.min(p.width, p.height) / 2) * p.round),
    viewBox: '0 0 200 200',
  },
  {
    id: 'blob',
    name: 'Blob',
    params: [
      ...SIZE(),
      { key: 'wobble', label: 'Wobble', min: 0, max: 1, step: 0.01, precision: 2 },
    ],
    defaults: { width: 200, height: 200, wobble: 0.35 },
    /*
      A circle whose radius breathes around the turn. Wobble at 0 is a plain ellipse; higher
      values push alternating lobes in and out, which is what separates a mascot blob from a
      ball without anyone hand-drawing the lumps.
    */
    build: p => {
      const points: string[] = []
      const STEPS = 24
      for (let i = 0; i < STEPS; i++) {
        const a = (i / STEPS) * Math.PI * 2
        const r = 1 + Math.sin(a * 3 + 0.6) * 0.07 * p.wobble + Math.sin(a * 2 - 1.1) * 0.05 * p.wobble
        points.push(`${(100 + Math.cos(a) * (p.width / 2) * r).toFixed(2)} ${(100 + Math.sin(a) * (p.height / 2) * r).toFixed(2)}`)
      }
      // Closed Catmull-Rom-ish: quadratics through the midpoints keep it smooth and closed.
      let d = ''
      for (let i = 0; i < points.length; i++) {
        const [cx, cy] = points[i].split(' ').map(Number)
        const [nx, ny] = points[(i + 1) % points.length].split(' ').map(Number)
        const mid = `${((cx + nx) / 2).toFixed(2)} ${((cy + ny) / 2).toFixed(2)}`
        d += i === 0 ? `M${mid}` : `Q${cx.toFixed(2)} ${cy.toFixed(2)} ${mid}`
      }
      const [fx, fy] = points[0].split(' ').map(Number)
      const [sx, sy] = points[1].split(' ').map(Number)
      d += `Q${fx.toFixed(2)} ${fy.toFixed(2)} ${((fx + sx) / 2).toFixed(2)} ${((fy + sy) / 2).toFixed(2)}Z`
      return fill(d)
    },
    viewBox: '0 0 200 200',
  },
  {
    id: 'capsule',
    name: 'Capsule',
    params: SIZE(),
    defaults: { width: 150, height: 200 },
    // Ends always fully round — that is what makes it a capsule rather than a squircle.
    build: p => roundedBox(p.width, p.height, Math.min(p.width, p.height) / 2),
    viewBox: '0 0 200 200',
  },
  {
    id: 'cone',
    name: 'Cone',
    params: [
      ...SIZE(),
      { key: 'tip', label: 'Tip round', min: 0.02, max: 1, step: 0.01, precision: 2 },
      { key: 'base', label: 'Base round', min: 0.02, max: 1, step: 0.01, precision: 2 },
    ],
    defaults: { width: 190, height: 200, tip: 0.45, base: 0.9 },
    /*
      Tip and base round independently, which is the whole point of the shape: the same
      outline covers a teardrop, a shield and a rounded triangle depending on which end you
      soften.
    */
    build: p => {
      const hw = p.width / 2
      const hh = p.height / 2
      const t = hw * p.tip
      const b = hw * p.base * 0.55
      return fill(
        `M${100 - t} ${100 - hh + t * 0.9}` +
          `Q${100} ${100 - hh} ${100 + t} ${100 - hh + t * 0.9}` +
          `L${100 + hw - b * 0.4} ${100 + hh - b}` +
          `Q${100 + hw} ${100 + hh} ${100 + hw - b} ${100 + hh}` +
          `L${100 - hw + b} ${100 + hh}` +
          `Q${100 - hw} ${100 + hh} ${100 - hw + b * 0.4} ${100 + hh - b}Z`
      )
    },
    viewBox: '0 0 200 200',
  },
  {
    id: 'drop',
    name: 'Drop',
    params: [...SIZE(), ROUND('Belly')],
    defaults: { width: 156, height: 194, round: 0.62 },
    // Deliberately lopsided: its widest region is nowhere near the bounding-box centre, so
    // it proves the fit is solved rather than guessed.
    build: p => {
      const hw = p.width / 2
      const belly = p.height * (0.3 + p.round * 0.35)
      return fill(
        `M100 ${100 - p.height / 2}` +
          `C${100 + hw * 0.78} ${100 - p.height / 2 + belly * 0.75} ${100 + hw} ${100 - p.height / 2 + belly} ${100 + hw} ${100 + p.height / 2 - hw}` +
          `A${hw} ${hw} 0 0 1 ${100 - hw} ${100 + p.height / 2 - hw}` +
          `C${100 - hw} ${100 - p.height / 2 + belly} ${100 - hw * 0.78} ${100 - p.height / 2 + belly * 0.75} 100 ${100 - p.height / 2}Z`
      )
    },
    viewBox: '0 0 200 200',
  },
  {
    id: 'hex',
    name: 'Polygon',
    params: [
      ...SIZE(),
      { key: 'sides', label: 'Sides', min: 3, max: 10, step: 1, precision: 0 },
      ROUND('Corners'),
    ],
    defaults: { width: 196, height: 196, sides: 6, round: 0.12 },
    build: p => {
      const n = Math.max(3, Math.round(p.sides))
      const pts: [number, number][] = []
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2
        pts.push([100 + Math.cos(a) * (p.width / 2), 100 + Math.sin(a) * (p.height / 2)])
      }
      // Corner rounding by cutting each vertex back along both its edges and arcing across.
      const r = p.round
      if (r <= 0.001) return fill('M' + pts.map(q => `${q[0].toFixed(2)} ${q[1].toFixed(2)}`).join('L') + 'Z')
      let d = ''
      for (let i = 0; i < n; i++) {
        const prev = pts[(i - 1 + n) % n]
        const cur = pts[i]
        const next = pts[(i + 1) % n]
        const a = lerp(cur, prev, r * 0.5)
        const b = lerp(cur, next, r * 0.5)
        d += i === 0 ? `M${a[0].toFixed(2)} ${a[1].toFixed(2)}` : `L${a[0].toFixed(2)} ${a[1].toFixed(2)}`
        d += `Q${cur[0].toFixed(2)} ${cur[1].toFixed(2)} ${b[0].toFixed(2)} ${b[1].toFixed(2)}`
      }
      return fill(d + 'Z')
    },
    viewBox: '0 0 200 200',
  },
  {
    id: 'star',
    name: 'Star',
    params: [
      ...SIZE(),
      { key: 'points', label: 'Points', min: 3, max: 9, step: 1, precision: 0 },
      { key: 'inner', label: 'Depth', min: 0.25, max: 0.9, step: 0.01, precision: 2 },
    ],
    defaults: { width: 196, height: 196, points: 5, inner: 0.42 },
    build: p => {
      const n = Math.max(3, Math.round(p.points))
      const out: string[] = []
      for (let i = 0; i < n * 2; i++) {
        const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2
        const k = i % 2 === 0 ? 1 : p.inner
        out.push(`${(100 + Math.cos(a) * (p.width / 2) * k).toFixed(2)} ${(100 + Math.sin(a) * (p.height / 2) * k).toFixed(2)}`)
      }
      return fill('M' + out.join('L') + 'Z')
    },
    viewBox: '0 0 200 200',
  },
  {
    id: 'cursor',
    name: 'Cursor',
    params: [...SIZE(), ROUND()],
    defaults: { width: 170, height: 200, round: 0.5 },
    // The maus silhouette, parameterised — an arrow with a notched tail.
    build: p => {
      const hw = p.width / 2
      const hh = p.height / 2
      const r = 6 + p.round * 14
      return fill(
        `M${100 - r * 0.4} ${100 - hh}` +
          `Q100 ${100 - hh - r * 0.5} ${100 + r * 0.4} ${100 - hh}` +
          `L${100 + hw} ${100 + hh * 0.42}` +
          `Q${100 + hw + r * 0.3} ${100 + hh * 0.55} ${100 + hw - r} ${100 + hh * 0.6}` +
          `L${100 + r * 0.3} ${100 + hh * 0.62}` +
          `Q${100 - r * 0.2} ${100 + hh * 0.6} ${100 - r * 0.6} ${100 + hh * 0.78}` +
          `L${100 - hw * 0.62} ${100 + hh}` +
          `Q${100 - hw * 0.8} ${100 + hh + r * 0.3} ${100 - hw * 0.76} ${100 + hh - r}Z`
      )
    },
    viewBox: '0 0 200 200',
  },
]

const lerp = (a: [number, number], b: [number, number], t: number): [number, number] => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
]

/** Wraps a builtin as a standalone SVG document, so it imports exactly like an upload. */
export function builtinToSvg(shape: BuiltinShape, params?: Record<string, number>): string {
  const p = { ...shape.defaults, ...params }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${shape.viewBox}">${shape.build(p)}</svg>`
}
