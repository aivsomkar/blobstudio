/**
 * Generates src/engine/faceEngine.tsx from the original GrokBot lab.
 *
 * The lab (../gist/index.html) stays the source of truth for the expression rings,
 * mouth table, state pools and cadences. Run `npm run gen:engine` after changing it.
 */
const fs = require('fs')
const path = require('path')

const LAB = path.resolve(__dirname, '../../gist/index.html')
const DEST = path.resolve(__dirname, '../src/engine/faceEngine.tsx')

if (!fs.existsSync(LAB)) {
  console.error(
    [
      'Cannot find the GrokBot lab at ' + LAB,
      '',
      'The generated engine (src/engine/faceEngine.tsx) is committed, so the app builds and',
      'runs without it. You only need the lab to regenerate. To get it:',
      '',
      '  git clone https://gist.github.com/49a4c9303de70118a90dc43badc1aba5.git ../gist',
      '',
      'Source: https://gist.github.com/smontlouis/49a4c9303de70118a90dc43badc1aba5',
    ].join('\n')
  )
  process.exit(1)
}

const t = fs.readFileSync(LAB, 'utf8')
const part = name => fs.readFileSync(path.resolve(__dirname, name), 'utf8')
const EFFECTS_PART = part('engine-effects.part.tsx')
const LIFE_PART = part('engine-life.part.tsx')
const SEQUENCE_PART = part('engine-sequence.part.tsx')

function grab(name, endMark) {
  const i = t.indexOf(`const ${name} = `)
  /*
    A file exists at LAB but does not contain what the generator reads. Almost always this
    is the wrong lab rather than a corrupt one — a fresh clone of the published gist, say,
    when the engine was generated from a locally modified copy. Saying so beats throwing
    `missing MOUTHS` at someone who has never opened this file.
  */
  if (i < 0) {
    throw new Error(
      [
        `The lab at ${path.relative(process.cwd(), LAB)} has no \`const ${name}\`.`,
        '',
        'That file is not the lab this engine was generated from. If you cloned the',
        'published gist, note that the committed engine may come from a locally edited',
        'copy, which the gist does not have.',
      ].join('\n')
    )
  }
  const j = t.indexOf(endMark, i)
  return eval('(' + t.slice(i + `const ${name} = `.length, j + endMark.length) + ')')
}
const EXPRESSIONS = grab('EXPRESSIONS', '\n            ]')
const MOUTHS = grab('MOUTHS', '\n            ]')
const POOLS = grab('POOLS', '\n            }')
const EXPR_CADENCE = grab('EXPR_CADENCE', '\n            }')
const BLINK = grab('BLINK', '\n            }')
const GROUPS = grab('GROUPS', '\n            }')

/* ------------------------------------------------------------------------- *
 * States this studio adds on top of the lab
 *
 * The lab is upstream and shared, so states that only exist here are declared here rather
 * than by editing it. They still go through every check and every transform below, so a
 * local state is a real state — it just has a different birthplace.
 *
 * `thinking-dots` dissolves the body into the three-dot loading indicator. Its pool never
 * shows: the dots replace the face outright. The entry exists because every table in the
 * engine is keyed by the full state list.
 * ------------------------------------------------------------------------- */

const LOCAL_STATES = {
  'thinking-dots': {
    pool: [0, 8],
    cadence: [4000, 8000],
    blink: null,
    group: 'Morphes agent',
    after: 'progress',
  },
}

/** Puts `key` straight after `after`, because key order is the order every table reads in. */
function insertAfter(table, after, key, value) {
  const rebuilt = {}
  for (const [k, v] of Object.entries(table)) {
    rebuilt[k] = v
    if (k === after) rebuilt[key] = value
  }
  if (!(key in rebuilt)) rebuilt[key] = value
  for (const k of Object.keys(table)) delete table[k]
  Object.assign(table, rebuilt)
}

for (const [name, spec] of Object.entries(LOCAL_STATES)) {
  if (name in POOLS) throw new Error(`${name} is already in the lab; drop it from LOCAL_STATES`)
  insertAfter(POOLS, spec.after, name, spec.pool)
  insertAfter(EXPR_CADENCE, spec.after, name, spec.cadence)
  insertAfter(BLINK, spec.after, name, spec.blink)
  const group = GROUPS[spec.group]
  if (!group) throw new Error(`no group "${spec.group}" for ${name}`)
  const at = group.indexOf(spec.after)
  group.splice(at < 0 ? group.length : at + 1, 0, name)
}

if (MOUTHS.length !== EXPRESSIONS.length) throw new Error('mouth/expression count mismatch')
const states = Object.keys(POOLS)
for (const s of states) {
  if (!EXPR_CADENCE[s]) throw new Error('no cadence for ' + s)
  if (!(s in BLINK)) throw new Error('no blink entry for ' + s)
  for (const e of POOLS[s]) {
    if (e < 0 || e >= EXPRESSIONS.length) throw new Error(`state ${s} references expression ${e}`)
  }
}

/* ------------------------------------------------------------------------- *
 * Resting faces
 *
 * A state shows its pool's first expression at rest, and the original ordering was not
 * chosen with that in mind: `idle` rested on expression 00, a pose whose eyes sit at
 * different heights and tilt opposite ways, so a mascot at rest never quite looked at you.
 *
 * Score each expression on how forward-facing it is — level pair, matched sizes, matched
 * tilt, upright — and make each state rest on its most forward-facing member. Cycle order
 * is otherwise preserved, so no state loses its character; `angry` still rests on a scowl,
 * because every face in its pool is a scowl.
 * ------------------------------------------------------------------------- */

const centreOf = ring => {
  let x = 0
  let y = 0
  for (const p of ring) {
    x += p[0]
    y += p[1]
  }
  return [x / ring.length, y / ring.length]
}

