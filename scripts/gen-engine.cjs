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

function grab(name, endMark) {
  const i = t.indexOf(`const ${name} = `)
  if (i < 0) throw new Error('missing ' + name)
  const j = t.indexOf(endMark, i)
  return eval('(' + t.slice(i + `const ${name} = `.length, j + endMark.length) + ')')
}
const EXPRESSIONS = grab('EXPRESSIONS', '\n            ]')
const MOUTHS = grab('MOUTHS', '\n            ]')
const POOLS = grab('POOLS', '\n            }')
const EXPR_CADENCE = grab('EXPR_CADENCE', '\n            }')
const BLINK = grab('BLINK', '\n            }')
const GROUPS = grab('GROUPS', '\n            }')

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

export const DEFAULT_GRADIENT: [string, string, string] = ['#9FE6B5', '#3FAE6E', '#1C7A4C']

/** The face box every coordinate in this file is expressed in. */
export const FACE_BOX = 228.541
const VIEW_BOX = \`-15 -15 \${FACE_BOX + 30} \${FACE_BOX + 30}\`
const SPHERE_C = 114.2705
const SPHERE_R = 105
const GAZE_X = 13.2
const GAZE_Y = 8.4

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

/** Face-space transform placing the face inside a silhouette. */
export const anchorTransform = (a: { x: number; y: number; scale: number }) =>
  \`translate(\${a.x} \${a.y}) scale(\${a.scale}) translate(\${-FACE_CENTRE[0]} \${-FACE_CENTRE[1]})\`

/* --------------------------------------------------------------- component */

export interface MascotAvatarProps {
  state?: MascotState
  /** Pin a specific expression. Stops the state's own cycling. */
  expression?: number
  size?: number | string
  /** Eye offset, each axis -1…1. */
  gaze?: { x?: number; y?: number }
  /** Head turn in degrees; the eyes wrap around the implied sphere. */
  turn?: number
  /** How much of each expression's own look-direction to apply. 0 = always forward. */
  lookAround?: number
  flip?: boolean
  spring?: number
  eyeScale?: number
  showMouth?: boolean
  mouthStroke?: number
  autoBlink?: boolean
  autoExpression?: boolean
  paused?: boolean
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
      gaze,
      turn = 0,
      lookAround = 0.35,
      flip = false,
      spring = 7,
      eyeScale = 1,
      showMouth = true,
      mouthStroke = MOUTH_STROKE,
      autoBlink = true,
      autoExpression = true,
      paused = false,
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
      last: 0,
      props: { state, expression, gaze, turn, spring, eyeScale, paused, lookAround },
    })
    engine.current.props = { state, expression, gaze, turn, spring, eyeScale, paused, lookAround }

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
      selectExpression(expression ?? POOLS[state][0])
    }, [state, expression])

    useEffect(() => {
      if (!autoExpression || expression !== undefined || paused) return
      let timer: ReturnType<typeof setTimeout>
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
    }, [state, autoExpression, expression, paused])

    useEffect(() => {
      const cadence = BLINK[state]
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
    }, [state, autoBlink, paused])

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
        const radians = (((p.turn ?? 0) + spinTurn) * Math.PI) / 180
        const base = p.eyeScale ?? 1
        const blink = blinkScale(e, now)

        rings.forEach((ring, index) => {
          const el = index === 0 ? eye0.current : eye1.current
          if (!el) return
          const c = ringCentre(ring)
          const baseLongitude = Math.asin(clamp((c[0] - SPHERE_C) / SPHERE_R, -1, 1))
          const longitude = baseLongitude + radians
          const depth = Math.cos(longitude)
          const perspective = Math.max(depth, 0.02) / Math.max(Math.cos(baseLongitude), 0.02)
          el.setAttribute('d', toPath(ring))
          el.setAttribute(
            'transform',
            \`translate(\${(SPHERE_C + SPHERE_R * Math.sin(longitude) + gx).toFixed(2)} \${(
              c[1] + gy
            ).toFixed(2)}) scale(\${clamp(perspective * base, 0.02, 2.4).toFixed(4)} \${clamp(
              blink * base,
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
      }

      const step = (now: number) => {
        frame = requestAnimationFrame(step)
        const e = engine.current
        const p = e.props
        const dt = Math.min((now - e.last) / 1000, 0.1)
        e.last = now
        if (p.paused) return

        const f = p.spring ?? 7
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
    }, [])

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
          <g transform={shape.fit || undefined} dangerouslySetInnerHTML={{ __html: body }} />
          <g clipPath={\`url(#\${uid}-clip)\`}>
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

export default MascotAvatar
`

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
