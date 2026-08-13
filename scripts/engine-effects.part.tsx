/* ----------------------------------------------------------------- effects */

/**
 * Confetti, motion ribbons, and glyph morphs.
 *
 * All three are shape-agnostic: they orbit, burst around, or stand in for whatever
 * silhouette they are given, so an uploaded logo behaves exactly like the built-in circle.
 *
 * These layers are driven imperatively from the frame loop rather than through React
 * state. A celebrate burst is ~14 elements changing every frame, and a page showing all
 * states at once would otherwise re-render continuously.
 */

const TAU = Math.PI * 2

/** Deterministic per-particle randomness — same seed, same particle, every run. */
const hash01 = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

const CONFETTI_COLORS = ['#F472B6', '#C084FC', '#818CF8', '#38BDF8', '#34D399', '#FACC15', '#FB7185']

/**
 * Comet palettes — one per ribbon, each running through three neighbouring hues along its
 * own length. A single flat colour reads as wire; a hue that travels reads as something lit
 * and moving, which is the whole difference between an orbit and a circle.
 */
const COMET_COLORS: [string, string, string][] = [
  ['#A855F7', '#6366F1', '#38BDF8'],
  ['#22D3EE', '#34D399', '#A3E635'],
  ['#FB923C', '#F43F5E', '#D946EF'],
  ['#818CF8', '#C084FC', '#F472B6'],
  ['#FACC15', '#FB923C', '#EC4899'],
  ['#34D399', '#22D3EE', '#60A5FA'],
]

export interface ConfettiSpec {
  /** How many pieces are in flight per burst. */
  count: number
  /** Milliseconds between bursts. */
  period: number
  /** How long one piece lives, ms. */
  life: number
  /** Radius the pieces launch from, so a burst clears the face instead of covering it. */
  origin: number
  /** How far pieces travel beyond that, in face units. */
  spread: number
}

export interface TrailSpec {
  /** How many comets orbit the body. */
  count: number
  /** Milliseconds for one full orbit. */
  period: number
  /** Orbit radius, in face units. */
  radius: number
  /** Half-width at the head, in face units. The tail tapers from this to nothing. */
  width?: number
  /** How much of the orbit one comet covers, in radians. Kept under π so a comet
   *  crosses the horizon at most once and never splits into three pieces. */
  span?: number
}

/** A body shrunk to a dot and thrown across the frame, with tails streaming behind it. */
export interface DashSpec {
  /** How many tails stream off the dot. */
  count: number
  /** Milliseconds for one full flight. */
  period: number
  /** How far the dot travels from centre, in face units. */
  radius: number
  /** How far back in the flight the longest tail reaches, ms. */
  length: number
  /** Half-width where a tail meets the dot. */
  width?: number
}

/** The body dissolved into a row of dots — the loading indicator every chat app has. */
export interface DotsSpec {
  /** How many dots stand in for the body. */
  count: number
  /** Milliseconds for one pass of the highlight along the row. */
  period: number
  /** Dot radius, in face units. */
  radius: number
  /** Distance between dot centres. */
  gap: number
  /**
   * How long the body takes to come apart into the row, ms.
   *
   * The dots are not a separate picture that replaces the mascot — they are the mascot,
   * broken up. Over this window the body shrinks toward the middle dot while the outer ones
   * slide out from behind it, so what you read is one thing dividing rather than a swap.
   * Run the state's clock back down to zero and it plays in reverse: the row gathers and
   * the body reforms.
   */
  split: number
}

/** Small body-coloured dots flung off as the mascot collapses or springs into being. */
export interface PopSpec {
  count: number
  /** Milliseconds between rounds. */
  period: number
  /** How long one dot lives, ms. */
  life: number
  /** How far a dot travels from centre. */
  spread: number
  /** Largest dot radius; the rest are scaled down from it. */
  radius: number
}

/** The unread dot that lands on the mascot's shoulder. */
export interface BadgeSpec {
  color: string
  radius: number
  /** Badge centre, in face units. */
  x: number
  y: number
  /** Milliseconds between appearances. */
  period: number
  /** How long it is held, ms. */
  hold: number
}

export interface GlyphSpec {
  /** Markup drawn in place of the body. {{GRADIENT}} is replaced with the body paint. */
  markup: string
  /** Milliseconds between appearances. */
  period: number
  /** How long the glyph is held, ms. */
  hold: number
}