/** Principal axis of one eye, plus how elongated it is. */
function eyeAxis(ring) {
  const c = centreOf(ring)
  let sxx = 0
  let syy = 0
  let sxy = 0
  for (const p of ring) {
    const dx = p[0] - c[0]
    const dy = p[1] - c[1]
    sxx += dx * dx
    syy += dy * dy
    sxy += dx * dy
  }
  const n = ring.length
  sxx /= n
  syy /= n
  sxy /= n
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy)
  const trace = sxx + syy
  const det = sxx * syy - sxy * sxy
  const root = Math.sqrt(Math.max((trace * trace) / 4 - det, 0))
  const major = trace / 2 + root
  const minor = trace / 2 - root
  // Near-circular eyes have no meaningful angle, so weight angle terms by elongation.
  const elongation = major > 0 ? 1 - Math.sqrt(Math.max(minor, 0) / major) : 0
  const fold = (((theta * 180) / Math.PI + 90) % 180 + 180) % 180 - 90
  return { fold, offVertical: 90 - Math.abs(fold), elongation, area: Math.sqrt(Math.max(det, 0)) }
}

/** Lower is more forward-facing. */
function forwardScore(expression) {
  const a = eyeAxis(expression[0])
  const b = eyeAxis(expression[1])
  const c0 = centreOf(expression[0])
  const c1 = centreOf(expression[1])
  const pairTilt = Math.abs((Math.atan2(c1[1] - c0[1], c1[0] - c0[0]) * 180) / Math.PI)
  const asymmetry = Math.abs(a.area - b.area) / Math.max(a.area, b.area, 1e-6)
  const elongation = (a.elongation + b.elongation) / 2
  const tiltMismatch = Math.abs(a.fold - b.fold) * elongation
  const upright = (a.offVertical * a.elongation + b.offVertical * b.elongation) / 2
  return pairTilt * 1.2 + asymmetry * 50 + tiltMismatch * 0.5 + upright * 0.5
}

const SCORES = EXPRESSIONS.map(forwardScore)

/** Expression 6 is symmetric, upright, and used by no state — the neutral spare. */
const NEUTRAL = 6
const GENERIC_POOL = '0,8'

const RESTING_TUNED = {}
for (const [state, pool] of Object.entries(POOLS)) {
  // The seven states sharing the generic [0,8] pool have no truly neutral face available.
  const withNeutral =
    [...pool].sort((a, b) => a - b).join(',') === GENERIC_POOL ? [NEUTRAL, ...pool] : [...pool]
  const best = withNeutral.reduce((a, b) => (SCORES[b] < SCORES[a] ? b : a))
  RESTING_TUNED[state] = [best, ...withNeutral.filter(x => x !== best)]
}
const restingChanges = Object.entries(RESTING_TUNED).filter(([s, p]) => p[0] !== POOLS[s][0]).length

const round = n => String(Math.round(n * 100) / 100)
const encoded = EXPRESSIONS.map(ex =>
  ex.map(ring => ring.map(p => round(p[0]) + ',' + round(p[1])).join(' ')).join('|')
)
const unquoteKey = /"([A-Za-z_$][A-Za-z0-9_$]*)":/g

