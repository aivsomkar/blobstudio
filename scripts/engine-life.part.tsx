/* -------------------------------------------------------------------- life */

/**
 * Micro-saccades — the thing that separates "still" from "dead".
 *
 * The body already breathes and bounces, but between expression changes the eyes were
 * perfectly motionless, which is uncanny in a way that is hard to name and easy to feel.
 * Real eyes never hold still: they make small fast jumps a few times a second, with slow
 * drift in between.
 *
 * Three properties this has to have:
 *
 * **Eyes only.** The mouth keeps its own position. A whole-face jitter reads as the picture
 * shaking; an eyes-only one reads as attention moving.
 *
 * **Fast in, slow out.** A saccade is ballistic — the jump takes about 40ms and the eye then
 * sits at the new target. Easing it symmetrically would read as a float rather than a flick.
 *
 * **Desynchronised per mascot.** A page showing every state at once has forty of these on
 * screen. Seeded from the instance rather than from the expression, so they do not all
 * twitch on the same frame — which would read as the page stuttering, not as forty
 * characters looking around.
 *
 * Bounded on purpose: the fit solver has to widen every eye point's required clearance by
 * this much, so a generous amplitude is paid for in face size on every silhouette.
 */
export const SACCADE_TRAVEL = { x: 2.2, y: 1.4 }

/** Worst-case excursion in any direction, which is what the solver has to leave room for. */
export const SACCADE_RADIUS = Math.hypot(SACCADE_TRAVEL.x, SACCADE_TRAVEL.y)

/** Mean time between jumps. Jittered per jump so the rhythm never reads as a metronome. */
const SACCADE_INTERVAL = 1150
/** How long the jump itself takes. Short — this is the ballistic part. */
const SACCADE_RISE = 45

const lifeHash = (n: number) => {
  const x = Math.sin(n * 91.7 + 47.3) * 28461.13
  return (x - Math.floor(x)) * 2 - 1
}

/** Stable per-instance number from the component's uid, so two mascots differ. */
export const lifeSeed = (uid: string) => {
  let hash = 0
  for (let i = 0; i < uid.length; i++) hash = (hash * 31 + uid.charCodeAt(i)) % 100000
  return hash
}

/**
 * Where the eyes are looking right now, relative to their resting position.
 *
 * Each interval picks a fresh target and jumps to it. Between jumps the eyes drift very
 * slightly, which is what stops a held gaze from looking frozen while it waits.
 */
export function saccadeOffset(
  elapsedMs: number,
  seed: number,
  strength: number
): [number, number] {
  if (strength <= 0) return [0, 0]

  // Warp the clock so intervals vary; a fixed period is legible as a tick within seconds.
  const warped = elapsedMs + Math.sin(elapsedMs / 1900 + seed) * 260
  const step = Math.floor(warped / SACCADE_INTERVAL)
  const into = warped - step * SACCADE_INTERVAL

  const from = [lifeHash(step * 2 + seed), lifeHash(step * 2 + 1 + seed)]
  const to = [lifeHash((step + 1) * 2 + seed), lifeHash((step + 1) * 2 + 1 + seed)]

  // Fast in: the whole move happens in the first SACCADE_RISE ms of the interval.
  const rise = Math.min(into / SACCADE_RISE, 1)
  const eased = rise * rise * (3 - 2 * rise)
  const held = (into - SACCADE_RISE) / SACCADE_INTERVAL

  // Slow out: a little drift after landing, so the held position is not perfectly static.
  const drift = Math.sin(held * 2.4 + seed) * 0.06

  /*
    Clamped to the unit box before scaling, and this matters more than it looks: the hash
    already spans -1…1, so the drift on top of it can land just outside. The fit solver
    reserves exactly SACCADE_TRAVEL of clearance for this function, so an offset a
    thousandth of a unit over is not a rounding detail — it is the clipping report being
    wrong, which is the one thing it is for.
  */
  return [
    unit(from[0] + (to[0] - from[0]) * eased + drift) * SACCADE_TRAVEL.x * strength,
    unit(from[1] + (to[1] - from[1]) * eased + drift * 0.6) * SACCADE_TRAVEL.y * strength,
  ]
}

const unit = (value: number) => (value < -1 ? -1 : value > 1 ? 1 : value)