export interface StateEffects {
  confetti?: ConfettiSpec
  trails?: TrailSpec
  dash?: DashSpec
  dots?: DotsSpec
  pops?: PopSpec
  badge?: BadgeSpec
  glyph?: GlyphSpec
}

/**
 * The exclamation mark the mascot becomes when something needs attention — drawn as a
 * tapered bar and a dot so it reads as a character rather than a rectangle.
 */
const GLYPH_BANG =
  '<path fill="{{GRADIENT}}" d="M99 58 Q99 43 114.3 43 Q129.6 43 129.6 58 L123 150 Q122 161 114.3 161 Q106.6 161 105.6 150 Z"/>' +
  '<circle fill="{{GRADIENT}}" cx="114.3" cy="188" r="15"/>'

/** The question mark for genuine confusion. Stroked, so it stays light against the body. */
const GLYPH_QUERY =
  '<path fill="none" stroke="{{GRADIENT}}" stroke-width="19" stroke-linecap="round" ' +
  'd="M88 76 A27 27 0 1 1 114.3 112 L114.3 132"/>' +
  '<circle fill="{{GRADIENT}}" cx="114.3" cy="170" r="13"/>'

export const EFFECTS: Partial<Record<MascotState, StateEffects>> = {
  // Celebration — the loud burst.
  // Travel is deliberately bounded: the viewBox only carries 15 units of margin, so a
  // piece thrown much past ~130 from centre would be clipped mid-flight.
  celebrate: { confetti: { count: 16, period: 1500, life: 1300, origin: 74, spread: 54 } },
  excited: { confetti: { count: 9, period: 2000, life: 1100, origin: 72, spread: 44 } },
  laughing: { confetti: { count: 7, period: 2400, life: 1000, origin: 70, spread: 38 } },

  // Work in flight — comets orbiting the body on tilted rings.
  // `radius` is bounded by the viewBox: a comet swells by up to ORBIT_NEAR at the near
  // point of its ring, so radius × 1.06 (ring variation) × ORBIT_NEAR + width has to stay
  // inside the 129 units from centre that the margin allows. The trail states also carry a
  // MOTION `scale` under 1, which is what buys the rings room to clear the silhouette.
  orbit: { trails: { count: 6, period: 3000, radius: 105, width: 5, span: 2.5 } },
  radar: { trails: { count: 4, period: 2400, radius: 106, width: 4.5, span: 2.1 } },
  progress: { trails: { count: 5, period: 2000, radius: 104, width: 4.8, span: 2.3 } },
  loading: { trails: { count: 5, period: 2400, radius: 105, width: 5, span: 2.6 } },
  uploading: { trails: { count: 4, period: 1800, radius: 104, width: 4.8, span: 2.2 } },

  // A packet in flight: the body balled up to a dot with its tails strung out behind.
  // `period` here has to match MOTION's dash exactly, sign included — the tails are drawn
  // from the same flight path the body is riding, and a mismatch detaches them.
  sending: { dash: { count: 3, period: 1500, radius: 66, length: 520, width: 9 } },
  receiving: { dash: { count: 3, period: -1500, radius: 66, length: 520, width: 9 } },

  // The body dissolved into the three dots every chat app shows while it thinks.
  'thinking-dots': { dots: { count: 3, period: 1150, radius: 17, gap: 50, split: 460 } },

  // Coming into being and winding down — the body collapses to a point either way, and
  // sheds a few of itself on the way.
  spawning: { pops: { count: 5, period: 3200, life: 900, spread: 62, radius: 9 } },
  'powering-down': { pops: { count: 4, period: 2600, life: 1100, spread: 54, radius: 8 } },

  // The mascot standing aside to show a symbol.
  alerting: { glyph: { markup: GLYPH_BANG, period: 2600, hold: 1100 } },
  confused: { glyph: { markup: GLYPH_QUERY, period: 5200, hold: 1200 } },

  // Notification keeps its face and takes the badge on the shoulder instead — the mascot
  // is telling you about something, not becoming it.
  notifying: { badge: { color: '#2E9BF0', radius: 17, x: 186, y: 46, period: 3400, hold: 2000 } },
}

const SVG_NS = 'http://www.w3.org/2000/svg'

