import { describe, expect, it } from 'vitest'
import {
  advanceSequence,
  EXPRESSION_COUNT,
  lifeSeed,
  resolveSequence,
  SACCADE_RADIUS,
  SACCADE_TRAVEL,
  saccadeOffset,
  sequenceDuration,
  sequenceSpring,
  type SequenceCursor,
  type SequenceDef,
} from './faceEngine'

/*
  These live in scripts/engine-*.part.tsx and are generated into the engine, so the tests
  import them from the generated file — the same module the app and the export use. Testing
  the part files directly would prove the sources compile, not that what ships behaves.
*/

const cursor = (index: number, direction: 1 | -1 = 1): SequenceCursor => ({
  index,
  direction,
  done: false,
})

/** Walks a sequence for n advances and returns the step indices it visited. */
const walk = (steps: number, playback: SequenceDef['playback'], count: number) => {
  let current = cursor(0)
  const seen = [current.index]
  for (let i = 0; i < count; i++) {
    current = advanceSequence(steps, current, playback)
    seen.push(current.index)
  }
  return seen
}

describe('advanceSequence', () => {
  it('loops back to the start', () => {
    expect(walk(3, 'loop', 5)).toEqual([0, 1, 2, 0, 1, 2])
  })

  it('stops on the last step when played once', () => {
    expect(walk(3, 'once', 4)).toEqual([0, 1, 2, 2, 2])
    expect(advanceSequence(3, cursor(2), 'once').done).toBe(true)
  })

  it('turns around at the ends without repeating them', () => {
    // 0,1,2,1,0,1,2 — repeating an endpoint would hold it for double time and read as a
    // stumble rather than as a turn.
    expect(walk(3, 'pingPong', 6)).toEqual([0, 1, 2, 1, 0, 1, 2])
  })

  it('handles a two-step ping-pong, where every step is an end', () => {
    expect(walk(2, 'pingPong', 4)).toEqual([0, 1, 0, 1, 0])
  })

  it('holds still on a single step rather than dividing by zero', () => {
    expect(walk(1, 'loop', 3)).toEqual([0, 0, 0, 0])
    expect(walk(1, 'pingPong', 3)).toEqual([0, 0, 0, 0])
    expect(advanceSequence(1, cursor(0), 'once').done).toBe(true)
  })

  it('reports done for an empty sequence instead of returning an index into nothing', () => {
    expect(advanceSequence(0, cursor(0), 'loop')).toEqual({ index: 0, direction: 1, done: true })
  })
})

describe('resolveSequence', () => {
  const base: SequenceDef = {
    name: 'test',
    steps: [{ expression: 1, holdMs: 1000, transitionMs: 300, transition: 'smooth' }],
    playback: 'loop',
    blink: { minMs: 3000, maxMs: 5000 },
    motion: null,
  }

  it('passes a good sequence through', () => {
    expect(resolveSequence(base, EXPRESSION_COUNT)?.steps[0].expression).toBe(1)
  })

  it('rejects nothing to play', () => {
    expect(resolveSequence(null, EXPRESSION_COUNT)).toBeNull()
    expect(resolveSequence({ ...base, steps: [] }, EXPRESSION_COUNT)).toBeNull()
  })

  it('wraps an out-of-range expression rather than throwing inside the frame loop', () => {
    const wrapped = resolveSequence(
      { ...base, steps: [{ ...base.steps[0], expression: EXPRESSION_COUNT + 3 }] },
      EXPRESSION_COUNT
    )
    expect(wrapped?.steps[0].expression).toBe(3)
  })

  it('wraps a negative expression the same way', () => {
    const wrapped = resolveSequence(
      { ...base, steps: [{ ...base.steps[0], expression: -1 }] },
      EXPRESSION_COUNT
    )
    expect(wrapped?.steps[0].expression).toBe(EXPRESSION_COUNT - 1)
  })

  it('clamps a hold that would spin the timer at zero delay', () => {
    const resolved = resolveSequence(
      { ...base, steps: [{ ...base.steps[0], holdMs: 0 }] },
      EXPRESSION_COUNT
    )
    expect(resolved!.steps[0].holdMs).toBeGreaterThanOrEqual(120)
  })

  it('falls back on an unknown transition and playback', () => {
    const resolved = resolveSequence(
      {
        ...base,
        playback: 'sideways' as SequenceDef['playback'],
        steps: [{ ...base.steps[0], transition: 'wobble' as never }],
      },
      EXPRESSION_COUNT
    )
    expect(resolved!.playback).toBe('loop')
    expect(resolved!.steps[0].transition).toBe('smooth')
  })

  it('keeps blink bounds in order however they arrive', () => {
    const resolved = resolveSequence(
      { ...base, blink: { minMs: 9000, maxMs: 1000 } },
      EXPRESSION_COUNT
    )
    expect(resolved!.blink!.maxMs).toBeGreaterThanOrEqual(resolved!.blink!.minMs)
  })

  it('keeps a null blink null, which is how a sequence says never', () => {
    expect(resolveSequence({ ...base, blink: null }, EXPRESSION_COUNT)!.blink).toBeNull()
  })
})

