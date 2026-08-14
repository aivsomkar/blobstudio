import { describe, expect, it } from 'vitest'
import { describeSuppression, suppressedEffect } from './effects'
import { EFFECTS, MASCOT_STATES, type MascotState } from '../engine/faceEngine'

const all = { effects: true, glyphs: true, motion: 1 }

describe('suppressedEffect', () => {
  it('says nothing when everything is on', () => {
    for (const state of MASCOT_STATES) {
      expect(suppressedEffect(state, all), state).toBeNull()
    }
  })

  it('says nothing for a state that draws no extra layer', () => {
    // idle just breathes; there is nothing being hidden to report.
    expect(suppressedEffect('idle', { effects: false, glyphs: false, motion: 0 })).toBeNull()
  })

  it('names the comets when Effects is off', () => {
    const result = suppressedEffect('orbit', { ...all, effects: false })
    expect(result).toEqual({ effect: 'comets', reasons: ['effects'] })
  })

  it('names confetti for a celebration', () => {
    expect(suppressedEffect('celebrate', { ...all, effects: false })?.effect).toBe(
      'a confetti burst'
    )
  })

  it('catches body motion at zero, which gates effects too', () => {
    expect(suppressedEffect('orbit', { ...all, motion: 0 })).toEqual({
      effect: 'comets',
      reasons: ['motion'],
    })
  })

  it('reports both reasons, because fixing one would not be enough', () => {
    expect(suppressedEffect('orbit', { effects: false, glyphs: true, motion: 0 })?.reasons).toEqual(
      ['effects', 'motion']
    )
  })

  it('treats a glyph as its own switch', () => {
    // A glyph replaces the mascot rather than decorating it, so Effects and motion do not
    // gate it — only the Glyphs toggle does.
    expect(suppressedEffect('alerting', { ...all, glyphs: false })).toEqual({
      effect: 'a symbol',
      reasons: ['glyphs'],
    })
    expect(suppressedEffect('alerting', { ...all, effects: false, motion: 0 })).toBeNull()
  })

  it('does not blame Glyphs for a non-glyph state', () => {
    expect(suppressedEffect('orbit', { ...all, glyphs: false })).toBeNull()
  })

  it('has a name for every effect the engine can draw', () => {
    // A new effect kind added to the table without a name here would report nothing, which
    // is the exact silence this module exists to end.
    for (const [state, spec] of Object.entries(EFFECTS)) {
      const off = suppressedEffect(state as MascotState, {
        effects: false,
        glyphs: false,
        motion: 0,
      })
      expect(off, `${state} (${Object.keys(spec ?? {}).join()})`).not.toBeNull()
      expect(off!.effect).not.toBe('')
    }
  })
})

describe('describeSuppression', () => {
  it('reads as a sentence for one reason', () => {
    expect(describeSuppression({ effect: 'comets', reasons: ['effects'] })).toBe(
      'This state draws comets, but Effects is off.'
    )
  })

  it('joins two reasons with "and"', () => {
    expect(describeSuppression({ effect: 'comets', reasons: ['effects', 'motion'] })).toBe(
      'This state draws comets, but Effects is off and body motion is at zero.'
    )
  })
})
