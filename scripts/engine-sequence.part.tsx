/* ---------------------------------------------------------------- sequence */

/**
 * Custom states.
 *
 * The built-in states cycle a pool at random within a cadence, which is right for a mood:
 * `thinking` should not play the same four faces in the same order forever. It is wrong for
 * a scripted beat — "look up, pause, nod" — where the order is the whole point, and it is
 * the only thing on offer if your app needs a state the lab never authored.
 *
 * A sequence is that other thing: ordered steps, each holding for its own time, with its own
 * transition feel. Everything here is deliberately framework-free and side-effect-free so
 * the same code runs the studio preview, the exported component, and the tests.
 */

export type SequenceTransition = 'spring' | 'smooth' | 'snappy'
export type SequencePlayback = 'loop' | 'once' | 'pingPong'

export interface SequenceStep {
  /** Index into EXPRESSIONS. Validated on the way in — see resolveSequence. */
  expression: number
  /** How long this step is held once it has arrived. */
  holdMs: number
  /** How long the morph into this step should feel like it takes. */
  transitionMs: number
  transition: SequenceTransition
}

export interface SequenceDef {
  name: string
  steps: SequenceStep[]
  playback: SequencePlayback
  /** Null disables blinking for this sequence entirely. */
  blink: { minMs: number; maxMs: number } | null
  /** Name of a built-in state whose body motion to borrow, or null to hold still. */
  motion: string | null
}

export interface SequenceCursor {
  index: number
  direction: 1 | -1
  /** True once a `once` sequence has reached its last step and stopped. */
  done: boolean
}

export const sequenceCursorStart = (): SequenceCursor => ({
  index: 0,
  direction: 1,
  done: false,
})

/**
 * Where the sequence goes next.
 *
 * pingPong turns around at the ends rather than repeating them, so a three-step sequence
 * reads 0,1,2,1,0,1,2… — repeating the endpoint would hold it for double time and read as
 * a stumble.
 */
export function advanceSequence(
  stepCount: number,
  cursor: SequenceCursor,
  playback: SequencePlayback
): SequenceCursor {
  const last = stepCount - 1
  if (last < 0) return { index: 0, direction: 1, done: true }
  if (last === 0) return { index: 0, direction: 1, done: playback === 'once' }

  if (playback === 'once') {
    if (cursor.index >= last) return { index: last, direction: 1, done: true }
    return { index: cursor.index + 1, direction: 1, done: false }
  }

  if (playback === 'pingPong') {
    if (cursor.direction === 1 && cursor.index >= last) {
      return { index: last - 1, direction: -1, done: false }
    }
    if (cursor.direction === -1 && cursor.index <= 0) {
      return { index: 1, direction: 1, done: false }
    }
    return { index: cursor.index + cursor.direction, direction: cursor.direction, done: false }
  }

  return { index: cursor.index >= last ? 0 : cursor.index + 1, direction: 1, done: false }
}

/**
 * The spring constant a step should morph with.
 *
 * The engine's morph is a spring, not a duration, so `transitionMs` is a feel rather than a
 * measurement: a shorter time means a stiffer spring. The style then biases it — `smooth`
 * settles without overshoot, `snappy` arrives hard, `spring` keeps the engine's own bounce.
 */
export function sequenceSpring(
  transition: SequenceTransition,
  transitionMs: number,
  base: number
): number {
  const byDuration = Math.min(Math.max(500 / Math.max(transitionMs, 60), 0.35), 3)
  const byStyle = transition === 'smooth' ? 0.72 : transition === 'snappy' ? 1.6 : 1
  return Math.min(Math.max(base * byDuration * byStyle, 1), 40)
}

/**
 * Makes an arbitrary object safe to play.
 *
 * Sequences arrive from localStorage, from a project file someone edited by hand, or from an
 * app passing a prop. A step pointing at expression 99 must not throw mid-frame, and a
 * sequence with no steps must not spin the timer at zero delay.
 */
export function resolveSequence(
  value: SequenceDef | null | undefined,
  expressionCount: number
): SequenceDef | null {
  if (!value || !Array.isArray(value.steps) || value.steps.length === 0) return null
  const steps = value.steps
    .filter(step => step && Number.isFinite(step.expression))
    .map(step => ({
      expression:
        ((Math.round(step.expression) % expressionCount) + expressionCount) % expressionCount,
      holdMs: clampNumber(step.holdMs, 120, 60000, 1400),
      transitionMs: clampNumber(step.transitionMs, 0, 5000, 400),
      transition: (['spring', 'smooth', 'snappy'] as SequenceTransition[]).includes(
        step.transition
      )
        ? step.transition
        : 'smooth',
    }))
  if (!steps.length) return null
  const blink = value.blink
    ? {
        minMs: clampNumber(value.blink.minMs, 200, 60000, 3200),
        maxMs: clampNumber(value.blink.maxMs, 200, 60000, 6000),
      }
    : null
  if (blink) blink.maxMs = Math.max(blink.maxMs, blink.minMs)
  return {
    name: typeof value.name === 'string' && value.name ? value.name : 'sequence',
    steps,
    playback: (['loop', 'once', 'pingPong'] as SequencePlayback[]).includes(value.playback)
      ? value.playback
      : 'loop',
    blink,
    motion: typeof value.motion === 'string' && value.motion ? value.motion : null,
  }
}

function clampNumber(value: number, min: number, max: number, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(Math.max(value, min), max)
    : fallback
}

/** Total wall time for one pass, for a UI that wants to say how long a sequence runs. */
export function sequenceDuration(sequence: SequenceDef): number {
  const pass = sequence.steps.reduce((total, step) => total + step.holdMs + step.transitionMs, 0)
  return sequence.playback === 'pingPong' && sequence.steps.length > 1 ? pass * 2 : pass
}