/** Grows or shrinks a layer's pool of <path> children to exactly `count`. */
function poolPaths(layer: SVGGElement, count: number): SVGPathElement[] {
  while (layer.childNodes.length > count) layer.removeChild(layer.lastChild!)
  while (layer.childNodes.length < count) {
    const path = document.createElementNS(SVG_NS, 'path')
    path.setAttribute('stroke-linecap', 'round')
    path.setAttribute('fill', 'none')
    layer.appendChild(path)
  }
  return Array.from(layer.childNodes) as SVGPathElement[]
}

/** Confetti: short curved strokes thrown outward, arcing down as they fade. */
function drawConfetti(
  layer: SVGGElement,
  spec: ConfettiSpec,
  elapsed: number,
  strength: number,
  cx: number,
  cy: number
) {
  const paths = poolPaths(layer, spec.count)
  for (let i = 0; i < spec.count; i++) {
    const path = paths[i]
    const seedA = hash01(i + 1)
    const seedB = hash01(i + 41)
    const seedC = hash01(i + 91)

    // Stagger the pieces across the burst window so they don't leave as one wall.
    const t = (((elapsed + seedC * spec.period) % spec.period) / spec.life) * 1
    if (t > 1) {
      path.setAttribute('opacity', '0')
      continue
    }

    const angle = seedA * TAU
    const travel = spec.spread * (0.45 + seedB * 0.55) * (1 - (1 - t) * (1 - t))
    const distance = (spec.origin + travel) * strength
    const gravity = 34 * strength * t * t
    const x = cx + Math.cos(angle) * distance
    const y = cy + Math.sin(angle) * distance + gravity
    const length = 11 + seedB * 12
    const spin = angle + (seedC - 0.5) * 5 * t
    const ex = x + Math.cos(spin) * length
    const ey = y + Math.sin(spin) * length
    // A slight bend reads as paper rather than a matchstick.
    const bend = (seedA - 0.5) * length * 0.7
    const mx = (x + ex) / 2 - Math.sin(spin) * bend
    const my = (y + ey) / 2 + Math.cos(spin) * bend

    path.setAttribute('d', `M${x.toFixed(1)} ${y.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`)
    path.setAttribute('stroke', CONFETTI_COLORS[i % CONFETTI_COLORS.length])
    path.setAttribute('stroke-width', (4 + seedB * 2.4).toFixed(1))
    path.setAttribute('opacity', (t < 0.12 ? t / 0.12 : 1 - (t - 0.12) / 0.88).toFixed(3))
  }
}

/* ------------------------------------------------------------------ comets */

/**
 * A comet is a filled outline, not a stroke.
 *
 * SVG cannot taper a stroke, and taper is most of what separates a comet from a hoop: a
 * round head at the leading edge thinning to nothing behind it. So each one is sampled
 * along its path, offset either side by a width that shrinks toward the tail, and closed
 * with a half-round cap at the head.
 */
interface Sample {
  x: number
  y: number
  /** Half-width here. */
  h: number
}

/** How much a comet swells at the near point of its ring. Pure perspective cheat. */
const ORBIT_NEAR = 1.1

/**
 * Head→tail samples to one filled outline.
 *
 * `capHead` / `capTail` are false for the cut ends of a comet that has been split at the
 * horizon: a cap there would bulge in the middle of the comet and read as a bead.
 */
function cometPath(s: Sample[], capHead: boolean, capTail: boolean): string {
  const n = s.length
  if (n < 2) return ''

  // Screen-space normal at each sample, from the tangent through its neighbours.
  const nx: number[] = []
  const ny: number[] = []
  for (let i = 0; i < n; i++) {
    const a = s[Math.max(i - 1, 0)]
    const b = s[Math.min(i + 1, n - 1)]
    const tx = b.x - a.x
    const ty = b.y - a.y
    const len = Math.hypot(tx, ty) || 1
    nx.push(-ty / len)
    ny.push(tx / len)
  }

  const point = (x: number, y: number) => `${x.toFixed(1)} ${y.toFixed(1)}`
  const left: string[] = []
  const right: string[] = []
  for (let i = 0; i < n; i++) {
    left.push(point(s[i].x + nx[i] * s[i].h, s[i].y + ny[i] * s[i].h))
    right.push(point(s[i].x - nx[i] * s[i].h, s[i].y - ny[i] * s[i].h))
  }

  /**
   * Caps are sampled rather than drawn with `A`, because the sweep flag an arc needs
   * depends on which way the comet happens to be pointing, and half of an orbit points the
   * other way. Sampling a semicircle around the end point is always the right one.
   *
   * `out` is the direction the cap bulges: away from the rest of the comet.
   */
  const cap = (i: number, out: 1 | -1) => {
    const STEPS = 6
    const { x, y, h } = s[i]
    const tx = ny[i]
    const ty = -nx[i]
    const parts: string[] = []
    for (let k = 1; k < STEPS; k++) {
      const a = (k / STEPS) * Math.PI
      const dn = out * Math.cos(a)
      const dt = out * Math.sin(a)
      parts.push(point(x + (nx[i] * dn + tx * dt) * h, y + (ny[i] * dn + ty * dt) * h))
    }
    return parts
  }

  // Start at the head's right shoulder, over the nose, down the left flank to the tail,
  // round the tail, then back up the right flank.
  const outline = [right[0]]
  if (capHead) outline.push(...cap(0, -1))
  outline.push(...left)
  if (capTail) outline.push(...cap(n - 1, 1))
  for (let i = n - 1; i > 0; i--) outline.push(right[i])
  return `M${outline.join('L')}Z`
}