const out = `/**
 * Mascot face engine — ${EXPRESSIONS.length} expressions, ${states.length} states, eyes and mouth.
 *
 * GENERATED FILE. Source of truth is the GrokBot lab; regenerate with \`npm run gen:engine\`.
 *
 * Self-contained: React is the only dependency. Drop this file into a project and use it.
 *
 *   <MascotAvatar state="thinking" size={160} />
 *
 * ── Face space ──────────────────────────────────────────────────────────────
 * Eye paths live in a ${'228.541'}-unit box built around a sphere of radius 105 centred at
 * (114.27, 114.27). That sphere is what makes the eyes wrap when \`turn\` is non-zero.
 *
 * ── Gaze ────────────────────────────────────────────────────────────────────
 * Each expression originally baked its look-direction into absolute eye positions, so a
 * resting face permanently glanced up-and-right. Here every expression is centred at load
 * and its offset is kept separately in GAZE. The engine re-applies \`GAZE[i] * lookAround\`
 * at render time, so the default face looks straight at you while expressive poses still
 * glance around. lookAround: 0 = always forward, 1 = the original behaviour.
 *
 * ── Shape ───────────────────────────────────────────────────────────────────
 * SHAPE below carries the silhouette: artwork markup, the transform that fits it into face
 * space, the clip region, and where the face sits inside it. Swap SHAPE to re-skin.
 */
import React, { useEffect, useId, useMemo, useRef } from 'react'

/* ------------------------------------------------------------------- shape */

export interface MascotShape {
  /** Human-readable name, used for the accessible label. */
  name: string
  /** Transform mapping the artwork into the ${'228.541'}-unit face box. '' for none. */
  fit: string
  /** SVG markup for the body. The token {{GRADIENT}} is replaced with the instance gradient. */
  body: string
  /** SVG markup defining the clip region — the union of the silhouette's filled shapes. */
  clip: string
  /** Where the face sits inside the silhouette, in face-space units. */
  anchor: { x: number; y: number; scale: number }
}

/* __SHAPE_START__ */
export const SHAPE: MascotShape = {
  name: 'Circle',
  fit: '',
  body: '<circle cx="114.2705" cy="114.2705" r="114.2705" fill="{{GRADIENT}}"/>',
  clip: '<circle cx="114.2705" cy="114.2705" r="114.2705"/>',
  anchor: { x: 114.2705, y: 114.2705, scale: 1 },
}
/* __SHAPE_END__ */

export const DEFAULT_GRADIENT: [string, string, string] = ['#3FB180', '#009A5A', '#00683B']

/**
 * Where the eyes rest when no gaze is passed. Slightly off-centre reads as alive; dead
 * centre can look like a stare. Each axis is -1…1.
 */
export const DEFAULT_GAZE: { x: number; y: number } = { x: 0, y: 0 }

/** The face box every coordinate in this file is expressed in. */
export const FACE_BOX = 228.541
const VIEW_BOX = \`-15 -15 \${FACE_BOX + 30} \${FACE_BOX + 30}\`
const SPHERE_C = 114.2705

/**
 * Radius of the sphere the face is painted on. Exported because anyone re-implementing the
 * projection — a renderer that seeks instead of ticking, say — needs it to place an eye.
 */
export const SPHERE_R = 105
/** How far a full-deflection gaze moves the eyes, in face units. */
export const GAZE_TRAVEL = { x: 13.2, y: 8.4 }
const GAZE_X = GAZE_TRAVEL.x
const GAZE_Y = GAZE_TRAVEL.y

/** Face-space centre the expressions are normalised around. */
export const FACE_CENTRE: [number, number] = [120, 122.5]

/* ------------------------------------------------------------- expressions */

export type Ring = [number, number][]

/** ${EXPRESSIONS.length} expressions × 2 eyes × ${EXPRESSIONS[0][0].length} points, as "x,y x,y…|x,y x,y…". */
const ENCODED: string[] = [
${encoded.map(e => '  ' + JSON.stringify(e) + ',').join('\n')}
]

const RAW: Ring[][] = ENCODED.map(line =>
  line.split('|').map(
    ring =>
      ring.split(' ').map(pair => {
        const [x, y] = pair.split(',')
        return [Number(x), Number(y)]
      }) as Ring
  )
)

const ringCentre = (ring: Ring): [number, number] => {
  let x = 0
  let y = 0
  for (const p of ring) {
    x += p[0]
    y += p[1]
  }
  return [x / ring.length, y / ring.length]
}

/**
 * Each expression's look-direction: the eye-pair centroid relative to face centre.
 * Split out so the resting face can look straight ahead.
 */
export const GAZE: [number, number][] = RAW.map(ex => {
  const a = ringCentre(ex[0])
  const b = ringCentre(ex[1])
  return [(a[0] + b[0]) / 2 - FACE_CENTRE[0], (a[1] + b[1]) / 2 - FACE_CENTRE[1]]
})

/** Expressions with their look-direction removed — every one looks straight ahead. */
export const EXPRESSIONS: Ring[][] = RAW.map((ex, i) =>
  ex.map(ring => ring.map(p => [p[0] - GAZE[i][0], p[1] - GAZE[i][1]] as [number, number]))
)

export const EXPRESSION_COUNT = EXPRESSIONS.length

/**
 * One mouth per expression: [halfWidth, curve, gap, skew].
 *   curve  + bows the middle down => smile (U);  - => frown
 *   gap    clearance below the lowest eye edge
 *   skew   extra tilt in degrees on top of the eye-pair tilt, for smirks
 */
export const MOUTHS: number[][] = ${JSON.stringify(MOUTHS)
  .replace(/\],\[/g, '],\n  [')
  .replace(/^\[/, '[\n  ')
  .replace(/\]$/, ',\n]')}

/** Mouth thickness, in face-space units. */
export const MOUTH_STROKE = 7.5

/* ------------------------------------------------------------------ motion */

/**
 * How the body itself moves. The face engine on its own leaves the silhouette perfectly
 * still, which reads as dead for states literally named \`bouncing\` or \`spawning\`.
 *
 * All of this is shape-agnostic — it moves whatever silhouette it is given, so an uploaded
 * logo animates exactly like the built-in circle.
 *
 *   bob     vertical travel, [amplitude in face units, period ms]
 *   sway    rotation, [degrees, period ms]
 *   pulse   uniform scale, [fraction, period ms] — breathing
 *   circle  orbital drift, [radius, period ms]
 *   jitter  fast nervous shake, [amplitude, period ms]
 *   tilt    constant lean, degrees
 *   squash  0..1, how much a bob squashes the body at the bottom of its arc
 *   enter   one-shot on entering the state, [starting scale, duration ms]
 *   settle  scale it eases to and holds, for exits like powering-down
 *   scale   constant resting scale — what the comet states use to buy their rings room
 *   dash    balled up and thrown along a flight path, [travel radius, period ms]
 */
export interface BodyMotion {
  bob?: [number, number]
  sway?: [number, number]
  pulse?: [number, number]
  circle?: [number, number]
  jitter?: [number, number]
  tilt?: number
  squash?: number
  enter?: [number, number]
  settle?: number
  scale?: number
  dash?: [number, number]
}

export const MOTION: Record<MascotState, BodyMotion> = {
  // Lifecycle — quiet, breathing, alive but not busy.
  sleeping: { pulse: [0.028, 4600], tilt: 2 },
  waking: { enter: [0.92, 700], pulse: [0.03, 2200] },
  idle: { pulse: [0.014, 3600] },
  listening: { bob: [2, 2600], pulse: [0.012, 2600] },
  thinking: { sway: [1.6, 3000], pulse: [0.01, 3000] },
  searching: { bob: [3, 1400], sway: [2.2, 1400] },
  working: { bob: [2.5, 900], squash: 0.22 },

  // Reactions — the loud half.
  excited: { bob: [9, 520], sway: [3, 1040], squash: 0.35 },
  surprised: { enter: [1.14, 340], jitter: [0.8, 120] },
  suspicious: { sway: [2.4, 2600], tilt: -3 },
  angry: { jitter: [1.3, 95], tilt: 2 },
  drowsy: { pulse: [0.026, 5000], tilt: 3 },
  happy: { bob: [5, 820], squash: 0.28 },
  curious: { sway: [3.4, 1900], tilt: -4 },
  confused: { sway: [3, 2200] },
  bored: { pulse: [0.016, 5200], tilt: 2 },
  proud: { bob: [1.6, 2400], pulse: [0.02, 2400] },
  shy: { pulse: [0.016, 3000], tilt: 4 },
  sad: { pulse: [0.02, 4600], tilt: 3 },
  laughing: { bob: [7, 430], squash: 0.4 },
  scared: { jitter: [2.2, 75] },
  playful: { bob: [6, 620], sway: [5, 1240], squash: 0.3 },
  celebrate: { bob: [10, 480], sway: [4, 960], squash: 0.35 },

  // Agent morphs — the mascot standing in for a process.
  // The comet states sit back a little: at full size the silhouette fills the frame and the
  // rings have nowhere to pass but across its face.
  orbit: { circle: [6, 3200], scale: 0.72 },
  radar: { sway: [6, 2400], pulse: [0.012, 2400], scale: 0.72 },
  progress: { pulse: [0.022, 1600], scale: 0.74 },
  'thinking-dots': {},

  // Product cycle.
  spawning: { enter: [0.02, 820], pulse: [0.014, 3600] },
  humming: { pulse: [0.016, 2800] },
  loading: { sway: [2.2, 1500], pulse: [0.012, 1500], scale: 0.72 },
  dictating: { bob: [2, 2000] },
  writing: { bob: [1.6, 1100] },
  // Balled up to a dot and thrown — outbound one way round the flight path, inbound the
  // other, which is the whole difference between the two states.
  sending: { dash: [66, 1500], scale: 0.21 },
  receiving: { dash: [66, -1500], scale: 0.21 },
  uploading: { bob: [3, 1000], scale: 0.74 },
  notifying: { bob: [4, 700], sway: [2.5, 700] },
  alerting: { jitter: [2.6, 85] },
  dragging: { tilt: -6, sway: [2, 900] },
  bouncing: { bob: [12, 560], squash: 0.45 },
  'powering-down': { settle: 0.05, tilt: 4 },
}

/** How long a \`settle\` takes to reach its resting scale. */
const SETTLE_MS = 1400

${EFFECTS_PART.trim()}

${LIFE_PART.trim()}

${SEQUENCE_PART.trim()}

/**
 * States built in Blob Studio and baked in at export.
 *
 * Empty in the studio's own copy — there, sequences arrive live through the \`sequence\`
 * prop as you edit them. An exported component carries whatever you chose to ship, and its
 * recipient plays one by name: \`<Avatar sequenceName="greeting" />\`.
 */
/* __SEQUENCES_START__ */
export const SEQUENCES: Record<string, SequenceDef> = {}
/* __SEQUENCES_END__ */

/* ------------------------------------------------------------------ states */

export type MascotState =
${states.map(s => `  | ${JSON.stringify(s)}`).join('\n')}

/**
 * Which expressions a state cycles through. The first is its resting face, chosen as the
 * pool's most forward-facing member so a mascot at rest looks at you rather than past you.
 */
export const POOLS: Record<MascotState, number[]> = ${JSON.stringify(RESTING_TUNED, null, 2).replace(unquoteKey, '$1:')}

/** How long a state holds an expression before drifting to another, in ms. */
const EXPR_CADENCE: Record<MascotState, [number, number]> = ${JSON.stringify(EXPR_CADENCE, null, 2).replace(unquoteKey, '$1:')} as Record<MascotState, [number, number]>

/** Blink cadence in ms, or null for states that never blink. */
const BLINK: Record<MascotState, [number, number] | null> = ${JSON.stringify(BLINK, null, 2).replace(unquoteKey, '$1:')} as Record<MascotState, [number, number] | null>

/** Grouping, for pickers and docs. */
export const STATE_GROUPS: Record<string, MascotState[]> = ${JSON.stringify(GROUPS, null, 2)}

export const MASCOT_STATES = Object.keys(POOLS) as MascotState[]

/* ------------------------------------------------------------------- maths */

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

const toPath = (ring: Ring) =>
  'M' + ring.map(p => p[0].toFixed(2) + ' ' + p[1].toFixed(2)).join('L') + 'Z'

const clone = (rings: Ring[]): Ring[] => rings.map(r => r.map(p => [p[0], p[1]] as [number, number]))

/**
 * The mouth hangs off the eyes: centred under the pair, tilted with them, and pushed clear
 * of whichever eye is tallest. It stays coherent for free as the eyes move, so only four
 * numbers per expression have to be authored.
 */
export function mouthFrame(rings: Ring[], spec: number[]) {
  const c0 = ringCentre(rings[0])
  const c1 = ringCentre(rings[1])
  const theta = Math.atan2(c1[1] - c0[1], c1[0] - c0[0])
  let halfHeight = 0
  for (const ring of rings) {
    let lo = Infinity
    let hi = -Infinity
    for (const p of ring) {
      if (p[1] < lo) lo = p[1]
      if (p[1] > hi) hi = p[1]
    }
    halfHeight = Math.max(halfHeight, (hi - lo) / 2)
  }
  const drop = halfHeight + spec[2]
  return {
    x: (c0[0] + c1[0]) / 2 - Math.sin(theta) * drop,
    y: (c0[1] + c1[1]) / 2 + Math.cos(theta) * drop,
    angle: theta + (spec[3] * Math.PI) / 180,
  }
}

export function mouthPath(frame: { x: number; y: number; angle: number }, spec: number[]) {
  const ca = Math.cos(frame.angle)
  const sa = Math.sin(frame.angle)
  const at = (lx: number, ly: number) =>
    [frame.x + lx * ca - ly * sa, frame.y + lx * sa + ly * ca] as [number, number]
  const a = at(-spec[0], 0)
  const c = at(0, spec[1])
  const b = at(spec[0], 0)
  return (
    'M' + a[0].toFixed(2) + ' ' + a[1].toFixed(2) +
    ' Q' + c[0].toFixed(2) + ' ' + c[1].toFixed(2) +
    ' ' + b[0].toFixed(2) + ' ' + b[1].toFixed(2)
  )
}

/**
 * Per-eye [width, height] multipliers, indexed to match \`rings\`.
 *
 * Which path is the left eye is decided by where it sits, not by which was authored first —
 * expression rings are not in a guaranteed order, and a caller writing \`left\` means the eye
 * they can see on the left.
 */
function resolveEyeScale(
  scale: number | { left?: [number, number]; right?: [number, number] } | undefined,
  rings: Ring[]
): [number, number][] {
  if (scale === undefined) return [[1, 1], [1, 1]]
  if (typeof scale === 'number') return [[scale, scale], [scale, scale]]
  const left: [number, number] = scale.left ?? [1, 1]
  const right: [number, number] = scale.right ?? [1, 1]
  return ringCentre(rings[0])[0] <= ringCentre(rings[1])[0] ? [left, right] : [right, left]
}

/** Face-space transform placing the face inside a silhouette. */
export const anchorTransform = (a: { x: number; y: number; scale: number }) =>
  \`translate(\${a.x} \${a.y}) scale(\${a.scale}) translate(\${-FACE_CENTRE[0]} \${-FACE_CENTRE[1]})\`

/** Overshooting ease, so a pop-in lands with a little life instead of stopping dead. */
const easeOutBack = (t: number) => {
  const c = 1.7
  const u = t - 1
  return 1 + (c + 1) * u * u * u + c * u * u
}

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t))

/**
 * Builds the body's transform for this frame.
 *
 * \`elapsed\` is time since the state was entered, which is what one-shot entrances need;
 * loops read it too so every mascot on a page doesn't pulse in lockstep.
 */
export function bodyTransform(motion: BodyMotion, elapsed: number, strength: number): string {
  if (strength <= 0) return ''
  const centre = FACE_BOX / 2
  const ground = FACE_BOX
  const wave = (period: number, phase = 0) => Math.sin((elapsed / period) * Math.PI * 2 + phase)

  let dx = 0
  let dy = 0
  let rotation = motion.tilt ? motion.tilt * strength : 0
  let scale = 1
  let sx = 1
  let sy = 1

  if (motion.bob) {
    const [amplitude, period] = motion.bob
    const p = wave(period)
    dy -= amplitude * strength * p
    if (motion.squash) {
      // Squash at the bottom of the arc, stretch at the top. Volume roughly conserved.
      const amount = motion.squash * strength * Math.max(0, -p)
      sy = 1 - amount * 0.5
      sx = 1 + amount * 0.5
    }
  }
  if (motion.circle) {
    const [radius, period] = motion.circle
    dx += radius * strength * wave(period)
    dy += radius * strength * wave(period, Math.PI / 2)
  }
  if (motion.sway) {
    const [degrees, period] = motion.sway
    rotation += degrees * strength * wave(period)
  }
  if (motion.pulse) {
    const [fraction, period] = motion.pulse
    scale *= 1 + fraction * strength * wave(period)
  }
  if (motion.jitter) {
    const [amplitude, period] = motion.jitter
    // Two incommensurate waves read as nervous rather than metronomic.
    dx += amplitude * strength * wave(period)
    dy += amplitude * strength * wave(period * 0.63, 1.1)
  }
  if (motion.enter) {
    const [from, duration] = motion.enter
    const t = elapsed / duration
    scale *= t >= 1 ? 1 : from + (1 - from) * easeOutBack(Math.max(t, 0))
  }
  if (motion.settle !== undefined) {
    const t = Math.min(Math.max(elapsed / SETTLE_MS, 0), 1)
    scale *= 1 + (motion.settle - 1) * easeInOut(t) * strength
  }
  if (motion.dash) {
    const [radius, period] = motion.dash
    const p = dashPoint(radius * strength, period, elapsed)
    dx += p.x
    dy += p.y
  }
  if (motion.scale !== undefined) {
    // Eased by strength so \`motion={0}\` still gives the state's resting silhouette.
    scale *= 1 + (motion.scale - 1) * strength
  }

  const parts: string[] = []
  if (dx || dy) parts.push(\`translate(\${dx.toFixed(2)} \${dy.toFixed(2)})\`)
  if (rotation) parts.push(\`rotate(\${rotation.toFixed(2)} \${centre} \${centre})\`)
  if (scale !== 1) {
    parts.push(\`translate(\${centre} \${centre}) scale(\${scale.toFixed(4)}) translate(\${-centre} \${-centre})\`)
  }
  if (sx !== 1 || sy !== 1) {
    // Squash pivots on the ground, not the middle — otherwise it floats instead of landing.
    parts.push(\`translate(\${centre} \${ground}) scale(\${sx.toFixed(4)} \${sy.toFixed(4)}) translate(\${-centre} \${-ground})\`)
  }
  return parts.join(' ')
}

/* --------------------------------------------------------------- component */

export interface MascotAvatarProps {
  state?: MascotState
  /** Pin a specific expression. Stops the state's own cycling. */
  expression?: number
  size?: number | string
  /** Eye offset, each axis -1…1. */
  gaze?: { x?: number; y?: number }
  /**
   * Head turn in degrees; the eyes wrap around the implied sphere.
   */
  turn?: number
  /** How much of each expression's own look-direction to apply. 0 = always forward. */
  lookAround?: number
  flip?: boolean
  spring?: number
  /**
   * Eye size. A number scales both eyes evenly; the object form sizes each one on its own,
   * as \`[width, height]\` multipliers. Left and right are decided by where the eyes sit,
   * not by which path was authored first.
   */
  eyeScale?: number | { left?: [number, number]; right?: [number, number] }
  showMouth?: boolean
  mouthStroke?: number
  /** How strongly the body itself moves. 0 holds it perfectly still, 1 is full motion. */
  motion?: number
  /** Confetti and motion ribbons. */
  effects?: boolean
  /** Let states like alerting replace the mascot with a symbol. */
  glyphs?: boolean
  autoBlink?: boolean
  autoExpression?: boolean
  paused?: boolean
  /**
   * Play an ordered sequence of expressions instead of the state's random pool. Overrides
   * the state's own cycling and blink cadence; the state still supplies body motion unless
   * the sequence names its own.
   */
  sequence?: SequenceDef | null
  /** One of the states baked in at export — see SEQUENCES. Ignored if \`sequence\` is set. */
  sequenceName?: string
  /**
   * Micro-saccades — small eye movements between expression changes. Scaled by \`motion\`,
   * so a caller who has already asked for stillness gets it.
   */
  life?: boolean
  /** Silhouette to wear. Defaults to the baked-in SHAPE. */
  shape?: MascotShape
  gradient?: [string, string, string]
  eyeColor?: string
  title?: string | null
  className?: string
  style?: React.CSSProperties
}

export interface MascotAvatarHandle {
  blink: () => void
  spin: (durationMs?: number) => void
  setExpression: (index: number) => void
}

export const MascotAvatar = React.forwardRef<MascotAvatarHandle, MascotAvatarProps>(
  function MascotAvatar(
    {
      state = 'idle',
      expression,
      size = 160,
      gaze = DEFAULT_GAZE,
      turn = 0,
      lookAround = 0.35,
      flip = false,
      spring = 7,
      eyeScale = 1,
      showMouth = true,
      mouthStroke = MOUTH_STROKE,
      motion,
      effects = true,
      glyphs = true,
      autoBlink = true,
      autoExpression = true,
      paused = false,
      sequence = null,
      sequenceName,
      life = true,
      shape = SHAPE,
      gradient = DEFAULT_GRADIENT,
      eyeColor = '#ffffff',
      title,
      className,
      style,
    },
    ref
  ) {
    const reactId = useId()
    const uid = useMemo(() => 'mascot' + reactId.replace(/[^a-zA-Z0-9]/g, ''), [reactId])
    const eye0 = useRef<SVGPathElement | null>(null)
    const eye1 = useRef<SVGPathElement | null>(null)
    const mouth = useRef<SVGPathElement | null>(null)
    const bodyGroup = useRef<SVGGElement | null>(null)
    const bodyContent = useRef<SVGGElement | null>(null)
    const trailLayer = useRef<SVGGElement | null>(null)
    const trailFrontLayer = useRef<SVGGElement | null>(null)
    const confettiLayer = useRef<SVGGElement | null>(null)
    const glyphLayer = useRef<SVGGElement | null>(null)
    const overlayLayer = useRef<SVGGElement | null>(null)
    const dotsLayer = useRef<SVGGElement | null>(null)
    const faceLayer = useRef<SVGGElement | null>(null)

    // Respect the OS setting unless the caller states a preference explicitly.
    const prefersReducedMotion = useMemo(
      () =>
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      []
    )
    const motionStrength = motion ?? (prefersReducedMotion ? 0 : 1)

    /*
      Validated once rather than per frame. A step pointing at an expression that does not
      exist is a thing an app can hand us, and it must not throw inside the frame loop.
    */
    const activeSequence = useMemo(
      () =>
        resolveSequence(
          sequence ?? (sequenceName ? SEQUENCES[sequenceName] : null),
          EXPRESSION_COUNT
        ),
      [sequence, sequenceName]
    )
    // Per instance, so a page showing forty mascots does not saccade in lockstep.
    const saccadeSeed = useMemo(() => lifeSeed(uid), [uid])

    // Frame-loop state lives in a ref so prop changes never restart a morph.
    const engine = useRef({
      current: clone(EXPRESSIONS[0]),
      target: EXPRESSIONS[0],
      currentMouth: MOUTHS[0].slice(),
      targetMouth: MOUTHS[0],
      currentGaze: GAZE[0].slice() as number[],
      targetGaze: GAZE[0] as number[],
      expression: 0,
      morph: 1,
      velocity: 0,
      blinkStart: null as number | null,
      spinStart: null as number | null,
      spinDuration: 900,
      /** Set by a sequence step so its transition feel outlives the effect that set it. */
      springOverride: null as number | null,
      last: 0,
      stateStart: 0,
      lastState: state as MascotState,
      lastBodyTransform: '',
      props: {
        state,
        expression,
        gaze,
        turn,
        spring,
        eyeScale,
        paused,
        lookAround,
        motionStrength,
        effects,
        glyphs,
        life,
        saccadeSeed,
        sequenceMotion: activeSequence?.motion ?? null,
      },
    })
    engine.current.props = {
      state,
      expression,
      gaze,
      turn,
      spring,
      eyeScale,
      paused,
      lookAround,
      motionStrength,
      effects,
      glyphs,
      life,
      saccadeSeed,
      sequenceMotion: activeSequence?.motion ?? null,
    }

    const selectExpression = (index: number) => {
      const e = engine.current
      const i = ((index % EXPRESSION_COUNT) + EXPRESSION_COUNT) % EXPRESSION_COUNT
      if (i === e.expression && e.morph >= 1) return
      e.current = displayed(e)
      e.currentMouth = displayedMouth(e)
      e.currentGaze = displayedGaze(e)
      e.target = EXPRESSIONS[i]
      e.targetMouth = MOUTHS[i]
      e.targetGaze = GAZE[i]
      e.expression = i
      e.morph = 0
      e.velocity = 0
    }

    React.useImperativeHandle(
      ref,
      () => ({
        blink: () => {
          engine.current.blinkStart = performance.now()
        },
        spin: (durationMs = 900) => {
          engine.current.spinDuration = durationMs
          engine.current.spinStart = performance.now()
        },
        setExpression: selectExpression,
      }),
      []
    )

    useEffect(() => {
      selectExpression(expression ?? activeSequence?.steps[0].expression ?? POOLS[state][0])
    }, [state, expression, activeSequence])

    /*
      Two ways to change face, and only one runs at a time.

      A state picks at random from its pool on a cadence, which is what makes a mood look
      unscripted. A sequence walks its steps in order, holding each for its own time — the
      order is the content, so randomising it would destroy the thing being authored.

      Both stop dead when the caller pins an expression, and both stop when paused. The
      sequence path also honours its own transition feel per step by overriding the spring
      for the duration of that morph.
    */
    useEffect(() => {
      if (!autoExpression || expression !== undefined || paused) return
      let timer: ReturnType<typeof setTimeout>

      if (activeSequence) {
        const steps = activeSequence.steps
        let cursor = sequenceCursorStart()
        const play = (first: boolean) => {
          const step = steps[cursor.index]
          engine.current.springOverride = sequenceSpring(
            step.transition,
            step.transitionMs,
            spring
          )
          if (!first) selectExpression(step.expression)
          if (cursor.done) return
          timer = setTimeout(() => {
            cursor = advanceSequence(steps.length, cursor, activeSequence.playback)
            play(false)
          }, step.holdMs + step.transitionMs)
        }
        play(true)
        return () => {
          clearTimeout(timer)
          engine.current.springOverride = null
        }
      }

      const tick = () => {
        const [lo, hi] = EXPR_CADENCE[state]
        timer = setTimeout(() => {
          const pool = POOLS[state]
          const alternatives = pool.filter(x => x !== engine.current.expression)
          selectExpression(
            alternatives.length
              ? alternatives[Math.floor(Math.random() * alternatives.length)]
              : pool[0]
          )
          tick()
        }, lo + Math.random() * (hi - lo))
      }
      tick()
      return () => clearTimeout(timer)
    }, [state, autoExpression, expression, paused, activeSequence, spring])

    useEffect(() => {
      const cadence = activeSequence
        ? activeSequence.blink && ([activeSequence.blink.minMs, activeSequence.blink.maxMs] as const)
        : BLINK[state]
      if (!autoBlink || !cadence || paused) return
      let timer: ReturnType<typeof setTimeout>
      const tick = () => {
        timer = setTimeout(() => {
          engine.current.blinkStart = performance.now()
          tick()
        }, cadence[0] + Math.random() * (cadence[1] - cadence[0]))
      }
      tick()
      return () => clearTimeout(timer)
    }, [state, autoBlink, paused, activeSequence])

    useEffect(() => {
      let frame = 0
      engine.current.last = performance.now()

      const draw = (e: typeof engine.current, now: number, spinTurn: number) => {
        const p = e.props
        // Re-apply a fraction of this expression's own look-direction.
        const g = displayedGaze(e)
        const look = p.lookAround ?? 0.35
        const ox = g[0] * look
        const oy = g[1] * look
        const rings = displayed(e).map(
          ring => ring.map(pt => [pt[0] + ox, pt[1] + oy] as [number, number]) as Ring
        )
        const gx = clamp(p.gaze?.x ?? 0, -1, 1) * GAZE_X
        const gy = clamp(p.gaze?.y ?? 0, -1, 1) * GAZE_Y
        /*
          Micro-saccades ride on top of the constant aim, and only on the eyes: gx/gy move
          the whole face because a deliberate look turns the head with it, but a saccade is
          the eyes alone moving inside a face that stays put.
        */
        const [sx, sy] =
          p.life === false
            ? [0, 0]
            : saccadeOffset(now, p.saccadeSeed ?? 0, p.motionStrength ?? 1)
        const radians = (((p.turn ?? 0) + spinTurn) * Math.PI) / 180
        const eyeSize = resolveEyeScale(p.eyeScale, rings)
        const blink = blinkScale(e, now)

        rings.forEach((ring, index) => {
          const el = index === 0 ? eye0.current : eye1.current
          if (!el) return
          const c = ringCentre(ring)
          const baseLongitude = Math.asin(clamp((c[0] - SPHERE_C) / SPHERE_R, -1, 1))
          const longitude = baseLongitude + radians
          const depth = Math.cos(longitude)
          const perspective = Math.max(depth, 0.02) / Math.max(Math.cos(baseLongitude), 0.02)
          const size = eyeSize[index]
          el.setAttribute('d', toPath(ring))
          el.setAttribute(
            'transform',
            \`translate(\${(SPHERE_C + SPHERE_R * Math.sin(longitude) + gx + sx).toFixed(2)} \${(
              c[1] + gy + sy
            ).toFixed(2)}) scale(\${clamp(perspective * size[0], 0.02, 2.4).toFixed(4)} \${clamp(
              blink * size[1],
              0.02,
              2.4
            ).toFixed(4)}) translate(\${(-c[0]).toFixed(2)} \${(-c[1]).toFixed(2)})\`
          )
          el.style.opacity = depth > 0.02 ? '1' : '0'
        })

        // Mouth: same sphere projection as the eyes, but blinking never touches it.
        const mouthEl = mouth.current
        if (mouthEl) {
          const spec = displayedMouth(e)
          const frameGeom = mouthFrame(rings, spec)
          const baseLongitude = Math.asin(clamp((frameGeom.x - SPHERE_C) / SPHERE_R, -1, 1))
          const longitude = baseLongitude + radians
          const depth = Math.cos(longitude)
          const perspective = Math.max(depth, 0.02) / Math.max(Math.cos(baseLongitude), 0.02)
          mouthEl.setAttribute('d', mouthPath(frameGeom, spec))
          mouthEl.setAttribute(
            'transform',
            \`translate(\${(SPHERE_C + SPHERE_R * Math.sin(longitude) + gx).toFixed(2)} \${(
              frameGeom.y + gy
            ).toFixed(2)}) scale(\${clamp(perspective, 0.02, 2.4).toFixed(4)} 1) translate(\${(
              -frameGeom.x
            ).toFixed(2)} \${(-frameGeom.y).toFixed(2)})\`
          )
          mouthEl.style.opacity = depth > 0.02 ? '1' : '0'
        }

        // The body. One-shot entrances need time since the state began, so track that here
        // rather than in an effect — the loop already has the clock.
        const bodyEl = bodyGroup.current
        if (bodyEl) {
          /*
            A sequence may borrow a state's body motion by name; otherwise the state it is
            playing under supplies it. The clock restarts on the motion, not on the state,
            or a one-shot entrance would fail to replay when only the borrowed motion
            changed.
          */
          const motionKey = (p.sequenceMotion ?? p.state) as MascotState
          if (motionKey !== e.lastState) {
            e.lastState = motionKey
            e.stateStart = now
          }
          const transform = bodyTransform(
            MOTION[motionKey] ?? {},
            now - e.stateStart,
            p.motionStrength ?? 1
          )
          if (transform !== e.lastBodyTransform) {
            e.lastBodyTransform = transform
            if (transform) bodyEl.setAttribute('transform', transform)
            else bodyEl.removeAttribute('transform')
          }
        }

        updateEffects({
          trails: trailLayer.current,
          trailsFront: trailFrontLayer.current,
          confetti: confettiLayer.current,
          glyph: glyphLayer.current,
          overlay: overlayLayer.current,
          dots: dotsLayer.current,
          bodyContent: bodyContent.current,
          face: faceLayer.current,
          state: p.state as MascotState,
          elapsed: now - e.stateStart,
          strength: p.motionStrength ?? 1,
          paint: paintRef.current,
          uid,
          showEffects: p.effects !== false,
          showGlyphs: p.glyphs !== false,
        })
      }

      const step = (now: number) => {
        frame = requestAnimationFrame(step)
        const e = engine.current
        const p = e.props
        const dt = Math.min((now - e.last) / 1000, 0.1)
        e.last = now
        if (p.paused) return

        const f = e.springOverride ?? p.spring ?? 7
        e.velocity += (-2 * f * e.velocity - f * f * (e.morph - 1)) * dt
        e.morph += e.velocity * dt
        if (!Number.isFinite(e.morph)) {
          e.morph = 1
          e.velocity = 0
        }

        let spinTurn = 0
        if (e.spinStart !== null) {
          const tt = (now - e.spinStart) / e.spinDuration
          if (tt >= 1) e.spinStart = null
          else spinTurn = 360 * tt
        }

        draw(e, now, spinTurn)
      }

      frame = requestAnimationFrame(step)
      return () => cancelAnimationFrame(frame)
      // \`uid\` is stable for the component's life, so listing it re-runs nothing — it is
      // here because the loop genuinely reads it, and a lie in a dependency array is the
      // kind that bites later.
    }, [uid])

    /*
      What the extras are made of.

      The loading dots, the pieces shed on spawn and shutdown, and the glyph the mascot
      turns into are all meant to read as the same stuff as the body. That is the instance
      gradient whenever the body takes it — but artwork that kept its own colours never
      does, and those parts would then arrive in a gradient that appears nowhere else on
      screen: a red logo dissolving into green dots.

      Artwork gradients survive this, because the import inlines their defs alongside the
      body, so a \`url(#…)\` fill still resolves.
    */
    const paint = useMemo(() => {
      if (shape.body.includes('{{GRADIENT}}')) return \`url(#\${uid}-grad)\`
      const own = shape.body.match(/fill="(?!none)([^"]+)"/)
      return own ? own[1] : \`url(#\${uid}-grad)\`
    }, [shape.body, uid])
    const paintRef = useRef(paint)
    paintRef.current = paint

    const dimension = typeof size === 'number' ? \`\${size}px\` : size
    const label = title === undefined ? \`\${shape.name} mascot\` : title
    const body = shape.body.replace(/\\{\\{GRADIENT\\}\\}/g, \`url(#\${uid}-grad)\`)

    return (
      <svg
        viewBox={VIEW_BOX}
        width={dimension}
        height={dimension}
        className={className}
        style={style}
        role={label ? 'img' : undefined}
        aria-label={label ?? undefined}
        aria-hidden={label ? undefined : true}
      >
        <defs>
          <linearGradient id={\`\${uid}-grad\`} x1="1" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={gradient[0]} />
            <stop offset="55%" stopColor={gradient[1]} />
            <stop offset="100%" stopColor={gradient[2]} />
          </linearGradient>
          {/* The fit goes on the clipPath itself: a <g> inside one is ignored by browsers,
              which is also why shape.clip is pre-flattened to bare shapes. */}
          <clipPath
            id={\`\${uid}-clip\`}
            transform={shape.fit || undefined}
            dangerouslySetInnerHTML={{ __html: shape.clip }}
          />
        </defs>
        <g transform={flip ? \`translate(\${FACE_BOX} 0) scale(-1 1)\` : undefined}>
          {/* The far half of every orbit. Its near half is drawn after the body, which is
              the only thing making the rings read as rings rather than as a halo. */}
          <g ref={trailLayer} />
          {/* Under the body on purpose: the dots are what the body comes apart into, and
              they have to slide out from behind it rather than across it. */}
          <g ref={dotsLayer} />
          {/* Body and face move together — the face is painted on the body, not floating
              in front of it, so a squash or a tilt has to carry both. The glyph rides the
              same motion but is not faded with them, since it replaces them. */}
          <g ref={bodyGroup}>
          <g ref={bodyContent}>
          <g transform={shape.fit || undefined} dangerouslySetInnerHTML={{ __html: body }} />
          <g ref={faceLayer} clipPath={\`url(#\${uid}-clip)\`}>
            <g transform={anchorTransform(shape.anchor)}>
              <path ref={eye0} fill={eyeColor} />
              <path ref={eye1} fill={eyeColor} />
              {showMouth && (
                <path
                  ref={mouth}
                  fill="none"
                  stroke={eyeColor}
                  strokeWidth={mouthStroke}
                  strokeLinecap="round"
                />
              )}
            </g>
          </g>
          </g>
          <g ref={glyphLayer} style={{ opacity: 0 }} />
          </g>
          {/* The near half of the orbits, and the tails a dashing dot drags through. */}
          <g ref={trailFrontLayer} />
          <g ref={confettiLayer} />
          {/* Pops and the badge sit above everything — they are things happening to the
              mascot, not parts of it. */}
          <g ref={overlayLayer} />
        </g>
      </svg>
    )
  }
)

/* ----------------------------------------------------------------- helpers */

function displayed(e: { current: Ring[]; target: Ring[]; morph: number }): Ring[] {
  const m = clamp(e.morph, 0, 1)
  return e.current.map((ring, eye) =>
    ring.map(
      (p, i) =>
        [p[0] + (e.target[eye][i][0] - p[0]) * m, p[1] + (e.target[eye][i][1] - p[1]) * m] as [
          number,
          number
        ]
    )
  )
}

function displayedMouth(e: { currentMouth: number[]; targetMouth: number[]; morph: number }) {
  const m = clamp(e.morph, 0, 1)
  return e.currentMouth.map((v, i) => v + (e.targetMouth[i] - v) * m)
}

function displayedGaze(e: { currentGaze: number[]; targetGaze: number[]; morph: number }) {
  const m = clamp(e.morph, 0, 1)
  return e.currentGaze.map((v, i) => v + (e.targetGaze[i] - v) * m)
}

function blinkScale(e: { blinkStart: number | null }, now: number) {
  if (e.blinkStart === null) return 1
  const t = (now - e.blinkStart) / 320
  if (t >= 1) {
    e.blinkStart = null
    return 1
  }
  // Fast close, slower open.
  return Math.max(t < 0.42 ? 1 - t / 0.42 : (t - 0.42) / 0.58, 0.04)
}

/**
 * The hand-fitted avatars this engine replaced exposed these three separately. Kept so
 * existing imports keep working; the silhouette, its fit transform and the face anchor all
 * live in SHAPE now.
 */
export const MASCOT_GRADIENT = DEFAULT_GRADIENT
export const FACE_ANCHOR = anchorTransform(SHAPE.anchor)
export const MASCOT_FIT = SHAPE.fit

export default MascotAvatar
`