describe('sequenceSpring', () => {
  it('makes a shorter transition stiffer', () => {
    expect(sequenceSpring('spring', 120, 7)).toBeGreaterThan(sequenceSpring('spring', 2000, 7))
  })

  it('orders the styles smooth < spring < snappy at the same duration', () => {
    const smooth = sequenceSpring('smooth', 500, 7)
    const spring = sequenceSpring('spring', 500, 7)
    const snappy = sequenceSpring('snappy', 500, 7)
    expect(smooth).toBeLessThan(spring)
    expect(spring).toBeLessThan(snappy)
  })

  it('stays in a range the morph integrator can survive', () => {
    for (const ms of [0, 1, 60, 500, 5000, 1e9]) {
      const value = sequenceSpring('snappy', ms, 20)
      expect(Number.isFinite(value)).toBe(true)
      expect(value).toBeGreaterThanOrEqual(1)
      expect(value).toBeLessThanOrEqual(40)
    }
  })
})

describe('sequenceDuration', () => {
  it('sums holds and transitions', () => {
    const sequence = resolveSequence(
      {
        name: 'x',
        steps: [
          { expression: 0, holdMs: 1000, transitionMs: 200, transition: 'smooth' },
          { expression: 1, holdMs: 500, transitionMs: 300, transition: 'smooth' },
        ],
        playback: 'loop',
        blink: null,
        motion: null,
      },
      EXPRESSION_COUNT
    )!
    expect(sequenceDuration(sequence)).toBe(2000)
    expect(sequenceDuration({ ...sequence, playback: 'pingPong' })).toBe(4000)
  })
})

describe('saccadeOffset', () => {
  it('stays inside the travel the solver reserves room for', () => {
    // The fit report is only honest if this never exceeds what buildClouds paid for.
    let worst = 0
    for (let seed = 0; seed < 12; seed++) {
      for (let t = 0; t < 20000; t += 7) {
        const [x, y] = saccadeOffset(t, seed, 1)
        expect(Math.abs(x)).toBeLessThanOrEqual(SACCADE_TRAVEL.x)
        expect(Math.abs(y)).toBeLessThanOrEqual(SACCADE_TRAVEL.y)
        worst = Math.max(worst, Math.hypot(x, y))
      }
    }
    expect(worst).toBeLessThanOrEqual(SACCADE_RADIUS)
    // And it genuinely uses the room, or reserving it would be waste.
    expect(worst).toBeGreaterThan(SACCADE_RADIUS * 0.4)
  })

  it('holds perfectly still at zero strength', () => {
    for (let t = 0; t < 5000; t += 50) expect(saccadeOffset(t, 3, 0)).toEqual([0, 0])
  })

  it('scales with strength', () => {
    const full = saccadeOffset(3210, 5, 1)
    const half = saccadeOffset(3210, 5, 0.5)
    expect(half[0]).toBeCloseTo(full[0] / 2, 10)
    expect(half[1]).toBeCloseTo(full[1] / 2, 10)
  })

  it('is deterministic — same clock and seed, same offset', () => {
    expect(saccadeOffset(1234, 9, 1)).toEqual(saccadeOffset(1234, 9, 1))
  })

  it('desynchronises different instances', () => {
    // Forty mascots twitching on the same frame reads as the page stuttering.
    const a = saccadeOffset(1234, lifeSeed('mascotA'), 1)
    const b = saccadeOffset(1234, lifeSeed('mascotB'), 1)
    expect(a[0]).not.toBeCloseTo(b[0], 3)
  })

  it('actually moves', () => {
    const samples = new Set<string>()
    for (let t = 0; t < 6000; t += 120) {
      samples.add(saccadeOffset(t, 2, 1).map(v => v.toFixed(3)).join(','))
    }
    expect(samples.size).toBeGreaterThan(20)
  })

  it('jumps faster than it drifts, which is what makes it read as a flick', () => {
    // Find the biggest change across one frame during a jump, versus while held.
    const speedAt = (t: number) => {
      const [x0, y0] = saccadeOffset(t, 4, 1)
      const [x1, y1] = saccadeOffset(t + 16, 4, 1)
      return Math.hypot(x1 - x0, y1 - y0)
    }
    const speeds = Array.from({ length: 400 }, (_, i) => speedAt(i * 16))
    const fastest = Math.max(...speeds)
    const median = [...speeds].sort((a, b) => a - b)[Math.floor(speeds.length / 2)]
    expect(fastest).toBeGreaterThan(median * 8)
  })
})

describe('lifeSeed', () => {
  it('is stable for the same uid', () => {
    expect(lifeSeed('mascotR1a')).toBe(lifeSeed('mascotR1a'))
  })

  it('differs for the uids React actually generates', () => {
    const seeds = new Set(
      ['mascotr1', 'mascotr2', 'mascotr3', 'mascotr1a', 'mascotr1b'].map(lifeSeed)
    )
    expect(seeds.size).toBe(5)
  })
})