/** Grows or shrinks a layer's pool of comet outlines, keeping any <defs> at the front. */
function poolComets(layer: SVGGElement, count: number): SVGPathElement[] {
  const paths = Array.from(layer.querySelectorAll(':scope > path'))
  while (paths.length > count) layer.removeChild(paths.pop()!)
  while (paths.length < count) {
    const path = document.createElementNS(SVG_NS, 'path')
    path.setAttribute('stroke', 'none')
    layer.appendChild(path)
    paths.push(path)
  }
  return paths as SVGPathElement[]
}

/**
 * One <linearGradient> per comet, kept alive across frames. Only the endpoints move — the
 * stops are set once — so a hue runs head-to-tail no matter how the ring is turned, and a
 * comet split across the horizon still reads as one continuous object.
 */
function cometGradients(layer: SVGGElement, uid: string, count: number): SVGLinearGradientElement[] {
  let defs = layer.querySelector(':scope > defs')
  if (!defs) {
    defs = document.createElementNS(SVG_NS, 'defs')
    layer.prepend(defs)
  }
  const found = Array.from(defs.querySelectorAll(':scope > linearGradient'))
  while (found.length > count) defs.removeChild(found.pop()!)
  while (found.length < count) {
    const i = found.length
    const grad = document.createElementNS(SVG_NS, 'linearGradient')
    grad.setAttribute('id', `${uid}-comet-${i}`)
    grad.setAttribute('gradientUnits', 'userSpaceOnUse')
    const colors = COMET_COLORS[i % COMET_COLORS.length]
    // The last stop fades: taper alone ends the comet's shape, this ends its presence.
    const offsets = ['0%', '52%', '100%']
    const alphas = ['1', '1', '0.35']
    for (let s = 0; s < 3; s++) {
      const stop = document.createElementNS(SVG_NS, 'stop')
      stop.setAttribute('offset', offsets[s])
      stop.setAttribute('stop-color', colors[s])
      stop.setAttribute('stop-opacity', alphas[s])
      grad.appendChild(stop)
    }
    defs.appendChild(grad)
    found.push(grad)
  }
  return found as SVGLinearGradientElement[]
}

/**
 * Comets orbiting the body on tilted rings.
 *
 * Each ring is a circle in its own plane, tipped away from the viewer and rolled in the
 * screen plane, so the near half passes in front of the mascot and the far half behind it.
 * That is why this draws into two layers: a comet gets cut at the horizon and its pieces
 * are handed to whichever side of the body they belong on.
 */
