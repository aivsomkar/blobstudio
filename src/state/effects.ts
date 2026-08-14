/**
 * Why the mascot looks plainer than it should.
 *
 * Seventeen of the forty states draw something extra — a confetti burst, comets on tilted
 * rings, a packet dashing along a figure-eight, the loading dots. Three separate switches
 * can each suppress that, and none of them says so: the Effects toggle, the Glyphs toggle,
 * and body motion at zero, which gates effects too because a burst thrown from a body that
 * is not moving reads as debris.
 *
 * That was survivable when the toggles reset on every reload. They persist now, so a stray
 * click follows you between sessions, and "the streaks stopped appearing" has no visible
 * cause anywhere on the page. This works out what is being hidden so the stage can say so.
 */

import { EFFECTS, type MascotState } from '../engine/faceEngine'

export type SuppressionReason = 'effects' | 'glyphs' | 'motion'

export interface EffectSuppression {
  /** What this state would draw, named the way the UI talks about it. */
  effect: string
  /** Everything currently preventing it. Fixing one is not always enough. */
  reasons: SuppressionReason[]
}

/** Reads the way someone would describe the missing thing, not the way the table spells it. */
const EFFECT_NAMES: Record<string, string> = {
  confetti: 'a confetti burst',
  trails: 'comets',
  dash: 'a comet dash',
  dots: 'the loading dots',
  pops: 'pops',
  glyph: 'a symbol',
  badge: 'a badge',
}

export function suppressedEffect(
  state: MascotState,
  settings: { effects: boolean; glyphs: boolean; motion: number }
): EffectSuppression | null {
  const spec = EFFECTS[state]
  if (!spec) return null

  const kind = Object.keys(spec).find(key => key in EFFECT_NAMES)
  if (!kind) return null
  const effect = EFFECT_NAMES[kind]

  /*
    Glyphs are their own switch and are not gated by motion or by Effects — a glyph replaces
    the mascot rather than decorating it, so it stands or falls on its own.
  */
  if (kind === 'glyph') {
    return settings.glyphs ? null : { effect, reasons: ['glyphs'] }
  }

  const reasons: SuppressionReason[] = []
  if (!settings.effects) reasons.push('effects')
  if (settings.motion <= 0) reasons.push('motion')
  return reasons.length ? { effect, reasons } : null
}

/** One sentence naming what is missing and what is hiding it. */
export function describeSuppression(suppression: EffectSuppression): string {
  const parts = suppression.reasons.map(reason =>
    reason === 'effects' ? 'Effects is off' : reason === 'glyphs' ? 'Glyphs is off' : 'body motion is at zero'
  )
  const joined =
    parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
  return `This state draws ${suppression.effect}, but ${joined}.`
}