/*
  --check regenerates into memory and compares, without writing.

  The engine is committed so a clean clone builds with nothing else present, which means
  nothing otherwise notices when the lab or the effects part moves on and the committed file
  does not. A stale engine is a silent bug: the preview and the export both come from it, so
  they agree with each other while disagreeing with the source they claim to be generated
  from.
*/
if (process.argv.includes('--check')) {
  const current = fs.existsSync(DEST) ? fs.readFileSync(DEST, 'utf8') : null
  if (current === out) {
    console.log('engine is current —', path.relative(process.cwd(), DEST))
    process.exit(0)
  }
  console.error(
    [
      current === null
        ? 'The generated engine is missing: ' + path.relative(process.cwd(), DEST)
        : 'The generated engine is stale: ' + path.relative(process.cwd(), DEST),
      '',
      'It no longer matches what the lab and scripts/engine-effects.part.tsx produce.',
      'Run `npm run gen:engine` and commit the result.',
    ].join('\n')
  )
  process.exit(1)
}

fs.mkdirSync(path.dirname(DEST), { recursive: true })
fs.writeFileSync(DEST, out)
console.log(
  'wrote',
  path.relative(process.cwd(), DEST),
  (out.length / 1024).toFixed(1) + 'KB,',
  EXPRESSIONS.length,
  'expressions,',
  states.length,
  'states,',
  restingChanges,
  'resting faces re-pointed forward'
)