function drawTrails(
  back: SVGGElement,
  front: SVGGElement,
  spec: TrailSpec,
  elapsed: number,
  strength: number,
  cx: number,
  cy: number,
  uid: string
) {
  const count = spec.count
  const width = spec.width ?? 7
  const span = Math.min(spec.span ?? 2.4, Math.PI - 0.05)
  const SAMPLES = 22

  const gradients = cometGradients(back, uid, count)
  // A comet crosses the horizon at most once, so it is at most two pieces — but both can
  // land on the same side, so each layer has to be able to hold two per comet.
  const backPaths = poolComets(back, count * 2)
  const frontPaths = poolComets(front, count * 2)
  let backUsed = 0
  let frontUsed = 0

  for (let i = 0; i < count; i++) {
    const seedA = hash01(i + 3)
    const seedB = hash01(i + 29)
    const seedC = hash01(i + 71)

    // Every ring gets its own tip, roll and speed. Shared values would stack the comets
    // into what looks like one thick ring seen edge-on.
    //
    // The tip is what decides whether a ring's far half clears the silhouette and can be
    // seen passing behind it: a near-flat ring projects almost to its full radius all the
    // way round, a steep one folds its far half inside the body. Both are wanted — the mix
    // is what makes the cluster read as a sphere of orbits rather than a stack of arches.
    const tilt = 0.3 + seedA * 0.66
    const roll = seedB * TAU
    const period = spec.period * (0.78 + seedC * 0.55)
    const direction = i % 2 === 0 ? 1 : -1
    const radius = spec.radius * strength * (0.94 + seedB * 0.12)
    const head = direction * (elapsed / period) * TAU + seedA * TAU

    const cosT = Math.cos(tilt)
    const sinT = Math.sin(tilt)
    const cosR = Math.cos(roll)
    const sinR = Math.sin(roll)

    // Split into runs of constant depth sign; each run becomes one path.
    const runs: { samples: Sample[]; front: boolean }[] = []
    let run: Sample[] = []
    let side = 0

    /**
     * A comet that clips the horizon leaves a stub on the far side — a few samples' worth,
     * shorter than the comet is wide. Capped like a real end it reads as a bead floating
     * off the comet, so anything under a few widths long is dropped and the surviving piece
     * takes the cap.
     */
    const keep = (samples: Sample[]) => {
      if (samples.length < 3) return false
      let length = 0
      for (let s = 1; s < samples.length; s++) {
        length += Math.hypot(samples[s].x - samples[s - 1].x, samples[s].y - samples[s - 1].y)
      }
      return length > width * 3.5
    }

    for (let s = 0; s < SAMPLES; s++) {
      const k = s / (SAMPLES - 1)
      const angle = head - direction * span * k
      const ox = Math.cos(angle) * radius
      const oy = Math.sin(angle) * radius
      // Tip the ring away from the viewer, then roll it in the screen plane.
      const ty = oy * cosT
      const z = oy * sinT
      const near = 1 + (z / radius) * (ORBIT_NEAR - 1)
      const x = cx + (ox * cosR - ty * sinR) * near
      const y = cy + (ox * sinR + ty * cosR) * near
      // Mostly full width, thinning to a third by the tail. Tapering all the way to a point
      // reads as a brush stroke; keeping some weight back there keeps it a comet.
      const h = width * near * (1 - 0.68 * Math.pow(k, 1.5)) * strength

      const nowSide = z >= 0 ? 1 : -1
      if (nowSide !== side) {
        if (keep(run)) runs.push({ samples: run, front: side > 0 })
        // Repeat the crossing sample so the two pieces meet rather than leaving a gap.
        run = run.length ? [run[run.length - 1]] : []
        side = nowSide
      }
      run.push({ x, y, h })
    }
    if (keep(run)) runs.push({ samples: run, front: side > 0 })
    if (!runs.length) continue

    // The gradient spans the whole comet, not each piece, so a hue still runs head to tail
    // across a horizon cut.
    const first = runs[0].samples
    const lastRun = runs[runs.length - 1].samples
    const grad = gradients[i]
    grad.setAttribute('x1', first[0].x.toFixed(1))
    grad.setAttribute('y1', first[0].y.toFixed(1))
    grad.setAttribute('x2', lastRun[lastRun.length - 1].x.toFixed(1))
    grad.setAttribute('y2', lastRun[lastRun.length - 1].y.toFixed(1))

    for (let r = 0; r < runs.length; r++) {
      const pool = runs[r].front ? frontPaths : backPaths
      const index = runs[r].front ? frontUsed++ : backUsed++
      const path = pool[index]
      if (!path) continue
      // Only the true ends get capped; the cut where the comet crosses the horizon is a
      // seam between two pieces of one object.
      path.setAttribute('d', cometPath(runs[r].samples, r === 0, r === runs.length - 1))
      path.setAttribute('fill', `url(#${uid}-comet-${i})`)
      path.setAttribute('opacity', '1')
    }
  }

  for (let i = backUsed; i < backPaths.length; i++) backPaths[i].setAttribute('opacity', '0')
  for (let i = frontUsed; i < frontPaths.length; i++) frontPaths[i].setAttribute('opacity', '0')
}

/**
 * Where the dashing dot is at this instant, relative to centre.
 *
 * A figure-eight rather than a circle: a circle reads as a wheel, and the crossing in the
 * middle gives the flight a moment where it passes its own tail. Shared with the body
 * transform, which is the only reason the tails stay welded to the dot.
 */
export function dashPoint(radius: number, period: number, elapsed: number) {
  const a = (elapsed / period) * TAU
  return { x: Math.cos(a) * radius, y: Math.sin(a * 2) * radius * 0.44 }
}

/** The tails streaming off a dashing dot — the flight path it has just come through. */
function drawDash(
  layer: SVGGElement,
  spec: DashSpec,
  elapsed: number,
  strength: number,
  cx: number,
  cy: number,
  uid: string
) {
  const count = spec.count
  const width = spec.width ?? 8
  const SAMPLES = 18
  const gradients = cometGradients(layer, uid, count)
  const paths = poolComets(layer, count)

  for (let i = 0; i < count; i++) {
    const seed = hash01(i + 13)
    // Staggered lengths and a small lateral offset fan the tails instead of stacking them.
    const length = spec.length * (0.66 + seed * 0.5)
    const offset = (i - (count - 1) / 2) * width * 0.85
    const samples: Sample[] = []

    for (let s = 0; s < SAMPLES; s++) {
      const k = s / (SAMPLES - 1)
      const at = elapsed - length * k
      const p = dashPoint(spec.radius * strength, spec.period, at)
      // Push each tail off the flight line so they read as separate ribbons.
      const q = dashPoint(spec.radius * strength, spec.period, at + 1)
      const tx = q.x - p.x
      const ty = q.y - p.y
      const len = Math.hypot(tx, ty) || 1
      samples.push({
        x: cx + p.x - (ty / len) * offset,
        y: cy + p.y + (tx / len) * offset,
        h: width * (1 - Math.pow(k, 1.7)) * strength,
      })
    }

    const grad = gradients[i]
    grad.setAttribute('x1', samples[0].x.toFixed(1))
    grad.setAttribute('y1', samples[0].y.toFixed(1))
    grad.setAttribute('x2', samples[SAMPLES - 1].x.toFixed(1))
    grad.setAttribute('y2', samples[SAMPLES - 1].y.toFixed(1))

    const path = paths[i]
    path.setAttribute('d', cometPath(samples, true, true))
    path.setAttribute('fill', `url(#${uid}-comet-${i})`)
    path.setAttribute('opacity', '1')
  }
}

/* -------------------------------------------------------------------- dots */

/** Grows or shrinks a layer's pool of <circle> children to exactly `count`. */
function poolCircles(layer: SVGGElement, count: number): SVGCircleElement[] {
  while (layer.childNodes.length > count) layer.removeChild(layer.lastChild!)
  while (layer.childNodes.length < count) {
    layer.appendChild(document.createElementNS(SVG_NS, 'circle'))
  }
  return Array.from(layer.childNodes) as SVGCircleElement[]
}

/**
 * The body dissolved into a row of dots, with a brightness that walks along the row.
 * The walk is what makes three dots read as thinking rather than as an ellipsis.
 */
function drawDots(
  layer: SVGGElement,
  spec: DotsSpec,
  elapsed: number,
  strength: number,
  cx: number,
  cy: number,
  paint: string,
  split: number
) {
  const circles = poolCircles(layer, spec.count)
  for (let i = 0; i < spec.count; i++) {
    const circle = circles[i]
    const phase = elapsed / spec.period - i * 0.16
    // Squared cosine peaks sharply, so one dot leads and the others trail it. Scaled by the
    // split so the row is still while it is forming and only starts talking once it has.
    const lift = Math.pow(0.5 + 0.5 * Math.cos(TAU * phase), 3) * split
    // Every dot starts stacked at the centre, under the body, and travels out to its place.
    const x = cx + (i - (spec.count - 1) / 2) * spec.gap * split
    const y = cy - lift * 9 * strength
    circle.setAttribute('cx', x.toFixed(1))
    circle.setAttribute('cy', y.toFixed(1))
    circle.setAttribute('r', (spec.radius * (0.82 + lift * 0.3) * split).toFixed(1))
    circle.setAttribute('fill', paint)
    circle.setAttribute('opacity', (0.34 + lift * 0.66).toFixed(3))
  }
}

/**
 * How far the body has come apart into the row, 0..1.
 *
 * `share` shortens the window: the body finishes its part of the split before the dots
 * finish theirs. That ordering is the whole effect — the body is gone by the time the outer
 * dots are still travelling outward, so what you see is a thing that has already divided,
 * rather than a shape and some dots occupying the same space.
 */
function splitAmount(spec: DotsSpec, elapsed: number, share = 1): number {
  if (spec.split <= 0) return 1
  return easeInOut(clamp(elapsed / (spec.split * share), 0, 1))
}

/** The body is done breaking up this far into the dots' own window. */
const BODY_SPLIT_SHARE = 0.62

/** Small body-coloured dots shed as the mascot arrives or winds down. */
function drawPops(
  layer: SVGGElement,
  spec: PopSpec,
  elapsed: number,
  strength: number,
  cx: number,
  cy: number,
  paint: string
) {
  const circles = poolCircles(layer, spec.count)
  for (let i = 0; i < spec.count; i++) {
    const circle = circles[i]
    const seedA = hash01(i + 7)
    const seedB = hash01(i + 53)
    const t = ((elapsed + seedB * spec.period) % spec.period) / spec.life
    if (t > 1) {
      circle.setAttribute('opacity', '0')
      continue
    }
    const angle = seedA * TAU
    // Decelerating travel: they are thrown, not driven.
    const distance = spec.spread * (0.4 + seedB * 0.6) * (1 - (1 - t) * (1 - t)) * strength
    circle.setAttribute('cx', (cx + Math.cos(angle) * distance).toFixed(1))
    circle.setAttribute('cy', (cy + Math.sin(angle) * distance).toFixed(1))
    circle.setAttribute('r', (spec.radius * (0.45 + seedA * 0.55) * (1 - t * 0.55)).toFixed(1))
    circle.setAttribute('fill', paint)
    circle.setAttribute('opacity', (t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85).toFixed(3))
  }
}

/** The unread dot, springing onto the mascot's shoulder and holding there. */
function drawBadge(
  layer: SVGGElement,
  spec: BadgeSpec,
  elapsed: number,
  strength: number
) {
  const circles = poolCircles(layer, 1)
  const circle = circles[0]
  const position = elapsed % spec.period
  const start = spec.period - spec.hold
  if (position < start) {
    circle.setAttribute('opacity', '0')
    return
  }
  const into = position - start
  const ARRIVE = 340
  const t = Math.min(into / ARRIVE, 1)
  const leaving = Math.max(0, Math.min(1, (spec.hold - into) / 180))
  circle.setAttribute('cx', spec.x.toFixed(1))
  circle.setAttribute('cy', spec.y.toFixed(1))
  circle.setAttribute('r', (spec.radius * easeOutBack(t) * strength).toFixed(2))
  circle.setAttribute('fill', spec.color)
  circle.setAttribute('opacity', leaving.toFixed(3))
}

/** How present the glyph is right now, 0..1, with eased edges. */
function glyphAmount(spec: GlyphSpec, elapsed: number): number {
  const position = elapsed % spec.period
  const start = spec.period - spec.hold
  if (position < start) return 0
  const into = position - start
  const remaining = spec.hold - into
  const EASE = 200
  return Math.max(0, Math.min(1, Math.min(into, remaining) / EASE))
}

export interface EffectFrame {
  /** Comets on the far side of the ring. */
  trails: SVGGElement | null
  /** Comets on the near side, plus dash tails. */
  trailsFront: SVGGElement | null
  confetti: SVGGElement | null
  glyph: SVGGElement | null
  /** Pops and the notification badge, above the body. */
  overlay: SVGGElement | null
  /** The dots the body dissolves into. */
  dots: SVGGElement | null
  bodyContent: SVGGElement | null
  /** Eyes and mouth alone, so a dashing dot can lose its face but keep its body. */
  face: SVGGElement | null
  state: MascotState
  elapsed: number
  strength: number
  paint: string
  /** Instance id, for the comet gradients. */
  uid: string
  showEffects: boolean
  showGlyphs: boolean
}

/** Called once per frame from the engine loop. */
export function updateEffects(frame: EffectFrame) {
  const spec = EFFECTS[frame.state]
  const centre = FACE_BOX / 2
  const strength = frame.strength
  const on = frame.showEffects && strength > 0

  if (frame.trails && frame.trailsFront) {
    if (spec?.trails && on) {
      drawTrails(
        frame.trails,
        frame.trailsFront,
        spec.trails,
        frame.elapsed,
        strength,
        centre,
        centre,
        frame.uid
      )
    } else if (spec?.dash && on) {
      // Tails ride behind: they converge on the dot, and a tail is about as wide as the dot
      // is across, so drawing them over it would swallow the thing they belong to.
      if (frame.trailsFront.childNodes.length) frame.trailsFront.replaceChildren()
      drawDash(frame.trails, spec.dash, frame.elapsed, strength, centre, centre, frame.uid)
    } else {
      if (frame.trails.childNodes.length) frame.trails.replaceChildren()
      if (frame.trailsFront.childNodes.length) frame.trailsFront.replaceChildren()
    }
  }

  if (frame.dots && frame.bodyContent) {
    if (spec?.dots && on) {
      const split = splitAmount(spec.dots, frame.elapsed)
      drawDots(frame.dots, spec.dots, frame.elapsed, strength, centre, centre, frame.paint, split)
      // The body shrinks into the middle dot rather than cutting to it, on its own shorter
      // clock so it has finished before the row has.
      const shed = splitAmount(spec.dots, frame.elapsed, BODY_SPLIT_SHARE)
      const target = spec.dots.radius / (FACE_BOX / 2)
      const scale = 1 - (1 - target) * shed
      frame.bodyContent.setAttribute(
        'transform',
        `translate(${centre} ${centre}) scale(${scale.toFixed(4)}) translate(${-centre} ${-centre})`
      )
      // Held solid while it is still big enough to recognise, then dissolved quickly once
      // it is down near dot size. Fading it early instead leaves a large ghost with the
      // dots showing through, which reads as two pictures crossfading rather than one thing
      // dividing.
      frame.bodyContent.style.opacity = (1 - clamp((shed - 0.62) / 0.3, 0, 1)).toFixed(3)
    } else if (frame.dots.childNodes.length) {
      frame.dots.replaceChildren()
      frame.bodyContent.removeAttribute('transform')
    }
  }

  if (frame.overlay) {
    if (spec?.pops && on) {
      drawPops(frame.overlay, spec.pops, frame.elapsed, strength, centre, centre, frame.paint)
    } else if (spec?.badge && on) {
      drawBadge(frame.overlay, spec.badge, frame.elapsed, strength)
    } else if (frame.overlay.childNodes.length) {
      frame.overlay.replaceChildren()
    }
  }

  if (frame.face) {
    // A dot has no room for a face, and the eyes shrunk to specks read as grit.
    frame.face.style.opacity = spec?.dash && on ? '0' : '1'
  }

  if (frame.confetti) {
    if (spec?.confetti && frame.showEffects && strength > 0) {
      drawConfetti(frame.confetti, spec.confetti, frame.elapsed, strength, centre, centre)
    } else if (frame.confetti.childNodes.length) {
      frame.confetti.replaceChildren()
    }
  }

  if (frame.glyph && frame.bodyContent) {
    if (spec?.glyph && frame.showGlyphs) {
      const amount = glyphAmount(spec.glyph, frame.elapsed)
      const markup = spec.glyph.markup.replace(/\{\{GRADIENT\}\}/g, frame.paint)
      if (frame.glyph.getAttribute('data-glyph') !== markup) {
        frame.glyph.setAttribute('data-glyph', markup)
        frame.glyph.innerHTML = markup
      }
      frame.glyph.style.opacity = String(amount)
      // Scale up as it arrives, so the swap reads as a transformation.
      const scale = 0.72 + 0.28 * amount
      frame.glyph.setAttribute(
        'transform',
        `translate(${centre} ${centre}) scale(${scale.toFixed(3)}) translate(${-centre} ${-centre})`
      )
      // The body steps aside rather than sitting behind the glyph.
      frame.bodyContent.style.opacity = String(1 - amount)
    } else {
      if (frame.glyph.getAttribute('data-glyph')) {
        frame.glyph.removeAttribute('data-glyph')
        frame.glyph.replaceChildren()
      }
      frame.glyph.style.opacity = '0'
      // Not `1` unconditionally: the dots may have stood the body down this same frame.
      if (!(spec?.dots && on)) frame.bodyContent.style.opacity = '1'
    }
  }
}
